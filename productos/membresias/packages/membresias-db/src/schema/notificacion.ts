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
