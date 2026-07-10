# DINAMYT — Montar el proyecto en la web (gratis)

> Paso a paso para publicar el monorepo con **Vercel** (webs) + **Render**
> (APIs) + **Supabase** (Postgres), todo en planes free. Última actualización:
> 2026-07-10.

## 0. ¿Qué hago con lo que ya tengo corriendo (DINAMYT-COMBAT)?

Tu Vercel/Render/Supabase actuales sirven a `DINAMYT-COMBAT` (proyecto viejo).
**Pueden convivir**: Vercel y Render permiten varios proyectos por cuenta y
Supabase hasta 2 proyectos free. Recomendación: **déjalo quieto** mientras
montas este, y cuando el monorepo esté estable, apaga/borra los servicios de
COMBAT para liberar cupo (el free de Supabase pausa proyectos inactivos tras
1 semana — si COMBAT no se usa, se pausará solo y no estorba).

## 1. GitHub (estado actual: ✅ sube sin problemas)

- Repo: `github.com/ArsenalCrack/dinamyt`, rama de trabajo `feat/academy`
  (pusheada). `keys/`, `.env`, `.uploads/`, `.localdb/` y `.venv/` están
  gitignorados: **no hay secretos en el repo**.
- Falta: merge de `feat/academy` → `master` cuando lo apruebes
  (`git checkout master && git merge feat/academy && git push`).

## 2. Supabase (base de datos — usa UN solo proyecto)

1. Crea el proyecto (o reusa uno) → copia el **connection string** del pooler.
2. En tu PC, pon esa URL en los `.env` y **comenta las líneas PGLITE**:
   - `apps/ecosystem-api/.env` → `DATABASE_URL=...` (comenta `PGLITE_DATA`)
   - `packages/campeonatos-db/.env` → `CAMPEONATOS_DATABASE_URL=...`
   - `packages/membresias-db/.env` → `MEMBRESIAS_DATABASE_URL=...`
   - `packages/academy-db/.env` → `ACADEMY_DATABASE_URL=...` (comenta `ACADEMY_PGLITE_DATA`)
   (Es el MISMO Postgres: cada app usa su schema — ecosystem, campeonatos,
   membresias, academy.)
3. Migra y siembra (una vez, desde tu PC):
   ```powershell
   pnpm --filter @dinamyt/ecosystem-api db:migrate ; pnpm --filter @dinamyt/ecosystem-api db:seed
   pnpm --filter @dinamyt/campeonatos-db db:migrate
   pnpm --filter @dinamyt/membresias-db db:migrate
   pnpm --filter @dinamyt/academy-db db:migrate
   ```

## 3. Llaves RS256 y correo (lo que FALTA configurar)

- **Llaves**: `openssl genpkey -algorithm RSA -out private.pem -pkeyopt rsa_keygen_bits:2048`
  y `openssl rsa -in private.pem -pubout -out public.pem`. En Render se cargan
  como **Secret Files** del servicio ecosystem-api (rutas en
  `JWT_PRIVATE_KEY_PATH`/`JWT_PUBLIC_KEY_PATH`). No reuses las de tu PC.
- **Correo (OTP y avisos)**: Gmail con *contraseña de aplicación* →
  `MAIL_USER`/`MAIL_PASS` en ecosystem-api (y SMTP de campeonatos si usas
  invitaciones por correo).
- **Membresías**: `FIELD_ENCRYPTION_KEY` (cadena robusta) y VAPID
  (`pnpm --filter @dinamyt/membresias-api gen:vapid`).

## 4. Render (las 4 APIs — free web services)

Para cada una: New → Web Service → repo `dinamyt` → runtime Node.
Build: `corepack enable && pnpm install && pnpm --filter <paquete> build`
Start: `pnpm --filter <paquete> start`

| Servicio | Paquete | Envs claves |
| --- | --- | --- |
| ecosystem-api | `@dinamyt/ecosystem-api` | `DATABASE_URL`, llaves RS256, `MAIL_*`, `ADMIN_*`, `CORS_ORIGINS` (URLs Vercel) |
| campeonatos-api | `@dinamyt/campeonatos-api` | `CAMPEONATOS_DATABASE_URL`, `ECOSYSTEM_JWKS_URL=https://<eco>.onrender.com/auth/jwks`, `CORS_ORIGINS` |
| membresias-api | `@dinamyt/membresias-api` | ídem + `FIELD_ENCRYPTION_KEY`, VAPID |
| academy-api | `@dinamyt/academy-api` | `ACADEMY_DATABASE_URL`, `ECOSYSTEM_JWKS_URL`, `ECOSYSTEM_API_URL`, `CORS_ORIGINS`, `FIGURAS_SERVICE_URL` |

- `PORT` lo inyecta Render (las APIs ya leen `process.env.PORT`).
- **academy-figuras** (Python): New → Web Service → runtime Python,
  build `pip install -r apps/academy-figuras/requirements-service.txt`,
  start `uvicorn service.main:app --host 0.0.0.0 --port $PORT --app-dir apps/academy-figuras`.
  ⚠️ En free, los archivos subidos NO persisten entre deploys de Render:
  para producción real, mover `.uploads` a Supabase Storage (pendiente
  RF-ACA-11) o pagar un disco persistente. Para demo/gratis funciona.
- Free de Render “duerme” tras 15 min sin tráfico (el primer request tarda ~1 min).

## 5. Vercel (las 4 webs)

Para cada una: Add New Project → repo `dinamyt` → **Root Directory** =
`apps/ecosystem-portal` (o `campeonatos-web`, `membresias-web`, `academy-web`).
Vercel detecta Next; deja el build por defecto. Envs (`NEXT_PUBLIC_*`):
las URLs de Render y de las otras webs de Vercel — p. ej. en academy-web:
`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_ECOSYSTEM_API_URL`,
`NEXT_PUBLIC_ECOSYSTEM_PORTAL_URL`; en el portal:
`NEXT_PUBLIC_CAMPEONATOS_URL`, `NEXT_PUBLIC_MEMBRESIAS_URL`,
`NEXT_PUBLIC_ACADEMY_URL`.

## 6. Cierre

1. Actualiza `CORS_ORIGINS` de TODAS las APIs con los dominios Vercel finales.
2. Entra al portal → login super-admin (seed) → crea org + suscripciones.
3. Sanity: `/auth/jwks` (eco), `/health` (cada API), SSO desde el dashboard.

**Checklist de lo que falta hoy**: merge a master · proyecto Supabase +
migraciones/seed · llaves RS256 nuevas · contraseña de aplicación de Gmail ·
crear los 5 servicios en Render y 4 en Vercel con sus envs · CORS final.
