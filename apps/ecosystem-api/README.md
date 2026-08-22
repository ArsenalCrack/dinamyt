# DINAMYT Ecosystem — Backend

Servicio central de **identidad, suscripciones e integración** del ecosistema
DINAMYT. Es el único componente que gestiona el registro, el login y el control
de acceso por aplicación. Las apps del ecosistema (**DINAMYT Academy**,
**DINAMYT Campeonatos** y **DINAMYT Membresías**) **no** tienen autenticación
propia: delegan en este servicio y solo **verifican** los tokens que él emite.

## Qué resuelve

- **Identidad única**: un usuario, una cuenta, un login para todo el ecosistema.
- **Autenticación centralizada**: registro con verificación por OTP, login,
  recuperación de contraseña, emisión y verificación de JWT.
- **Suscripciones B2B**: organizaciones (federación, liga, club, academia) y
  usuarios adquieren planes que habilitan el acceso a una o más apps.
- **Control de acceso por scope**: el token incluye los `app_scopes` activos del
  usuario; cada app exige su propio scope (ej. `campeonatos`).

## Stack

| Capa          | Tecnología                          |
| ------------- | ----------------------------------- |
| Framework     | NestJS 11 (Node.js) + TypeScript    |
| Base de datos | PostgreSQL (Supabase)               |
| ORM           | Drizzle ORM (schema `ecosystem`)    |
| Auth          | JWT **RS256** firmado con `jose`    |
| Correo        | Nodemailer (OTP por Gmail)          |

## El contrato (lo que consumen las apps)

El payload del JWT es el contrato de integración del ecosistema:

```ts
interface JwtPayload {
  sub: string;              // user_id (UUID del ecosistema)
  email: string;
  fullName: string;
  org_id: string | null;    // primera organización con suscripción activa
  app_scopes: string[];     // ej. ["academy", "campeonatos"]
  role_academy: string | null;
  role_campeonatos: string | null;
  is_super_admin: boolean;
}
```

Una app del ecosistema valida el acceso así:

1. Obtiene la clave pública en `GET /auth/jwks` (o verifica vía
   `POST /auth/verify-token`).
2. Verifica la firma **RS256** del `Authorization: Bearer <token>`.
3. Comprueba que su scope esté en `app_scopes` (ej. `"campeonatos"`); si no,
   responde `403` y redirige al portal del ecosistema.
4. Lee `sub`, `org_id` y su rol (`role_campeonatos`) **sin** llamar al ecosistema
   en cada request.

## Perfil de la persona (transversal)

El **perfil es de la persona, no de cada app**: vive aquí y lo consumen por igual
Campeonatos y Membresías (por eso el maestro registra al alumno **una sola vez**).

**Hoy en `users`:** `full_name`, `document_id`, `email`, `phone`, `birth_date`,
`avatar_url` (foto), `data_consent_at`.

**Pendiente de añadir (perfil de alumno del ecosistema — lo consume Membresías):**

- `users`: **contacto de emergencia** (`emergency_contact_name`, `_phone`,
  `_relationship`) y **notas médicas** (`medical_notes` — _dato sensible_, con
  consentimiento).
- `user_guardians` (nueva): persona ↔ **acudiente** + parentesco (un acudiente puede
  tener varios menores; habilita el consentimiento de menores en Campeonatos).
- `user_disciplines` (nueva): **grado/cinturón por disciplina** (`discipline`,
  `current_grade`, `since`); las promociones las hace el club.
- Endpoints `GET/PATCH /users/:id/profile` (perfil unificado — ver `HANDOFF.md`).
- Para habilitar Membresías: agregar `'membresias'` a `apps_included` y
  `role_membresias` al `JwtPayload`.

> El **estado en un club** (activo/retirado, plan, vencimiento) **no** va aquí: es de
> cada app (ej. Membresías). Aquí solo vive la persona. Detalle en `PLAN_MEMBRESIAS.md`.

## Endpoints

| Método | Ruta                          | Protección            | Descripción                          |
| ------ | ----------------------------- | --------------------- | ------------------------------------ |
| POST   | `/auth/register`              | pública               | **No crea la cuenta**: deja un registro pendiente (caduca a los 20 min) y manda el código |
| POST   | `/auth/verify-email`          | pública               | `{ email, code }` → **aquí nace la cuenta**, y devuelve `access_token` |
| POST   | `/auth/resend-code`           | pública               | Otro código para el mismo registro (espera de 60 s, máx. 5 envíos) |
| GET    | `/auth/disponibilidad`        | pública               | `?email=&documentId=` → si están libres (lo consulta el formulario) |
| POST   | `/auth/login`                 | pública               | Devuelve `{ access_token }`          |
| POST   | `/auth/forgot-password`       | pública               | Envía OTP de recuperación (responde igual exista o no el correo) |
| POST   | `/auth/reset-password`        | pública               | `{ email, code, newPassword }` → nueva contraseña |
| POST   | `/auth/verify-token`          | pública (apps)        | Valida un token y devuelve el payload |
| GET    | `/auth/jwks`                  | pública (apps)        | Clave pública en formato JWKS        |
| POST   | `/organizations`              | super admin           | Crear organización                   |
| GET    | `/organizations`              | super admin           | Listar organizaciones                |
| GET    | `/organizations/:id`          | autenticado           | Detalle                              |
| POST   | `/organizations/:id/invite`   | super admin           | Invitar miembro por correo           |
| GET    | `/organizations/:id/members`  | autenticado           | Listar miembros                      |
| POST   | `/subscription-plans`         | super admin           | Crear plan                           |
| GET    | `/subscription-plans`         | pública               | Listar planes activos                |
| PATCH  | `/subscription-plans/:id`     | super admin           | Actualizar plan                      |
| DELETE | `/subscription-plans/:id`     | super admin           | Desactivar plan (soft delete)        |
| POST   | `/subscriptions`              | super admin           | Crear suscripción organizacional     |
| GET    | `/subscriptions`              | super admin           | Listar suscripciones                 |
| GET    | `/subscriptions/org/:orgId`   | autenticado           | Suscripciones de una organización    |
| PATCH  | `/subscriptions/:id/payment`  | super admin           | Registrar abono                      |
| PATCH  | `/subscriptions/:id/status`   | super admin           | Cambiar estado                       |

> Hay ejemplos listos para usar en [`requests/auth.http`](./requests/auth.http).

## Puesta en marcha

### Requisitos

- Node.js 18+
- Una base de datos PostgreSQL (Supabase en la nube o local)

### 1. Instalar dependencias

```bash
npm install
```

### 2. Generar el par de claves RS256

Las claves **no** se versionan (ver `.gitignore`). Genéralas una vez en `keys/`:

```bash
# requiere openssl
openssl genpkey -algorithm RSA -out keys/private.pem -pkeyopt rsa_keygen_bits:2048
openssl rsa -in keys/private.pem -pubout -out keys/public.pem
```

### 3. Configurar el entorno

```bash
cp .env.example .env   # (Windows: copy .env.example .env)
```

Ajusta `DATABASE_URL`, `MAIL_USER`/`MAIL_PASS` y las credenciales `ADMIN_*`.

### 4. Migrar y sembrar la base de datos

```bash
npm run db:migrate   # aplica el schema "ecosystem"
npm run db:seed      # crea el super admin + planes base (Academy, Campeonatos, Completo)
```

### 5. Arrancar

```bash
npm run start:dev    # desarrollo (watch)
# o
npm run build && npm run start:prod
```

El servicio queda en `http://localhost:3001`. Verifica con:

```
GET http://localhost:3001/auth/jwks
```

## Scripts útiles

| Script                | Descripción                                   |
| --------------------- | --------------------------------------------- |
| `npm run start:dev`   | Arranque en watch                             |
| `npm run build`       | Compila a `dist/`                             |
| `npm run start:prod`  | Ejecuta el build (`dist/src/main.js`)         |
| `npm run db:generate` | Genera migraciones Drizzle desde el schema    |
| `npm run db:migrate`  | Aplica migraciones                            |
| `npm run db:seed`     | Crea super admin + planes base (idempotente)  |
| `npm run db:studio`   | Abre Drizzle Studio                           |
| `npm run test`        | Tests unitarios                               |
