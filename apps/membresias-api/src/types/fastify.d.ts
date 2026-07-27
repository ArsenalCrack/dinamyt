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
    /**
     * BD dentro de una transacción con el club del request ya fijado, que es lo
     * que leen las políticas de RLS. Es la que deben usar los handlers.
     *
     * `server.db` sigue existiendo para lo que legítimamente cruza clubes (el
     * login y los guards, que buscan por correo antes de saber de qué club es
     * quien llama), pero ahí el filtro por club no protege: úsala a conciencia.
     */
    db: Db;
  }
}
