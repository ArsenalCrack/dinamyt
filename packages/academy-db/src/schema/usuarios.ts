import {
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { aca, rolAcademyEnum, estadoSolicitudEnum } from './_schema';
import { martialArts, grades } from './artes';

// ── Usuarios locales, matrícula y avance de grado ────────────────────────────

/** Espejo local del usuario del ecosistema (RF-ACA-05/26): sincroniza nombre y
 *  correo sin duplicar la identidad. `localRole` (si existe) prevalece sobre el
 *  `role_academy` del token; `suspended`/`deletedAt` solo afectan a Academy. */
export const academyUsers = aca.table(
  'academy_users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** UUID de la persona en el ecosistema (sin FK entre bases). */
    ecosystemUserId: uuid('ecosystem_user_id').notNull(),
    fullName: varchar('full_name', { length: 160 }),
    email: varchar('email', { length: 160 }),
    localRole: rolAcademyEnum('local_role'),
    /** Foto de perfil (data-URL comprimida), sincronizada del ecosystem. */
    avatarUrl: text('avatar_url'),
    /**
     * Zona horaria IANA de la persona, espejada del token del ecosystem.
     *
     * Academy no la pregunta ni la elige. Existe porque hay textos que se
     * escriben en el SERVIDOR, cuando la persona no está delante —el aviso de
     * «evaluación nueva, vence el …»—, y ahí no hay navegador que ponga la
     * hora buena: salían con la del VPS para todo el mundo.
     */
    timezone: varchar('timezone', { length: 64 }),
    suspended: boolean('suspended').notNull().default(false),
    /** Soft delete local (RNF-ACA-06): no toca la cuenta del ecosistema. */
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [uniqueIndex('uq_academy_user').on(t.ecosystemUserId)],
);

/** Matrícula de un estudiante en un arte marcial, con su grado ACTUAL.
 *  El estudiante accede al contenido de su grado y los anteriores (RF-ACA-14). */
export const enrollments = aca.table(
  'enrollments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentUserId: uuid('student_user_id').notNull(),
    martialArtId: uuid('martial_art_id')
      .notNull()
      .references(() => martialArts.id),
    currentGradeId: uuid('current_grade_id')
      .notNull()
      .references(() => grades.id),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [uniqueIndex('uq_enrollment').on(t.studentUserId, t.martialArtId)],
);

/** Historial INMUTABLE de avances de grado (RF-ACA-23/24 y requisito
 *  transversal del ecosistema): los nombres se guardan como snapshot de texto
 *  para que el historial muestre el estado AL MOMENTO del avance aunque el
 *  catálogo cambie después. */
export const gradeAdvancements = aca.table('grade_advancements', {
  id: uuid('id').primaryKey().defaultRandom(),
  enrollmentId: uuid('enrollment_id')
    .notNull()
    .references(() => enrollments.id),
  fromGradeId: uuid('from_grade_id'),
  toGradeId: uuid('to_grade_id').notNull(),
  /** Snapshots inmutables (texto, no FK). */
  fromGradeName: varchar('from_grade_name', { length: 80 }),
  toGradeName: varchar('to_grade_name', { length: 80 }).notNull(),
  approvedByUserId: uuid('approved_by_user_id').notNull(),
  approvedByName: varchar('approved_by_name', { length: 160 }),
  notes: text('notes'),
  /** Ruta relativa del certificado oficial subido por el maestro (PDF/imagen).
   *  Null si aún no se ha subido. Se sirve vía /files/<ruta>. */
  certificateUrl: text('certificate_url'),
  advancedAt: timestamp('advanced_at').defaultNow(),
});

/** Solicitud para ser maestro (RF-ACA-27): el admin la aprueba o rechaza. */
export const teacherRequests = aca.table('teacher_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  fullName: varchar('full_name', { length: 160 }),
  martialArtId: uuid('martial_art_id').references(() => martialArts.id),
  message: text('message'),
  status: estadoSolicitudEnum('status').notNull().default('PENDIENTE'),
  resolvedByUserId: uuid('resolved_by_user_id'),
  resolvedAt: timestamp('resolved_at'),
  createdAt: timestamp('created_at').defaultNow(),
});
