import 'fastify';
import type { JwtPayload } from './auth';
import type { Db } from '@dinamyt/membresias-db';

declare module 'fastify' {
  interface FastifyInstance {
    /** Verifica un token (propio HS256, o del ecosistema si el SSO está activo). */
    verifyToken: (token: string) => Promise<JwtPayload>;
    /** Conexión a la BD de Membresías (inyectable para tests). */
    db: Db;
  }
  interface FastifyRequest {
    /** Usuario del request, releído de la BD por los guards de `plugins/auth`. */
    user?: JwtPayload;
  }
}
