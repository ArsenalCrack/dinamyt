import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // NOTA: cuando se introduzcan DTOs con class-validator, registrar aquí un
  // ValidationPipe global (requiere instalar `class-validator` y
  // `class-transformer`). Hoy los cuerpos se tipan inline, así que se omite.

  // CORS: el portal del ecosistema y las apps (academy, campeonatos)
  // consumen esta API desde otros orígenes. Lista separada por comas en
  // CORS_ORIGINS; en desarrollo se permite localhost por defecto.
  const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
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
