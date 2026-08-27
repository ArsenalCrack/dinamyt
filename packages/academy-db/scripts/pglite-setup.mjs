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
// `migrationsSchema` NO es opcional aquí, aunque lo parezca.
//
// Sin él, el migrador escribe el diario en un esquema llamado `drizzle` —su
// valor por defecto—, mientras que `drizzle.config.ts` lo declara DENTRO de
// `academy`. Los dos caminos quedan así mirando diarios distintos: esta siembra
// aplica y anota en `drizzle`, y el día que alguien corre `pnpm db:migrar` (o
// `drizzle-kit`) este mira en `academy`, no encuentra nada, da la base por
// vacía y reintenta la 0000 contra tablas que ya existen. El error que sale
// —«type … already exists»— no menciona ni diarios ni esquemas.
//
// Es exactamente el mismo fallo que ya se cerró en el ecosystem; aquí seguía
// abierto. Si tu base local viene de antes de este arreglo:
//   pnpm db:migrar --mover-diario
await migrate(db, {
  migrationsFolder: join(process.cwd(), 'drizzle', 'migrations'),
  migrationsSchema: 'academy',
});
console.log('[academy] migraciones aplicadas en', dir);

// Siembra (usa el build de dist para compartir la misma lógica idempotente).
const { seedAcademy } = await import('../dist/seed.js');
await seedAcademy(db);
console.log('[academy] seed de Hapkido aplicado.');

await pg.close();
console.log('[academy] setup completado.');
