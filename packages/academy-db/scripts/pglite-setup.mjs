// Setup de la BD local embebida (PGlite) de ACADEMY: aplica migraciones y siembra
// Hapkido con sus 11 cinturones. Idempotente. Uso: `pnpm db:local:setup`.
import 'dotenv/config';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { join } from 'node:path';

const dir = process.env.ACADEMY_PGLITE_DATA;
if (!dir) {
  console.error('[academy] Falta ACADEMY_PGLITE_DATA en packages/academy-db/.env');
  process.exit(1);
}

const pg = new PGlite(dir);
const db = drizzle(pg);
await migrate(db, { migrationsFolder: join(process.cwd(), 'drizzle', 'migrations') });
console.log('[academy] migraciones aplicadas en', dir);

// Siembra (usa el build de dist para compartir la misma lógica idempotente).
const { seedAcademy } = await import('../dist/seed.js');
await seedAcademy(db);
console.log('[academy] seed de Hapkido aplicado.');

await pg.close();
console.log('[academy] setup completado.');
