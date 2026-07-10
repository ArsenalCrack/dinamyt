import {
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { aca } from './_schema';

// ── Artes marciales y su sistema de grados (RF-ACA-06..09) ──────────────────

/** Arte marcial con su federación de referencia. Deshabilitar NO borra su
 *  contenido asociado (RF-ACA-08). */
export const martialArts = aca.table('martial_arts', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 120 }).notNull().unique(),
  description: text('description'),
  federation: varchar('federation', { length: 160 }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

/** Grado/cinturón de un arte marcial. `orderIndex` define la jerarquía
 *  (1 = primer grado); `groupName` es el grupo de competencia (mismo catálogo
 *  que Campeonatos: BLANCO/PRINCIPIANTE/INTERMEDIO/AVANZADO/NEGRO). */
export const grades = aca.table(
  'grades',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    martialArtId: uuid('martial_art_id')
      .notNull()
      .references(() => martialArts.id),
    name: varchar('name', { length: 80 }).notNull(),
    groupName: varchar('group_name', { length: 40 }),
    orderIndex: integer('order_index').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_grade_order').on(t.martialArtId, t.orderIndex),
    uniqueIndex('uq_grade_name').on(t.martialArtId, t.name),
  ],
);

/** Asignación maestro ↔ arte marcial: solo publica contenido para las artes
 *  asignadas (RF-ACA-09). */
export const teacherMartialArts = aca.table(
  'teacher_martial_arts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** UUID del maestro en el ecosistema (sin FK entre bases). */
    teacherUserId: uuid('teacher_user_id').notNull(),
    martialArtId: uuid('martial_art_id')
      .notNull()
      .references(() => martialArts.id),
    /** Quién hizo la asignación (admin), para auditoría. */
    assignedByUserId: uuid('assigned_by_user_id'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => [uniqueIndex('uq_teacher_art').on(t.teacherUserId, t.martialArtId)],
);
