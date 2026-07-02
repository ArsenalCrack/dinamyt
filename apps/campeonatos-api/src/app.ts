import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type { JwtPayload } from '@dinamyt/shared';
import { db as defaultDb, type Db } from '@dinamyt/campeonatos-db';
import { config } from './config';
import { createRemoteVerifier } from './plugins/auth';
import { healthRoutes } from './routes/health';
import { campeonatosRoutes } from './routes/campeonatos';
import { tatamisRoutes } from './routes/tatamis';
import { geoRoutes } from './routes/geo';
import { invitacionesRoutes } from './routes/invitaciones';

export interface BuildAppDeps {
  /** Verificador de tokens. Por defecto usa el JWKS remoto del ecosystem;
   *  en tests se inyecta uno local para no depender de la red. */
  verifyToken?: (token: string) => Promise<JwtPayload>;
  /** BD de Campeonatos. Por defecto la conexión real; en tests se inyecta PGlite. */
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
  void app.register(campeonatosRoutes);
  void app.register(tatamisRoutes);
  void app.register(geoRoutes);
  void app.register(invitacionesRoutes);

  return app;
}
