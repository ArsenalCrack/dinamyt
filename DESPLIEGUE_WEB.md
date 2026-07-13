# DINAMYT — Montar el proyecto en la web (gratis, paso a paso)

> Guía **completa y detallada** para publicar el monorepo con **Vercel** (webs)
> + **Render** (APIs) + **Supabase** (Postgres), todo en planes free.
> Última actualización: 2026-07-11.

---

## Índice

0. [Prerrequisitos](#0-prerrequisitos)
1. [GitHub — preparar el repositorio](#1-github--preparar-el-repositorio)
2. [Supabase — base de datos](#2-supabase--base-de-datos)
3. [Migraciones y seed](#3-migraciones-y-seed)
4. [Llaves RS256 y correo (Gmail)](#4-llaves-rs256-y-correo-gmail)
5. [Render — las 5 APIs](#5-render--las-5-apis)
6. [Vercel — las 4 webs](#6-vercel--las-4-webs)
7. [CORS y verificación final](#7-cors-y-verificación-final)
8. [Troubleshooting y FAQ](#8-troubleshooting-y-faq)
9. [Checklist final](#9-checklist-final)

---

## 0. Prerrequisitos

Antes de empezar, asegúrate de tener:

| Cuenta / herramienta | Para qué | Cómo obtenerla |
| --- | --- | --- |
| **GitHub** | Repositorio del código | [github.com/signup](https://github.com/signup) |
| **Vercel** | Hospedar las 4 webs (Next.js) | [vercel.com/signup](https://vercel.com/signup) — vincula tu cuenta de GitHub |
| **Render** | Hospedar las 5 APIs (Node.js + Python) | [render.com/register](https://render.com/register) — vincula tu GitHub |
| **Supabase** | Base de datos PostgreSQL | [supabase.com/dashboard](https://supabase.com/dashboard) — 2 proyectos free |
| **Node.js 18+** | Correr migraciones desde tu PC | `node -v` debe dar ≥18 |
| **pnpm 11+** | Gestor de paquetes del monorepo | `npm i -g pnpm` o `corepack enable` |
| **OpenSSL** | Generar llaves RS256 | Viene con Git for Windows (`Git Bash`) |
| **Gmail** | Enviar OTP y notificaciones | Necesitas una *contraseña de aplicación* |

> ⚠️ **¿Ya tengo DINAMYT-COMBAT desplegado?** Déjalo quieto. Vercel y Render
> permiten varios proyectos por cuenta y Supabase da 2 proyectos free. Cuando
> el monorepo nuevo esté estable, apaga los servicios viejos.

---

## 1. GitHub — preparar el repositorio

### 1.1 Verificar que no hay secretos en el repo

```powershell
# Archivos que NUNCA deben estar en git (ya en .gitignore):
# keys/  .env  .uploads/  .localdb/  .venv/
git status   # debe estar limpio
```

### 1.2 Merge de la rama de trabajo a master/main

```powershell
git checkout master
git merge feat/academy
git push origin master
```

> Si tu rama principal en GitHub es `main` (no `master`), haz el merge a `main`:
> ```powershell
> git checkout main
> git merge feat/academy
> git push origin main
> ```

### 1.3 Verificar el CI

Después del push, revisa que el workflow de GitHub Actions pase en verde:
**Actions** → **CI** → debe salir ✅. Si falla, revisa la sección de
[Troubleshooting](#8-troubleshooting-y-faq).

---

## 2. Supabase — base de datos

### 2.1 Crear el proyecto

1. Ve a [supabase.com/dashboard](https://supabase.com/dashboard).
2. Haz clic en **New Project**.
3. Elige un nombre (ej. `dinamyt-prod`) y una contraseña para la BD.
   **Guarda esta contraseña**, la necesitarás para el connection string.
4. Selecciona la región más cercana a tus usuarios.
5. Espera ~2 minutos a que se provisione.

### 2.2 Copiar el connection string

1. En el dashboard del proyecto, ve a **Settings → Database**.
2. Busca la sección **Connection string** → pestaña **URI**.
3. Copia el string **con modo Pooler (Transaction)**. Se ve así:
   ```
   postgresql://postgres.xxxxxxx:TU_CONTRASEÑA@aws-0-us-east-1.pooler.supabase.com:6543/postgres
   ```
4. **Reemplaza `TU_CONTRASEÑA`** con la que pusiste al crear el proyecto.

### 2.3 Entender los schemas

DINAMYT usa **un solo proyecto de Supabase** con 4 schemas aislados:

| Schema | Qué almacena | Quién lo usa |
| --- | --- | --- |
| `ecosystem` | Usuarios, orgs, planes, suscripciones | ecosystem-api |
| `campeonatos` | Campeonatos, inscripciones, secciones | campeonatos-api |
| `membresias` | Membresías, check-ins, pagos | membresias-api |
| `academy` | Artes marciales, contenidos, evaluaciones | academy-api |

Todos apuntan al **mismo connection string**; cada app crea su propio schema.

### 2.4 Configurar los .env locales para migrar

En tu PC (estos archivos son locales, NO se suben a git), **comenta las líneas
de PGlite** y agrega la URL de Supabase:

**`apps/ecosystem-api/.env`:**
```env
# PGLITE_DATA=D:/Repositorios/dinamyt/.localdb/ecosystem   ← COMENTADA
DATABASE_URL=postgresql://postgres.xxxxxxx:TU_CONTRASEÑA@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

**`packages/campeonatos-db/.env`:**
```env
# CAMPEONATOS_PGLITE_DATA=...   ← COMENTADA
CAMPEONATOS_DATABASE_URL=postgresql://postgres.xxxxxxx:TU_CONTRASEÑA@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

**`packages/membresias-db/.env`:**
```env
# MEMBRESIAS_PGLITE_DATA=...   ← COMENTADA
MEMBRESIAS_DATABASE_URL=postgresql://postgres.xxxxxxx:TU_CONTRASEÑA@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

**`packages/academy-db/.env`:**
```env
# ACADEMY_PGLITE_DATA=...   ← COMENTADA
ACADEMY_DATABASE_URL=postgresql://postgres.xxxxxxx:TU_CONTRASEÑA@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

---

## 3. Migraciones y seed

### 3.1 Instalar dependencias y compilar

```powershell
pnpm install
pnpm build      # turbo: 15/15 deben pasar
```

### 3.2 Ejecutar migraciones (una vez, desde tu PC)

```powershell
# Ecosystem: crea el schema + tablas de identidad
pnpm --filter @dinamyt/ecosystem-api db:migrate

# Ecosystem seed: crea el super-admin + planes (Academy/Campeonatos/Completo)
pnpm --filter @dinamyt/ecosystem-api db:seed

# Campeonatos: crea el schema + tablas de campeonatos
pnpm --filter @dinamyt/campeonatos-db db:migrate

# Membresías: crea el schema + tablas de membresías
pnpm --filter @dinamyt/membresias-db db:migrate

# Academy: crea el schema + tablas de academy
pnpm --filter @dinamyt/academy-db db:migrate
```

### 3.3 Verificar en Supabase

En el dashboard de Supabase → **Table Editor**, deberías ver los schemas
`ecosystem`, `campeonatos`, `membresias` y `academy` con todas sus tablas.

El seed crea el super-admin con las credenciales de tu `.env`:
- Email: lo que tengas en `ADMIN_EMAIL`
- Password: lo que tengas en `ADMIN_PASSWORD`

---

## 4. Llaves RS256 y correo (Gmail)

### 4.1 Generar llaves RS256 NUEVAS para producción

⚠️ **NUNCA reutilices** las llaves de desarrollo local. Genera un par nuevo:

```bash
# En Git Bash o terminal con OpenSSL:
openssl genpkey -algorithm RSA -out private.pem -pkeyopt rsa_keygen_bits:2048
openssl rsa -in private.pem -pubout -out public.pem
```

Esto genera dos archivos: `private.pem` y `public.pem`. Los subirás a Render
como **Secret Files** del servicio ecosystem-api (§5).

### 4.2 Configurar Gmail con contraseña de aplicación

1. Ve a [myaccount.google.com/security](https://myaccount.google.com/security).
2. Activa la **verificación en 2 pasos** si no la tienes.
3. Busca **Contraseñas de aplicaciones** (App passwords).
4. Crea una nueva: nombre = `DINAMYT`, tipo = **Correo**.
5. Google te dará una contraseña de 16 caracteres. **Cópiala**.

En Render usarás:
- `MAIL_USER` = tu Gmail (ej. `tucorreo@gmail.com`)
- `MAIL_PASS` = la contraseña de 16 caracteres

### 4.3 Generar claves VAPID (Membresías)

```powershell
pnpm --filter @dinamyt/membresias-api gen:vapid
```

Copia `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT` del output.

### 4.4 Generar clave de encriptación de campos

Para `FIELD_ENCRYPTION_KEY`, genera una cadena aleatoria robusta:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 5. Render — las 5 APIs

### 5.1 Pasos generales (aplica a cada servicio)

1. Ve a [render.com/dashboard](https://render.com/dashboard).
2. Haz clic en **New → Web Service**.
3. Conecta tu repositorio `ArsenalCrack/dinamyt`.
4. Configura:
   - **Name**: nombre del servicio (ej. `dinamyt-ecosystem-api`)
   - **Root Directory**: déjalo vacío (es monorepo)
   - **Runtime**: Node (para las APIs de JS) o Python (para figuras)
   - **Build Command** y **Start Command**: ver tabla abajo
   - **Instance Type**: Free
5. En **Environment → Environment Variables**, agrega las variables que
   correspondan (ver tabla por servicio).
6. Haz clic en **Deploy**.

### 5.2 ecosystem-api (identidad central)

| Campo | Valor |
| --- | --- |
| **Name** | `dinamyt-ecosystem-api` |
| **Build** | `corepack enable && pnpm install && pnpm --filter "@dinamyt/ecosystem-api..." build` |
| **Start** | `pnpm --filter @dinamyt/ecosystem-api start:prod` |

**Environment Variables:**

| Variable | Valor |
| --- | --- |
| `DATABASE_URL` | `postgresql://postgres.xxx:...` (tu connection string de Supabase) |
| `JWT_PRIVATE_KEY_PATH` | `/etc/secrets/private.pem` |
| `JWT_PUBLIC_KEY_PATH` | `/etc/secrets/public.pem` |
| `ADMIN_EMAIL` | `admin@tudominio.com` |
| `ADMIN_PASSWORD` | Contraseña fuerte para el super-admin |
| `MAIL_USER` | Tu Gmail |
| `MAIL_PASS` | Contraseña de aplicación de Gmail |
| `CORS_ORIGINS` | `https://tu-portal.vercel.app,https://tu-academy.vercel.app,https://tu-campeonatos.vercel.app,https://tu-membresias.vercel.app` |

**Secret Files** (en Settings → Secret Files):
- `/etc/secrets/private.pem` → contenido de `private.pem`
- `/etc/secrets/public.pem` → contenido de `public.pem`

### 5.3 campeonatos-api

| Campo | Valor |
| --- | --- |
| **Name** | `dinamyt-campeonatos-api` |
| **Build** | `corepack enable && pnpm install && pnpm --filter "@dinamyt/campeonatos-api..." build` |
| **Start** | `pnpm --filter @dinamyt/campeonatos-api start` |

**Environment Variables:**

| Variable | Valor |
| --- | --- |
| `CAMPEONATOS_DATABASE_URL` | Misma URL de Supabase |
| `ECOSYSTEM_JWKS_URL` | `https://dinamyt-ecosystem-api.onrender.com/auth/jwks` |
| `CORS_ORIGINS` | URLs de Vercel del portal y de campeonatos-web |

### 5.4 membresias-api

| Campo | Valor |
| --- | --- |
| **Name** | `dinamyt-membresias-api` |
| **Build** | `corepack enable && pnpm install && pnpm --filter "@dinamyt/membresias-api..." build` |
| **Start** | `pnpm --filter @dinamyt/membresias-api start` |

**Environment Variables:**

| Variable | Valor |
| --- | --- |
| `MEMBRESIAS_DATABASE_URL` | Misma URL de Supabase |
| `ECOSYSTEM_JWKS_URL` | `https://dinamyt-ecosystem-api.onrender.com/auth/jwks` |
| `FIELD_ENCRYPTION_KEY` | La clave generada en §4.4 |
| `VAPID_PUBLIC_KEY` | Del output de gen:vapid |
| `VAPID_PRIVATE_KEY` | Del output de gen:vapid |
| `VAPID_SUBJECT` | `mailto:tucorreo@gmail.com` |
| `CORS_ORIGINS` | URLs de Vercel del portal y de membresias-web |

### 5.5 academy-api

| Campo | Valor |
| --- | --- |
| **Name** | `dinamyt-academy-api` |
| **Build** | `corepack enable && pnpm install && pnpm --filter "@dinamyt/academy-api..." build` |
| **Start** | `pnpm --filter @dinamyt/academy-api start` |

**Environment Variables:**

| Variable | Valor |
| --- | --- |
| `ACADEMY_DATABASE_URL` | Misma URL de Supabase |
| `ECOSYSTEM_JWKS_URL` | `https://dinamyt-ecosystem-api.onrender.com/auth/jwks` |
| `ECOSYSTEM_API_URL` | `https://dinamyt-ecosystem-api.onrender.com` |
| `FIGURAS_SERVICE_URL` | `https://dinamyt-figuras.onrender.com` (si lo despliegas) |
| `CORS_ORIGINS` | URLs de Vercel del portal y de academy-web |

### 5.6 academy-figuras (Python, opcional)

| Campo | Valor |
| --- | --- |
| **Name** | `dinamyt-figuras` |
| **Runtime** | Python 3 |
| **Build** | `pip install -r apps/academy-figuras/requirements-service.txt` |
| **Start** | `uvicorn service.main:app --host 0.0.0.0 --port $PORT --app-dir apps/academy-figuras` |

> ⚠️ En el plan free de Render, los archivos subidos (`.uploads/`) **NO persisten**
> entre deploys. Para producción real, migrar a Supabase Storage. Para demo, funciona.

### 5.7 Notas importantes de Render

- **`PORT`** lo inyecta Render automáticamente — las APIs ya leen `process.env.PORT`.
- **Free tier**: los servicios se "duermen" tras 15 min sin tráfico. El primer
  request tarda ~1 minuto en despertar. Esto es normal.
- Las URLs de tus servicios serán `https://<nombre>.onrender.com`.
  Anótalas porque las necesitas para las variables de entorno de Vercel.

---

## 6. Vercel — las 4 webs

### 6.1 Pasos generales

1. Ve a [vercel.com/dashboard](https://vercel.com/dashboard).
2. Haz clic en **Add New → Project**.
3. Importa el repo `ArsenalCrack/dinamyt`.
4. Configura **Root Directory** al subdirectorio de la web (ver tabla).
5. Vercel detecta Next.js automáticamente — deja el build por defecto.
6. Agrega las **Environment Variables** que correspondan.
7. Haz clic en **Deploy**.

### 6.2 ecosystem-portal (portal principal)

| Campo | Valor |
| --- | --- |
| **Root Directory** | `apps/ecosystem-portal` |

**Environment Variables:**

| Variable | Valor |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `https://dinamyt-ecosystem-api.onrender.com` |
| `NEXT_PUBLIC_CAMPEONATOS_URL` | URL de campeonatos-web en Vercel |
| `NEXT_PUBLIC_MEMBRESIAS_URL` | URL de membresias-web en Vercel |
| `NEXT_PUBLIC_ACADEMY_URL` | URL de academy-web en Vercel |

### 6.3 campeonatos-web

| Campo | Valor |
| --- | --- |
| **Root Directory** | `apps/campeonatos-web` |

**Environment Variables:**

| Variable | Valor |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `https://dinamyt-campeonatos-api.onrender.com` |
| `NEXT_PUBLIC_ECOSYSTEM_API_URL` | `https://dinamyt-ecosystem-api.onrender.com` |
| `NEXT_PUBLIC_ECOSYSTEM_PORTAL_URL` | URL del portal en Vercel |
| `NEXT_PUBLIC_WS_URL` | `wss://dinamyt-campeonatos-api.onrender.com` (si combate va en la misma API) |

### 6.4 membresias-web

| Campo | Valor |
| --- | --- |
| **Root Directory** | `apps/membresias-web` |

**Environment Variables:**

| Variable | Valor |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `https://dinamyt-membresias-api.onrender.com` |
| `NEXT_PUBLIC_ECOSYSTEM_API_URL` | `https://dinamyt-ecosystem-api.onrender.com` |
| `NEXT_PUBLIC_ECOSYSTEM_PORTAL_URL` | URL del portal en Vercel |

### 6.5 academy-web

| Campo | Valor |
| --- | --- |
| **Root Directory** | `apps/academy-web` |

**Environment Variables:**

| Variable | Valor |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `https://dinamyt-academy-api.onrender.com` |
| `NEXT_PUBLIC_ECOSYSTEM_API_URL` | `https://dinamyt-ecosystem-api.onrender.com` |
| `NEXT_PUBLIC_ECOSYSTEM_PORTAL_URL` | URL del portal en Vercel |

---

## 7. CORS y verificación final

### 7.1 Actualizar CORS de TODAS las APIs

Una vez que tengas las URLs finales de Vercel (ej. `https://dinamyt-portal.vercel.app`),
vuelve a **cada servicio de Render** y actualiza la variable `CORS_ORIGINS` con
las URLs exactas de las webs de Vercel, separadas por coma, sin espacios:

```
https://dinamyt-portal.vercel.app,https://dinamyt-academy.vercel.app,https://dinamyt-campeonatos.vercel.app,https://dinamyt-membresias.vercel.app
```

### 7.2 Sanity checks

Verifica que todo está funcionando:

| Verificación | URL | Resultado esperado |
| --- | --- | --- |
| JWKS del ecosystem | `https://<eco>.onrender.com/auth/jwks` | JSON con las llaves públicas |
| Health de campeonatos | `https://<camp>.onrender.com/health` | `{ "status": "ok" }` |
| Health de membresias | `https://<memb>.onrender.com/health` | `{ "status": "ok" }` |
| Health de academy | `https://<aca>.onrender.com/health` | `{ "status": "ok" }` |
| Portal web | URL de Vercel del portal | Página de login |
| Login super-admin | Ingresar con `ADMIN_EMAIL`/`ADMIN_PASSWORD` | Dashboard con accesos |
| SSO hacia Academy | Desde el dashboard → «Entrar a Academy» | Academy se abre sin pedir login |

### 7.3 Primeros pasos después del deploy

1. **Login** en el portal con el super-admin.
2. **Crear organización** y suscripciones desde el panel `/admin`.
3. **Probar cada app** (Campeonatos, Membresías, Academy) desde el dashboard.

---

## 8. Troubleshooting y FAQ

### El CI de GitHub falla con `Hook timed out`

Los tests usan PGlite (Postgres embebido en WASM). En los runners de GitHub
Actions el cold-start de WASM es más lento. Los paquetes de BD ya tienen
`vitest.config.ts` con `hookTimeout: 30000`. Si aún falla, aumenta el timeout
o agrega `retry: 1` en el vitest config.

### Render dice `Build failed` — `ERR_PNPM_FROZEN_LOCKFILE`

El lockfile local no coincide con lo que hay en el repo. Solución:
```powershell
pnpm install
git add pnpm-lock.yaml
git commit -m "fix: actualizar lockfile"
git push
```

### Las webs cargan pero dan error 401 o CORS

1. Verifica que `CORS_ORIGINS` en las APIs incluye **exactamente** la URL de
   Vercel (con `https://`, sin trailing slash).
2. Verifica que `NEXT_PUBLIC_API_URL` apunta a la API correcta (no al portal).

### Supabase dice `schema "academy" does not exist`

No has corrido las migraciones (§3.2). Córrelas desde tu PC con los `.env`
apuntando a Supabase.

### Render se duerme y tarda mucho en responder

Normal en el free tier (15 min de inactividad → cold start de ~1 min).
Opciones: pagar el plan Starter ($7/mes por servicio) o usar un servicio de
"ping" externo como UptimeRobot para mantener los servicios despiertos.

### Error `Cannot find module '@dinamyt/...'` en Render

El build command necesita compilar las dependencias del workspace primero.
Asegúrate de que el build command incluye `pnpm install` antes del build del
paquete específico: `corepack enable && pnpm install && pnpm --filter <pkg> build`.

---

## 9. Checklist final

Marca cada paso a medida que lo completes:

- ⬜ Merge de `feat/academy` a `master`/`main`
- ⬜ CI en verde en GitHub Actions
- ⬜ Proyecto de Supabase creado
- ⬜ Connection string copiado
- ⬜ Migraciones ejecutadas (4 schemas)
- ⬜ Seed del ecosystem ejecutado (super-admin + planes)
- ⬜ Llaves RS256 nuevas generadas
- ⬜ Contraseña de aplicación de Gmail obtenida
- ⬜ Claves VAPID generadas
- ⬜ `FIELD_ENCRYPTION_KEY` generada
- ⬜ ecosystem-api desplegado en Render + Secret Files
- ⬜ campeonatos-api desplegado en Render
- ⬜ membresias-api desplegado en Render
- ⬜ academy-api desplegado en Render
- ⬜ academy-figuras desplegado en Render (opcional)
- ⬜ ecosystem-portal desplegado en Vercel
- ⬜ campeonatos-web desplegado en Vercel
- ⬜ membresias-web desplegado en Vercel
- ⬜ academy-web desplegado en Vercel
- ⬜ `CORS_ORIGINS` actualizado en las 4 APIs con las URLs finales de Vercel
- ⬜ JWKS accesible (`/auth/jwks`)
- ⬜ Health de cada API responde OK
- ⬜ Login del super-admin funciona en el portal
- ⬜ SSO desde el portal a cada app funciona
