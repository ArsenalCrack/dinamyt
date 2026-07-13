import { uuid, varchar, text, timestamp, index } from 'drizzle-orm/pg-core';
import { aca } from './_schema';

// ── Historial de actividad (bitácora para el maestro) ───────────────────────

/** Un evento de actividad de una persona en Academy: cuándo ENTRA a la
 *  plataforma, cuándo VE una unidad, cuándo ENTREGA una tarea/evaluación,
 *  cuándo envía una FIGURA o ASCIENDE de grado. Lo consultan los maestros
 *  (solo de sus artes) y el admin. */
export const activityLog = aca.table(
  'activity_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** UUID de la persona en el ecosistema. */
    userId: uuid('user_id').notNull(),
    /** ingreso | contenido_visto | entrega | intento_figura | avance_grado. */
    type: varchar('type', { length: 40 }).notNull(),
    /** Descripción legible (ej. «Entregó "Tarea: video de caídas"»). */
    detail: text('detail'),
    /** Arte marcial del evento (null en ingresos: son globales). */
    martialArtId: uuid('martial_art_id'),
    /** Id del objeto relacionado (contenido, intento…), si aplica. */
    refId: uuid('ref_id'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => [
    index('ix_activity_user').on(t.userId, t.createdAt),
    index('ix_activity_type').on(t.type, t.createdAt),
  ],
);
