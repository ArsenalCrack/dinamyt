import {
  uuid,
  varchar,
  timestamp,
  jsonb,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { camp } from './_schema';
import { campeonatos } from './campeonato';
import { inscripciones } from './competidor';

/** Estado de una invitación a competir (modelo de DINAMYT-PROJECT). */
export const estadoInvitacionEnum = camp.enum('estado_invitacion', [
  'PENDIENTE',
  'ACEPTADA',
  'RECHAZADA',
]);

// ── Invitaciones a competidores (§6.2, flujo de PROJECT) ─────────────────────
// El admin/coach invita por email; el competidor la ve al iniciar sesión
// (notificación in-app) y/o recibe un correo, y al aceptar elige modalidades
// y completa sus datos → se crea su inscripción.
export const invitaciones = camp.table(
  'invitaciones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campeonatoId: uuid('campeonato_id')
      .notNull()
      .references(() => campeonatos.id),
    /** Email de la cuenta del ecosystem invitada (en minúsculas). */
    email: varchar('email', { length: 200 }).notNull(),
    estado: estadoInvitacionEnum('estado').notNull().default('PENDIENTE'),
    /** user_id del ecosystem del admin/coach que invitó. */
    invitadoPorUserId: uuid('invitado_por_user_id'),
    /** Rol de quien invitó (admin | maestro): con el evento EN_CURSO solo se
     *  pueden aceptar las invitaciones hechas por el ADMIN. */
    invitadoPorRol: varchar('invitado_por_rol', { length: 20 }),
    /** Inscripción creada al aceptar (null mientras esté pendiente). */
    inscripcionId: uuid('inscripcion_id').references(() => inscripciones.id),
    /** Modalidades elegidas al aceptar (string[]). */
    modalidades: jsonb('modalidades'),
    createdAt: timestamp('created_at').defaultNow(),
    respondidaAt: timestamp('respondida_at'),
  },
  (t) => [uniqueIndex('uq_invitacion_campeonato_email').on(t.campeonatoId, t.email)],
);
