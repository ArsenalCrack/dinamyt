import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config();

// DB propia de Campeonatos (independiente del ecosistema). Referencia el
// user_id del ecosistema por UUID, sin FK entre bases.
export default defineConfig({
  schema: './src/schema/index.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.CAMPEONATOS_DATABASE_URL!,
  },
  schemaFilter: ['campeonatos'],
  migrations: {
    schema: 'campeonatos',
    table: '__drizzle_migrations',
  },
});
