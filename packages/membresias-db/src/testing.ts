import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { join } from 'path';
import * as schema from './schema';
import { ESQUEMA_DIARIO } from './diario';

/**
 * Crea una base de datos Postgres EN MEMORIA (PGlite) con las migraciones ya
 * aplicadas. Pensada para tests de integración sin Docker ni base externa. Cada
 * llamada devuelve una BD aislada.
 */
export async function createTestDb(): Promise<PgliteDatabase<typeof schema>> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, {
    migrationsFolder: join(__dirname, '..', 'drizzle', 'migrations'),
    // Mismo esquema que en producción: si el diario viviera en otro sitio en
    // los tests, dejarían de probar el arranque real. Ver `diario.ts`.
    migrationsSchema: ESQUEMA_DIARIO,
  });
  return db;
}
