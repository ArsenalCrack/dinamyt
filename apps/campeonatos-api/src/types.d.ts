import 'fastify';
import type { JwtPayload } from '@dinamyt/shared';

declare module 'fastify' {
  interface FastifyInstance {
    /** Verifica un token del ecosystem (RS256) y devuelve su payload. */
    verifyToken: (token: string) => Promise<JwtPayload>;
  }
  interface FastifyRequest {
    /** Payload del token, presente tras pasar un guard de scope. */
    user?: JwtPayload;
  }
}
