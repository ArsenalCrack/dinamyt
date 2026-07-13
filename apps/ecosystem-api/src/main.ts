import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
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
