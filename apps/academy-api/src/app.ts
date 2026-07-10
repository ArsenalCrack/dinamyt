import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { mkdirSync } from 'node:fs';
import type { JwtPayload } from '@dinamyt/shared';
import { db as defaultDb, type Db } from '@dinamyt/academy-db';
import { config } from './config';
import { createRemoteVerifier } from './plugins/auth';
import { createHttpFigurasClient, type FigurasClient } from './lib/figuras-client';
import { healthRoutes } from './routes/health';
import { martialArtsRoutes } from './routes/martial-arts';
import { contentsRoutes } from './routes/contents';
import { evaluationsRoutes } from './routes/evaluations';
import { progressRoutes } from './routes/progress';
import { adminRoutes } from './routes/admin';
import { notificationsRoutes } from './routes/notifications';
import { announcementsRoutes } from './routes/announcements';
import { dashboardRoutes } from './routes/dashboard';
import { figurasRoutes } from './routes/figuras';
import { historialRoutes } from './routes/historial';
import { uploadsRoutes } from './routes/uploads';

export interface BuildAppDeps {
  /** Verificador de tokens. Por defecto usa el JWKS remoto del ecosystem;
   *  en tests se inyecta uno local para no depender de la red. */
  verifyToken?: (token: string) => Promise<JwtPayload>;
  /** BD de Academy. Por defecto la conexión real; en tests se inyecta PGlite. */
  db?: Db;
  /** Cliente del microservicio de figuras; en tests se simula. */
  figurasClient?: FigurasClient;
}

export function buildApp(deps: BuildAppDeps = {}): FastifyInstance {
  const app = Fastify({ logger: false });

  app.decorate(
    'verifyToken',
    deps.verifyToken ?? createRemoteVerifier(config.ecosystemJwksUrl),
  );
  app.decorate('db', deps.db ?? defaultDb);
  app.decorate(
    'figurasClient',
    deps.figurasClient ?? createHttpFigurasClient(config.figurasServiceUrl),
  );

  void app.register(cors, { origin: config.corsOrigins });
  // Videos de figuras: hasta 300 MB por archivo.
  void app.register(multipart, { limits: { fileSize: 300 * 1024 * 1024 } });
  // Archivos generados y subidos (videos, reportes, evidencias). Se sirven
  // como datos inertes: nosniff + CSP nula → aunque algo malicioso burlara la
  // validación de subida, el navegador jamás lo ejecutaría desde aquí.
  mkdirSync(config.uploadsDir, { recursive: true });
  void app.register(fastifyStatic, {
    root: config.uploadsDir,
    prefix: '/files/',
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  });

  void app.register(healthRoutes);
  void app.register(martialArtsRoutes);
  void app.register(contentsRoutes);
  void app.register(evaluationsRoutes);
  void app.register(progressRoutes);
  void app.register(adminRoutes);
  void app.register(notificationsRoutes);
  void app.register(announcementsRoutes);
  void app.register(dashboardRoutes);
  void app.register(figurasRoutes);
  void app.register(historialRoutes);
  void app.register(uploadsRoutes);

  return app;
}
