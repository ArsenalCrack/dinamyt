import type { Config } from 'drizzle-kit';
import * as dotenv from 'dotenv';
dotenv.config();

export default {
  schema: './src/db/schema/index.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // El diario de migraciones va DENTRO del esquema de la app y no en el
  // `drizzle` global. En el VPS la base es UNA sola con un esquema por app, y
  // un diario global lo compartirían todas: el migrador decide por marca de
  // tiempo, así que la app que llegue segunda daría por aplicadas migraciones
  // que nunca corrió y arrancaría contra un esquema incompleto.
  //
  // OJO al desplegar sobre la base restaurada: el diario que traiga el volcado
  // viene en `drizzle` y hay que moverlo aquí ANTES del primer `drizzle-kit
  // migrate`, o se reintentarán las 4 migraciones desde cero.
  migrations: { schema: 'ecosystem' },
} satisfies Config;