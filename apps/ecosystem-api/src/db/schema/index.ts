import { sql } from 'drizzle-orm';
import {
  pgSchema,
  index,
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

/**
 * ── Las fechas de aquí son de DOS clases, y se escriben distinto ───────────
 *
 * **Instantes** — cuándo pasó algo: `created_at`, `expires_at`, `paid_at`,
 * `responded_at`… Llevan `{ withTimezone: true }`, o sea `timestamptz`.
 * Guardan un punto en el tiempo, no una hora de pared, así que da exactamente
 * igual si el valor lo pone `DEFAULT now()` (la base, en la zona del VPS) o un
 * `new Date()` de la aplicación (UTC): los dos escriben el mismo instante y
 * los dos se leen bien.
 *
 * Sin zona no daba igual, y costó un despliegue: la base escribía hora de
 * Bogotá, Drizzle leía dando por hecho UTC, y toda fila escrita por la base
 * salía cinco horas en el pasado. En local no se veía porque PGlite arranca en
 * `GMT` y los dos convenios coincidían de casualidad. El relato entero está en
 * §5.1-bis de OPERAR; el arreglo, en la migración `0012_fechas_con_zona`.
 *
 * **Fechas civiles** — un día del calendario, sin hora: `birth_date`, y los
 * `starts_at` / `ends_at` de las suscripciones. Se quedan en `timestamp` sin
 * zona **a propósito**. Un cumpleaños no ocurre a una hora, y una suscripción
 * que vence «el 31» no vence a las 19:00 del 30; se calculan como texto
 * 'YYYY-MM-DD' (ver `common/ciclo.ts`) y se guardan a medianoche. Ponerles
 * zona sería cometer el mismo error por el otro lado. Su tipo correcto es
 * `date` — pendiente, con su cambio de código, no de propina.
 *
 * **La regla para una columna nueva:** ¿se va a comparar con `Date.now()` o a
 * pintar con una hora? Instante, `withTimezone: true`. ¿Es un día que alguien
 * escribiría en un formulario? Fecha civil.
 */

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
  /**
   * Zona horaria IANA del CLUB, no de quien mira la pantalla.
   *
   * Es la que manda en los horarios de entrenamiento y en la asistencia: «la
   * clase es a las 7 pm» es hora de aquí, del salón. Convertirla a la zona de
   * un maestro que está de viaje sería justo el error contrario al que
   * arregla `users.timezone`, y mucho peor: haría que el horario publicado
   * cambiara según quién lo abre.
   */
  timezone: varchar('timezone', { length: 64 }).default('America/Bogota'),
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
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
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
  dataConsentAt: timestamp('data_consent_at', { withTimezone: true }),
  // ── Anti fuerza-bruta: contador de intentos fallidos y bloqueo temporal ────
  // (el super-admin puede desbloquear desde el panel /admin del portal)
  failedLoginAttempts: integer('failed_login_attempts').default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
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
  // ── Dónde está la PERSONA ──────────────────────────────────────────────────
  /**
   * Zona horaria IANA (`America/Bogota`, `Europe/Madrid`…). La detecta el
   * navegador al iniciar sesión y se puede cambiar en el perfil.
   *
   * Sirve para escribir la hora de lo que PASÓ: cuándo entró, cuándo se
   * registró un pago, a qué hora salió un aviso. En pantalla el navegador ya
   * pone la suya solo; esta columna existe para lo que se genera en el
   * servidor —los correos, sobre todo—, que hasta ahora salía en hora de
   * Bogotá para todo el mundo porque el VPS corre con `TZ=America/Bogota`.
   *
   * **No se aplica a fechas civiles.** Un vencimiento o un cumpleaños no
   * tienen zona: el 31 es el 31 en todo el planeta. Ver `packages/shared`.
   */
  timezone: varchar('timezone', { length: 64 }),
  /** `es-CO`, `es-ES`, `en-US`… Cómo se le escriben las fechas y los números. */
  locale: varchar('locale', { length: 10 }),
  /**
   * ¿La eligió la persona a mano en su perfil?
   *
   * La detección automática es lo que hace que a quien viaja le lleguen los
   * correos en su hora sin tocar nada. Pero pisaría la elección de quien entró
   * al perfil y puso la suya a propósito —«escríbeme siempre en hora de
   * Colombia aunque esté fuera»—, y una preferencia que se borra sola no es
   * una preferencia. Con esta bandera, lo automático solo escribe cuando nadie
   * ha dicho nada.
   */
  timezoneManual: boolean('timezone_manual').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

/**
 * ── Tabla: sessions ────────────────────────────────────────────────────────
 *
 * El registro de quién está dentro, y la pieza que le faltaba a «cerrar
 * sesión» para significar algo.
 *
 * Antes la sesión era ÚNICAMENTE el JWT. Nadie llevaba la cuenta, así que
 * salir solo borraba la copia del navegador: el token seguía siendo válido
 * hasta caducar solo un día después, y cambiar la contraseña no echaba a
 * nadie. Con esta tabla el token deja de ser la sesión y pasa a ser el
 * PASE de una sesión que vive aquí: lleva un `jti` que es el `id` de esta
 * fila, y si la fila está revocada el pase no abre, por perfecta que sea su
 * firma.
 *
 * Que el token dure poco (30 min) es lo que hace que esto funcione en toda la
 * federación sin tocar Academy ni Campeonatos: ellas siguen verificando la
 * firma sin preguntar nada, y una sesión revocada muere en todas partes en
 * cuanto su pase caduca y el ecosystem se niega a firmar otro.
 */
export const sessions = eco.table(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /**
     * Qué navegador y desde dónde. No es estadística: es lo que permite a
     * alguien reconocer «ese es el computador prestado» en la lista de
     * dispositivos conectados de su perfil y cerrarlo desde su celular.
     */
    userAgent: text('user_agent'),
    ip: varchar('ip', { length: 60 }),
    /**
     * ── Sin `defaultNow()`, y es lo que hace que esto funcione ────────────
     *
     * Estas columnas son `timestamp` **sin zona**. Postgres escribe `now()`
     * como la hora de pared de LA BASE, y Drizzle lee las columnas sin zona
     * dando por hecho que lo guardado es UTC. Mientras las dos coincidan no se
     * nota; en el VPS no coinciden —PostgreSQL sigue al sistema, que está en
     * `America/Bogota`— y una sesión recién creada se leía con cinco horas de
     * antigüedad. El guard la daba por muerta de inactividad y echaba a la
     * persona nada más entrar.
     *
     * Sin default, el tipo OBLIGA a dar el valor al insertar, así que lo pone
     * siempre JavaScript (ver `SessionsService.abrir`) y la zona de la base
     * deja de importar. Quitar el default no es cosmética: es lo que impide
     * que el fallo vuelva por descuido.
     */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    /** La última señal de vida. De esto depende el cierre por inactividad. */
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
    /**
     * El techo absoluto: pase lo que pase, la sesión muere aquí. Sin él, quien
     * toca la pantalla cada quince minutos no vuelve a escribir su contraseña
     * nunca, y una sesión que no caduca jamás es una contraseña que nadie
     * vuelve a comprobar.
     */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    /**
     * Por qué se cerró. Se guarda para poder DECIRLO —«se cerró porque
     * cambiaste la contraseña»— en vez de devolver a alguien al login sin
     * explicación, que es como se construye la sensación de que la aplicación
     * está rota. Ver `MotivoCierre`.
     */
    revokedReason: varchar('revoked_reason', { length: 30 }),
  },
  (t) => [
    index('ix_sessions_user').on(t.userId, t.lastSeenAt),
    index('ix_sessions_expires').on(t.expiresAt),
  ],
);

// ── Tabla: otp_codes ───────────────────────────────────────────────────────
export const otpCodes = eco.table('otp_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  code: varchar('code', { length: 6 }).notNull(),
  type: varchar('type', { length: 30 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
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
  /**
   * Si esta persona tiene acceso a Membresías EN ESTE CLUB. Lo dice Membresías,
   * no se decide aquí (`POST /sync/acceso`).
   *
   * `null` = **no consta**, que es lo que vale para quien no tiene ficha allí y
   * para todo el mundo hasta que llegue el primer aviso. Cerraba un hueco que
   * se notaba por los dos lados: al alumno al que su maestro le había cortado
   * el acceso se le seguía enseñando el botón «Entrar a Membresías», que lo
   * dejaba en un 403 sin explicación; y el maestro, mirando su gente en el
   * portal, no tenía forma de ver a quién había apagado.
   *
   * **No es la pertenencia al club.** Se puede pertenecer al club y no tener
   * acceso a una de sus aplicaciones — es el caso de casi todo el mundo con
   * Campeonatos. Dar de baja del club es borrar esta fila, y eso es otra cosa
   * (`removeMember`, que además avisa a Membresías).
   */
  membresiasActivo: boolean('membresias_activo'),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow(),
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
  consentAt: timestamp('consent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
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
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
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
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
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
  // ── El ciclo: lo que convierte esto en algo que se RENUEVA ────────────────
  //
  // Hasta aquí una suscripción era una fila con dos fechas, y renovar era
  // crear otra a mano cada mes. Con el club número quince eso son quince
  // formularios al mes y una fila nueva por cada uno: el historial de un club
  // quedaba repartido en doce filas que nadie relacionaba entre sí.
  /** Cuántos meses compra cada renovación. Casi siempre 1. */
  renewalMonths: integer('renewal_months').default(1),
  /**
   * Día del mes en el que vence, conservado entre renovaciones.
   *
   * Sin él, el club que paga el día 5 pero un mes se retrasa al 12 se queda
   * venciendo el 12 para siempre — su ciclo se corre solo, un poco cada vez.
   * Ver `common/ciclo.ts`.
   */
  anchorDay: integer('anchor_day'),
  // ── El aviso de vencimiento ───────────────────────────────────────────────
  // Las dos columnas existen para no repetirse: sin ellas, el disparo diario
  // le manda al maestro el mismo correo cada mañana mientras siga vencido.
  /** Cuándo se le avisó por última vez al maestro. */
  lastReminderAt: timestamp('last_reminder_at', { withTimezone: true }),
  /** Qué se le avisó: `POR_VENCER` o `VENCIDA`. */
  lastReminderKind: varchar('last_reminder_kind', { length: 20 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
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
  /** El mismo ciclo que las de organización. Ver `subscriptions`. */
  renewalMonths: integer('renewal_months').default(1),
  anchorDay: integer('anchor_day'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ── Tabla: subscription_payments (el historial del dinero) ──────────────────
//
// ── Por qué no basta con `paid_amount` ──
//
// `subscriptions.paid_amount` es un contador: dice cuánto se ha pagado EN
// TOTAL, y nada más. No dice cuándo, ni en efectivo o por transferencia, ni
// qué meses compró ese dinero, ni quién lo registró. Con una suscripción que
// se renueva doce veces al año, ese número solo se puede leer como «algo se
// pagó»: si un club reclama que ya pagó agosto, no hay dónde mirar.
//
// ── Las tres columnas de periodo ──
//
// Son las que separan «cuándo entró la plata» de «a qué mes le toca». Un club
// que paga tres meses de golpe en agosto no metió el triple en agosto: compró
// agosto, septiembre y octubre. Es la misma decisión que ya tomó Membresías en
// su tabla `payments`, y por el mismo motivo.
//
// ── Una tabla para los dos tipos de suscripción ──
//
// `subscription_id` para las de organización y `user_subscription_id` para las
// personales; exactamente una de las dos. Dos tablas gemelas se separan al
// primer cambio, y el historial se lee siempre igual venga de donde venga.
export const subscriptionPayments = eco.table(
  'subscription_payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Suscripción de organización. Excluyente con la de abajo. */
    subscriptionId: uuid('subscription_id').references(() => subscriptions.id),
    /** Suscripción personal. Excluyente con la de arriba. */
    userSubscriptionId: uuid('user_subscription_id').references(
      () => userSubscriptions.id,
    ),
    amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
    /** `efectivo` · `transferencia` · `nequi` · `daviplata` · `otro`. */
    method: varchar('method', { length: 20 }).notNull().default('efectivo'),
    paidAt: timestamp('paid_at', { withTimezone: true }).defaultNow(),
    /**
     * Cuántos meses compró este pago. `0` = un abono suelto, que paga deuda
     * pero no mueve la fecha de vencimiento.
     */
    periodos: integer('periodos').notNull().default(1),
    periodoDesde: date('periodo_desde'),
    periodoHasta: date('periodo_hasta'),
    /** Quién lo registró (el super-admin). */
    registeredByUserId: uuid('registered_by_user_id').references(
      () => users.id,
    ),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    // Leer el historial de una suscripción es lo único que se hace con esta
    // tabla, y siempre de lo más nuevo a lo más viejo.
    index('ix_subscription_payments_sub').on(t.subscriptionId, t.paidAt),
    index('ix_subscription_payments_user').on(t.userSubscriptionId, t.paidAt),
  ],
);

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
  respondedAt: timestamp('responded_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
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
export const orgJoinRequests = eco.table(
  'org_join_requests',
  {
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
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    respondedByUserId: uuid('responded_by_user_id').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    // Parcial: una sola solicitud EN ESPERA por persona y club. Sin esto, pulsar
    // dos veces «pedir entrar» —o volver a intentarlo porque no pasaba nada—
    // llena la bandeja del maestro de la misma persona repetida. Las ya
    // respondidas no estorban: quien fue rechazado puede volver a pedirlo.
    uniqueIndex('ux_org_join_requests_pendiente')
      .on(t.orgId, t.userId)
      .where(sql`${t.status} = 'PENDIENTE'`),
  ],
);

// ── Tabla: org_invitations (club → persona, por correo) ─────────────────────
//
// El camino B del plan, pero **preguntando**.
//
// Hasta aquí «invitar» era un nombre bonito para dar de alta: el maestro
// tecleaba un correo, pulsaba «+ Añadir» y la fila de `org_members` nacía en el
// acto. La persona se enteraba —si acaso— por un correo que ya no le
// preguntaba nada. Es justo lo contrario de lo que hace el código del club
// (`org_join_requests`), donde entrar siempre es una decisión de los DOS: uno
// lo pide y el otro lo acepta. Aquí lo mismo, en el otro sentido: el club lo
// ofrece y la persona lo acepta.
//
// ── Por qué la clave es el CORREO y no el usuario ──
//
// Porque el maestro invita a gente que a veces todavía no tiene cuenta. Cuando
// la tiene, `user_id` se rellena y la invitación aparece en su panel de DINAMYT
// al instante. Cuando no, se le crea la cuenta y se le manda el enlace para
// poner contraseña (`inviteMember`), y esta invitación le está esperando dentro
// cuando entre por primera vez. En los dos casos, `org_members` no se toca
// hasta que alguien dice que sí.
export const orgInvitations = eco.table(
  'org_invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    /** A quién se invitó. Es la clave: puede no existir cuenta todavía. */
    email: varchar('email', { length: 200 }).notNull(),
    /** La cuenta, cuando la hay. Se rellena al crearla o al encontrarla. */
    userId: uuid('user_id').references(() => users.id),
    /** Rol general y por app con los que entraría. Los elige quien invita. */
    role: varchar('role', { length: 50 }).notNull().default('member'),
    roleMembresias: varchar('role_membresias', { length: 50 }),
    roleCampeonatos: varchar('role_campeonatos', { length: 50 }),
    roleAcademy: varchar('role_academy', { length: 50 }),
    /** `PENDIENTE` · `ACEPTADA` · `RECHAZADA` · `CANCELADA`. */
    status: varchar('status', { length: 20 }).notNull().default('PENDIENTE'),
    /** Lo que le escribe el maestro («eres del grupo de los martes»). */
    note: varchar('note', { length: 300 }),
    invitedByUserId: uuid('invited_by_user_id').references(() => users.id),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    // Una sola invitación EN ESPERA por correo y club, por lo mismo que en
    // `org_join_requests`: pulsar dos veces «invitar» —o volver a intentarlo
    // porque no se veía nada— llenaba la lista del mismo correo repetido.
    // Las respondidas no estorban: a quien rechazó se le puede volver a
    // invitar, que es lo que pasa cuando alguien se lo piensa mejor.
    uniqueIndex('ux_org_invitations_pendiente')
      .on(t.orgId, t.email)
      .where(sql`${t.status} = 'PENDIENTE'`),
  ],
);

// ── Tabla: audit_auth ──────────────────────────────────────────────────────
export const auditAuth = eco.table('audit_auth', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  event: varchar('event', { length: 50 }).notNull(),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  metadata: text('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
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
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  /** Códigos fallados. Al pasarse del tope, el registro se borra. */
  attempts: integer('attempts').default(0).notNull(),
  /** Veces que se ha mandado el código (el primero cuenta). Anti-abuso. */
  sends: integer('sends').default(1).notNull(),
  lastSentAt: timestamp('last_sent_at', { withTimezone: true }).defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ── Tabla: org_notifications ───────────────────────────────────────────────
//
// **La campana de quien lleva un club.**
//
// ── Qué problema resuelve ──
//
// Un club funciona por cosas que pasan cuando su maestro no está mirando:
// alguien teclea el código y se queda esperando, alguien acepta la invitación
// y entra, alguien se va. Hasta ahora nada de eso se contaba en el portal. La
// bandeja de solicitudes existía, pero había que acordarse de abrirla, y una
// bandeja que no avisa es una bandeja que se llena: la persona que pidió
// entrar veía «te avisamos» y esperaba días a que a alguien se le ocurriera
// entrar a mirar.
//
// ── Por qué una fila por PERSONA y no una por evento ──
//
// Porque leer es de cada quien. Un club puede tener maestro y dos
// administradores, y «ya lo vi» de uno no puede borrarle el aviso a los otros.
// Son dos o tres filas por evento, en clubes que tienen decenas de eventos al
// mes: la tabla no crece a nada.
//
// ── `resolved_at`, que es lo que la distingue de un registro de sucesos ──
//
// Hay dos clases de aviso aquí dentro, y la diferencia importa:
//
//   · Los que **son una tarea**: «alguien quiere entrar». Ése deja de existir
//     en cuanto se responde la solicitud — la haya respondido quien la haya
//     respondido. Sin esto, el maestro que acepta a diez personas se queda con
//     diez avisos rojos pidiéndole que haga algo que ya hizo, y a la tercera
//     vez deja de mirar la campana.
//   · Los que **son una noticia**: «entró alguien nuevo», «se fue alguien».
//     Ésos no se resuelven porque no piden nada: se leen y se quedan como
//     historia de lo que ha pasado en el club.
//
// `entity_id` es lo que permite resolver sin buscar: la solicitud que motivó
// el aviso. Ver `OrgNotificationsService.resolverPor`.
export const orgNotifications = eco.table(
  'org_notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    /** A quién le llega. Un aviso por cada persona que gestiona el club. */
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    /**
     * Qué pasó. Los valores están en `common/avisos-org.ts`, no en un enum de
     * PostgreSQL: añadir una clase de aviso no puede pedir una migración.
     */
    kind: varchar('kind', { length: 40 }).notNull(),
    /**
     * La fila que lo motivó (la solicitud, la invitación). Es la llave con la
     * que el aviso se resuelve cuando esa fila se responde.
     */
    entityId: uuid('entity_id'),
    /** De quién habla el aviso: quien pidió entrar, quien se fue. */
    subjectUserId: uuid('subject_user_id').references(() => users.id),
    /** Quién lo provocó. No se le avisa a él de lo que acaba de hacer. */
    actorUserId: uuid('actor_user_id').references(() => users.id),
    /**
     * Lo que hace falta para escribir la frase sin volver a la base: el nombre
     * de la persona, su correo, el rol con el que entra. Se guarda copiado a
     * propósito — un aviso cuenta lo que pasó ENTONCES, y si luego cambia el
     * nombre, el aviso viejo sigue diciendo lo que dijo.
     */
    data: jsonb('data'),
    readAt: timestamp('read_at', { withTimezone: true }),
    /** Cuándo dejó de haber algo que hacer. Ver el comentario de arriba. */
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    // La campana pregunta siempre lo mismo: «lo mío, de este club, lo último
    // primero». Sin índice, cada apertura del portal recorre la tabla entera.
    index('ix_org_notifications_destinatario').on(t.userId, t.createdAt),
    // Y resolver pregunta por la fila que se acaba de responder.
    index('ix_org_notifications_entidad').on(t.entityId),
  ],
);


// ── Tabla: push_subscriptions ──────────────────────────────────────────────
//
// **Los avisos que llegan cuando el portal está cerrado.**
//
// ── Qué problema resuelve ──
//
// `org_notifications` es una campana, y una campana solo suena si estás dentro
// de la casa. Quien lleva un club abre el portal cuando se acuerda; mientras
// tanto, la persona que tecleó el código del club sigue esperando. El aviso
// existía, pero llegaba cuando alguien iba a buscarlo — que es justo lo que la
// campana venía a arreglar, un piso más abajo.
//
// Esta tabla es el permiso que dio un navegador concreto para que le escriban.
// Es lo mismo que hace Membresías con su `push_subscriptions`, y a propósito:
// las dos apps mandan con las MISMAS llaves VAPID (`VAPID_PUBLIC_KEY` /
// `VAPID_PRIVATE_KEY`), porque VAPID identifica a quien envía —DINAMYT— y no a
// la aplicación que envía.
//
// ── Por qué una fila por NAVEGADOR y no por persona ──
//
// Porque el permiso lo da el navegador, no la cuenta. La misma maestra tiene el
// portal instalado en el celular y abierto en el portátil del club, y quiere el
// aviso en los dos. Cada uno tiene su `endpoint` —una dirección que le da su
// propio fabricante, Google o Apple o Mozilla— y sus llaves de cifrado.
//
// ── Por qué `endpoint` es único, y por qué se borra solo ──
//
// El navegador puede volver a suscribirse con el mismo `endpoint` —al reinstalar
// la app, al limpiar el sitio, al reactivar el permiso— y sin `unique` se
// acumularían filas que mandan el MISMO aviso dos y tres veces al mismo
// teléfono. Con `unique`, volver a suscribirse actualiza la fila que ya estaba.
//
// Y al revés: un `endpoint` muere cuando la persona desinstala la app o revoca
// el permiso. El servidor de push contesta 404/410 —«esto ya no existe»— y ahí
// la fila se borra sola (ver `common/push.ts`). Sin eso, la tabla se llena de
// direcciones muertas a las que se les sigue escribiendo para siempre.
export const pushSubscriptions = eco.table(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    /** La dirección que le da al navegador SU fabricante. Es la llave. */
    endpoint: text('endpoint').notNull().unique(),
    /** Las dos llaves con las que se cifra el aviso para ESE navegador. */
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    /**
     * Para qué sirve saber de dónde vino: el día que un aviso no llega, lo
     * primero que se pregunta es «¿desde qué aparato lo activaste?».
     */
    userAgent: varchar('user_agent', { length: 300 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    // Enviar pregunta siempre lo mismo: «los navegadores de estas personas».
    index('ix_push_subscriptions_persona').on(t.userId),
  ],
);
