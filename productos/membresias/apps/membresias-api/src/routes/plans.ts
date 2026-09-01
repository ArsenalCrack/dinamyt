import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { plans } from '@dinamyt/membresias-db';
import type { PlanType } from '../lib/billing';
import { orgDelRequest, requireRole } from '../plugins/auth';
import {
  LIMITES,
  MAX_CLASES,
  dinero,
  enteroOpcional,
  textoObligatorio,
} from '../lib/validacion';

const TIPOS: PlanType[] = ['mensual', 'semanal', 'clase', 'paquete', 'matricula'];

/**
 * Cuántas clases da cada tipo de plan, y por qué el número no siempre se
 * pregunta.
 *
 * `clase` y `paquete` hacen lo mismo por dentro —suman saldo de clases—, y esa
 * era justo la confusión: en la pantalla de planes los dos pedían «Nº de
 * clases», así que nada impedía crear una «clase suelta» de ocho ni distinguir
 * una cosa de la otra después. Lo que las separa es el TAMAÑO:
 *
 * - `clase` — una. Se paga y se entra hoy. El número no se pregunta porque no
 *   hay número que elegir; para llevar tres, el pago va con 3 periodos.
 * - `paquete` — las que el maestro decida (un bono de 8, de 12…), y por eso el
 *   campo solo aparece aquí.
 *
 * Los planes por tiempo y la matrícula no dan clases sueltas: su cobertura es
 * la fecha (o, en la matrícula, nada — ver `nextDue`).
 */
function clasesDelPlan(tipo: PlanType, pedidas: number | null): number | null {
  if (tipo === 'clase') return 1;
  if (tipo === 'paquete') return pedidas && pedidas > 0 ? pedidas : 1;
  return null;
}

interface PlanBody {
  name: string;
  type: PlanType;
  price: string;
  durationDays?: number | null;
  nClasses?: number | null;
  isActive?: boolean;
}

/** Planes/tarifas del club. Los define el maestro (owner). */
export async function plansRoutes(app: FastifyInstance) {
  // ── GET /plans — listar los planes del club (owner/staff) ─────────────────
  //
  // **Por defecto, solo los que se pueden cobrar.** Borrar un plan es apagarlo
  // (`DELETE /plans/:id`), y esta ruta los devolvía TODOS: el desplegable de
  // «asignar plan» de la ficha del alumno se llenaba de tarifas que el maestro
  // había borrado hacía meses, y elegir una de ellas funcionaba — dejaba al
  // alumno cobrando por un precio que el club ya no ofrece.
  //
  // `?todos=1` los trae todos, y lo usa una sola pantalla: la de planes, que
  // es donde tiene sentido ver también los apagados.
  app.get(
    '/plans',
    { preHandler: requireRole(['owner', 'staff']) },
    async (req, reply) => {
      const orgId = orgDelRequest(req);
      if (!orgId) return reply.code(400).send({ error: 'Sin club seleccionado.' });
      const todos = (req.query as { todos?: string }).todos === '1';
      return req.db
        .select()
        .from(plans)
        .where(
          todos
            ? eq(plans.orgId, orgId)
            : and(eq(plans.orgId, orgId), eq(plans.isActive, true)),
        );
    },
  );

  // ── POST /plans — crear plan (owner) ──────────────────────────────────────
  app.post(
    '/plans',
    { preHandler: requireRole(['owner']) },
    async (req, reply) => {
      const orgId = orgDelRequest(req);
      if (!orgId) return reply.code(400).send({ error: 'Sin club seleccionado.' });
      const body = req.body as PlanBody;

      const nombre = textoObligatorio(body.name, LIMITES.planNombre, 'El nombre del plan');
      if (!nombre.ok) return reply.code(422).send({ error: nombre.error });
      if (!TIPOS.includes(body.type)) {
        return reply.code(422).send({ error: `Tipo de plan inválido.` });
      }
      const precio = dinero(body.price, 'El precio');
      if (!precio.ok) return reply.code(422).send({ error: precio.error });
      const clases = enteroOpcional(body.nClasses, MAX_CLASES, 'El número de clases');
      if (!clases.ok) return reply.code(422).send({ error: clases.error });

      const [plan] = await req.db
        .insert(plans)
        .values({
          orgId,
          name: nombre.valor,
          type: body.type,
          price: precio.valor,
          // El semanal cubre la SEMANA (lunes a domingo), no una cuenta de
          // días: `durationDays` queda por compatibilidad con lo ya guardado y
          // no lo lee nadie. Ver `nextDue` en `lib/billing.ts`.
          durationDays: body.durationDays ?? (body.type === 'semanal' ? 7 : null),
          nClasses: clasesDelPlan(body.type, clases.valor),
        })
        .returning();
      return reply.code(201).send(plan);
    },
  );

  // ── PATCH /plans/:id — actualizar plan (owner) ────────────────────────────
  app.patch(
    '/plans/:id',
    { preHandler: requireRole(['owner']) },
    async (req, reply) => {
      const orgId = orgDelRequest(req);
      const { id } = req.params as { id: string };
      const body = req.body as Partial<PlanBody>;
      const db = req.db;

      const [existing] = await db
        .select()
        .from(plans)
        .where(and(eq(plans.id, id), eq(plans.orgId, orgId ?? '')))
        .limit(1);
      if (!existing) return reply.code(404).send({ error: 'Plan no encontrado.' });

      const cambios: Record<string, unknown> = { updatedAt: new Date() };
      if (body.name !== undefined) {
        const nombre = textoObligatorio(body.name, LIMITES.planNombre, 'El nombre del plan');
        if (!nombre.ok) return reply.code(422).send({ error: nombre.error });
        cambios.name = nombre.valor;
      }
      if (body.price !== undefined) {
        const precio = dinero(body.price, 'El precio');
        if (!precio.ok) return reply.code(422).send({ error: precio.error });
        cambios.price = precio.valor;
      }
      if (body.nClasses !== undefined) {
        const clases = enteroOpcional(body.nClasses, MAX_CLASES, 'El número de clases');
        if (!clases.ok) return reply.code(422).send({ error: clases.error });
        // El tipo no se edita, así que manda el que ya tiene el plan.
        cambios.nClasses = clasesDelPlan(existing.type as PlanType, clases.valor);
      }
      if (body.durationDays !== undefined) {
        const dias = enteroOpcional(body.durationDays, 3650, 'La duración en días');
        if (!dias.ok) return reply.code(422).send({ error: dias.error });
        cambios.durationDays = dias.valor;
      }
      if (body.isActive !== undefined) cambios.isActive = Boolean(body.isActive);

      const [plan] = await db
        .update(plans)
        .set(cambios)
        .where(eq(plans.id, id))
        .returning();
      return plan;
    },
  );

  // ── DELETE /plans/:id — desactivar plan (soft delete, owner) ──────────────
  app.delete(
    '/plans/:id',
    { preHandler: requireRole(['owner']) },
    async (req, reply) => {
      const orgId = orgDelRequest(req);
      const { id } = req.params as { id: string };
      const [plan] = await req.db
        .update(plans)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(eq(plans.id, id), eq(plans.orgId, orgId ?? '')))
        .returning();
      if (!plan) return reply.code(404).send({ error: 'Plan no encontrado.' });
      return { ok: true };
    },
  );
}
