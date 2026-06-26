import {
  uuid,
  varchar,
  timestamp,
  integer,
  decimal,
  jsonb,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { camp, ganadorCombateEnum, estadoSeccionEnum } from './_schema';
import { secciones } from './seccion';
import { competidores } from './competidor';

// ── Llave / Bracket de una sección de combate ────────────────────────────────
// La estructura del cuadro (competidores sorteados, byes, rondas y avance de
// ganadores) se guarda en JSON, igual que en DINAMYT-COMBAT (§8.3).
export const llaves = camp.table('llaves', {
  id: uuid('id').primaryKey().defaultRandom(),
  seccionId: uuid('seccion_id')
    .notNull()
    .references(() => secciones.id),
  estructura: jsonb('estructura').notNull(),
  estado: estadoSeccionEnum('estado').notNull().default('EN_ESPERA'),
  createdAt: timestamp('created_at').defaultNow(),
});

// ── Combate individual (1 vs 1) ──────────────────────────────────────────────
// hong = esquina roja, chung = esquina azul. A diferencia de COMBAT, los
// competidores son referencias reales (no texto libre).
export const combates = camp.table('combates', {
  id: uuid('id').primaryKey().defaultRandom(),
  seccionId: uuid('seccion_id').references(() => secciones.id),
  competidorHongId: uuid('competidor_hong_id').references(() => competidores.id),
  competidorChungId: uuid('competidor_chung_id').references(() => competidores.id),
  marcadorHong: decimal('marcador_hong', { precision: 6, scale: 2 }).default('0'),
  marcadorChung: decimal('marcador_chung', { precision: 6, scale: 2 }).default('0'),
  /** Puntos de réferis de esquina (§7.5). */
  esqHong: decimal('esq_hong', { precision: 6, scale: 2 }).default('0'),
  esqChung: decimal('esq_chung', { precision: 6, scale: 2 }).default('0'),
  /** Puntos del juez de mesa / canto del central (§7.5). */
  centralHong: decimal('central_hong', { precision: 6, scale: 2 }).default('0'),
  centralChung: decimal('central_chung', { precision: 6, scale: 2 }).default('0'),
  kyongHong: integer('kyong_hong').default(0),
  kyongChung: integer('kyong_chung').default(0),
  faltasHong: integer('faltas_hong').default(0),
  faltasChung: integer('faltas_chung').default(0),
  numJueces: integer('num_jueces').default(4),
  duracionSegundos: integer('duracion_segundos').default(120),
  ronda: varchar('ronda', { length: 30 }),
  ganador: ganadorCombateEnum('ganador'),
  /** Historial completo y detalle por juez (JSON, como en COMBAT). */
  detalle: jsonb('detalle'),
  inicio: timestamp('inicio'),
  fin: timestamp('fin'),
  createdAt: timestamp('created_at').defaultNow(),
});

// ── Eventos del combate (event sourcing para replay y auditoría) ─────────────
export const eventosCombate = camp.table(
  'eventos_combate',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    combateId: uuid('combate_id')
      .notNull()
      .references(() => combates.id),
    /** Id idempotente del evento (dedupe al sincronizar desde el módulo local). */
    evId: varchar('ev_id', { length: 100 }),
    accion: varchar('accion', { length: 50 }).notNull(),
    datos: jsonb('datos'),
    secuencia: integer('secuencia').default(0),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => [uniqueIndex('uq_evento_ev_id').on(t.evId)],
);
