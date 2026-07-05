# DINAMYT — Guía de despliegue y pendientes

> Creado 2026-07-04. Responde: ¿sirve Hostinger?, ¿qué plan?, paso a paso para
> montar TODO en la web (correos reales, BD, imágenes, conexiones), y qué
> partes del software faltan según los documentos (HANDOFF, PLAN_FUSION,
> PLAN_MEMBRESIAS). Léelo junto a `RUN_LOCAL.md` §8.

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

**Hoy**: el perfil guarda `avatarUrl` (una URL) — editable desde el portal
(`/perfil`). No hay subida directa de archivos todavía.

**Para subir archivos de verdad (recomendado: Cloudflare R2 — 10 GB gratis,
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

**Pendiente (orden sugerido):**
1. **Operación (bloqueante para salir a la web)** — subir el monorepo a GitHub
   (hoy NO tiene remoto), rotar secretos, migrar a Postgres real, CI/CD
   (GitHub Actions: build+test en cada push).
2. **Seguridad** — rate-limiting en `/auth/login` y verificación de OTP
   (`@nestjs/throttler`, ~1 h de trabajo); límite de intentos por OTP.
3. **Campeonatos** —
   - Reportes **Excel/PDF** (planillas, podios, medallería) — `exceljs` +
     `pdfkit`/`reportlab`-like; COMBAT ya define qué reportes.
   - **Figuras/saltos EN VIVO** con motor sincronizado (hoy: planilla local
     del juez + registro de la mesa; falta el equivalente WS de combate).
   - Enlazar cada combate del bracket con su sala WS con un clic (hoy la mesa
     abre `?seccion=`).
   - Snapshot inmutable COMPLETO en resultados (falta club/edad/nombre en el
     momento de competir) + `GET /users/:id/campeonatos-summary` (historial).
   - PWA/offline completo de la pantalla pública.
4. **SSO por redirección completo** — hoy el portal ya entrega el token a las
   apps por fragmento (`#token=`); falta el camino inverso: que las apps
   rediriján a `portal/login?redirect=` cuando no hay sesión, y logout global.
5. **Membresías** — adaptador REAL del lector (requiere el hardware
   DigitalPersona/ZKTeco; el esqueleto ya está), generador de carnets con QR
   para check-in `qr` (el endpoint ya lo acepta), UI de vinculación
   acudiente↔menor (el endpoint `POST /users/:id/guardians` ya existe).
6. **Pagos en línea** — pasarela (Wompi/MercadoPago) para comprar planes desde
   el portal; hoy la suscripción la activa el super-admin manualmente.
7. **Subida de archivos** — avatar con URL prefirmada (§6); hoy solo URL.
8. **Academy** — no iniciada (0%): plataforma de enseñanza + el microservicio
   de visión por computador (Sistema Inteligente Hapkido, proyecto Python aparte).

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

- [ ] Comprar dominio y decidir ruta A (VPS KVM 2) o B (Vercel+Render+Neon).
- [ ] Subir el monorepo a GitHub (privado) y archivar los repos viejos.
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
