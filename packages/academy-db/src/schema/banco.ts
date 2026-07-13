import {
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core';
import { aca, tipoPreguntaEnum } from './_schema';
import { martialArts } from './artes';
import { questions } from './evaluaciones';

// ── Rúbricas y banco de preguntas ────────────────────────────────────────────

/** Criterio de rúbrica de una pregunta de EVIDENCIA: el maestro califica cada
 *  criterio (0..maxPoints) y la nota de la pregunta es la suma. */
export const questionCriteria = aca.table('question_criteria', {
  id: uuid('id').primaryKey().defaultRandom(),
  questionId: uuid('question_id')
    .notNull()
    .references(() => questions.id),
  label: varchar('label', { length: 160 }).notNull(),
  maxPoints: integer('max_points').notNull().default(1),
  orderIndex: integer('order_index').notNull().default(0),
});

/** Pregunta guardada en el BANCO personal del maestro, reutilizable entre
 *  evaluaciones. `opciones`/`criterios` van como JSON (es una plantilla, no
 *  participa del historial de intentos). */
export const questionBank = aca.table('question_bank', {
  id: uuid('id').primaryKey().defaultRandom(),
  teacherUserId: uuid('teacher_user_id').notNull(),
  martialArtId: uuid('martial_art_id')
    .notNull()
    .references(() => martialArts.id),
  type: tipoPreguntaEnum('type').notNull(),
  prompt: text('prompt').notNull(),
  points: integer('points').notNull().default(1),
  /** MC: [{text, isCorrect}] */
  opciones: jsonb('opciones'),
  /** Evidencia: [{label, maxPoints}] */
  criterios: jsonb('criterios'),
  isDeleted: boolean('is_deleted').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
});
