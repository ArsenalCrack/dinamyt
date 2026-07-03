import {
  uuid,
  varchar,
  text,
  boolean,
  integer,
  decimal,
  timestamp,
  date,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import {
  mem,
  tipoPlanEnum,
  metodoPagoEnum,
  estadoPagoEnum,
  estadoMembresiaEnum,
} from './_schema';

// ── Planes / tarifas del club ────────────────────────────────────────────────
export const plans = mem.table('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  type: tipoPlanEnum('type').notNull(),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  /** Solo para semanal (=7); mensual usa mes calendario, no días. */
  durationDays: integer('duration_days'),
  /** Solo para paquete/clase. */
  nClasses: integer('n_classes'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ── Membresía: estado del alumno EN ESTE club ────────────────────────────────
// El perfil de la persona vive en `ecosystem`; aquí solo el estado del club.
export const memberships = mem.table(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    /** UUID de la persona en el ecosistema (sin FK entre bases). */
    ecosystemUserId: uuid('ecosystem_user_id').notNull(),
    /** Acudiente que paga en este club (opcional). */
    payerUserId: uuid('payer_user_id'),
    status: estadoMembresiaEnum('status').notNull().default('activo'),
    statusReason: text('status_reason'),
    matriculado: boolean('matriculado').default(false),
    currentPlanId: uuid('current_plan_id').references(() => plans.id),
    /** Planes por tiempo: fecha de vencimiento vigente. */
    venceEl: date('vence_el'),
    /** Día ancla del mes para el ciclo mensual (§3.3 impl). */
    anchorDay: integer('anchor_day'),
    /** Planes por paquete/clase: clases disponibles. */
    clasesRestantes: integer('clases_restantes'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [uniqueIndex('uq_membership_org_user').on(t.orgId, t.ecosystemUserId)],
);

// ── Pagos (el cobro es externo; aquí solo se registran) ──────────────────────
export const payments = mem.table('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  membershipId: uuid('membership_id')
    .notNull()
    .references(() => memberships.id),
  planId: uuid('plan_id')
    .notNull()
    .references(() => plans.id),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  method: metodoPagoEnum('method').notNull(),
  status: estadoPagoEnum('status').notNull().default('PAGADO'),
  paidAt: timestamp('paid_at').defaultNow(),
  /** user_id del ecosistema que registró el pago (maestro o auxiliar). */
  registeredByUserId: uuid('registered_by_user_id').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
});
