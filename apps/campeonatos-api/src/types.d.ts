import 'fastify';
import type { JwtPayload } from '@dinamyt/shared';
import type { Db } from '@dinamyt/campeonatos-db';

declare module 'fastify' {
  interface FastifyInstance {
    /** Verifica un token del ecosystem (RS256) y devuelve su payload. */
    verifyToken: (token: string) => Promise<JwtPayload>;
    /** Conexión a la BD de Campeonatos (inyectable para tests). */
    db: Db;
  }
  interface FastifyRequest {
    /** Payload del token, presente tras pasar un guard de scope. */
    user?: JwtPayload;
  }
}
