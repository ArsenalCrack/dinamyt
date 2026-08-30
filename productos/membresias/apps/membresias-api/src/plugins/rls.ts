import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { conContexto } from '@dinamyt/membresias-db';
import { orgDelRequest } from './auth';

/**
 * Contexto de club para RLS.
 *
 * Envuelve cada handler en una transacción con `app.org_id` fijado y deja esa
 * transacción en `req.db`. Se hace con `onRoute` (y no ruta por ruta) para que
 * una ruta nueva quede protegida sin que nadie tenga que acordarse: olvidarse
 * de esto es justo el error que RLS existe para atrapar.
 *
 * Los preHandler (los guards de autenticación) corren ANTES y siguen usando
 * `server.db` sin contexto: buscan al usuario por correo, cuando todavía no se
 * sabe a qué club pertenece. Es deliberado y está acotado a ese paso.
 */

/**
 * Rutas que operan fuera de cualquier club y no deben abrir transacción.
 * `/auth/logout` solo borra cookies, y `/health` y `/geo/*` ni tocan la BD:
 * envolverlas costaría un BEGIN/COMMIT por petición para nada.
 */
const SIN_CONTEXTO = new Set([
  '/health',
  '/geo/paises',
  '/geo/ciudades',
  '/auth/login',
  '/auth/logout',
  '/auth/config',
  // El modo mantenimiento es un ajuste GLOBAL, de ninguna organización: abre
  // su propio acceso sin filtro (ver `lib/mantenimiento.ts`). Además el GET lo
  // consulta gente sin sesión, donde no hay club que fijar.
  '/maintenance',
  // Canjea el QR del maestro por una sesión: como el login, se resuelve antes
  // de saber a qué club pertenece quien entra y abre su propio contexto.
  '/auth/acceso-qr',
  // Canjea el token del portal DINAMYT por una sesión: mismo caso que las dos
  // anteriores. Olvidarla aquí no da un error claro —la ruta se queda colgada,
  // porque su `sinFiltroDeClub` abriría una transacción dentro de esta.
  '/auth/sso',
  // El cron diario recorre TODOS los clubes: abre su propia transacción sin
  // filtro (ver `routes/notifications.ts`), así que envolverla en el contexto
  // de un club —que no tiene— solo abriría una transacción de más.
  '/notifications/cron',
  // El espejo del portal (ver `routes/sync.ts`): quien llama es el otro
  // servidor, no pertenece a ningún club y busca por `eco_sub` / `eco_org_id`.
  // Mismo caso que `/auth/sso`, y con el mismo síntoma si se olvida: la ruta se
  // queda colgada en vez de dar un error.
  '/sync/persona',
  '/sync/club',
  '/sync/contrasena',
]);

function contextoDe(req: FastifyRequest) {
  // El superadmin cruza clubes por diseño. Si además eligió uno con `?orgId=`,
  // se respeta: así audita un club concreto con el mismo filtro que su maestro.
  if (req.user?.is_super_admin) {
    const elegido = orgDelRequest(req);
    return elegido
      ? { orgId: elegido, accesoTotal: false }
      : { orgId: null, accesoTotal: true };
  }
  return { orgId: req.user?.org_id ?? null, accesoTotal: false };
}

export function registrarContextoRls(app: FastifyInstance) {
  app.addHook('onRoute', (routeOptions) => {
    if (SIN_CONTEXTO.has(routeOptions.url)) return;

    const original = routeOptions.handler;
    if (typeof original !== 'function') return;

    routeOptions.handler = function (this: FastifyInstance, req: FastifyRequest, reply: FastifyReply) {
      return conContexto(this.db, contextoDe(req), async (tx) => {
        req.db = tx;
        return original.call(this, req, reply);
      });
    };
  });
}
