import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { db as defaultDb, type Db } from '@dinamyt/membresias-db';
import type { JwtPayload } from './types/auth';
import { config } from './config';
import { crearVerificador } from './plugins/auth';
import { registrarContextoRls } from './plugins/rls';
import { registrarLimiteGlobal } from './lib/auth/rate-limit';
import { AlumnoNoDelClub } from './lib/memberships';
import { healthRoutes } from './routes/health';
import { geoRoutes } from './routes/geo';
import { authRoutes } from './routes/auth';
import { orgsRoutes } from './routes/orgs';
import { usersRoutes } from './routes/users';
import { plansRoutes } from './routes/plans';
import { membershipsRoutes } from './routes/memberships';
import { paymentsRoutes } from './routes/payments';
import { scheduleRoutes } from './routes/schedule';
import { checkinRoutes } from './routes/checkin';
import { reportsRoutes } from './routes/reports';
import { notificationsRoutes } from './routes/notifications';
import { pushRoutes } from './routes/push';

export interface BuildAppDeps {
  /** Verificador de tokens. Por defecto el híbrido (propio + SSO opcional);
   *  en tests se inyecta uno local para no depender de la red. */
  verifyToken?: (token: string) => Promise<JwtPayload>;
  /** BD de Membresías. Por defecto la conexión real; en tests se inyecta PGlite. */
  db?: Db;
}

export function buildApp(deps: BuildAppDeps = {}): FastifyInstance {
  const app = Fastify({
    logger: false,
    // Ver `config.trustProxyHops`. `false` = usar la IP del socket tal cual.
    trustProxy: config.trustProxyHops > 0 ? config.trustProxyHops : false,
  });

  app.decorate('verifyToken', deps.verifyToken ?? crearVerificador());
  app.decorate('db', deps.db ?? defaultDb);

  // Un carnet QR de otro club se ve igual que uno de este: se responde 404 en
  // vez de dejar que reviente como error 500.
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof AlumnoNoDelClub) {
      return reply.code(404).send({ error: err.message });
    }
    return reply.send(err);
  });

  void app.register(cookie);
  // `credentials` es imprescindible con sesión por cookie: sin él el navegador
  // ni la manda ni acepta la que responde el login.
  void app.register(cors, { origin: config.corsOrigins, credentials: true });

  // Ambos van ANTES de registrar rutas: `onRoute` solo alcanza las que se
  // declaren después, y el techo global debe cubrir también las que se añadan
  // mañana sin que nadie se acuerde de limitarlas.
  registrarLimiteGlobal(app);
  registrarContextoRls(app);

  void app.register(healthRoutes);
  void app.register(geoRoutes);
  void app.register(authRoutes);
  void app.register(orgsRoutes);
  void app.register(usersRoutes);
  void app.register(plansRoutes);
  void app.register(membershipsRoutes);
  void app.register(paymentsRoutes);
  void app.register(scheduleRoutes);
  void app.register(checkinRoutes);
  void app.register(reportsRoutes);
  void app.register(notificationsRoutes);
  void app.register(pushRoutes);

  return app;
}
