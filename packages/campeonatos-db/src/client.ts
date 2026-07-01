import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Conexión a la BD propia de Campeonatos.
 * - Producción / Supabase: cliente `postgres` (postgres-js) vía `CAMPEONATOS_DATABASE_URL`.
 * - Desarrollo local sin servidor: si `CAMPEONATOS_PGLITE_DATA` está definida, se
 *   usa una base **PGlite embebida** persistida en esa carpeta. Las dependencias
 *   de PGlite se cargan solo en esta rama para no afectar producción.
 */
function crearDb(): PostgresJsDatabase<typeof schema> {
  if (process.env.CAMPEONATOS_PGLITE_DATA) {
    /* eslint-disable @typescript-eslint/no-var-requires */
    const { PGlite } = require('@electric-sql/pglite');
    const { drizzle: pgliteDrizzle } = require('drizzle-orm/pglite');
    /* eslint-enable @typescript-eslint/no-var-requires */
    const client = new PGlite(process.env.CAMPEONATOS_PGLITE_DATA);
    return pgliteDrizzle(client, {
      schema,
    }) as unknown as PostgresJsDatabase<typeof schema>;
  }

  const client = postgres(process.env.CAMPEONATOS_DATABASE_URL!, {
    prepare: false, // obligatorio con el pooler de Supabase
  });
  return drizzle(client, { schema });
}

// Inicialización perezosa: no abrimos la conexión (ni el PGlite embebido) hasta
// el primer uso, para que importar el paquete (p. ej. solo por el schema en
// tests) no tenga efectos secundarios.
let instancia: PostgresJsDatabase<typeof schema> | undefined;
function obtenerDb(): PostgresJsDatabase<typeof schema> {
  if (!instancia) instancia = crearDb();
  return instancia;
}

export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_target, prop) {
    const real = obtenerDb() as unknown as Record<string | symbol, unknown>;
    const valor = real[prop];
    return typeof valor === 'function'
      ? (valor as (...args: unknown[]) => unknown).bind(real)
      : valor;
  },
});
export type Db = PostgresJsDatabase<typeof schema>;
