import { uuid, varchar, text, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { camp } from './_schema';
import { campeonatos } from './campeonato';
import { inscripciones } from './competidor';
import { secciones } from './seccion';

// ── Auditoría general ────────────────────────────────────────────────────────
// Puntajes, pagos y movimientos de categoría registran usuario, fecha y hora
// (RNF-CAM-08; validez jurídica de los registros, Ley 527, §11.2).
export const auditoria = camp.table('auditoria', {
  id: uuid('id').primaryKey().defaultRandom(),
  campeonatoId: uuid('campeonato_id').references(() => campeonatos.id),
  entidad: varchar('entidad', { length: 50 }).notNull(),
  entidadId: varchar('entidad_id', { length: 64 }),
  accion: varchar('accion', { length: 50 }).notNull(),
  /** user_id del ecosistema que ejecutó la acción. */
  userId: uuid('user_id'),
  datos: jsonb('datos'),
  createdAt: timestamp('created_at').defaultNow(),
});

// ── Movimiento manual de competidor entre categorías (R6, RF-CAM-07) ─────────
export const movimientosCategoria = camp.table('movimientos_categoria', {
  id: uuid('id').primaryKey().defaultRandom(),
  inscripcionId: uuid('inscripcion_id')
    .notNull()
    .references(() => inscripciones.id),
  seccionOrigenId: uuid('seccion_origen_id').references(() => secciones.id),
  seccionDestinoId: uuid('seccion_destino_id').references(() => secciones.id),
  motivo: text('motivo').notNull(),
  movidoPorUserId: uuid('movido_por_user_id'),
  createdAt: timestamp('created_at').defaultNow(),
});
