# PLAN — Sacar DINAMYT Membresías a un proyecto independiente

> Estado: **plan aprobado, sin ejecutar**. Documento de trabajo previo a la extracción.
> Fecha: 2026-07-26

---

## 1. Objetivo y decisiones tomadas

Convertir Membresías (hoy 4 paquetes dentro del monorepo `dinamyt`) en un **producto autónomo**, con su propio repositorio, su propia identidad y su propio despliegue en Vercel + Render, sin depender de que el ecosystem esté vivo.

Decisiones ya cerradas:

| Tema | Decisión |
|---|---|
| **Login** | Híbrido: Membresías emite sus propios tokens y funciona 100% sola. Si se configura `ECOSYSTEM_JWKS_URL`, además acepta tokens del ecosystem (SSO opcional). |
| **Multi-club** | Multi-tenant: tabla propia de clubes; el `org_id` sale de la BD de Membresías, no de un claim externo. |
| **Superadmin** | Sí, con la jerarquía de DINAMYT-LOCAL: el superadmin decide **qué clubes y qué maestros tienen acceso**. |
| **Alumnos** | CRUD propio del maestro. Membresías deja de leer el roster del ecosystem. |
| **Repo destino** | Se reutiliza `github.com/ArsenalCrack/dinamyt-membresias` (hoy contiene solo el frontend). |
| **Huella** | **Fuera.** Se elimina biometría por completo (rutas, tabla, agente). |
| **Check-in** | **Carnet QR imprimible** por alumno + PIN de respaldo. El maestro lo lee con la cámara de su celular. |
| **Correos** | **Ninguno.** Sin recuperación de contraseña, sin avisos por email. El maestro administra los perfiles y las contraseñas. |
| **PWA** | Instalable en el celular del maestro y del alumno. |
| **Monorepo** | **Conserva su copia** de Membresías (no se borra). Ver §8, riesgo de divergencia. |
| **Tema / idioma** | Claro-oscuro + es/en portados del patrón de DINAMYT-LOCAL. |

---

## 2. Inventario: qué se extrae

| Paquete | Ruta actual | Contenido |
|---|---|---|
| API | `apps/membresias-api` | Fastify :3004 — 23 endpoints en 9 grupos de rutas |
| Web | `apps/membresias-web` | Next 16 PWA :3006 — 8 páginas, 4 componentes (~2.100 líneas) |
| BD | `packages/membresias-db` | Drizzle, schema Postgres `membresias`, 11 tablas, 2 migraciones |
| _(fuera)_ | `apps/membresias-agent` | Agente Windows del lector de huella — **no se lleva ahora** |

**Endpoints actuales** (todos se conservan): `plans` (4) · `memberships` (4) · `payments` (1) · `schedule` (4) · `checkin` (2) · `reports` (3) · `notifications` (2) · `biometrics` (2) · `health` (1).

**Tablas actuales**: `plans`, `memberships`, `payments`, `club_schedule`, `schedule_exceptions`, `devices`, `attendances`, `biometric_templates`, `push_subscriptions`, `notifications`, `audit`.

---

## 3. El problema real: los 4 acoplamientos con el ecosystem

Membresías hoy **no tiene identidad propia**. Todo lo que hay que romper:

| # | Acoplamiento | Dónde | Qué pasa hoy |
|---|---|---|---|
| 1 | **Login** | [`api.ts:59`](apps/membresias-web/src/lib/api.ts:59) | `POST {ecosystem}/auth/login`. El token lo emite el ecosystem. |
| 2 | **Verificación** | [`plugins/auth.ts:10`](apps/membresias-api/src/plugins/auth.ts:10) | `createRemoteJWKSet` contra el JWKS del ecosystem. La API **nunca firma**. |
| 3 | **Roster** | [`lib/ecosystem.ts:20`](apps/membresias-api/src/lib/ecosystem.ts:20) | `GET /organizations/:id/members`. Membresías **no crea alumnos**. |
| 4 | **Perfil / foto** | [`mi/page.tsx:113`](apps/membresias-web/src/app/mi/page.tsx:113), [`alumnos/[id]/page.tsx:58`](apps/membresias-web/src/app/alumnos/[id]/page.tsx:58) | `GET {ecosystem}/users/:id/profile`. |

Y un quinto, transversal: **`org_id` viene del claim del JWT del ecosystem**. Aparece en 20+ sitios de las rutas (`req.user!.org_id`) y en 8 de las 11 tablas. `memberships.ecosystem_user_id` apunta a usuarios que viven en otra base de datos, sin FK.

Dependencia extra menor: `@dinamyt/shared` — se usa **solo para tipos** (`JwtPayload`, `AppScope`, `MembresiasRole`) en 7 archivos. Se resuelve copiando el tipo al repo nuevo.

---

## 4. Arquitectura destino

### 4.1 Estructura del repositorio

El repo `dinamyt-membresias` hoy tiene el frontend suelto en la raíz (1 commit). Se reestructura como mini-monorepo, moviendo con `git mv` para **conservar el historial**:

```
dinamyt-membresias/
├── apps/
│   ├── membresias-api/      ← desde apps/membresias-api  (Render)
│   └── membresias-web/      ← contenido actual del repo   (Vercel)
├── packages/
│   └── membresias-db/       ← desde packages/membresias-db
├── package.json             (turbo, pnpm workspaces)
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
└── README.md
```

Se conservan los nombres de paquete (`@dinamyt/membresias-api`, `@dinamyt/membresias-web`, `@dinamyt/membresias-db`) para no tocar ni un import. Renombrarlos a `@membresias/*` es cosmético y se puede hacer después.

### 4.2 Jerarquía de roles

Espejo de DINAMYT-LOCAL (`es_superadmin` como booleano aparte del rol, no un valor más del enum — así no hay que migrar el tipo), adaptado al dominio de Membresías:

| Nivel | Rol | Alcance |
|---|---|---|
| 0 | **superadmin** (`is_super_admin = true`) | Ve y gestiona **todo**: crea clubes, crea maestros, activa/desactiva su acceso. Es el usuario sembrado. |
| 1 | **owner** (maestro / dueño del club) | Su club: planes, alumnos, pagos, horario, kiosco, avisos, reportes. |
| 2 | **staff** (auxiliar) | Día a día del club: check-in y registrar pagos. Sin planes ni usuarios. |
| 3 | **guardian** (acudiente) | Solo el estado de los alumnos que él paga (`memberships.payer_user_id`). |
| 3 | **student** (alumno) | Solo su propio estado. |

Los valores `owner | staff | guardian | student` **ya existen** en el sistema, así que los datos actuales encajan sin traducción. Y como `is_super_admin` ya es un claim del JWT del ecosystem, el SSO híbrido sigue funcionando sin adaptadores.

Aislamiento (regla de DINAMYT-LOCAL): un `owner` solo ve su club. Al negar acceso a un recurso de otro club se responde **404, no 403**, para no revelar que existe.

### 4.3 Tablas nuevas

Se agregan al schema `membresias` ya existente:

```
orgs             id, name, slug, city, country, is_active,
                 owner_user_id, created_at, updated_at
                 → los crea el superadmin; is_active corta el acceso al club entero

users            id, email (unique), full_name, password_hash, phone, avatar_url,
                 role, is_super_admin, org_id, is_active,
                 email_verified_at, created_by_id, created_at, updated_at
                 → identidad propia; created_by_id da la trazabilidad del workspace

otp_codes        id, user_id, code_hash, purpose ('verify' | 'reset'), expires_at, used_at
                 → verificación de correo y recuperación de contraseña
```

**No** hace falta tabla de acudientes: `memberships.payer_user_id` ya modela quién paga, y el `guardian` consulta por ahí.

### 4.4 Migración de datos

`memberships.ecosystem_user_id` pasa a apuntar a `membresias.users.id`. Se renombra a `user_id` con `ALTER TABLE ... RENAME COLUMN` (preserva los datos). Igual para `push_subscriptions.user_id` y `notifications.user_id`, que ya se llaman bien.

Si la Supabase de producción ya tiene datos reales, se agrega un script de importación puntual: leer el roster del ecosystem una vez, insertar en `users` **respetando los UUID existentes**, y así los `ecosystem_user_id` guardados siguen resolviendo sin tocar ninguna fila. Esto se verifica en la Fase 0 antes de escribir la migración.

### 4.5 Autenticación híbrida

**Token propio: HS256 con `JWT_SECRET`.** Deliberadamente *no* RS256 con archivos `.pem`: los últimos 3 commits del monorepo (`5c12c57`, `7fad6dc`, `bc07e03`) son precisamente peleas con las rutas de las llaves JWT en Render. Un secreto en variable de entorno elimina esa clase de bug. El payload conserva la forma actual (`sub`, `email`, `fullName`, `org_id`, `role_membresias`, `is_super_admin`) para que el frontend no cambie de contrato.

**Verificador con dos emisores** — reemplaza `createRemoteVerifier` en [`plugins/auth.ts`](apps/membresias-api/src/plugins/auth.ts):

1. Intenta HS256 con `JWT_SECRET` → token propio.
2. Si falla y `ECOSYSTEM_JWKS_URL` está definido, intenta RS256 contra el JWKS → token del ecosystem; se resuelve el usuario local **por email**. Si no existe, 401 (nada de auto-crear cuentas en silencio).
3. Si `ECOSYSTEM_JWKS_URL` no está definido, el paso 2 no existe: la app es totalmente autónoma.

`requireScope()` deja de tener sentido sin el ecosystem (no hay `app_scopes` que comprar). Se sustituye por `requireOrgActiva()`: club existente y `is_active = true`. El superadmin siempre pasa.

Endpoints nuevos de auth: `POST /auth/login`, `GET /auth/me`, `POST /auth/change-password`, `POST /auth/forgot-password`, `POST /auth/reset-password`. Con **rate limiting** de entrada (5 intentos por correo y 20 por IP cada 5 min, como DINAMYT-LOCAL) y bcrypt con coste configurable — DINAMYT-LOCAL bajó a 10 rondas justamente porque en la CPU compartida de Render 12 rondas tardan segundos.

---

## 5. Fases de trabajo

### Fase 0 — Preparación
- Verificar si la Supabase de Membresías tiene datos reales (define si la Fase 2 necesita script de importación).
- Clonar `dinamyt-membresias` y crear rama de trabajo.
- Confirmar que la copia del monorepo queda intacta como referencia.

### Fase 1 — Extracción mecánica
- `git mv` del frontend actual a `apps/membresias-web/`.
- Copiar `membresias-api` y `membresias-db`.
- Crear `package.json` raíz, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.gitignore`.
- Eliminar `@dinamyt/shared`: copiar `JwtPayload` y los tipos de rol a `apps/membresias-api/src/types/auth.ts` (7 archivos afectados, todos `import type`).
- **Criterio de salida**: `pnpm install && pnpm build && pnpm test` verdes en el repo nuevo, con la app funcionando exactamente igual que hoy (todavía contra el ecosystem).

### Fase 2 — Identidad propia en la API
- Schema: `orgs`, `users`, `otp_codes` + migración de renombrado.
- `lib/auth/passwords.ts` (bcrypt), `lib/auth/tokens.ts` (firmar/verificar HS256), `lib/auth/rate-limit.ts`.
- Reescribir `plugins/auth.ts`: verificador híbrido, `requireOrgActiva`, `requireRole` sobre roles locales.
- Nuevas rutas `routes/auth.ts`.
- Seed del superadmin (email + contraseña por variable de entorno; falla si no está en producción).
- Actualizar los specs que hoy inyectan `verifyToken` falso (`app.spec.ts`, `checkin.spec.ts`, `notifications.spec.ts`, `reports.spec.ts`).

### Fase 3 — Roster propio
- `routes/users.ts`: CRUD de alumnos del club (alta, edición, foto, teléfono, acudiente, activar/desactivar).
- Reemplazar `fetchMembers` (hoy llamada HTTP al ecosystem) por una consulta a `users` — afecta `memberships.ts:32` y `notifications.ts:65`.
- `GET /users/:id/profile` propio, para que la web deje de llamar al ecosystem.
- Borrar `lib/ecosystem.ts` y la inyección `fetchMembers` de `app.ts`.

### Fase 4 — Panel de superadmin
- `routes/orgs.ts`: crear club, activar/desactivar, asignar maestro dueño.
- `routes/admin-users.ts`: crear maestros, activar/desactivar, reset de contraseña.
- Página `/admin` en la web: lista de clubes y maestros con su estado de acceso.

### Fase 5 — Web: login, tema e idioma
- **Login propio**: `lib/auth.tsx` con `AuthProvider` (patrón de DINAMYT-LOCAL: contexto + `localStorage` + revalidación con `/auth/me`), reescritura de `login/page.tsx`, y `lib/api.ts` apuntando a la API propia. El botón "Entrar con el portal DINAMYT" se conserva solo si el SSO está configurado.
- **Tema**: portar `lib/theme.ts` (localStorage + `data-theme="light"` en `<html>` + script inline anti-flash en `layout.tsx`) y escribir el bloque `html[data-theme="light"]` en `globals.css`, que hoy es dark-only.
- **i18n**: portar el patrón de `lib/i18n.tsx` (contexto, `Record<ClaveTexto, string>` tipado, persistencia en `dinamyt_lang`) con un diccionario **nuevo** para las claves de Membresías. Las 2.374 líneas de DINAMYT-LOCAL son de campeonatos: no se copian, se copia la mecánica.
- **UI de control**: selector de tema + idioma en el `NavBar`, y un `PublicControls` flotante para las pantallas sin sesión (`/login`, `/kiosco`).
- Traducir las 8 páginas y 4 componentes a claves i18n (es/en).

### Fase 6 — Despliegue
- **Render** (`dinamyt-membresias-api`): build `pnpm install --frozen-lockfile && pnpm --filter @dinamyt/membresias-db build && pnpm --filter @dinamyt/membresias-api build`, start `node apps/membresias-api/dist/main.js`, health check `/health`.
- **Vercel** (`dinamyt-membresias-web`): root directory `apps/membresias-web`, framework Next.js.
- Variables (§6).
- Actualizar `CORS_ORIGINS` con el dominio nuevo de Vercel.

### Fase 7 — Cierre
- `README.md` y `RUN_LOCAL.md` propios del repo.
- Suite de tests verde.
- Prueba de humo en producción: superadmin entra → crea club → crea maestro → maestro entra → crea alumno → registra pago → check-in.

---

## 6. Variables de entorno

**Render — API**
```
PORT=3004
MEMBRESIAS_DATABASE_URL=postgresql://...
JWT_SECRET=<cadena larga aleatoria>
JWT_EXPIRES_IN=86400
BCRYPT_ROUNDS=10
SUPERADMIN_EMAIL=...
SUPERADMIN_PASSWORD=...
CORS_ORIGINS=https://dinamyt-membresias-web.vercel.app
MEMBRESIAS_WEB_URL=https://dinamyt-membresias-web.vercel.app
FIELD_ENCRYPTION_KEY=...
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:...
MAIL_USER=...            # o RESEND_API_KEY si se migra el mailer
MAIL_PASS=...
# SSO opcional — si se omiten, la app es 100% autónoma:
# ECOSYSTEM_JWKS_URL=https://dinamyt-ecosystem-api.onrender.com/auth/jwks
# ECOSYSTEM_PORTAL_URL=https://dinamyt-ecosystem-portal.vercel.app
```

**Vercel — Web**
```
NEXT_PUBLIC_API_URL=https://dinamyt-membresias-api.onrender.com
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
# SSO opcional:
# NEXT_PUBLIC_ECOSYSTEM_PORTAL_URL=https://dinamyt-ecosystem-portal.vercel.app
```

Desaparecen `NEXT_PUBLIC_ECOSYSTEM_API_URL` y `ECOSYSTEM_API_URL`: ya no se consulta al ecosystem para roster ni perfiles.

---

## 7. Verificación

- [ ] `pnpm build` y `pnpm test` verdes en el repo nuevo
- [ ] La API arranca **sin** `ECOSYSTEM_JWKS_URL` definida
- [ ] Login propio funciona; un token del ecosystem también entra si el SSO está activo
- [ ] Un `owner` de club A recibe 404 (no 403) al pedir recursos del club B
- [ ] Superadmin desactiva un club → sus maestros dejan de entrar
- [ ] Tema claro/oscuro persiste y **no parpadea** al recargar
- [ ] Cambio es/en aplica al instante en toda la app, sin recargar
- [ ] Vercel y Render despliegan desde el repo nuevo y se hablan entre sí

---

## 8. Riesgos y puntos abiertos

**Kiosco de huella sin agente.** Al no llevar `membresias-agent`, el check-in por huella no funciona en el repo standalone. Las rutas `biometrics.ts` siguen ahí (solo guardan plantillas cifradas), y el kiosco sigue sirviendo por QR/PIN. Cuando quieras el lector, se copia el agente y ya.

**Dos copias divergiendo.** El monorepo conserva su Membresías y no recibirá nada de lo que se haga aquí. A partir de la Fase 2 los schemas dejan de ser compatibles. Vale la pena decidir pronto cuál de las dos es la versión viva.

**Render capa gratis.** La API se duerme a los 15 min y el primer login puede tardar ~1 min. Con bcrypt encima, la sensación es peor. Está analizado en [`INFRAESTRUCTURA_PRODUCCION.md`](INFRAESTRUCTURA_PRODUCCION.md).

**Correo transaccional.** Recuperar contraseña necesita correo que llegue. Hoy el mailer usa `nodemailer` con Gmail, que Render bloquea en capa gratis. La recomendación existente es Resend por HTTP; no está en este plan y habría que decidir si entra en la Fase 2 o después.

**El `/kiosco` no debe pedir login de persona.** Hoy funciona con el token del maestro. Con identidad propia conviene revisar si el dispositivo merece su propio token de larga vida (la tabla `devices` ya existe y no se está usando para eso).
