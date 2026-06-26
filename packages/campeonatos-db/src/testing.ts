import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { join } from 'path';
import * as schema from './schema';

/**
 * Crea una base de datos Postgres EN MEMORIA (PGlite) con las migraciones ya
 * aplicadas. Pensada para tests de integración (api, lógica) sin Docker ni una
 * base de datos externa. Cada llamada devuelve una BD aislada.
 */
export async function createTestDb(): Promise<PgliteDatabase<typeof schema>> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, {
    migrationsFolder: join(__dirname, '..', 'drizzle', 'migrations'),
  });
  return db;
}
