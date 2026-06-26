import {
  pgSchema,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  decimal,
} from 'drizzle-orm/pg-core';

// ── Schema de PostgreSQL ───────────────────────────────────────────────────
const eco = pgSchema('ecosystem');

// ── Enums ──────────────────────────────────────────────────────────────────
export const orgTypeEnum = eco.enum('org_type', [
  'FEDERATION',
  'LEAGUE',
  'CLUB',
  'ACADEMY',
]);

export const subscriptionStatusEnum = eco.enum('subscription_status', [
  'ACTIVE',
  'EXPIRED',
  'SUSPENDED',
  'PENDING_REVIEW',
]);

export const paymentStatusEnum = eco.enum('payment_status', [
  'PAID',
  'PARTIAL',
  'PENDING',
]);

// ── Tabla: organizations ───────────────────────────────────────────────────
export const organizations = eco.table('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 200 }).notNull(),
  type: orgTypeEnum('type').notNull(),
  parentId: uuid('parent_id'),
  email: varchar('email', { length: 200 }),
  phone: varchar('phone', { length: 30 }),
  city: varchar('city', { length: 100 }),
  country: varchar('country', { length: 100 }).default('Colombia'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ── Tabla: users ───────────────────────────────────────────────────────────
export const users = eco.table('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 200 }).notNull().unique(),
  documentId: varchar('document_id', { length: 30 }).notNull().unique(),
  fullName: varchar('full_name', { length: 200 }).notNull(),
  phone: varchar('phone', { length: 30 }),
  birthDate: timestamp('birth_date'),
  avatarUrl: text('avatar_url'),
  passwordHash: text('password_hash').notNull(),
  isEmailVerified: boolean('is_email_verified').default(false),
  isActive: boolean('is_active').default(true),
  isSuperAdmin: boolean('is_super_admin').default(false),
  dataConsentAt: timestamp('data_consent_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ── Tabla: otp_codes ───────────────────────────────────────────────────────
export const otpCodes = eco.table('otp_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  code: varchar('code', { length: 6 }).notNull(),
  type: varchar('type', { length: 30 }).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

// ── Tabla: org_members ─────────────────────────────────────────────────────
export const orgMembers = eco.table('org_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  role: varchar('role', { length: 50 }).notNull().default('member'),
  joinedAt: timestamp('joined_at').defaultNow(),
  invitedByUserId: uuid('invited_by_user_id').references(() => users.id),
});

// ── Tabla: subscription_plans ──────────────────────────────────────────────
export const subscriptionPlans = eco.table('subscription_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 200 }).notNull(),
  description: text('description'),
  appsIncluded: text('apps_included').array().notNull(),
  maxUsers: integer('max_users'),
  priceMonthly: decimal('price_monthly', { precision: 10, scale: 2 }),
  priceAnnual: decimal('price_annual', { precision: 10, scale: 2 }),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

// ── Tabla: subscriptions (organizacionales) ────────────────────────────────
export const subscriptions = eco.table('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  planId: uuid('plan_id')
    .notNull()
    .references(() => subscriptionPlans.id),
  status: subscriptionStatusEnum('status').default('PENDING_REVIEW'),
  startsAt: timestamp('starts_at').notNull(),
  endsAt: timestamp('ends_at').notNull(),
  totalAmount: decimal('total_amount', { precision: 10, scale: 2 }),
  paidAmount: decimal('paid_amount', { precision: 10, scale: 2 }).default('0'),
  paymentStatus: paymentStatusEnum('payment_status').default('PENDING'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ── Tabla: user_subscriptions (personales) ─────────────────────────────────
export const userSubscriptions = eco.table('user_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  planId: uuid('plan_id')
    .notNull()
    .references(() => subscriptionPlans.id),
  status: subscriptionStatusEnum('status').default('ACTIVE'),
  startsAt: timestamp('starts_at').notNull(),
  endsAt: timestamp('ends_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// ── Tabla: audit_auth ──────────────────────────────────────────────────────
export const auditAuth = eco.table('audit_auth', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  event: varchar('event', { length: 50 }).notNull(),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  metadata: text('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
});
