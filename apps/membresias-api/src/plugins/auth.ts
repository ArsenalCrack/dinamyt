import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { JwtPayload, AppScope, MembresiasRole } from '@dinamyt/shared';
import { config } from '../config';

/**
 * Verificador por defecto: descarga y cachea el JWKS del ecosystem y valida la
 * firma RS256 del token. Membresías NUNCA emite tokens.
 */
export function createRemoteVerifier(jwksUrl: string) {
  const jwks = createRemoteJWKSet(new URL(jwksUrl));
  return async (token: string): Promise<JwtPayload> => {
    const { payload } = await jwtVerify(token, jwks, { algorithms: ['RS256'] });
    return payload as unknown as JwtPayload;
  };
}

/**
 * preHandler que exige un token válido cuyo `app_scopes` incluya el scope dado.
 * Sin token → 401; sin scope → 403 con enlace al portal. En éxito inyecta el
 * payload en `request.user`. El super admin pasa siempre.
 */
export function requireScope(scope: AppScope) {
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

    if (payload.is_super_admin) {
      req.user = payload;
      return;
    }

    if (!payload.app_scopes?.includes(scope)) {
      return reply.code(403).send({
        error: `Tu plan no incluye acceso a '${scope}'.`,
        portalUrl: config.ecosystemPortalUrl,
      });
    }

    req.user = payload;
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
 * preHandler que, además del scope, exige que el rol del usuario en Membresías
 * (`role_membresias`) esté entre `roles`. El super admin pasa siempre.
 */
export function requireRole(scope: AppScope, roles: MembresiasRole[]) {
  const guardScope = requireScope(scope);
  return async function (req: FastifyRequest, reply: FastifyReply) {
    await guardScope(req, reply);
    if (reply.sent) return; // token/scope inválido: requireScope ya respondió.

    if (req.user?.is_super_admin) return;

    const rol = req.user?.role_membresias as MembresiasRole | null | undefined;
    if (!rol || !roles.includes(rol)) {
      return reply.code(403).send({
        error: `Tu rol no permite esta acción (requiere: ${roles.join(', ')}).`,
      });
    }
  };
}
