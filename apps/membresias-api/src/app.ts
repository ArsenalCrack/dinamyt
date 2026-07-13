import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type { JwtPayload } from '@dinamyt/shared';
import { db as defaultDb, type Db } from '@dinamyt/membresias-db';
import { config } from './config';
import { createRemoteVerifier } from './plugins/auth';
import { fetchMembersFromEcosystem, type FetchMembers } from './lib/ecosystem';
import { healthRoutes } from './routes/health';
import { plansRoutes } from './routes/plans';
import { membershipsRoutes } from './routes/memberships';
import { paymentsRoutes } from './routes/payments';
import { scheduleRoutes } from './routes/schedule';
import { checkinRoutes } from './routes/checkin';
import { reportsRoutes } from './routes/reports';
import { notificationsRoutes } from './routes/notifications';
import { biometricsRoutes } from './routes/biometrics';

export interface BuildAppDeps {
  /** Verificador de tokens. Por defecto usa el JWKS remoto del ecosystem;
   *  en tests se inyecta uno local para no depender de la red. */
  verifyToken?: (token: string) => Promise<JwtPayload>;
  /** BD de Membresías. Por defecto la conexión real; en tests se inyecta PGlite. */
  db?: Db;
  /** Fuente del roster del club. Por defecto llama al ecosystem; se mockea en tests. */
  fetchMembers?: FetchMembers;
}

export function buildApp(deps: BuildAppDeps = {}): FastifyInstance {
  const app = Fastify({ logger: false });

  app.decorate(
    'verifyToken',
    deps.verifyToken ?? createRemoteVerifier(config.ecosystemJwksUrl),
  );
  app.decorate('db', deps.db ?? defaultDb);
  app.decorate('fetchMembers', deps.fetchMembers ?? fetchMembersFromEcosystem);

  void app.register(cors, { origin: config.corsOrigins });
  void app.register(healthRoutes);
  void app.register(plansRoutes);
  void app.register(membershipsRoutes);
  void app.register(paymentsRoutes);
  void app.register(scheduleRoutes);
  void app.register(checkinRoutes);
  void app.register(reportsRoutes);
  void app.register(notificationsRoutes);
  void app.register(biometricsRoutes);

  return app;
}
