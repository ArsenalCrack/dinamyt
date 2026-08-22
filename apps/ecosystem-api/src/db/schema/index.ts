import { sql } from 'drizzle-orm';
import {
  pgSchema,
  uniqueIndex,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  decimal,
  date,
  jsonb,
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
  /**
   * Nombre corto y estable del club, único en todo el ecosistema.
   *
   * Existe por la reconciliación (§2.4 del plan): `membresias.orgs` ya tiene
   * su propio `slug`, y cruzar por él es lo que hace que correr el guion dos
   * veces no cree dos clubes. Los clubes que solo conocía Campeonatos —donde
   * el club es texto libre dentro de `usuarios.clubes`— reciben uno derivado
   * de su nombre normalizado. Nullable: las organizaciones creadas desde el
   * portal antes de esto no tienen ninguno.
   */
  slug: varchar('slug', { length: 60 }).unique(),
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
  /** Logo del club (data-URL comprimida en el cliente o http). */
  logoUrl: text('logo_url'),
  /** Enlaces de redes sociales (array de URLs). */
  socialLinks: jsonb('social_links'),
  /**
   * Delegación a la que responde el club, y el país de esa delegación.
   *
   * No es lo mismo que `city`/`country`: Campeonatos lleva años pidiéndolos por
   * separado al dar de alta un maestro (`{nombre, delegacion, pais_delegacion}`
   * en `usuarios.clubes`) porque un dojang de Bogotá puede responder a una
   * delegación de otro departamento —o de otro país—, y el admin que revisa una
   * inscripción necesita ver la delegación DE ESE club para agrupar los
   * reportes. Sin estas dos columnas, unir Campeonatos al ecosistema obligaría
   * a volver a teclearlas, que es como se parten en dos las agrupaciones.
   */
  delegation: varchar('delegation', { length: 120 }),
  delegationCountry: varchar('delegation_country', { length: 100 }),
  /**
   * Si el club sale en el directorio público de `dinamyt.org`.
   *
   * Apagado por defecto, y a propósito: la ficha lleva teléfono y dirección, y
   * publicarlos tiene que ser un acto deliberado de su maestro, no el efecto
   * secundario de haber rellenado el formulario. Lo que se publica es la ficha
   * de contacto del club — nunca su gente.
   */
  isPublic: boolean('is_public').default(false),
  /**
   * Código de entrada al club: lo reparte el maestro y quien lo teclea en el
   * portal queda como SOLICITUD, nunca como miembro directo.
   *
   * Es el camino C de §2.1 del plan, y existe porque los otros dos no cubren a
   * quien ya tiene cuenta: hasta ahora, alguien que se registraba en el portal
   * se quedaba sin club para siempre a menos que su maestro adivinara su correo
   * y lo invitara a mano. Rotable (`POST /organizations/:id/codigo`): un código
   * que se filtró se cambia y los que ya entraron no se enteran.
   */
  joinCode: varchar('join_code', { length: 12 }).unique(),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ── Tabla: users ───────────────────────────────────────────────────────────
export const users = eco.table('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 200 }).notNull().unique(),
  /**
   * Documento de identidad. **Opcional**, y no por comodidad: ni Membresías ni
   * Campeonatos lo guardan, así que exigirlo dejaría fuera de la reconciliación
   * a todo el mundo que ya existe. El auto-registro del portal lo sigue
   * pidiendo; a las cuentas importadas se les pide la primera vez que abran su
   * perfil. `unique` sigue valiendo: PostgreSQL admite varios NULL.
   */
  documentId: varchar('document_id', { length: 30 }).unique(),
  fullName: varchar('full_name', { length: 200 }).notNull(),
  phone: varchar('phone', { length: 30 }),
  birthDate: timestamp('birth_date'),
  /**
   * `MASCULINO` | `FEMENINO`. Opcional, y de la persona — no de una app.
   *
   * Existe porque Campeonatos lo necesita para categorizar
   * (`competidores.genero`) y hasta ahora el ecosistema no lo tenía: cada
   * inscripción lo volvía a preguntar, y lo que se pregunta dos veces acaba
   * contestado de dos formas. Se pide en el registro junto al documento y la
   * fecha de nacimiento, que son los otros dos que Campeonatos autorrellena.
   *
   * Nullable: todas las cuentas importadas (§2.4) llegan sin él, y ninguna se
   * queda fuera por eso — se le pide a su dueño la primera vez que abra su
   * perfil, igual que el documento.
   */
  gender: varchar('gender', { length: 20 }),
  avatarUrl: text('avatar_url'),
  /**
   * bcrypt. **Puede ser NULL**: una cuenta creada por invitación del maestro
   * (camino B, §2.1) existe antes de tener contraseña. Sin hash no se puede
   * iniciar sesión, y `login` lo dice con esas palabras en vez de fingir que
   * la contraseña es incorrecta.
   */
  passwordHash: text('password_hash'),
  isEmailVerified: boolean('is_email_verified').default(false),
  isActive: boolean('is_active').default(true),
  isSuperAdmin: boolean('is_super_admin').default(false),
  /**
   * De dónde salió la cuenta: `registro` (la persona se registró en el
   * portal), `invitacion` (la creó su maestro) o `importado-membresias` /
   * `importado-campeonatos` / `importado-ambas` (la trajo la reconciliación
   * de §2.4 desde una app que ya existía).
   *
   * No es estadística. De esto depende qué se le dice a quien intenta
   * registrarse con un correo que ya está («tu cuenta ya existe, entra con la
   * contraseña de Membresías») y a quién hay que pedirle una verificación de
   * correo de verdad cuando el correo funcione (bloque B2).
   */
  origen: varchar('origen', { length: 30 }).notNull().default('registro'),
  /**
   * De dónde salió el HASH de la contraseña: `propio`, `membresias` o
   * `campeonatos`.
   *
   * Las tres apps hashean con bcrypt al mismo costo (10 rondas), así que el
   * hash importado se verifica tal cual y la gente entra con la contraseña que
   * ya usa —sin depender del correo, que es el bloque B2—. Se anota el origen
   * para rehashearlo al costo del ecosistema en el primer login correcto y
   * para saber quién no ha puesto todavía una contraseña propia.
   */
  passwordOrigen: varchar('password_origen', { length: 30 }),
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
  /** Tipo de sangre (A+, O-, …): lo fija el maestro/admin del club. */
  bloodType: varchar('blood_type', { length: 5 }),
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
  /** Rol general en la organización (el que se ve en el portal). */
  role: varchar('role', { length: 50 }).notNull().default('member'),
  /**
   * Rol por aplicación. Existen porque la misma persona no es lo mismo en cada
   * una: un alumno del club (`student` en Membresías) suele ser `judge` o
   * `competitor` en Campeonatos. Con un solo `role` había que elegir cuál de
   * las dos mentir, y el token lleva un claim por app.
   *
   * NULL = no participa en esa app, y el claim va en `null`. Los valores
   * válidos son los catálogos de `@dinamyt/shared` (`MembresiasRole`,
   * `CampeonatosRole`, `AcademyRole`).
   */
  roleMembresias: varchar('role_membresias', { length: 50 }),
  roleCampeonatos: varchar('role_campeonatos', { length: 50 }),
  roleAcademy: varchar('role_academy', { length: 50 }),
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

// ── Tabla: org_join_requests (persona → club, por código) ───────────────────
//
// El camino C de §2.1: alguien que YA tiene cuenta teclea el código de su club
// y queda a la espera. Es una solicitud y no un alta porque el código se
// comparte en un grupo de WhatsApp y acaba donde no debe; el maestro es quien
// decide, y de paso es el único que sabe qué rol le toca a cada quien.
//
// Al aceptar nace la fila de `org_members` con sus roles por app, y desde ahí
// Membresías le crea la ficha sola la primera vez que entre (auto-
// aprovisionamiento, M1 de §4.3): pertenecer al club y tener ficha en la app
// dejan de ser dos altas que nadie conectaba.
export const orgJoinRequests = eco.table('org_join_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  /** `PENDIENTE` · `ACEPTADA` · `RECHAZADA`. */
  status: varchar('status', { length: 20 }).notNull().default('PENDIENTE'),
  /** Lo que escribe quien pide entrar («soy el papá de Ana», «entreno los martes»). */
  note: varchar('note', { length: 300 }),
  respondedAt: timestamp('responded_at'),
  respondedByUserId: uuid('responded_by_user_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => [
  // Parcial: una sola solicitud EN ESPERA por persona y club. Sin esto, pulsar
  // dos veces «pedir entrar» —o volver a intentarlo porque no pasaba nada—
  // llena la bandeja del maestro de la misma persona repetida. Las ya
  // respondidas no estorban: quien fue rechazado puede volver a pedirlo.
  uniqueIndex('ux_org_join_requests_pendiente')
    .on(t.orgId, t.userId)
    .where(sql`${t.status} = 'PENDIENTE'`),
]);

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

// ── Tabla: pending_registrations ───────────────────────────────────────────
//
// **La cuenta no existe hasta que el correo está verificado.**
//
// Antes, `POST /auth/register` insertaba la fila en `users` y la dejaba con
// `is_email_verified = false`. Eso tenía dos consecuencias que se notaban:
//
//   · El correo y el documento quedaban OCUPADOS para siempre. Quien se
//     equivocó al teclear su correo —el caso normal— no podía volver a
//     registrarse con el bueno usando su mismo documento, y nadie más podía
//     usar el correo que se tecleó mal. La única salida era el super-admin.
//   · La lista de usuarios se llenaba de cuentas que no eran de nadie.
//
// Aquí vive el registro mientras espera su código: con todo lo que hará falta
// para crear la cuenta —incluida la contraseña YA hasheada, nunca en claro— y
// con fecha de caducidad. Si el código no se usa a tiempo, la fila se borra y
// el correo y el documento vuelven a quedar libres, sin que nadie tenga que
// hacer nada.
//
// Las dos claves son únicas por lo mismo que en `users`: dos personas no pueden
// estar esperando el código para el mismo correo, ni para el mismo documento.
export const pendingRegistrations = eco.table('pending_registrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 200 }).notNull().unique(),
  documentId: varchar('document_id', { length: 30 }).unique(),
  fullName: varchar('full_name', { length: 200 }).notNull(),
  phone: varchar('phone', { length: 30 }),
  birthDate: timestamp('birth_date'),
  gender: varchar('gender', { length: 20 }),
  /** bcrypt, con el costo del ecosistema. **Nunca la contraseña en claro.** */
  passwordHash: text('password_hash').notNull(),
  /** Seis dígitos. El mismo formato que el OTP de recuperar contraseña. */
  code: varchar('code', { length: 6 }).notNull(),
  /** Cuándo caduca el registro entero, no solo el código: son lo mismo. */
  expiresAt: timestamp('expires_at').notNull(),
  /** Códigos fallados. Al pasarse del tope, el registro se borra. */
  attempts: integer('attempts').default(0).notNull(),
  /** Veces que se ha mandado el código (el primero cuenta). Anti-abuso. */
  sends: integer('sends').default(1).notNull(),
  lastSentAt: timestamp('last_sent_at').defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
});
