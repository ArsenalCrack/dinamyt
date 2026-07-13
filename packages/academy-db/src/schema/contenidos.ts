import {
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { aca, tipoContenidoEnum } from './_schema';
import { martialArts, grades } from './artes';

// ── Contenidos por grado (RF-ACA-10..15) ─────────────────────────────────────

/** Unidad de contenido de un arte marcial y grado: documento (PDF), video
 *  embebido (YouTube/Drive), imagen o texto enriquecido. Soft delete: eliminar
 *  NO afecta el historial de evaluaciones (RF-ACA-13, RNF-ACA-06). */
export const contents = aca.table('contents', {
  id: uuid('id').primaryKey().defaultRandom(),
  martialArtId: uuid('martial_art_id')
    .notNull()
    .references(() => martialArts.id),
  gradeId: uuid('grade_id')
    .notNull()
    .references(() => grades.id),
  title: varchar('title', { length: 160 }).notNull(),
  description: text('description'),
  type: tipoContenidoEnum('type').notNull(),
  /** documento/video/imagen: URL (Supabase Storage o embed YouTube/Drive). */
  url: text('url'),
  /** texto: cuerpo enriquecido (markdown/HTML simple). */
  body: text('body'),
  orderIndex: integer('order_index').notNull().default(0),
  createdByUserId: uuid('created_by_user_id').notNull(),
  isDeleted: boolean('is_deleted').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

/** Primera vista de una unidad por estudiante (RF-ACA-15): alimenta el % de
 *  progreso. Única por (contenido, estudiante) → registrar es idempotente. */
export const contentViews = aca.table(
  'content_views',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contentId: uuid('content_id')
      .notNull()
      .references(() => contents.id),
    studentUserId: uuid('student_user_id').notNull(),
    viewedAt: timestamp('viewed_at').defaultNow(),
  },
  (t) => [uniqueIndex('uq_content_view').on(t.contentId, t.studentUserId)],
);
