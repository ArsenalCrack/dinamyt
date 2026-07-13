import {
  uuid,
  varchar,
  text,
  boolean,
  integer,
  decimal,
  timestamp,
  uniqueIndex,
  jsonb,
} from 'drizzle-orm/pg-core';
import { aca, tipoPreguntaEnum, estadoIntentoEnum, tipoEvaluacionEnum } from './_schema';
import { martialArts, grades } from './artes';

// ── Evaluaciones por grado (RF-ACA-16..21) ───────────────────────────────────

/** Evaluación de un grado: preguntas de opción múltiple (calificación
 *  automática) y/o de evidencia multimedia (calificación manual). La nota
 *  final es la suma ponderada: `mcWeight`% opción múltiple, el resto evidencias
 *  (RF-ACA-21). Si solo hay un tipo de pregunta, esa parte vale 100%. */
export const evaluations = aca.table('evaluations', {
  id: uuid('id').primaryKey().defaultRandom(),
  martialArtId: uuid('martial_art_id')
    .notNull()
    .references(() => martialArts.id),
  gradeId: uuid('grade_id')
    .notNull()
    .references(() => grades.id),
  title: varchar('title', { length: 160 }).notNull(),
  description: text('description'),
  /** Cuestionario / tarea / actividad (etiqueta pedagógica). */
  kind: tipoEvaluacionEnum('kind').notNull().default('cuestionario'),
  maxAttempts: integer('max_attempts').notNull().default(1),
  /** Desde cuándo está disponible (RF-ACA-16); null = ya disponible. */
  availableFrom: timestamp('available_from'),
  /** Fecha límite de entrega; null = sin vencimiento. */
  dueAt: timestamp('due_at'),
  /** Peso (0-100) del bloque de opción múltiple en la nota final. */
  mcWeight: integer('mc_weight').notNull().default(50),
  createdByUserId: uuid('created_by_user_id').notNull(),
  isDeleted: boolean('is_deleted').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

/** Pregunta de una evaluación. `points` pondera dentro de su bloque. */
export const questions = aca.table('questions', {
  id: uuid('id').primaryKey().defaultRandom(),
  evaluationId: uuid('evaluation_id')
    .notNull()
    .references(() => evaluations.id),
  type: tipoPreguntaEnum('type').notNull(),
  prompt: text('prompt').notNull(),
  points: integer('points').notNull().default(1),
  orderIndex: integer('order_index').notNull().default(0),
});

/** Opción de una pregunta de opción múltiple. */
export const questionOptions = aca.table('question_options', {
  id: uuid('id').primaryKey().defaultRandom(),
  questionId: uuid('question_id')
    .notNull()
    .references(() => questions.id),
  text: text('text').notNull(),
  isCorrect: boolean('is_correct').notNull().default(false),
  orderIndex: integer('order_index').notNull().default(0),
});

/** Intento de un estudiante. `gradeNameSnapshot` congela el cinturón con el
 *  que rindió (historial inmutable). Notas en escala 0-100. */
export const attempts = aca.table(
  'attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    evaluationId: uuid('evaluation_id')
      .notNull()
      .references(() => evaluations.id),
    studentUserId: uuid('student_user_id').notNull(),
    attemptNumber: integer('attempt_number').notNull(),
    status: estadoIntentoEnum('status').notNull().default('EN_CURSO'),
    mcScore: decimal('mc_score', { precision: 5, scale: 2 }),
    evidenceScore: decimal('evidence_score', { precision: 5, scale: 2 }),
    finalScore: decimal('final_score', { precision: 5, scale: 2 }),
    gradeNameSnapshot: varchar('grade_name_snapshot', { length: 80 }),
    /** Observación GENERAL del maestro sobre el intento (además del feedback
     *  por pregunta). */
    teacherComment: text('teacher_comment'),
    startedAt: timestamp('started_at').defaultNow(),
    submittedAt: timestamp('submitted_at'),
    gradedAt: timestamp('graded_at'),
  },
  (t) => [
    uniqueIndex('uq_attempt_n').on(t.evaluationId, t.studentUserId, t.attemptNumber),
  ],
);

/** Respuesta de un intento a una pregunta: opción elegida (auto) o URL de
 *  evidencia (manual, con retroalimentación del maestro — RF-ACA-20). */
export const answers = aca.table(
  'answers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    attemptId: uuid('attempt_id')
      .notNull()
      .references(() => attempts.id),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id),
    selectedOptionId: uuid('selected_option_id').references(() => questionOptions.id),
    evidenceUrl: text('evidence_url'),
    /** Opción múltiple: resultado automático. */
    isCorrect: boolean('is_correct'),
    /** Evidencia: puntos otorgados por el maestro (0..points de la pregunta). */
    score: decimal('score', { precision: 5, scale: 2 }),
    feedback: text('feedback'),
    /** Desglose de rúbrica calificada: [{label, score, max}] (snapshot). */
    criteriaScores: jsonb('criteria_scores'),
    gradedByUserId: uuid('graded_by_user_id'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [uniqueIndex('uq_answer').on(t.attemptId, t.questionId)],
);
