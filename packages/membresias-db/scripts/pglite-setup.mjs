// Setup de la BD local embebida (PGlite) de MEMBRESÍAS: aplica migraciones.
// Idempotente. Uso: `pnpm db:local:setup`.
import 'dotenv/config';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { join } from 'node:path';

// El diario de migraciones vive en el esquema de la app, igual que al arrancar
// la API (`migrarBd` en src/migrate.ts) y en las pruebas. Ver src/diario.ts.
//
// Este script se quedó con el diario por defecto (`drizzle`) cuando la API se
// mudó al suyo: contra un PGlite que la API ya había migrado no encontraba el
// diario, daba las veinte migraciones por pendientes y moría en la primera
// tabla que ya existía («type "canal_notif" already exists»).
const ESQUEMA_DIARIO = 'membresias';

const dir = process.env.MEMBRESIAS_PGLITE_DATA;
if (!dir) {
  console.error('[membresias] Falta MEMBRESIAS_PGLITE_DATA en packages/membresias-db/.env');
  process.exit(1);
}

const pg = new PGlite(dir);
const db = drizzle(pg);

// La misma mudanza que hace `migrarBd`: un PGlite de antes del cambio tiene el
// diario en `drizzle`, y sin moverlo se volvería a migrar desde cero.
await pg.exec(`CREATE SCHEMA IF NOT EXISTS "${ESQUEMA_DIARIO}"`);
try {
  await pg.exec(`ALTER TABLE IF EXISTS drizzle.__drizzle_migrations SET SCHEMA "${ESQUEMA_DIARIO}"`);
} catch {
  // Ya estaba en su sitio y quedó una copia vieja en `drizzle`: manda la buena.
}

await migrate(db, {
  migrationsFolder: join(process.cwd(), 'drizzle', 'migrations'),
  migrationsSchema: ESQUEMA_DIARIO,
});
console.log('[membresias] migraciones aplicadas en', dir);

await pg.close();
console.log('[membresias] setup completado.');
