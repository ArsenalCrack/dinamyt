import { uuid, varchar, text, timestamp } from 'drizzle-orm/pg-core';
import {
  mem,
  canalNotifEnum,
  tipoNotifEnum,
  estadoNotifEnum,
} from './_schema';
import { memberships } from './planes';

// ── Suscripciones Web Push (VAPID) ───────────────────────────────────────────
export const pushSubscriptions = mem.table('push_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  endpoint: text('endpoint').notNull(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ── Avisos encolados/enviados ────────────────────────────────────────────────
export const notifications = mem.table('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  membershipId: uuid('membership_id').references(() => memberships.id),
  type: tipoNotifEnum('type').notNull(),
  channel: canalNotifEnum('channel').notNull(),
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  status: estadoNotifEnum('status').notNull().default('PENDIENTE'),
  /**
   * Cuándo lo abrió su destinatario. `null` = sin leer, y eso es exactamente
   * lo que cuenta la campana: antes el contador miraba la fecha del aviso, así
   * que al día siguiente los pendientes desaparecían del número aunque nadie
   * los hubiera mirado nunca.
   */
  readAt: timestamp('read_at', { withTimezone: true }),
  /**
   * Cuándo lo dio por visto QUIEN LLEVA EL CLUB. No es lo mismo que `read_at`.
   *
   * ── Por qué hacen falta las dos ──
   *
   * La misma fila la miran dos personas distintas y para dos cosas distintas.
   * Para el alumno es un recado —«tu mensualidad venció»— y `read_at` dice si
   * ya lo abrió. Para el maestro es una TAREA —«a éste hay que cobrarle»— y su
   * campana (`?all=1`) lista las de todos sus alumnos.
   *
   * Con una sola columna no se podía servir a los dos: si el maestro marcaba
   * leído, le borraba el recado al alumno sin que lo hubiera visto; y como no
   * podía marcar nada, su campana se quedaba enseñando lo mismo para siempre —
   * abría el aviso, lo leía, y ahí seguía. Eso es lo que hace que a la tercera
   * vez se deje de mirar la campana, y con ella se pierda la que sí importaba.
   *
   * ── Lo que esta columna NO distingue ──
   *
   * A un gestor de otro. Es una sola marca por fila, así que en un club con
   * maestro y auxiliar, lo que uno da por visto desaparece para los dos. Es
   * deliberado: la campana del club es una lista de trabajo compartida, como
   * una bandeja de entrada de equipo, y lo caro sería que cada uno tuviera que
   * descartar la misma tarea. Y lo que se pierde es poco: el aviso vuelve
   * mañana si el alumno sigue debiendo, y entretanto la deuda se ve en la lista
   * de alumnos, que es de donde se cobra.
   */
  staffReadAt: timestamp('staff_read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ── Auditoría de acciones sensibles (pagos, edición, borrado) ────────────────
export const audit = mem.table('audit', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id'),
  actorUserId: uuid('actor_user_id'),
  action: varchar('action', { length: 80 }).notNull(),
  entity: varchar('entity', { length: 80 }),
  entityId: uuid('entity_id'),
  metadata: text('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
