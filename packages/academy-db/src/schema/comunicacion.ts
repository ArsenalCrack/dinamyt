import {
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { aca } from './_schema';
import { martialArts, grades } from './artes';

// ── Notificaciones y anuncios ────────────────────────────────────────────────

/** Notificación in-app para una persona (campana de la web): nueva tarea,
 *  intento por revisar, calificación lista, avance de grado, anuncio… */
export const notifications = aca.table(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    /** Etiqueta corta del evento: tarea_nueva, por_revisar, calificado,
     *  avance_grado, anuncio, material_nuevo, solicitud_resuelta, figura_lista. */
    type: varchar('type', { length: 40 }).notNull(),
    title: varchar('title', { length: 160 }).notNull(),
    body: text('body'),
    /** Ruta dentro de academy-web a la que lleva el clic. */
    link: varchar('link', { length: 240 }),
    readAt: timestamp('read_at'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => [index('ix_notif_user').on(t.userId, t.readAt)],
);

/** Anuncio del maestro para su arte marcial (o un grado concreto). */
export const announcements = aca.table('announcements', {
  id: uuid('id').primaryKey().defaultRandom(),
  martialArtId: uuid('martial_art_id')
    .notNull()
    .references(() => martialArts.id),
  /** null = para toda el arte marcial. */
  gradeId: uuid('grade_id').references(() => grades.id),
  title: varchar('title', { length: 160 }).notNull(),
  body: text('body'),
  createdByUserId: uuid('created_by_user_id').notNull(),
  /** Snapshot del nombre (historial estable aunque cambie el perfil). */
  createdByName: varchar('created_by_name', { length: 160 }),
  isDeleted: boolean('is_deleted').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
});
