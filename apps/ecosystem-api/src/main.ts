import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // ── Detrás de un proxy ────────────────────────────────────────────────────
  //
  // En el VPS nadie habla con esta API directamente: entra por Caddy, y algún
  // día por Cloudflare. Sin esto, la IP del socket es la del proxy y
  // @nestjs/throttler mete a TODO el mundo en el mismo cubo: los diez inicios
  // de sesión por minuto dejan de ser diez POR PERSONA y pasan a ser diez para
  // la plataforma entera. Un club entrando a la vez se bloquea solo, y un
  // atacante deja fuera a todos los demás con un guion de tres líneas.
  //
  // Es un NÚMERO DE SALTOS y no "true", igual que TRUST_PROXY_HOPS en
  // Campeonatos y en Membresías: X-Forwarded-For lo puede escribir cualquiera,
  // así que solo se cree el salto que de verdad hay delante. 1 = solo Caddy.
  // 2 = Cloudflare con el proxy naranja encendido y Caddy detrás.
  const saltosDeProxy = parseInt(process.env.TRUST_PROXY_HOPS ?? '0', 10);
  if (saltosDeProxy > 0) app.set('trust proxy', saltosDeProxy);

  app.use(json({ limit: '5mb' }));
  app.use(urlencoded({ extended: true, limit: '5mb' }));
  // ValidationPipe global (requiere instalar `class-validator` y
  // `class-transformer`). Hoy los cuerpos se tipan inline, así que se omite.

  // CORS: el portal del ecosistema y las apps (academy, campeonatos)
  // consumen esta API desde otros orígenes. Lista separada por comas en
  // CORS_ORIGINS; en desarrollo se permite localhost por defecto.
  const origins = (
    process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:3003'
  )
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: origins,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`DINAMYT Ecosystem escuchando en http://localhost:${port}`);
}
void bootstrap();
