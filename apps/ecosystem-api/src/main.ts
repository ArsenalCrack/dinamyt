import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  // bodyParser propio: la foto de perfil viaja como data-URL (base64) en el
  // PATCH del perfil y supera el límite por defecto de 100 KB de express.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(json({ limit: '2mb' }));
  app.use(urlencoded({ extended: true, limit: '2mb' }));

  // NOTA: cuando se introduzcan DTOs con class-validator, registrar aquí un
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
