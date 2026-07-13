import {
  uuid,
  varchar,
  text,
  boolean,
  decimal,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core';
import { aca, estadoFiguraEnum } from './_schema';
import { martialArts, grades } from './artes';

// ── Figuras (katas) con visión por computador — módulo dinamyt-figuras ──────
// El maestro sube la figura de REFERENCIA por cinturón; el estudiante graba la
// suya y el microservicio (MediaPipe + DTW) la compara: score por articulación,
// correcciones con marca de tiempo e imágenes comparativas.

/** Figura de referencia de un grado, subida por el maestro. */
export const referenceFigures = aca.table('reference_figures', {
  id: uuid('id').primaryKey().defaultRandom(),
  martialArtId: uuid('martial_art_id')
    .notNull()
    .references(() => martialArts.id),
  gradeId: uuid('grade_id')
    .notNull()
    .references(() => grades.id),
  name: varchar('name', { length: 160 }).notNull(),
  description: text('description'),
  /** Ruta del video dentro del almacén de archivos de Academy. */
  videoPath: varchar('video_path', { length: 300 }).notNull(),
  /** Ruta del .npz con ángulos/landmarks precalculados por el servicio. */
  anglesPath: varchar('angles_path', { length: 300 }),
  /** % de frames con pose detectada al extraer la referencia. */
  detectionRate: decimal('detection_rate', { precision: 5, scale: 1 }),
  uploadedByUserId: uuid('uploaded_by_user_id').notNull(),
  isDeleted: boolean('is_deleted').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

/** Intento del estudiante contra una referencia. `resultJson` guarda el
 *  reporte completo del servicio (score por articulación, correcciones con
 *  timestamps mm:ss, rutas de imágenes comparativas). */
export const figureAttempts = aca.table('figure_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  referenceFigureId: uuid('reference_figure_id')
    .notNull()
    .references(() => referenceFigures.id),
  studentUserId: uuid('student_user_id').notNull(),
  videoPath: varchar('video_path', { length: 300 }).notNull(),
  status: estadoFiguraEnum('status').notNull().default('PROCESANDO'),
  /** Nota global 0-100. */
  score: decimal('score', { precision: 5, scale: 2 }),
  resultJson: jsonb('result_json'),
  reportImgPath: varchar('report_img_path', { length: 300 }),
  annotatedVideoPath: varchar('annotated_video_path', { length: 300 }),
  errorMsg: text('error_msg'),
  /** Cinturón con el que se intentó (historial inmutable). */
  gradeNameSnapshot: varchar('grade_name_snapshot', { length: 80 }),
  createdAt: timestamp('created_at').defaultNow(),
  completedAt: timestamp('completed_at'),
});
