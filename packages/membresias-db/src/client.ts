import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Parámetros de la URL que postgres-js no entiende y que, si se dejan, acaban
 * enviados al servidor como si fueran opciones de arranque de PostgreSQL. El
 * servidor los rechaza y la conexión falla entera.
 *
 * `channel_binding` viene en la cadena que **Neon** ofrece para copiar y pegar,
 * así que sin esto la primera conexión a Neon muere con un
 * `unrecognized configuration parameter`. El cifrado no se pierde: lo que manda
 * es `sslmode`, que sí se respeta.
 */
const PARAMS_IGNORADOS = ['channel_binding'];

/** Limpia la URL de conexión de parámetros que romperían el arranque. */
export function normalizarUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const p of PARAMS_IGNORADOS) u.searchParams.delete(p);
    return u.toString();
  } catch {
    // Cadena con formato raro: se deja como está y que falle con su propio
    // error, que será más claro que uno inventado aquí.
    return url;
  }
}

/**
 * Conexión a la BD propia de Membresías.
 * - Producción (Neon, Supabase u otro PostgreSQL): cliente `postgres`
 *   (postgres-js) vía `MEMBRESIAS_DATABASE_URL`.
 * - Desarrollo local sin servidor: si `MEMBRESIAS_PGLITE_DATA` está definida, se usa
 *   una base **PGlite embebida** persistida en esa carpeta. Las dependencias de
 *   PGlite se cargan solo en esta rama para no afectar producción.
 */
function crearDb(): PostgresJsDatabase<typeof schema> {
  if (process.env.MEMBRESIAS_PGLITE_DATA) {
    /* eslint-disable @typescript-eslint/no-var-requires */
    const { PGlite } = require('@electric-sql/pglite');
    const { drizzle: pgliteDrizzle } = require('drizzle-orm/pglite');
    /* eslint-enable @typescript-eslint/no-var-requires */
    const client = new PGlite(process.env.MEMBRESIAS_PGLITE_DATA);
    return pgliteDrizzle(client, {
      schema,
    }) as unknown as PostgresJsDatabase<typeof schema>;
  }

  const client = postgres(normalizarUrl(process.env.MEMBRESIAS_DATABASE_URL!), {
    // Obligatorio detrás de un pooler en modo transacción: el de Neon
    // (`-pooler` en el host) y el de Supabase. Sin esto, las sentencias
    // preparadas se pierden entre conexiones del pool.
    prepare: false,
  });
  return drizzle(client, { schema });
}

// Inicialización perezosa: no abrimos la conexión (ni el PGlite embebido) hasta el
// primer uso, para que importar el paquete (p. ej. solo por el schema en tests) no
// tenga efectos secundarios.
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
