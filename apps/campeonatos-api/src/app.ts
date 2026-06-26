import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type { JwtPayload } from '@dinamyt/shared';
import { config } from './config';
import { createRemoteVerifier } from './plugins/auth';
import { healthRoutes } from './routes/health';
import { campeonatosRoutes } from './routes/campeonatos';

export interface BuildAppDeps {
  /** Verificador de tokens. Por defecto usa el JWKS remoto del ecosystem;
   *  en tests se inyecta uno local para no depender de la red. */
  verifyToken?: (token: string) => Promise<JwtPayload>;
}

export function buildApp(deps: BuildAppDeps = {}): FastifyInstance {
  const app = Fastify({ logger: false });

  app.decorate(
    'verifyToken',
    deps.verifyToken ?? createRemoteVerifier(config.ecosystemJwksUrl),
  );

  void app.register(cors, { origin: config.corsOrigins });
  void app.register(healthRoutes);
  void app.register(campeonatosRoutes);

  return app;
}
