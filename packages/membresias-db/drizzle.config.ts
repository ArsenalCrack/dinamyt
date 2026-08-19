import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config();

// BD de DINAMYT Membresías. Producto independiente: clubes, usuarios y estado
// del club viven todos aquí, bajo el schema `membresias`.
export default defineConfig({
  schema: './src/schema/index.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.MEMBRESIAS_DATABASE_URL!,
  },
  schemaFilter: ['membresias'],
  // El diario de migraciones va DENTRO del esquema de la app, no en el
  // `drizzle` global: en el VPS la base es una sola y hay un esquema por app,
  // así que un diario global lo compartirían todas. Ver `src/diario.ts`.
  migrations: { schema: 'membresias' },
});
