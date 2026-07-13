// Setup de la BD local embebida (PGlite) de MEMBRESÍAS: aplica migraciones.
// Idempotente. Uso: `pnpm db:local:setup`.
import 'dotenv/config';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { join } from 'node:path';

const dir = process.env.MEMBRESIAS_PGLITE_DATA;
if (!dir) {
  console.error('[membresias] Falta MEMBRESIAS_PGLITE_DATA en packages/membresias-db/.env');
  process.exit(1);
}

const pg = new PGlite(dir);
const db = drizzle(pg);
await migrate(db, { migrationsFolder: join(process.cwd(), 'drizzle', 'migrations') });
console.log('[membresias] migraciones aplicadas en', dir);

await pg.close();
console.log('[membresias] setup completado.');
