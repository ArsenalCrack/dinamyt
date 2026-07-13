# DINAMYT — Guía de despliegue y pendientes

> Creado 2026-07-04 · **Actualizado 2026-07-08.** Responde: ¿sirve Hostinger?,
> ¿qué plan?, paso a paso para montar TODO en la web (correos reales, BD,
> imágenes, conexiones), y qué partes del software faltan. Léelo junto a
> `RUN_LOCAL.md` §8.

> ## ⚡ TL;DR — lo que falta ANTES de salir a internet (en orden)
> 1. **Subir el código a GitHub** (hoy el repo es solo local, sin remoto). Ver §0.
> 2. **Base de datos real** (Neon/Supabase): correr migraciones + seed. Ver §4.
> 3. **Secretos nuevos**: par RS256, `FIELD_ENCRYPTION_KEY`, VAPID, contraseña
>    del super-admin, y **rotar** la clave de Gmail/Supabase que se usó en dev. §5.
> 4. **Correo real** (Gmail/Brevo/Resend) para verificación de cuenta y avisos. §7.
> 5. **Desplegar** por Ruta A (VPS) o Ruta B (Vercel+Render+Neon) con HTTPS. §3.
> 6. **CORS y `NEXT_PUBLIC_*`** con los dominios reales; **subir el límite de
>    body del proxy a ≥2 MB** (los avatares/logos viajan como data-URL). §5.
>
> Todo lo demás del producto (perfil, clubes, campeonatos, membresías,
> reportes, estadísticas) **ya está implementado y probado en local** — ver §8.

---

## 0. Subir el código a GitHub (primer paso, hoy PENDIENTE)

El monorepo está **100% commiteado en local pero no tiene remoto** (`git remote -v`
sale vacío). El working tree está limpio y **ningún `.env`, `keys/` ni `.localdb/`
está trackeado** (verificado). Para subirlo:

```bash
# 1) Crea un repo VACÍO y PRIVADO en GitHub llamado "dinamyt" (sin README).
# 2) Desde D:\Repositorios\dinamyt:
git remote add origin https://github.com/<tu-usuario>/dinamyt.git
git push -u origin feat/membresias        # sube la rama de trabajo
# (opcional) fusiona a main cuando quieras:
#   git checkout main && git merge feat/membresias && git push -u origin main
```

> Necesitas autenticarte con TU cuenta de GitHub (token/credencial) — por eso
> este paso lo haces tú. Con `gh` instalado sería: `gh repo create dinamyt
> --private --source=. --push`. El workflow de CI (`.github/workflows/ci.yml`)
> ya está en el repo y corre solo al primer push.

---

## 1. ¿Hostinger sirve? — Veredicto

**Sí, pero SOLO con un VPS. El hosting compartido/«Premium» de Hostinger NO
sirve** para este proyecto: está pensado para PHP/WordPress y archivos
estáticos; no puede correr NestJS/Fastify/Node persistentes ni WebSockets.

| Opción Hostinger | ¿Sirve? | Por qué |
| --- | --- | --- |
| Hosting compartido / Premium / Business | ❌ | Sin procesos Node persistentes, sin WebSockets |
| Cloud Hosting | ❌ | Mismo modelo (LiteSpeed/PHP) |
| **VPS KVM 2** (2 vCPU, 8 GB RAM, 100 GB NVMe) | ✅ **Recomendado** | Control total: Node, Docker, WS, cron |
| VPS KVM 1 (1 vCPU, 4 GB) | ⚠️ Justo | Arranca, pero con 7 procesos Node queda corto |

**Dimensionamiento real**: un campeonato de 200 atletas significa ~200-400
personas entrando/saliendo, 4-6 jueces por tatami con WebSocket y decenas de
pantallas públicas. El servidor de combate mantiene el estado EN MEMORIA de un
solo proceso (como COMBAT: ~80-300 conexiones WS las maneja un proceso sin
despeinarse). **KVM 2 sobra para empezar y escala vertical a KVM 4/8** con un
clic si Academy crece. Lo que NO debe vivir en el VPS: la base de datos de
producción (usa Postgres administrado, §4) ni los archivos subidos (usa object
storage, §6) — así el VPS es "descartable" y escalar/migrar es trivial.

**Alternativa sin VPS (menos administración, gratis para arrancar)**: webs en
Vercel + APIs en Render/Railway + BD en Neon/Supabase (mismo camino que ya usa
DINAMYT-COMBAT en producción). Recomendación honesta: si no quieres administrar
Linux, usa esta ruta; si quieres una sola factura y control total, Hostinger
VPS KVM 2.

---

## 2. Arquitectura de producción (cualquiera de las dos rutas)

```
portal.tudominio.com      → ecosystem-portal (Next)
id.tudominio.com          → ecosystem-api    (NestJS)   ← JWKS, login, orgs
camp.tudominio.com        → campeonatos-web  (Next)
api-camp.tudominio.com    → campeonatos-api  (Fastify)
combate.tudominio.com     → campeonatos-combat (WebSocket ws://→wss://)
memb.tudominio.com        → membresias-web   (Next PWA)
api-memb.tudominio.com    → membresias-api   (Fastify)
Postgres administrado (Neon/Supabase): schemas ecosystem · campeonatos · membresias
Object storage (Cloudflare R2 / Supabase Storage): avatares + archivos de Academy
```
- HTTPS es OBLIGATORIO (Web Push y PWA no funcionan sin TLS).
- El agente del lector de huella NO se despliega: corre en el PC del kiosco
  del club y habla con `api-memb` por internet.

---

## 3. Paso a paso — Ruta A: Hostinger VPS KVM 2

1. **Compra el VPS** (Ubuntu 24.04) y apunta el dominio: crea los subdominios
   de la tabla de arriba como registros A hacia la IP del VPS.
2. **Prepara el servidor** (una vez):
   ```bash
   apt update && apt upgrade -y
   curl -fsSL https://get.docker.com | sh          # Docker + compose
   # Caddy como reverse proxy con TLS automático (Let's Encrypt):
   apt install -y caddy
   ```
3. **Caddyfile** (`/etc/caddy/Caddyfile`) — TLS automático y proxy por subdominio:
   ```
   portal.tudominio.com   { reverse_proxy localhost:3000 }
   id.tudominio.com       { reverse_proxy localhost:3001 }
   camp.tudominio.com     { reverse_proxy localhost:3003 }
   api-camp.tudominio.com { reverse_proxy localhost:3002 }
   combate.tudominio.com  { reverse_proxy localhost:3005 }
   memb.tudominio.com     { reverse_proxy localhost:3006 }
   api-memb.tudominio.com { reverse_proxy localhost:3004 }
   ```
   (Caddy hace upgrade de WebSocket solo; `wss://combate.tudominio.com` funciona.)
4. **Clona y compila**:
   ```bash
   git clone <tu-repo> /opt/dinamyt && cd /opt/dinamyt
   corepack enable && corepack prepare pnpm@11.5.0 --activate
   pnpm install && pnpm build
   ```
5. **Variables de entorno** (§5) y **migraciones** (§4).
6. **Procesos con pm2** (o systemd):
   ```bash
   npm i -g pm2
   pm2 start "pnpm --filter @dinamyt/ecosystem-api start:prod"    --name eco-api
   pm2 start "pnpm --filter @dinamyt/ecosystem-portal start"      --name portal
   pm2 start "pnpm --filter @dinamyt/campeonatos-api start"       --name camp-api
   pm2 start "pnpm --filter @dinamyt/campeonatos-web start"       --name camp-web
   pm2 start "pnpm --filter @dinamyt/campeonatos-combat start"    --name combate
   pm2 start "pnpm --filter @dinamyt/membresias-api start"        --name memb-api
   pm2 start "pnpm --filter @dinamyt/membresias-web start"        --name memb-web
   pm2 save && pm2 startup   # sobreviven reinicios
   ```
   > Nota: verifica el script `start`/`start:prod` de cada package.json; para
   > los Next es `next start -p <puerto>`; para las APIs, `node dist/...`.
7. **Zona horaria**: `timedatectl set-timezone America/Bogota` (los vencimientos
   de Membresías se calculan con la fecha del servidor).
8. **Firewall**: `ufw allow 22,80,443/tcp && ufw enable` (los puertos 3000-3006
   NO se exponen: solo Caddy).

## 3b. Paso a paso — Ruta B: administrado (Vercel + Render + Neon)

Idéntico al README de DINAMYT-COMBAT que ya conoces, multiplicado por app:
1. **Neon**: crea la BD y copia el connection string (sirve la misma BD para
   los 3 schemas).
2. **Render** (Web Service por cada API): ecosystem-api (Node,
   `pnpm --filter @dinamyt/ecosystem-api start:prod`), campeonatos-api,
   membresias-api y campeonatos-combat (este último NECESITA un plan que
   permita WebSockets persistentes — el free de Render los soporta, pero se
   duerme a los 15 min: usa UptimeRobot).
3. **Vercel** (proyecto por cada web con Root Directory): ecosystem-portal,
   campeonatos-web, membresias-web. Monorepo pnpm: Vercel lo detecta.
4. Variables de entorno de §5 en cada servicio, CORS con los dominios reales.

---

## 4. Base de datos (de PGlite a Postgres real)

1. Crea el Postgres (Neon/Supabase, o en el VPS si insistes — con backups).
2. En los `.env` de producción **elimina** `PGLITE_DATA`,
   `CAMPEONATOS_PGLITE_DATA` y `MEMBRESIAS_PGLITE_DATA`, y define:
   - `DATABASE_URL` (ecosystem-api)
   - `CAMPEONATOS_DATABASE_URL` (campeonatos-api y packages/campeonatos-db)
   - `MEMBRESIAS_DATABASE_URL` (membresias-api y packages/membresias-db)
   (pueden ser el MISMO connection string: cada uno usa su schema).
3. Migraciones + seed:
   ```bash
   pnpm --filter @dinamyt/ecosystem-api db:migrate
   pnpm --filter @dinamyt/ecosystem-api db:seed        # super-admin + 7 planes
   pnpm --filter @dinamyt/campeonatos-db db:migrate
   pnpm --filter @dinamyt/membresias-db db:migrate
   ```
4. **Backups**: Neon/Supabase los hacen solos. En VPS: `pg_dump` diario a R2.

---

## 5. Variables de entorno de producción (checklist completo)

**ecosystem-api** (`apps/ecosystem-api/.env`):
| Var | Valor |
| --- | --- |
| `DATABASE_URL` | Postgres real |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | credenciales NUEVAS y fuertes del super-admin |
| `CORS_ORIGINS` | `https://portal...,https://camp...,https://memb...` |
| `MAIL_USER` / `MAIL_PASS` | correo real (§7) — o `MAIL_HOST`/`MAIL_PORT` para SMTP genérico |
| `MAIL_FROM` | remitente visible (opcional) |
| `FIELD_ENCRYPTION_KEY` | clave NUEVA (32+ chars aleatorios) — cifra notas médicas |
| Claves RS256 | genera un par NUEVO en `keys/` (no reutilices el de dev): `openssl genpkey -algorithm RSA -out keys/private.pem -pkeyopt rsa_keygen_bits:2048 && openssl rsa -in keys/private.pem -pubout -out keys/public.pem` |

**campeonatos-api**: `CAMPEONATOS_DATABASE_URL`, `ECOSYSTEM_JWKS_URL=https://id.tudominio.com/auth/jwks`, `CORS_ORIGINS`, `MAIL_*` (invitaciones).

**membresias-api**: `MEMBRESIAS_DATABASE_URL`, `ECOSYSTEM_JWKS_URL`,
`ECOSYSTEM_API_URL=https://id.tudominio.com`, `ECOSYSTEM_PORTAL_URL`,
`CORS_ORIGINS`, `MAIL_*`, `FIELD_ENCRYPTION_KEY` (plantillas de huella),
`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` (genera: `pnpm --filter @dinamyt/membresias-api gen:vapid`).

**Webs (Vercel/VPS)** — `NEXT_PUBLIC_*` se inyectan en BUILD (rebuild al cambiarlas):
- portal: `NEXT_PUBLIC_ECOSYSTEM_API_URL`, `NEXT_PUBLIC_CAMPEONATOS_API_URL`, `NEXT_PUBLIC_CAMPEONATOS_URL`, `NEXT_PUBLIC_MEMBRESIAS_URL`, `NEXT_PUBLIC_ADMIN_CONTACT_EMAIL`
- campeonatos-web: `NEXT_PUBLIC_API_URL` (api-camp), `NEXT_PUBLIC_ECOSYSTEM_API_URL`, `NEXT_PUBLIC_COMBAT_WS_URL=wss://combate.tudominio.com`, `NEXT_PUBLIC_ECOSYSTEM_PORTAL_URL`
- membresias-web: `NEXT_PUBLIC_API_URL` (api-memb), `NEXT_PUBLIC_ECOSYSTEM_API_URL`, `NEXT_PUBLIC_ECOSYSTEM_PORTAL_URL`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `NEXT_PUBLIC_AGENT_URL=http://localhost:7070` (el agente corre en el PC del club)

**⚠️ ROTAR YA**: la contraseña de Gmail y las keys de Supabase que estuvieron
en `.env` de desarrollo (nota de RUN_LOCAL §1) — cámbialas antes de salir a
producción, y NUNCA reutilices el par RS256 de dev.

---

## 6. Imágenes de perfil y archivos (Academy)

**Hoy (actualizado 2026-07-08)**: la **foto de perfil y el logo del club SÍ se
suben desde el dispositivo** (PC/Android). El navegador la recorta y comprime a
un **data-URL JPEG (~320px, <700 KB)** y se guarda directo en la BD
(`users.avatar_url`, `organizations.logo_url`) — sin servicio de archivos
externo. Por eso:
- El body de la API acepta hasta **2 MB** (`ecosystem-api/src/main.ts`); en el
  reverse proxy pon `client_max_body_size 2m` (nginx) o su equivalente. Caddy no
  limita por defecto.
- Es suficiente para avatares/logos. **Para media pesada de Academy** (videos,
  PDF de planes de estudio) sí conviene object storage:

**Para subir archivos pesados (recomendado: Cloudflare R2 — 10 GB gratis,
compatible S3, sin costo de salida):**
1. Crea el bucket `dinamyt-media` en R2 y un token de API (Access Key/Secret).
2. En ecosystem-api añade un endpoint `POST /users/:id/avatar-upload-url` que
   genere una **URL prefirmada** (SDK `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`
   apuntando al endpoint de R2). El navegador sube DIRECTO a R2 (la API nunca
   recibe el archivo) y luego hace `PATCH /users/:id/profile` con la URL pública.
3. Mismo patrón para los archivos de Academy (videos/PDF de planes de estudio):
   bucket propio + URL prefirmada + registro del archivo en la BD (tabla
   `academy.materials` cuando Academy se inicie). **Los archivos NUNCA van a la
   base de datos** — en la BD solo se guarda la URL/clave.
- Alternativa si eliges Supabase como BD: **Supabase Storage** (mismo patrón,
  SDK más simple, 1 GB gratis).

---

## 7. Correos reales + confirmación de registro

**El flujo ya está implementado**: registro → se genera OTP de 6 dígitos (10
min, un solo uso) → correo → `/verificar` → cuenta activa. Solo falta darle un
SMTP real:

| Opción | Pasos | Límite gratis |
| --- | --- | --- |
| **Gmail** (lo más rápido) | 1) Activa verificación en 2 pasos en la cuenta Gmail. 2) Genera una **Contraseña de aplicación** (myaccount.google.com → Seguridad). 3) `MAIL_USER=tucuenta@gmail.com`, `MAIL_PASS=<contraseña de aplicación>` | ~500/día |
| **Brevo** (recomendado al crecer) | Cuenta gratis → SMTP keys → `MAIL_HOST=smtp-relay.brevo.com`, `MAIL_PORT=587`, `MAIL_USER`, `MAIL_PASS` | 300/día |
| **Resend** | Requiere verificar tu dominio (DNS) → `MAIL_HOST=smtp.resend.com`, `MAIL_USER=resend`, `MAIL_PASS=<api key>` | 100/día |

- El mailer del ecosystem ya acepta **ambas formas** (Gmail por
  `MAIL_USER/MAIL_PASS` o SMTP genérico por `MAIL_HOST/MAIL_PORT`); sin
  variables imprime el OTP en la consola (solo dev).
- membresias-api usa su propio `MAIL_*` (mismas variables) para los avisos de
  vencimiento; el Web Push necesita `VAPID_*` y HTTPS.
- Configura también `MAIL_*` en campeonatos-api (correo de invitaciones).
- Consejo anti-spam: usa un dominio propio como remitente (`MAIL_FROM`) y
  configura SPF/DKIM en el DNS (Brevo/Resend te dan los registros exactos).

---

## 8. Qué falta del software (según HANDOFF / PLAN_FUSION / PLAN_MEMBRESIAS)

**Hecho hoy (2026-07-04)** para que no lo busques en pendientes: pantallas
públicas estilo COMBAT (marcador/árbol/podio/figuras), RBAC por rol en las 3
apps, panel del alumno `/mi` en Membresías, campana de avisos, perfil editable
en el portal, catálogo completo de planes con «contactar administrador»,
mailer configurable, fixes de seguridad (OTP un solo uso, PII de orgs).

**Resuelto el 2026-07-04 (noche):** rate-limiting en auth · SSO por redirección
completo · reporte Excel del campeonato · carnet QR del alumno · página de
privacidad · CI de GitHub Actions.

**Resuelto el 2026-07-06 → 07-08 (dos grandes lotes, ~40 ajustes):**
- **Perfil (ecosystem)**: subida de foto desde el dispositivo (data-URL);
  validación estricta (nombre solo letras y en MAYÚSCULAS, teléfono solo
  números, edad 3–100, parentesco y tipo de sangre por desplegable); el
  **nombre y la fecha son inmutables** para el usuario (los corrige el
  maestro/admin en `/mi-organizacion/miembro/[id]`); **barra de progreso** del
  perfil; el perfil (y la contraseña) viven SOLO en el portal.
- **Login/seguridad**: mensajes específicos (correo inexistente vs contraseña
  incorrecta con intentos restantes), **bloqueo de cuenta** tras 5 fallos y
  panel de desbloqueo en `/admin`; **interceptor global de 401** (token
  vencido → al login) en las 3 webs.
- **Organización vs Club**: la federación/liga agrega admins y jueces e
  **invita clubes** (el maestro acepta/rechaza); el club agrega maestros,
  coaches y **alumnos** (competidor/alumno unificado; el club NO asigna
  jueces); un maestro **funda su club** con logo, país/ciudad (desplegables),
  teléfono y redes; ficha del club visible en «Mi club».
- **Campeonatos**: **auto-inscripción** con autollenado del perfil (cinturón
  real → grupo; academia desplegable); **secciones automáticas** al aprobar;
  config de categorías con checkboxes y rangos con «+ Añadir», congelada con el
  evento en curso; reglas de **EN_CURSO** (solo el admin añade/invita);
  **desaprobar con motivo** (visible al competidor) y re-aprobar; fechas
  validadas (inicio ≥ hoy, fin ≥ inicio); el **juez central finaliza** su
  sección desde la mesa; jueces por tatami estilo COMBAT; «Ver pantalla del
  tatami» solo EN_CURSO; **clubes asistentes** en la info; filtros de la
  pantalla en línea/plegable.
- **Panel del usuario** `/panel` + `/panel/estadisticas`: inscripciones,
  **estadísticas completas** (combate + figuras + saltos, medallero) y
  **detalle por campeonato participado**.
- **Reportes estilo COMBAT** `/admin/[id]/reportes`: resumen, registros con
  filtros, podios y descarga Excel.
- **Membresías**: página de **asistencia** del maestro (huella/QR/PIN/manual),
  **escáner QR con la cámara** en el kiosco (BarcodeDetector), menú hamburguesa
  responsivo, botón Salir diferenciado, logo/favicon DINAMYT.
- **UI**: paleta de acción jade (se retiró el amarillo neón; el oro queda como
  marca y CTA del login). Fotos de perfil visibles en todo el ecosistema.

**Pendiente (orden sugerido):**
1. **Operación (bloqueante para salir a la web)** — **subir el monorepo a
   GitHub** (§0), rotar secretos, migrar a Postgres real (§4).
2. **Campeonatos** —
   - Reporte **PDF** (el Excel y el panel de reportes ya están).
   - **Figuras/saltos EN VIVO** con motor sincronizado (hoy: planilla local
     del juez + registro de la mesa; falta el equivalente WS de combate).
   - Enlazar cada combate del bracket con su sala WS con un clic (hoy la mesa
     abre `?seccion=`).
   - Snapshot inmutable COMPLETO en los resultados de figuras/saltos
     (el de combate ya lleva nombre/club por la llave).
   - PWA/offline completo de la pantalla pública.
   - Logout global del SSO (cerrar sesión en una app cierra las demás).
3. **Membresías** — adaptador REAL del lector (requiere el hardware
   DigitalPersona/ZKTeco; el esqueleto ya está), UI de vinculación
   acudiente↔menor (el endpoint `POST /users/:id/guardians` ya existe).
4. **Pagos**: NO hay pasarela por decisión de producto — el cobro es
   efectivo/transferencia y el sistema solo lo REGISTRA.
5. **Media pesada de Academy** — object storage con URL prefirmada (§6); los
   avatares/logos ya se suben desde el dispositivo.
6. **Academy** — no iniciada (0%): plataforma de enseñanza + microservicio de
   visión por computador (Sistema Inteligente Hapkido, Python aparte).

---

## 9. Cosas que se te estaban pasando (y su estado)

| Tema | Estado |
| --- | --- |
| HTTPS para PWA/Push | Obligatorio — lo resuelve Caddy/Vercel solo (§3) |
| Zona horaria del servidor | Vencimientos usan la fecha del servidor → `America/Bogota` (§3.7) |
| Backups de BD | Neon/Supabase automáticos; en VPS toca cron con `pg_dump` |
| Monitoreo | UptimeRobot gratis a `/health` de cada API |
| Ley 1581 (datos personales) | El registro ya pide consentimiento; falta página de política de privacidad pública |
| Notas médicas / huellas | Ya cifradas (AES-256-GCM) — pon `FIELD_ENCRYPTION_KEY` fuerte y NO la pierdas (sin ella no se descifran) |
| Registro sin correo configurado | Corregido hoy: sin `MAIL_*` el OTP sale por consola en dev |
| Dominio del correo | SPF/DKIM para no caer a spam (§7) |
| El agente de huella en producción | No se despliega: se instala en el PC de cada club |

---

## 10. Checklist para ti (en orden)

- [ ] **Subir el monorepo a GitHub** (privado) — comandos en §0. Es el 1.er paso.
- [ ] Comprar dominio y decidir ruta A (VPS KVM 2) o B (Vercel+Render+Neon).
- [ ] Crear Postgres (Neon/Supabase) y correr migraciones + seed (§4).
- [ ] Generar: par RS256 nuevo, `FIELD_ENCRYPTION_KEY`, VAPID, contraseña
      fuerte del super-admin (§5). Rotar la clave de Gmail expuesta en dev.
- [ ] Configurar correo real (§7) y probar el registro completo.
- [ ] Desplegar por la ruta elegida (§3/§3b) y probar el recorrido:
      registro → verificación → plan → campeonato → pantalla pública →
      membresías → kiosco.
- [ ] UptimeRobot + backups + política de privacidad.
- [ ] Cuando llegue el lector de huella: implementar el adaptador en
      `membresias-agent` e instalarlo en el PC del club.
