import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { JwtPayload, AcademyRole } from '@dinamyt/shared';
import { config } from '../config';
import { sincronizarUsuarioLocal, rolEfectivo } from '../lib/users';

/**
 * Verificador por defecto: descarga y cachea el JWKS del ecosystem y valida la
 * firma RS256 del token (RF-ACA-01). Academy NUNCA emite tokens.
 */
export function createRemoteVerifier(jwksUrl: string) {
  const jwks = createRemoteJWKSet(new URL(jwksUrl));
  return async (token: string): Promise<JwtPayload> => {
    const { payload } = await jwtVerify(token, jwks, { algorithms: ['RS256'] });
    return payload as unknown as JwtPayload;
  };
}

/** preHandler que solo exige un token válido del ecosystem, SIN scope. */
export function requireAuth() {
  return async function (req: FastifyRequest, reply: FastifyReply) {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Token de autenticación requerido.' });
    }
    try {
      req.user = await req.server.verifyToken(auth.slice(7));
    } catch {
      return reply.code(401).send({ error: 'Token inválido o expirado.' });
    }
  };
}

/**
 * Guard principal de Academy (RF-ACA-01..03, 26):
 * 1. Exige token válido con el scope `academy` (403 + enlace al portal si falta;
 *    el super admin pasa siempre).
 * 2. Sincroniza el perfil local (nombre/correo del token → `academy_users`,
 *    RF-ACA-05) y bloquea usuarios suspendidos o con soft delete local.
 * 3. Calcula el rol efectivo: rol local asignado por el admin > `role_academy`
 *    del token > `student`. Si se pasan `roles`, exige uno de ellos.
 * En éxito inyecta `req.user` (payload) y `req.academy` ({ usuario, rol }).
 */
export function requireAcademy(roles?: AcademyRole[]) {
  return async function (req: FastifyRequest, reply: FastifyReply) {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Token de autenticación requerido.' });
    }

    let payload: JwtPayload;
    try {
      payload = await req.server.verifyToken(auth.slice(7));
    } catch {
      return reply.code(401).send({ error: 'Token inválido o expirado.' });
    }

    if (!payload.is_super_admin && !payload.app_scopes?.includes('academy')) {
      return reply.code(403).send({
        error: `Tu plan no incluye acceso a 'academy'.`,
        portalUrl: config.ecosystemPortalUrl,
      });
    }

    const usuario = await sincronizarUsuarioLocal(req.server.db, payload);
    if (!payload.is_super_admin && (usuario.suspended || usuario.deletedAt)) {
      return reply.code(403).send({
        error: 'Tu acceso a Academy fue suspendido por el administrador.',
      });
    }

    const rol = rolEfectivo(payload, usuario);
    if (roles && !payload.is_super_admin && !roles.includes(rol)) {
      return reply.code(403).send({
        error: `Tu rol no permite esta acción (requiere: ${roles.join(', ')}).`,
      });
    }

    req.user = payload;
    req.academy = { usuario, rol };
  };
}
