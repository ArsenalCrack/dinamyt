import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { orgMembers, users } from '../db/schema';

/**
 * El cobro por persona: cuánta gente se factura y cuánto cuesta.
 *
 * ── Por qué el modelo de antes no servía ──
 *
 * Un plan tenía `price_monthly`: un importe fijo. Pero un club de 15 alumnos y
 * uno de 300 no pueden pagar lo mismo — con precio fijo, o el pequeño no entra
 * o el grande está regalado.
 *
 * Y `subscriptions.total_amount` se fijaba al crear la fila, así que el importe
 * era una CONSTANTE: el panel de recaudo sumaba números que dejaban de
 * significar algo en cuanto el club crecía.
 *
 * ── Cuándo se cuenta: AL RENOVAR, sobre el padrón de ese día ──
 *
 * Prepago, y las tres razones se sostienen entre sí:
 *
 * · **El club sabe cuánto paga antes de pagar.** Con corte al final, el mes
 *   termina debiendo una cifra que nadie anunció.
 * · **Encaja con el bloqueo por impago** (§4.16). Cobrar por detrás sería
 *   bloquear a alguien por una deuda que se generó sola.
 * · **No se baja quitando gente la víspera.** Con corte al vencer, quitar
 *   cuarenta alumnos el día antes y devolverlos después divide la factura.
 *
 * Lo que crezca a mitad de mes se cobra en la renovación siguiente, que es
 * cuando se vuelve a contar.
 *
 * ── Qué cuenta como persona facturable ──
 *
 * **Toda persona activa del club**: fila en `org_members` de esa organización y
 * `users.is_active`. Alumnos, auxiliares y el maestro.
 *
 * Es una definición, no una preferencia. Sin ella la cifra depende de la
 * consulta que se escriba ese día, y se eligió ésta porque es una sola
 * consulta, no admite interpretación y **se audita contra la pantalla**: el
 * número que factura es el mismo que el maestro ve en su lista de gente.
 *
 * ⚠️ **Cada club cuenta a los suyos.** Quien pertenece a dos clubes cuenta en
 * los dos, y es lo correcto: son dos clubes usando el servicio para la misma
 * persona. La alternativa —repartirla— hace que la factura de un club dependa
 * de a qué otros clubes se apuntó su gente, que nadie puede explicar.
 */

/** Lo que hay que saber de un plan para calcular su importe. */
export interface TarifaPlan {
  /** Precio por persona y mes. `null` = plan de importe fijo. */
  pricePerUser?: string | null;
  /** Mínimo facturable. `null` = sin mínimo. */
  minUsers?: number | null;
  /** El importe fijo de siempre, para los planes que no migraron. */
  priceMonthly?: string | null;
}

function aNumero(v: string | null | undefined): number {
  const n = parseFloat(v ?? '0');
  return Number.isFinite(n) ? n : 0;
}

/** ¿Este plan se cobra por persona? */
export function esPorPersona(plan: TarifaPlan): boolean {
  return plan.pricePerUser != null && aNumero(plan.pricePerUser) > 0;
}

/**
 * Cuánta gente activa tiene cada uno de esos clubes.
 *
 * Una sola consulta agrupada y no una por club: el barrido diario la llama con
 * todos a la vez, y el panel de recaudo también.
 */
export async function personasFacturables(
  orgIds: string[],
): Promise<Map<string, number>> {
  const ids = [...new Set(orgIds)];
  const cuenta = new Map<string, number>(ids.map((id) => [id, 0]));
  if (ids.length === 0) return cuenta;

  const filas = await db
    .select({
      orgId: orgMembers.orgId,
      personas: sql<number>`count(*)::int`,
    })
    .from(orgMembers)
    .innerJoin(users, eq(users.id, orgMembers.userId))
    .where(and(inArray(orgMembers.orgId, ids), eq(users.isActive, true)))
    .groupBy(orgMembers.orgId);

  for (const f of filas) cuenta.set(f.orgId, f.personas);
  return cuenta;
}

/** Atajo para un solo club. */
export async function personasDe(orgId: string): Promise<number> {
  return (await personasFacturables([orgId])).get(orgId) ?? 0;
}

/**
 * Lo que cuesta un periodo.
 *
 * Devuelve también **por cuánta gente se cobró**, que es lo que se guarda en
 * `subscriptions.billed_users`: solo con el importe no se puede responder a
 * «¿por qué me cobraron esto?», y el padrón de hoy ya no es el del día de
 * corte.
 */
export function importeDelPeriodo(
  plan: TarifaPlan,
  personas: number,
  meses = 1,
): { importe: number; facturadas: number } {
  const ciclos = Math.max(1, Math.trunc(meses));

  if (!esPorPersona(plan)) {
    // El modelo viejo, intacto: un plan sin precio unitario sigue cobrándose
    // por su importe fijo. Aplicar la migración no cambió el precio de nadie.
    return { importe: aNumero(plan.priceMonthly) * ciclos, facturadas: 0 };
  }

  // Por debajo del mínimo se cobra el mínimo: nadie factura tres alumnos, y un
  // club que arranca con cuatro paga una cifra que no cubre ni el soporte.
  const facturadas = Math.max(personas, plan.minUsers ?? 0);
  const importe = facturadas * aNumero(plan.pricePerUser) * ciclos;
  return { importe: Math.round(importe), facturadas };
}
