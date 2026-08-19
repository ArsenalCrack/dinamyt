import { sql } from 'drizzle-orm';
import type { Db } from './client';

/**
 * Contexto de club con el que se ejecuta una transacción.
 *
 * Lo leen las políticas de RLS (ver `drizzle/migrations/0003_rls_por_club.sql`)
 * a través de `membresias.org_actual()` y `membresias.acceso_total()`.
 */
export interface ContextoClub {
  /** Club sobre el que se opera. `null` solo tiene sentido con accesoTotal. */
  orgId: string | null;
  /**
   * Desactiva el filtro por club. Reservado a las rutas que de verdad cruzan
   * clubes: el login (busca por correo, antes de saber de qué club es nadie) y
   * el superadmin. Es explícito para que abrirlo sea una decisión y no un
   * descuido.
   */
  accesoTotal?: boolean;
}

/**
 * Ejecuta `fn` dentro de una transacción con el contexto de club fijado.
 *
 * `set_config(..., true)` es LOCAL a la transacción: cuando termina, el valor
 * desaparece. Importa detrás de un pooler en modo transacción, donde la
 * siguiente petición puede reutilizar la misma conexión física — con un `SET`
 * normal heredaría el club de quien la usó antes.
 */
export async function conContexto<T>(
  db: Db,
  ctx: ContextoClub,
  fn: (tx: Db) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.org_id', ${ctx.orgId ?? ''}, true)`,
    );
    await tx.execute(
      sql`select set_config('app.acceso_total', ${ctx.accesoTotal ? 'on' : 'off'}, true)`,
    );
    return fn(tx as unknown as Db);
  });
}

/**
 * Filas de un `db.execute()`, venga del driver que venga.
 *
 * postgres-js devuelve el array de filas directamente; PGlite devuelve
 * `{ rows: [...] }`. Sin normalizar, la comprobación de RLS revienta con
 * `filas is not iterable` justo en desarrollo, que es donde más se mira.
 */
function filasDe<T>(resultado: unknown): T[] {
  if (Array.isArray(resultado)) return resultado as T[];
  const filas = (resultado as { rows?: unknown } | null)?.rows;
  return Array.isArray(filas) ? (filas as T[]) : [];
}

/**
 * ¿Están las políticas de RLS realmente en vigor?
 *
 * Existe porque RLS se puede activar y aun así no proteger nada: un rol
 * SUPERUSER o con BYPASSRLS se salta las políticas sin avisar, y desde fuera
 * todo parece correcto. Se comprueba el rol de conexión, no solo las tablas.
 */
export async function verificarRls(db: Db): Promise<{
  ok: boolean;
  motivo?: string;
  tablasSinRls: string[];
}> {
  const rol = filasDe<{ rolsuper: boolean; rolbypassrls: boolean }>(
    await db.execute(
      sql`select rolsuper, rolbypassrls from pg_roles where rolname = current_user`,
    ),
  );

  const filas = filasDe<{ relname: string }>(
    await db.execute(
      sql`select relname from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'membresias'
            and c.relkind = 'r'
            and not (c.relrowsecurity and c.relforcerowsecurity)`,
    ),
  );

  const tablasSinRls = filas.map((f) => f.relname);
  const info = rol[0];

  if (info?.rolsuper || info?.rolbypassrls) {
    return {
      ok: false,
      motivo:
        'el rol de conexión es SUPERUSER o tiene BYPASSRLS, así que se salta ' +
        'todas las políticas. Conéctate con un rol normal para que RLS proteja.',
      tablasSinRls,
    };
  }
  if (tablasSinRls.length) {
    return {
      ok: false,
      motivo: `sin RLS forzado: ${tablasSinRls.join(', ')}`,
      tablasSinRls,
    };
  }
  return { ok: true, tablasSinRls: [] };
}
