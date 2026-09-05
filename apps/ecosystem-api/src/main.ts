import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { json, urlencoded } from 'express';
import { mkdirSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { directorioMedia, MEDIA_PREFIJO } from './common/almacen-imagenes';

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

  // ── Las fotos, servidas desde el disco ────────────────────────────────────
  //
  // En el VPS esto lo adelanta Caddy, que sirve el mismo directorio sin
  // despertar a Node (ver OPERAR.md §6.2). Esto de aquí es lo que hace que
  // funcione igual en local, y la red de seguridad si algún día la petición
  // llega hasta aquí.
  //
  // Dos cabeceras, y ninguna es adorno:
  //
  //  · `immutable` con un año se puede poner **porque el nombre es el hash del
  //    contenido**: si la imagen cambia, cambia el nombre. Sin esa propiedad,
  //    cachear un año sería servir la foto vieja para siempre.
  //  · `nosniff` + una CSP que no deja ejecutar nada: aunque algo malicioso
  //    burlara la comprobación de firma al subir, el navegador jamás lo
  //    correría desde aquí. Es la misma defensa que ya usa Academy para lo que
  //    sube su gente (`academy-api/src/app.ts`).
  mkdirSync(directorioMedia(), { recursive: true });
  app.useStaticAssets(directorioMedia(), {
    prefix: MEDIA_PREFIJO,
    index: false,
    setHeaders: (res: ServerResponse) => {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  });
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
    // `X-Zona-Horaria` y `X-Idioma`: dónde está y en qué idioma lee quien
    // pregunta. **Tienen que estar en esta lista.** Una cabecera que no
    // aparezca aquí no es que se ignore: el navegador falla la comprobación
    // previa y la petición ENTERA no sale, así que olvidarlas no rompería las
    // horas de los correos — rompería el inicio de sesión desde Academy.
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Zona-Horaria',
      'X-Idioma',
    ],
  });

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`DINAMYT Ecosystem escuchando en http://localhost:${port}`);
}
void bootstrap();
