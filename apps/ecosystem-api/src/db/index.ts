import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import * as dotenv from 'dotenv';
dotenv.config();

/**
 * Conexión a la BD del ecosistema.
 * - Producción / Supabase: cliente `postgres` (postgres-js) vía `DATABASE_URL`.
 * - Desarrollo local sin servidor: si `PGLITE_DATA` está definida, se usa una
 *   base **PGlite embebida** persistida en esa carpeta (Postgres en WASM). Las
 *   dependencias de PGlite se cargan solo en esta rama para no afectar prod.
 */
function crearDb(): PostgresJsDatabase<typeof schema> {
  if (process.env.PGLITE_DATA) {
    /* eslint-disable @typescript-eslint/no-var-requires */
    const { PGlite } = require('@electric-sql/pglite');
    const { drizzle: pgliteDrizzle } = require('drizzle-orm/pglite');
    /* eslint-enable @typescript-eslint/no-var-requires */
    const client = new PGlite(process.env.PGLITE_DATA);
    return pgliteDrizzle(client, {
      schema,
    }) as unknown as PostgresJsDatabase<typeof schema>;
  }

  const client = postgres(process.env.DATABASE_URL!, {
    prepare: false, // ← obligatorio con Supabase pooler
  });
  return drizzle(client, { schema });
}

// Inicialización perezosa: no abrimos la conexión (ni el PGlite embebido) hasta
// el primer uso, para que importar este módulo no tenga efectos secundarios.
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
