import 'fastify';
import type { JwtPayload, AcademyRole } from '@dinamyt/shared';
import type { Db } from '@dinamyt/academy-db';
import type { UsuarioLocal } from './lib/users';

declare module 'fastify' {
  interface FastifyInstance {
    /** Verifica un token del ecosystem (RS256) y devuelve su payload. */
    verifyToken: (token: string) => Promise<JwtPayload>;
    /** Conexión a la BD de Academy (inyectable para tests). */
    db: Db;
  }
  interface FastifyRequest {
    /** Payload del token, presente tras pasar un guard. */
    user?: JwtPayload;
    /** Contexto local de Academy (usuario sincronizado + rol efectivo),
     *  presente tras pasar `requireAcademy`. */
    academy?: { usuario: UsuarioLocal; rol: AcademyRole };
  }
}
