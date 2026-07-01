// Setup de la BD local embebida (PGlite) de CAMPEONATOS: aplica migraciones.
// Idempotente. Uso: `pnpm db:local:setup`.
import 'dotenv/config';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { join } from 'node:path';

const dir = process.env.CAMPEONATOS_PGLITE_DATA;
if (!dir) {
  console.error('[campeonatos] Falta CAMPEONATOS_PGLITE_DATA en packages/campeonatos-db/.env');
  process.exit(1);
}

const pg = new PGlite(dir);
const db = drizzle(pg);
await migrate(db, { migrationsFolder: join(process.cwd(), 'drizzle', 'migrations') });
console.log('[campeonatos] migraciones aplicadas en', dir);

await pg.close();
console.log('[campeonatos] setup completado.');
