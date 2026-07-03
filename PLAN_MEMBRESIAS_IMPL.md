# DINAMYT Membresías — Plan de implementación (técnico)

> Documento vivo. Creado 2026-07-02. Baja a código el `PLAN_MEMBRESIAS.md`
> (requisitos). Calcado del patrón real de `campeonatos-api` + `campeonatos-db` +
> `@dinamyt/shared`. Léelo junto a `PLAN_MEMBRESIAS.md` y `RUN_LOCAL.md`.

## 0. Artefactos nuevos y cómo enchufan al monorepo

pnpm workspaces (`apps/*`, `packages/*`) + turbo. Se agregan:

| Artefacto | Qué es | Basado en |
| --- | --- | --- |
| `packages/membresias-db` | Paquete Drizzle, schema `membresias`, BD propia | `campeonatos-db` |
| `apps/membresias-api` | API Fastify, auth delegada al ecosystem (JWKS) | `campeonatos-api` |
| `apps/membresias-web` | Next PWA (kiosco + panel + portal alumno) | `campeonatos-web` |
| `membresias-agent` | Companion de escritorio (Windows) del lector de huella | **nuevo** (fuera del web) |
| `packages/shared` *(editar)* | + `AppScope 'membresias'`, `MembresiasRole`, `role_membresias` | — |
| `apps/ecosystem-api` *(editar)* | + `role_membresias` en el token, perfil de persona, plan/seed | — |

**Puertos** (los usados hoy: ecosystem-api `3001`, portal `3000`, campeonatos-api
`3002`, campeonatos-web `3003`): **membresias-api `3004`**, **membresias-web `3005`**.

**Regla de oro heredada:** la BD de Membresías es **independiente**; referencia a la
persona por `ecosystem_user_id` (UUID) **sin FK entre bases**. **No duplica el perfil**
de la persona (a diferencia de la vieja tabla `competidores`, anterior a la decisión de
perfil unificado). Membresías NUNCA emite tokens: solo los **verifica** contra el JWKS.

---

## 1. Fase 0 — Cambios en el ecosystem (prerrequisito)

### 1.1 Contrato compartido (`packages/shared`)
`src/enums.ts`:
```ts
export type AppScope = 'academy' | 'campeonatos' | 'membresias';

/** Roles dentro de DINAMYT Membresías. */
export type MembresiasRole = 'owner' | 'staff' | 'student' | 'guardian';
```
`src/auth.ts` → `JwtPayload`:
```ts
  role_campeonatos: string | null;
  role_membresias: string | null;   // ← nuevo
  is_super_admin: boolean;
```

### 1.2 Emisión del token (`ecosystem-api/src/modules/auth/auth.service.ts`)
En `buildToken()`, replicar el mapeo que ya existe para academy/campeonatos:
```ts
const roleMembresias =
  uniqueScopes.includes('membresias') && orgRole ? orgRole : null;
// ...
const payload: JwtPayload = {
  /* ...existing... */
  role_membresias: roleMembresias,
};
```
- `subscriptions/plans.service.ts`: agregar `'membresias'` a los valores válidos de
  `appsIncluded` (comentario) y crear en el **seed** un plan con
  `appsIncluded: ['membresias']` (+ combos, p. ej. `['campeonatos','membresias']`).

### 1.3 Perfil de la persona (schema `ecosystem` — §6 del requisito)
Migración Drizzle en `ecosystem-api/src/db/schema/index.ts`:
```ts
// users: añadir
emergencyContactName:  varchar('emergency_contact_name',  { length: 200 }),
emergencyContactPhone: varchar('emergency_contact_phone', { length: 30 }),
emergencyContactRel:   varchar('emergency_contact_relationship', { length: 50 }),
medicalNotes:          text('medical_notes'), // dato sensible → cifrar en capa app

// nuevas tablas
export const userGuardians = eco.table('user_guardians', {
  id: uuid('id').primaryKey().defaultRandom(),
  minorUserId:    uuid('minor_user_id').notNull().references(() => users.id),
  guardianUserId: uuid('guardian_user_id').notNull().references(() => users.id),
  relationship:   varchar('relationship', { length: 50 }),
  consentAt:      timestamp('consent_at'),
});

export const userDisciplines = eco.table('user_disciplines', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId:       uuid('user_id').notNull().references(() => users.id),
  discipline:   varchar('discipline', { length: 80 }).notNull(),
  currentGrade: varchar('current_grade', { length: 50 }), // cinturón; lo edita el maestro
  since:        date('since'),
});
```
- Endpoints: `GET/PATCH /users/:id/profile` (perfil unificado — ya pendiente en HANDOFF).
- **Roster:** Membresías reutiliza el endpoint existente
  `GET /organizations/:id/members` (org_members ⨝ users). No hay que crear alta aquí.

---

## 2. `packages/membresias-db` (Drizzle, schema `membresias`)

Estructura espejo de `campeonatos-db`: `src/schema/_schema.ts` (pgSchema + enums),
`src/schema/*.ts`, `src/client.ts`, `src/index.ts`, `drizzle.config.ts`
(`schemaFilter: ['membresias']`, `MEMBRESIAS_DATABASE_URL`), `scripts/pglite-setup.mjs`.
Scripts `db:generate|migrate|studio|local:setup`.

`_schema.ts`:
```ts
export const mem = pgSchema('membresias');

export const tipoPlanEnum   = mem.enum('tipo_plan', ['mensual','semanal','clase','paquete','matricula']);
export const metodoPagoEnum = mem.enum('metodo_pago', ['efectivo','transferencia','nequi','daviplata']);
export const estadoPagoEnum = mem.enum('estado_pago', ['PAGADO','PARCIAL','PENDIENTE']);
export const estadoMembresiaEnum = mem.enum('estado_membresia', ['activo','inactivo','suspendido','retirado']);
export const metodoCheckinEnum   = mem.enum('metodo_checkin', ['fingerprint','qr','pin','manual']);
export const canalNotifEnum = mem.enum('canal_notif', ['push','email','inapp']);
export const tipoNotifEnum  = mem.enum('tipo_notif', ['pre_venc','venc','mora','maestro']);
```

Tablas principales (resto en §10 del requisito):
```ts
export const memberships = mem.table('memberships', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId:  uuid('org_id').notNull(),
  ecosystemUserId: uuid('ecosystem_user_id').notNull(), // persona (sin FK entre bases)
  payerUserId:     uuid('payer_user_id'),               // acudiente que paga aquí
  status: estadoMembresiaEnum('status').notNull().default('activo'),
  statusReason: text('status_reason'),
  matriculado:  boolean('matriculado').default(false),
  currentPlanId: uuid('current_plan_id'),
  venceEl:  date('vence_el'),          // planes por tiempo
  anchorDay: integer('anchor_day'),    // día ancla del mes (ver §3.3)
  clasesRestantes: integer('clases_restantes'), // planes por clase
  updatedAt: timestamp('updated_at').defaultNow(),
}, (t) => [uniqueIndex('uq_membership_org_user').on(t.orgId, t.ecosystemUserId)]);

export const plans = mem.table('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  name:  varchar('name', { length: 120 }).notNull(),
  type:  tipoPlanEnum('type').notNull(),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  durationDays: integer('duration_days'), // semanal=7; mensual usa mes calendario
  nClasses: integer('n_classes'),
  isActive: boolean('is_active').default(true),
});

export const payments = mem.table('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  membershipId: uuid('membership_id').notNull().references(() => memberships.id),
  planId: uuid('plan_id').notNull().references(() => plans.id),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  method: metodoPagoEnum('method').notNull(),
  status: estadoPagoEnum('status').notNull().default('PAGADO'),
  paidAt: timestamp('paid_at').defaultNow(),
  registeredByUserId: uuid('registered_by_user_id').notNull(),
  notes: text('notes'),
});

export const clubSchedule = mem.table('club_schedule', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  weekday: integer('weekday').notNull(),     // 0=domingo … 6=sábado
  opensAt: varchar('opens_at', { length: 5 }),
  closesAt: varchar('closes_at', { length: 5 }),
  group: varchar('group', { length: 80 }),
  isActive: boolean('is_active').default(true),
});
export const scheduleExceptions = mem.table('schedule_exceptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  date: date('date').notNull(),
  isClosed: boolean('is_closed').notNull(),  // false = apertura extra
  note: varchar('note', { length: 200 }),
});

export const attendances = mem.table('attendances', {
  id: uuid('id').primaryKey().defaultRandom(),
  membershipId: uuid('membership_id').notNull().references(() => memberships.id),
  checkedInAt: timestamp('checked_in_at').defaultNow(),
  method: metodoCheckinEnum('method').notNull(),
  group: varchar('group', { length: 80 }),
  deviceId: uuid('device_id'),
}, (t) => [uniqueIndex('uq_attendance_day').on(t.membershipId, sql`(checked_in_at::date)`)]);

export const biometricTemplates = mem.table('biometric_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  membershipId: uuid('membership_id').notNull().references(() => memberships.id),
  template: text('template').notNull(),   // cifrado (base64)
  format: varchar('format', { length: 40 }).notNull(), // marca/formato → lock-in
  consentAt: timestamp('consent_at'),
  createdAt: timestamp('created_at').defaultNow(),
});
// devices, notifications, push_subscriptions, audit → análogas (ver §10 requisito).
```

---

## 3. `apps/membresias-api` (Fastify, :3004)

### 3.1 Bootstrap (igual a campeonatos-api)
- `app.ts`: `buildApp(deps)` con `verifyToken` (default `createRemoteVerifier(config.ecosystemJwksUrl)`) y `db` inyectables; registra rutas como plugins.
- `config.ts`: `port 3004`, `ecosystemJwksUrl`, `ecosystemApiUrl` (para el roster),
  `ecosystemPortalUrl`, `webUrl 3005`, `corsOrigins`, VAPID, `mail*`.
- `plugins/auth.ts`: **copiar** `requireScope('membresias')` y `requireAuth`. ⚠️
  **Generalizar `requireRole`**: el de campeonatos lee `role_campeonatos` *hardcodeado*
  → parametrizar el claim (`role_membresias`) o duplicarlo como `requireMembresiasRole`.

### 3.2 Endpoints (por recurso)
| Método | Ruta | Rol | Qué hace |
| --- | --- | --- | --- |
| GET | `/health` | — | ping |
| GET | `/memberships` | owner/staff | Roster: trae miembros del club del ecosystem (`ecosystemApiUrl` con el token del usuario) y **mergea** el estado local (plan, `vence_el`, días faltantes, estado). |
| GET | `/memberships/:userId` | dueño/propio | Estado + historial de un alumno |
| PATCH | `/memberships/:userId` | owner/staff | Estado en el club (activo/retirado), plan, pagador |
| GET/POST/PATCH/DELETE | `/plans` | owner | Tarifas del club |
| POST | `/memberships/:userId/payments` | owner/staff | Registra pago → recalcula `vence_el`/clases (§3.3) |
| GET | `/payments` | owner/staff | Historial + filtros |
| POST | `/checkin` | staff/kiosco | `{identifier:{type,value}, deviceId}` → identifica, registra asistencia, devuelve `{nombre, foto, estado, diasFaltantes, accionSugerida}` |
| GET | `/attendances` | owner/staff | Asistencias por alumno/día |
| GET/PUT | `/schedule` · `/schedule/exceptions` | owner | Días de operación |
| POST | `/memberships/:id/biometrics` | agente | Guarda template + `format` (enrolamiento) |
| GET | `/reports/revenue` · `/reports/overdue` · `/reports/attendance` | owner/staff | Recaudo, morosos, asistencia |
| POST | `/push/subscribe` | autenticado | Guarda la suscripción Web Push |

### 3.3 Lógica de cobro — `lib/billing.ts` (pura, con tests vitest)
```ts
// Mes calendario / aniversario, anclado a max(hoy, venceAnterior).
export function nextDue(today, prevDue, plan, anchorDay) {
  const base = prevDue && prevDue > today ? prevDue : today; // no castiga anticipado
  if (plan.type === 'semanal') return addDays(base, plan.durationDays ?? 7);
  if (plan.type === 'mensual') {
    const day = anchorDay ?? base.getDate();                 // conserva el día ancla
    return clampToMonth(addMonths(base, 1), day);            // 31→último día si no existe
  }
  return prevDue; // clase/paquete no tocan la fecha; suman clases_restantes
}
export function estado(venceEl, today, ventanaAviso = 3) { /* al_día|por_vencer|vencido */ }
```
- **Días de operación** (`lib/schedule.ts`): `esDiaClase(orgId, date)` (weekday ∈
  `club_schedule` y no `is_closed`). El check-in por **paquete** solo descuenta si
  `esDiaClase`; el % de asistencia se calcula sobre días de clase.
- **Bloqueo por mora**: contar **días de clase vencido**; ≥2 → `accionSugerida='bloquear'`.

---

## 4. `membresias-agent` (companion del lector, Windows)

Proceso local en el PC del kiosco. **Único** que habla con el SDK del lector; expone
un **contrato estable** por `http://localhost:7070` (o WS) a la PWA:

| Ruta | Qué hace |
| --- | --- |
| `GET /status` | `{ readerConnected: bool, vendor }` — la PWA lo pinguea para saber si hay lector |
| `POST /enroll` | `{membershipId}` → captura huella, genera template → lo sube a `membresias-api` (`/biometrics`) con su `format` |
| `GET /identify` | captura + **match 1:N local** contra los templates cacheados → `{membershipId\|null, quality}` |

- El agente **cachea** los templates del club (bajados de la API) para matchear offline.
- Si el agente no responde → la PWA entra en **modo sin lector** (QR/PIN/lista).
- Adaptador por marca (DigitalPersona/ZKTeco) detrás de una interfaz común →
  cambiar de lector = cambiar solo el adaptador.

---

## 5. `apps/membresias-web` (Next PWA, :3005)

Patrón `campeonatos-web`: login delegado al ecosystem, token `dinamyt_token`, cliente
axios (`NEXT_PUBLIC_API_URL=3004`, `NEXT_PUBLIC_ECOSYSTEM_API_URL=3001`). **PWA**:
manifest + service worker + Web Push.

Rutas: `/kiosco` (check-in), `/` (panel maestro), `/alumnos/[id]` (ficha),
`/planes`, `/calendario`, `/reportes`, `/mi` (portal alumno/acudiente).

### Wireframe — Kiosco (`/kiosco`, pantalla completa)
```
┌───────────────────────────── DINAMYT Membresías · Kiosco ───────────────────────────┐
│                                                                                      │
│   [ Pon tu huella ]   ó   [ Escanea QR ]   ó   PIN [ _ _ _ _ ]   ó  Buscar nombre ▾   │
│                          (● lector conectado / ○ sin lector → QR/PIN)                 │
│                                                                                      │
│   ┌──────────────────────────────────────────────────────────────────────────────┐ │
│   │  (foto)   JUAN PÉREZ                                          ●  AL DÍA         │ │
│   │           Cinturón azul · Grupo 6pm                                            │ │
│   │           Vence en  12 días  (2026-07-14)        Asistencia registrada ✓       │ │
│   └──────────────────────────────────────────────────────────────────────────────┘ │
│   estado vencido →  ●  VENCIDO hace 2 días     [ Registrar pago ]  (1 toque)          │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### Wireframe — Panel del maestro (`/`)
```
┌ DINAMYT Membresías ───────────────────────────────────────────  Maestro ▾ ┐
│ Recaudado julio  $1.240.000 / $1.800.000   ·  Morosos 7  ·  Hoy asistieron 18 │
├───────────────────────────────────────────────────────────────────────────┤
│ Alumnos            [ + no: alta en el portal del ecosystem ]     Buscar ▾    │
│ ● Juan Pérez      Azul   Vence 14 jul (12 d)   al día        [ ver ]         │
│ ● Ana Gómez       Blanco VENCIDO hace 3 d      $60.000       [ pago ][ver ]  │
│ ○ Luis M. (retirado)                                                        │
├───────────────────────────────────────────────────────────────────────────┤
│ Accesos: Planes · Días de operación · Reportes (recaudo/cartera/asistencia)  │
└───────────────────────────────────────────────────────────────────────────┘
```
> El botón de "alta" **lleva al portal del ecosystem** (no se crean alumnos aquí, RF-02).

---

## 6. Notificaciones (Push + Email + in-app)

- **Job diario** en `membresias-api` (node-cron embebido o endpoint disparable):
  evalúa `vence_el`, encola `notifications` (`pre_venc` a −3 días, `venc` el día,
  `mora` con cadencia) y el resumen al maestro.
- **Envío**: Web Push (`web-push` + VAPID) como principal; **fallback Email** (reusar
  el mailer del ecosystem o SMTP propio). Siempre queda el **badge in-app**.
- Preferencias: a quién (alumno/acudiente/ambos), tope de frecuencia, horario.

---

## 7. Config / .env (membresias-api)

| Var | Ejemplo |
| --- | --- |
| `PORT` | `3004` |
| `MEMBRESIAS_DATABASE_URL` | postgres del schema `membresias` |
| `ECOSYSTEM_JWKS_URL` | `http://localhost:3001/auth/jwks` |
| `ECOSYSTEM_API_URL` | `http://localhost:3001` (roster) |
| `ECOSYSTEM_PORTAL_URL` | `http://localhost:3000` (redirección 403) |
| `CORS_ORIGINS` | `http://localhost:3000,http://localhost:3005` |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Web Push |
| `MAIL_*` | respaldo por correo |

---

## 8. Orden de trabajo (hitos)

- [x] **H0 · Fase 0 (ecosystem)** ✓ 2026-07-02 — `shared` (scope+`role_membresias`+
      `MembresiasRole`) · `buildToken` · plan/seed `membresias` · perfil de persona
      (`users` + `user_guardians` + `user_disciplines`) + migración `0001` +
      endpoints `GET/PATCH /users/:id/profile`, `PUT /disciplines`, `POST /guardians`
      (`UserProfileModule`). Verificado: build + tests (ecosystem 4/4, campeonatos 15/15).
- [x] **H1 · `membresias-db`** ✓ 2026-07-02 — schema `membresias` (11 tablas) +
      `drizzle.config` + migración `0000` + pglite; spec verde (2/2).
- [x] **H2 · `membresias-api` base** ✓ 2026-07-02 — Fastify :3004: bootstrap
      (`buildApp` con `verifyToken`/`db`/`fetchMembers` inyectables) + auth
      (`requireScope`/`requireRole` con `role_membresias`) + `plans` (CRUD) +
      `memberships` (roster merge desde ecosystem + `/mi` + PATCH + registrar pago) +
      `payments` (historial) + **`lib/billing.ts`** (mes calendario, ancla, clamp fin
      de mes) con tests. Verificado: build + tests **10/10** (6 billing + 4 integración
      PGlite).
- [ ] **H3 · Asistencia:** `/checkin` (QR/PIN/manual) + `attendances` + `schedule` +
      regla de mora.
- [ ] **H4 · `membresias-web` (MVP):** login + kiosco + panel maestro + ficha + planes.
- [ ] **H5 · Reportes + notificaciones** in-app + **Email** + job diario.
- [ ] **H6 · Fase 2:** Web **Push** (VAPID) · **`membresias-agent`** + lector · offline.

---

## 9. Decisiones técnicas a fijar al arrancar

1. **`requireRole`**: generalizar el claim (hoy hardcodea `role_campeonatos`) para
   reusarlo con `role_membresias`, o duplicar. *(Recom.: generalizar en `shared`/copia.)*
2. **Roster**: `membresias-api` hace fetch **server-side** al ecosystem con el token del
   usuario y mergea el estado local. *(Recom.; evita CORS y expone una sola API al web.)*
3. **Cron**: `node-cron` embebido en la API para el MVP (mover a job externo si crece).
4. **Migración del perfil**: como `ecosystem.users` es tabla existente con datos, las
   columnas nuevas van **nullable**; `medical_notes` cifrado en capa app.
