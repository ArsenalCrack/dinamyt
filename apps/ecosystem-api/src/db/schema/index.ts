import {
  pgSchema,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  decimal,
  date,
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
  // ── Ficha pública del club (la llena el maestro/admin del club; la ven sus
  //    miembros desde el portal — «Mi club») ─────────────────────────────────
  description: text('description'),
  address: varchar('address', { length: 200 }),
  schedule: text('schedule'),
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
  // ── Anti fuerza-bruta: contador de intentos fallidos y bloqueo temporal ────
  // (el super-admin puede desbloquear desde el panel /admin del portal)
  failedLoginAttempts: integer('failed_login_attempts').default(0),
  lockedUntil: timestamp('locked_until'),
  // ── Perfil transversal (lo consume Membresías; §6 PLAN_MEMBRESIAS) ──────────
  emergencyContactName: varchar('emergency_contact_name', { length: 200 }),
  emergencyContactPhone: varchar('emergency_contact_phone', { length: 30 }),
  emergencyContactRelationship: varchar('emergency_contact_relationship', {
    length: 50,
  }),
  // Dato sensible (salud): cifrar en la capa de aplicación antes de persistir.
  medicalNotes: text('medical_notes'),
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

// ── Tabla: user_guardians (persona ↔ acudiente; §6 PLAN_MEMBRESIAS) ──────────
// Un acudiente puede tener varios menores; habilita el consentimiento de menores
// (también en Campeonatos). Vive en el ecosistema porque es de la persona.
export const userGuardians = eco.table('user_guardians', {
  id: uuid('id').primaryKey().defaultRandom(),
  minorUserId: uuid('minor_user_id')
    .notNull()
    .references(() => users.id),
  guardianUserId: uuid('guardian_user_id')
    .notNull()
    .references(() => users.id),
  relationship: varchar('relationship', { length: 50 }),
  consentAt: timestamp('consent_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

// ── Tabla: user_disciplines (grado/cinturón por disciplina) ──────────────────
// Atributo de la persona (Campeonatos también lo usa para categorizar). Las
// promociones las hace el maestro del club. Una disciplina por ahora en la UI,
// pero el modelo ya soporta varias.
export const userDisciplines = eco.table('user_disciplines', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  discipline: varchar('discipline', { length: 80 }).notNull(),
  currentGrade: varchar('current_grade', { length: 50 }),
  since: date('since'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
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

// ── Tabla: org_club_invitations (federación/liga → club) ────────────────────
// Una organización invita a un club existente a ser su hijo; el maestro/dueño
// del club acepta o rechaza. Al aceptar, el club queda con parent_id de la org.
export const orgClubInvitations = eco.table('org_club_invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  clubId: uuid('club_id')
    .notNull()
    .references(() => organizations.id),
  status: varchar('status', { length: 20 }).notNull().default('PENDIENTE'),
  invitedByUserId: uuid('invited_by_user_id').references(() => users.id),
  respondedAt: timestamp('responded_at'),
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
