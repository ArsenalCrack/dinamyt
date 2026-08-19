import { eq } from 'drizzle-orm';
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
}

/**
 * Relee al usuario del token. Devuelve `null` si ya no existe o está inactivo.
 *
 * Se busca por CORREO, no por id: un token del ecosistema trae un `sub` que no
 * pertenece a esta base. Nunca se da de alta a nadie en silencio — si el correo
 * no existe aquí, no entra.
 */
async function usuarioVigente(
  db: Db,
  payload: JwtPayload,
): Promise<UsuarioVigente | null> {
  const correo = (payload.email ?? '').toLowerCase();
  if (!correo) return null;

  // Cruza clubes por necesidad: este paso ES el que averigua a cuál pertenece
  // quien llama, así que todavía no hay contexto con el que filtrar.
  const { fila, orgActiva } = await sinFiltroDeClub(db, async (tx) => {
    const [fila] = await tx
      .select()
      .from(users)
      .where(eq(users.email, correo))
      .limit(1);

    if (!fila || !fila.isActive) return { fila: null, orgActiva: true };

    let orgActiva = true;
    if (fila.orgId) {
      const [club] = await tx
        .select({ isActive: orgs.isActive })
        .from(orgs)
        .where(eq(orgs.id, fila.orgId))
        .limit(1);
      orgActiva = Boolean(club?.isActive);
    }
    return { fila, orgActiva };
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
