import 'fastify';
import type { JwtPayload } from '@dinamyt/shared';
import type { Db } from '@dinamyt/membresias-db';
import type { FetchMembers } from './lib/ecosystem';

declare module 'fastify' {
  interface FastifyInstance {
    /** Verifica un token del ecosystem (RS256) y devuelve su payload. */
    verifyToken: (token: string) => Promise<JwtPayload>;
    /** Conexión a la BD de Membresías (inyectable para tests). */
    db: Db;
    /** Trae el roster del club desde el ecosystem (inyectable para tests). */
    fetchMembers: FetchMembers;
  }
  interface FastifyRequest {
    /** Payload del token, presente tras pasar un guard de scope. */
    user?: JwtPayload;
  }
}
