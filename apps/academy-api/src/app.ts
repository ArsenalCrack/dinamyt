import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type { JwtPayload } from '@dinamyt/shared';
import { db as defaultDb, type Db } from '@dinamyt/academy-db';
import { config } from './config';
import { createRemoteVerifier } from './plugins/auth';
import { healthRoutes } from './routes/health';
import { martialArtsRoutes } from './routes/martial-arts';
import { contentsRoutes } from './routes/contents';
import { evaluationsRoutes } from './routes/evaluations';
import { progressRoutes } from './routes/progress';
import { adminRoutes } from './routes/admin';

export interface BuildAppDeps {
  /** Verificador de tokens. Por defecto usa el JWKS remoto del ecosystem;
   *  en tests se inyecta uno local para no depender de la red. */
  verifyToken?: (token: string) => Promise<JwtPayload>;
  /** BD de Academy. Por defecto la conexión real; en tests se inyecta PGlite. */
  db?: Db;
}

export function buildApp(deps: BuildAppDeps = {}): FastifyInstance {
  const app = Fastify({ logger: false });

  app.decorate(
    'verifyToken',
    deps.verifyToken ?? createRemoteVerifier(config.ecosystemJwksUrl),
  );
  app.decorate('db', deps.db ?? defaultDb);

  void app.register(cors, { origin: config.corsOrigins });
  void app.register(healthRoutes);
  void app.register(martialArtsRoutes);
  void app.register(contentsRoutes);
  void app.register(evaluationsRoutes);
  void app.register(progressRoutes);
  void app.register(adminRoutes);

  return app;
}
