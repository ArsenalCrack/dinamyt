import { uuid, varchar, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { mem } from './_schema';

/**
 * Interruptores globales de la instalación.
 *
 * Clave → valor JSON. Hoy solo lo usa el modo mantenimiento (ver
 * `apps/membresias-api/src/lib/mantenimiento.ts`), y por eso es una tabla de
 * dos columnas y no una fila con una columna por opción: añadir el siguiente
 * interruptor no obliga a migrar el esquema de nadie.
 *
 * Es la ÚNICA tabla que no pertenece a ningún club: lo que se guarda aquí lo
 * decide el superadmin y afecta a todos. Su política de RLS lo refleja —
 * cualquiera puede leerla, solo `acceso_total()` puede escribirla (ver
 * `drizzle/migrations/0012_modo_mantenimiento.sql`).
 */
export const appSettings = mem.table('app_settings', {
  key: varchar('key', { length: 60 }).primaryKey(),
  value: jsonb('value'),
  /** Quién lo cambió por última vez (trazabilidad, no una relación fuerte). */
  updatedById: uuid('updated_by_id'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
