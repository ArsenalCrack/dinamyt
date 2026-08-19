import { conContexto, type Db } from '@dinamyt/membresias-db';

/**
 * Ejecuta una consulta que cruza clubes a propósito.
 *
 * Con RLS forzado, una consulta sin contexto no ve NADA (`org_id = NULL` no es
 * cierto para ninguna fila). Los pasos que ocurren antes de saber a qué club
 * pertenece quien llama —el login, los guards que releen al usuario por correo,
 * la siembra del superadmin— tienen que decirlo de forma explícita, y este
 * nombre está para que se vea en el sitio de uso.
 *
 * Vive aparte de `plugins/rls.ts` porque lo usa `plugins/auth.ts`, y ese import
 * en el otro sentido cerraría un ciclo entre los dos módulos.
 */
export function sinFiltroDeClub<T>(db: Db, fn: (tx: Db) => Promise<T>): Promise<T> {
  return conContexto(db, { orgId: null, accesoTotal: true }, fn);
}
