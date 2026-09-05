import { eq, type SQL } from 'drizzle-orm';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { orgs, users, type Db } from '@dinamyt/membresias-db';
import type { JwtPayload, MembresiasRole } from '../types/auth';
import { config, ssoHabilitado } from '../config';
import { verificarTokenPropio, verificadorEcosystem } from '../lib/auth/tokens';
import { csrfValido, tokenDelRequest } from '../lib/auth/cookies';
import { sinFiltroDeClub } from '../lib/db-contexto';

/**
 * Guards de la API.
 *
 * Dos ideas gobiernan este archivo:
 *
 * 1. **El token prueba quién eres, no qué puedes hacer hoy.** Cada request
 *    relee al usuario de la BD, así que si el superadmin desactiva un club o un
 *    maestro el corte es inmediato, en vez de esperar a que caduque el token.
 * 2. **Negar sin delatar**: lo que no te corresponde responde 404, no 403, para
 *    no revelar que existe.
 */

/**
 * Verificador híbrido: primero intenta la firma propia (HS256); si falla y el
 * SSO está configurado, prueba con el JWKS del ecosistema DINAMYT (RS256).
 */
export function crearVerificador(): (token: string) => Promise<JwtPayload> {
  const verificarEcosystem = ssoHabilitado()
    ? verificadorEcosystem(config.ecosystemJwksUrl)
    : null;

  return async (token: string) => {
    try {
      return await verificarTokenPropio(token);
    } catch (err) {
      if (!verificarEcosystem) throw err;
      return verificarEcosystem(token);
    }
  };
}

interface UsuarioVigente {
  payload: JwtPayload;
  orgActiva: boolean;
  /**
   * Desde cuándo el ecosistema dice que el plan del club no está al día, o
   * `null`. Ver `orgs.plan_bloqueado_desde` y la migración `0019`.
   */
  planBloqueadoDesde: Date | null;
}

/** Un `sub` con forma de UUID; cualquier otra cosa no se le pasa a Postgres. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Relee al usuario del token. Devuelve `null` si ya no existe o está inactivo.
 *
 * Se busca primero por `eco_sub` —la cuenta del ecosistema con la que la
 * reconciliación (§2.4) enlazó esta ficha— y solo después por CORREO, que es
 * como se hacía cuando el enlace no existía. El orden importa: el correo se
 * puede cambiar desde el portal, y el enlace no.
 *
 * Nunca se da de alta a nadie en silencio: si no hay ficha, no entra.
 */
async function usuarioVigente(
  db: Db,
  payload: JwtPayload,
): Promise<UsuarioVigente | null> {
  const correo = (payload.email ?? '').toLowerCase();
  const sub = typeof payload.sub === 'string' && UUID.test(payload.sub) ? payload.sub : null;
  if (!correo && !sub) return null;

  // Cruza clubes por necesidad: este paso ES el que averigua a cuál pertenece
  // quien llama, así que todavía no hay contexto con el que filtrar.
  const { fila, orgActiva, planBloqueadoDesde } = await sinFiltroDeClub(db, async (tx) => {
    const buscar = (condicion: SQL | undefined) =>
      tx.select().from(users).where(condicion).limit(1);

    let [fila] = sub ? await buscar(eq(users.ecoSub, sub)) : [];
    if (!fila && correo) [fila] = await buscar(eq(users.email, correo));

    if (!fila || !fila.isActive) {
      return { fila: null, orgActiva: true, planBloqueadoDesde: null };
    }

    let orgActiva = true;
    let planBloqueadoDesde: Date | null = null;
    if (fila.orgId) {
      // Las dos cosas del club en la MISMA consulta que ya se hacía: son dos
      // cerrojos distintos —«el superadmin lo apagó» y «su plan venció»— y
      // preguntar por ellos por separado sería un viaje de más en cada
      // petición autenticada de la aplicación.
      const [club] = await tx
        .select({ isActive: orgs.isActive, planBloqueadoDesde: orgs.planBloqueadoDesde })
        .from(orgs)
        .where(eq(orgs.id, fila.orgId))
        .limit(1);
      orgActiva = Boolean(club?.isActive);
      planBloqueadoDesde = club?.planBloqueadoDesde ?? null;
    }
    return { fila, orgActiva, planBloqueadoDesde };
  });

  if (!fila) return null;

  return {
    payload: {
      sub: fila.id,
      email: fila.email,
      fullName: fila.fullName,
      org_id: fila.orgId,
      role_membresias: fila.role,
      is_super_admin: fila.isSuperAdmin,
    },
    orgActiva,
    planBloqueadoDesde,
  };
}

/**
 * Token válido + usuario activo + club activo. Es la base de los demás guards:
 * en éxito deja el payload recién leído de la BD en `request.user`.
 */
export function requireAuth() {
  return async function (req: FastifyRequest, reply: FastifyReply) {
    const token = tokenDelRequest(req);
    if (!token) {
      return reply.code(401).send({ error: 'Token de autenticación requerido.' });
    }

    // La sesión por cookie viaja sola en cada petición, incluidas las que
    // dispare otra web: sin esta comprobación, un formulario ajeno podría
    // ejecutar acciones en nombre de quien tenga la sesión abierta.
    if (!csrfValido(req)) {
      return reply.code(403).send({ error: 'Petición sin token CSRF válido.' });
    }

    let payload: JwtPayload;
    try {
      payload = await req.server.verifyToken(token);
    } catch {
      return reply.code(401).send({ error: 'Token inválido o expirado.' });
    }

    const vigente = await usuarioVigente(req.server.db, payload);
    if (!vigente) {
      return reply
        .code(401)
        .send({ error: 'Tu cuenta ya no está activa. Habla con tu maestro.' });
    }

    // El superadmin no pertenece a ningún club: esta regla nunca lo alcanza.
    if (!vigente.orgActiva && !vigente.payload.is_super_admin) {
      return reply.code(403).send({ error: 'El acceso de tu club está suspendido.' });
    }

    // ── El plan vencido, que es el otro cerrojo ──
    //
    // Va aquí y no en un hook aparte por dos razones. La primera es que este
    // es el único punto por el que pasan TODAS las rutas autenticadas: un hook
    // de `onRequest` corre antes de que se sepa quién llama, así que tendría
    // que verificar el token por su cuenta y volver a consultar el club.
    //
    // La segunda es la que de verdad importa: el agujero que esto tapa era que
    // Membresías tiene login propio. El portal ya filtra los `app_scopes` por
    // fecha, pero quien entra por el formulario de aquí no pasa por el portal
    // nunca. Este es el sitio equivalente de este lado.
    //
    // **402 y no 403**: son cosas distintas y la web las distingue para enseñar
    // pantallas distintas. 403 es «no te dejan»; esto es «hay que pagar», y
    // termina en cuanto alguien pague.
    if (vigente.planBloqueadoDesde && !vigente.payload.is_super_admin) {
      return reply.code(402).send({
        error:
          'El plan de tu club no está al día, así que Membresías está en pausa. ' +
          'Nada se ha perdido: los pagos, la asistencia y las fichas siguen ahí ' +
          'y vuelven en cuanto se renueve.',
        // La marca que mira la web para explicar en vez de decir «algo salió
        // mal», y la fecha para poder decir DESDE CUÁNDO: la diferencia entre
        // «se me pasó ayer» y «esto lleva tres semanas y nadie me avisó».
        planVencido: true,
        desde: vigente.planBloqueadoDesde.toISOString(),
      });
    }

    req.user = vigente.payload;
  };
}

/**
 * Además del token, exige pertenecer a un club. El superadmin pasa: opera sobre
 * el club que indique (ver `orgDelRequest`).
 */
export function requireClub() {
  const auth = requireAuth();
  return async function (req: FastifyRequest, reply: FastifyReply) {
    await auth(req, reply);
    if (reply.sent) return;

    if (req.user!.is_super_admin) return;
    if (!req.user!.org_id) {
      return reply.code(403).send({ error: 'Tu cuenta no pertenece a ningún club.' });
    }
  };
}

/** Exige que el rol esté entre `roles`. El superadmin pasa siempre. */
export function requireRole(roles: MembresiasRole[]) {
  const club = requireClub();
  return async function (req: FastifyRequest, reply: FastifyReply) {
    await club(req, reply);
    if (reply.sent) return;

    if (req.user!.is_super_admin) return;

    const rol = req.user!.role_membresias as MembresiasRole | null;
    if (!rol || !roles.includes(rol)) {
      return reply.code(403).send({
        error: `Tu rol no permite esta acción (requiere: ${roles.join(', ')}).`,
      });
    }
  };
}

/** Solo el superadmin: gestión de clubes y de maestros. */
export function requireSuperAdmin() {
  const auth = requireAuth();
  return async function (req: FastifyRequest, reply: FastifyReply) {
    await auth(req, reply);
    if (reply.sent) return;

    if (!req.user!.is_super_admin) {
      // 404 y no 403: quien no es superadmin no debería ni saber que existe.
      return reply.code(404).send({ error: 'No encontrado.' });
    }
  };
}

/**
 * Club sobre el que actúa el request.
 *
 * Para todos es el suyo. El superadmin, que no tiene club propio, elige uno con
 * `?orgId=` o la cabecera `x-org-id`; así audita cualquier club sin necesitar
 * una cuenta en cada uno.
 */
export function orgDelRequest(req: FastifyRequest): string | null {
  if (req.user?.is_super_admin) {
    const q = (req.query as { orgId?: string } | undefined)?.orgId;
    const h = req.headers['x-org-id'];
    const elegido = q ?? (typeof h === 'string' ? h : undefined);
    return elegido || req.user.org_id;
  }
  return req.user?.org_id ?? null;
}

/** `true` si el usuario gestiona el club (maestro, auxiliar o superadmin). */
export function esStaff(user: JwtPayload | undefined): boolean {
  return Boolean(
    user &&
      (user.is_super_admin ||
        user.role_membresias === 'owner' ||
        user.role_membresias === 'staff'),
  );
}
