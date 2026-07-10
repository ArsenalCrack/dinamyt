import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config();

// DB propia de Academy (independiente del ecosistema). Referencia la persona
// por `ecosystem_user_id` (UUID), sin FK entre bases.
export default defineConfig({
  schema: './src/schema/index.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.ACADEMY_DATABASE_URL!,
  },
  schemaFilter: ['academy'],
});
