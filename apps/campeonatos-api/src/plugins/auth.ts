import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { JwtPayload, AppScope } from '@dinamyt/shared';
import { config } from '../config';

/**
 * Verificador por defecto: descarga y cachea el JWKS del ecosystem y valida la
 * firma RS256 del token (RF-CAM-ECO-01). Campeonatos NUNCA emite tokens.
 */
export function createRemoteVerifier(jwksUrl: string) {
  const jwks = createRemoteJWKSet(new URL(jwksUrl));
  return async (token: string): Promise<JwtPayload> => {
    const { payload } = await jwtVerify(token, jwks, { algorithms: ['RS256'] });
    return payload as unknown as JwtPayload;
  };
}

/**
 * preHandler de Fastify que exige un token válido cuyo `app_scopes` incluya el
 * scope dado. Si falta el token → 401; si falta el scope → 403 con enlace al
 * portal (RF-CAM-ECO-02). En éxito, inyecta el payload en `request.user`.
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

    if (!payload.app_scopes?.includes(scope)) {
      return reply.code(403).send({
        error: `Tu plan no incluye acceso a '${scope}'.`,
        portalUrl: config.ecosystemPortalUrl,
      });
    }

    req.user = payload;
  };
}
