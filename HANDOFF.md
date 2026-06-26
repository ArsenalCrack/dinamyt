# DINAMYT — Estado del proyecto y Handoff

> Documento vivo. Última actualización: 2026-06-26.
> Propósito: (a) registrar qué está hecho y qué falta; (b) permitir continuar el
> trabajo en una sesión/chat nueva sin perder contexto.

---

## 1. Visión general

**DINAMYT** es un ecosistema digital para el deporte marcial (Hapkido) con 3 capas:

1. **DINAMYT Ecosystem** — servicio central de **identidad y suscripciones**. Emite
   JWT **RS256** y publica su clave en `/auth/jwks`. Las demás apps NO tienen auth
   propia: delegan en él y solo **verifican** el token + exigen su `app_scope`.
2. **DINAMYT Campeonatos** — gestión de campeonatos de Hapkido (inscripción,
   categorización, puntuación en vivo, resultados públicos).
3. **DINAMYT Academy** — plataforma de enseñanza (aún no iniciada).

Existe además, **fuera del ecosistema TS**, el **Sistema Inteligente Hapkido**
(visión por computador + DTW, Python) — proyecto aparte; futuro microservicio de
Academy. No tocar en este trabajo.

### Decisiones de arquitectura (firmes)
- **Stack único: TypeScript full-stack** (lo exige el doc del ecosistema).
- **Monorepo** (pnpm workspaces + Turborepo) en vez de polirepo, por DX de solo-dev.
- **`DINAMYT-COMBAT`** (Flask + Next, en `D:\hapkido\DINAMYT-COMBAT`) es el monolito
  que YA funciona en producción y le gusta a Amir. Campeonatos **reusa su lógica de
  dominio y UX**, pero **reimplementadas en TS** — NO se porta su backend Flask.
  COMBAT no se toca (es el producto en vivo).

---

## 2. Ubicaciones (rutas absolutas)

| Qué | Dónde |
| --- | --- |
| **Monorepo (canónico)** | `D:\Repositorios\dinamyt` |
| Repos viejos (backup, NO usar) | `D:\Repositorios\dinamyt-ecosystem` · `-campeonatos` · `-academy` · `-shared` |
| Monolito de referencia | `D:\hapkido\DINAMYT-COMBAT` |
| Specs (Word) | `D:\Repositorios\DINAMYT_Ecosystem_DocumentoPrincipal_v1.docx` · `DINAMYT_Campeonatos_Requerimientos_v3.docx` · `DINAMYT_Academy_DocumentoPrincipal_v2.docx` |
| Memoria del asistente | `C:\Users\amirs\.claude\projects\D--...-Software\memory\` |

GitHub: los repos viejos están en `github.com/ArsenalCrack/*`. **El monorepo aún
NO tiene remoto** (rama local `master`).

---

## 3. Estructura del monorepo y estado

```
dinamyt/
├── packages/
│   ├── shared/             @dinamyt/shared          ✅ contrato JWT + enums
│   ├── campeonatos-db/      @dinamyt/campeonatos-db  ✅ schema Drizzle + migración + ./testing
│   └── campeonatos-core/    @dinamyt/campeonatos-core ✅ dominio puro (categorización, puntuación, brackets)
└── apps/
    ├── ecosystem-api/       @dinamyt/ecosystem-api    ✅ NestJS — identidad central
    ├── campeonatos-api/     @dinamyt/campeonatos-api  ✅ Fastify — endpoints reales
    ├── campeonatos-web/     @dinamyt/campeonatos-web  ✅ Next 16 — pantalla pública (scaffold)
    └── ecosystem-portal/    @dinamyt/ecosystem-portal ✅ Next 16 — login/registro/dashboard/planes
```

Estado global: **`turbo build` 6/6** · **30 tests** (db 3 · core 21 · api 6) · ✅.

### Stack y versiones
pnpm 11.5 · Turborepo 2.10 · TypeScript 5.7 · NestJS 11 · Fastify 5 · Next 16.2.7 ·
React 19.2.4 · Tailwind 4 · Drizzle ORM 0.45 · `jose` 6 (RS256) · Vitest 3 ·
PGlite (tests de BD en memoria).

### Puertos (dev)
| App | Puerto |
| --- | --- |
| ecosystem-portal | 3000 |
| ecosystem-api | 3001 |
| campeonatos-api | 3002 |
| campeonatos-web | 3003 |
| academy-web (futuro) | 3004 |

---

## 4. Qué está HECHO (por paquete)

### `@dinamyt/shared`
Contrato de integración: interfaz `JwtPayload` (`sub, email, fullName, org_id,
app_scopes[], role_academy, role_campeonatos, is_super_admin`) + tipos `AppScope`,
`CampeonatosRole`, `OrgType`, `SubscriptionStatus`, `PaymentStatus`.

### `@dinamyt/ecosystem-api` (NestJS)
Servicio de identidad. Endpoints: `/auth/register|verify-email|login|forgot-password|
reset-password|verify-token|jwks`, `/organizations*`, `/subscriptions*`,
`/subscription-plans*`. `buildToken()` calcula `app_scopes` desde suscripciones
activas. Estabilizado (commit `7fe5577` en el repo viejo, ya incluido en el monorepo):
fix de `start:prod`, CORS, seed idempotente (super-admin + planes), README del
contrato, `.gitignore` de `keys/`. Llaves RS256 en `apps/ecosystem-api/keys/`
(NO versionadas; generar con openssl). Verificado: compila, arranca, sirve `/auth/jwks`.
**Sin probar contra una BD real** (login/seed requieren Postgres).

### `@dinamyt/campeonatos-db` (Drizzle)
Schema bajo el pg schema `campeonatos`, DB propia que referencia `user_id`/`org_id`
del ecosistema por UUID (sin FK entre bases). 15 tablas: `campeonatos`,
`modalidades_campeonato`, `tatamis`, `competidores` (perfil provisional vinculable
por documento), `inscripciones` (+pagos), `inscripcion_modalidades`, `secciones`,
`seccion_inscripciones`, `cola_tatami` (FIFO), `llaves`, `combates` (con competidores
reales), `eventos_combate`, `resultados_figura`, `auditoria`, `movimientos_categoria`.
Migración generada (`drizzle/migrations/0000_same_ezekiel.sql`). Expone `./testing`
(`createTestDb()` con PGlite). Tests 3/3.

### `@dinamyt/campeonatos-core` (lógica pura, sin IO)
- **categorización**: jerarquía de cinturones, edad, restricciones R1-R5, género de
  sección (R4/R5), `enRango` (verificación), `claveSeccion`/`nombreSeccion`.
- **puntuación**: combate §7.5 (+ DQ), figuras §7.2 (suma de jueces activos),
  `desempatesPodio` §7.3.
- **brackets** §8.3: `generarBracket` (potencia de 2, byes sin bye-vs-bye, avance
  automático), `avanzar`. Shuffle inyectable. Tests 21/21.

### `@dinamyt/campeonatos-api` (Fastify)
Guard `requireScope` (verifica RS256 contra el JWKS del ecosystem con `jose`, exige
scope `campeonatos`). Endpoints: `GET /health`, `GET /campeonatos/publico` (sin auth),
`GET /campeonatos`, `GET /me`, `POST /campeonatos`, `POST /campeonatos/:id/
inscripciones` (valida R1-R5 con el core + perfil provisional + monto),
`POST /secciones/:id/bracket`. BD y verificador inyectables para tests. Tests 6/6
(guard + integración PGlite).

### `@dinamyt/campeonatos-web` (Next 16)
Pantalla pública (`/pantalla` → `GET /campeonatos/publico`, sin auth) + landing.
Cliente axios → campeonatos-api. `next build` OK.

### `@dinamyt/ecosystem-portal` (Next 16)
Login, registro (+ consentimiento Ley 1581), verificación de correo (OTP), dashboard
(decodifica el token, muestra accesos a apps según `app_scopes`), página pública de
planes. `next build` OK.

---

## 5. Qué FALTA (pendiente)

**Dominio / core**
- [ ] **Motor de Saltos §7.4** (reglas confirmadas, ver memoria `dinamyt-saltos-reglas`):
      rondas sincronizadas, ganador por mayor distancia, fallas acumulativas por
      modalidad, pass/fail por juez central. **Requiere cambiar el enum `modalidad`**
      de `saltos` a `salto_altura` + `salto_longitud` (schema + migración + core).
- [ ] **Desempate §7.3**: confirmar con Amir si aplica solo ante empate de puntaje
      (asumido) o es siempre entre posiciones adyacentes del podio.
- [ ] **Generación automática de secciones** a partir de inscripciones (usar
      `claveSeccion`/`enRango`; necesita guardar los cortes de edad/peso por campeonato).

**Campeonatos**
- [ ] `apps/campeonatos-combat`: servidor WebSocket local por tatami + **motor de
      combate en vivo event-sourced** portado de `DINAMYT-COMBAT/backend/app/engine/
      combate_engine.py` (47KB; alertas, DQ, cronómetro). Opera offline en WiFi.
- [ ] Panel admin/maestro/juez en `campeonatos-web` (crear campeonato, inscribir,
      gestionar tatamis/cola, ingresar puntajes). Login vía portal del ecosystem.
- [ ] Endpoint `GET /users/:id/campeonatos-summary` (perfil unificado, RF-CAM-ECO-04).
- [ ] Reportes Excel/PDF (ExcelJS) y PWA/offline.

**Ecosystem**
- [ ] Gestión de organizaciones y suscripciones desde el portal (UI; el API ya existe).
- [ ] Endpoints de perfil (`/users/:id/profile`) y perfil unificado.

**Academy**: no iniciada.

**Operación / infra (tareas de Amir)**
- [ ] Correr migraciones contra Postgres real: ecosystem (`DATABASE_URL`) y
      campeonatos (`CAMPEONATOS_DATABASE_URL`); luego `db:seed` del ecosystem.
- [ ] Subir el monorepo a un repo `dinamyt` en GitHub (y archivar los 4 viejos).
- [ ] CI/CD (GitHub Actions) y despliegue (Vercel para webs, Render/Neon para APIs).

---

## 6. Cómo correr y verificar

```bash
cd D:\Repositorios\dinamyt
pnpm install          # instala todo el workspace
pnpm build            # turbo: compila todos los paquetes (debe dar 6/6)
pnpm test             # corre los tests de los paquetes que los tienen
```

Por app (desarrollo):
```bash
pnpm --filter @dinamyt/ecosystem-api start:dev     # :3001 (necesita keys/ y .env)
pnpm --filter @dinamyt/campeonatos-api dev          # :3002
pnpm --filter @dinamyt/campeonatos-web dev          # :3003
pnpm --filter @dinamyt/ecosystem-portal dev         # :3000
```

Tests de un paquete: `pnpm --filter @dinamyt/campeonatos-core test`.

Migraciones campeonatos: `pnpm --filter @dinamyt/campeonatos-db db:generate`
(offline) / `db:migrate` (requiere BD).

Claves RS256 del ecosystem (una vez, en `apps/ecosystem-api/`):
```bash
openssl genpkey -algorithm RSA -out keys/private.pem -pkeyopt rsa_keygen_bits:2048
openssl rsa -in keys/private.pem -pubout -out keys/public.pem
```
Cada app/paquete tiene su `.env.example` — copiar a `.env` y completar.

---

## 7. Gotchas / convenciones (IMPORTANTE)

- **`D:\` (raíz del disco) es un repo git.** Nunca `git add -A`/`git status` desde una
  carpeta sin `.git` propio bajo `D:\` — git operaría sobre el disco entero. El
  monorepo ya tiene su `.git`.
- **El sandbox bloquea** comandos que combinan `git reset` o un `Select-String`/grep
  con patrones tipo `\.env$` (los confunde con "Remove-Item on system path"). Commitear
  con comandos simples: `git add <rutas> ; git commit -m '...'`. Nunca commitear `keys/`
  ni `.env` (ya ignorados; stagear rutas explícitas).
- **pnpm 11 bloquea build-scripts** por defecto; los aprobados están en
  `pnpm-workspace.yaml > allowBuilds` (esbuild, unrs-resolver, sharp = true).
- **No hay Docker ni Postgres local** en esta máquina → tests de BD con **PGlite**.
- **Drizzle**: las columnas `decimal` vuelven como string con escala (`'0.00'`); las
  columnas `uuid` exigen UUID válido (el `sub` del ecosystem siempre lo es).
- Avisos `LF will be replaced by CRLF` al hacer `git add` son inocuos (Windows).

---

## 8. Handoff a una sesión nueva (instrucciones para mí mismo)

Si retomas esto en otro chat:

1. **Lee la memoria** en `...\memory\`: `MEMORY.md` (índice) +
   `dinamyt-ecosystem-arquitectura`, `dinamyt-campeonatos-plan`, `dinamyt-saltos-reglas`.
   (Y `dinamyt-hapkido` / `mediapipe-tasks-migration` para el proyecto Python aparte.)
2. **Lee este HANDOFF.md** completo y las specs `.docx` si necesitas detalle de reglas.
3. **Verifica el estado real** antes de afirmar nada: `cd D:\Repositorios\dinamyt && pnpm build && pnpm test`. Revisa `git log --oneline` (deben estar los 8 commits).
4. **Respeta el orden y las decisiones** de la sección 1; no reintroduzcas Flask ni
   polirepo; no toques `DINAMYT-COMBAT` (producción).
5. **Antes de Saltos**: están las reglas confirmadas en memoria; implica partir
   `modalidad` en `salto_altura`/`salto_longitud`.
6. **Decisiones que aún dependen de Amir**: interpretación del desempate §7.3; cortes
   de edad/peso por campeonato; detalles del panel admin.
7. **Trabaja siempre en el monorepo**, una pieza a la vez, con tests (Vitest/PGlite),
   y commitea por incremento con comandos git simples.

---

## 9. Historial de commits (monorepo)

```
d00a20f feat(ecosystem-portal): portal Next 16 con login/registro/verificacion
6c379f1 feat(campeonatos-web): scaffold Next 16 + pantalla publica
e90ae16 feat(campeonatos-api): endpoints reales con core + db (inscripcion categorizada)
f58330a feat(campeonatos-core): logica de dominio pura y testeada
bab1113 feat(campeonatos-api): esqueleto Fastify con guard JWT del ecosystem
72cc21b test(campeonatos-db): verificacion automatica con PGlite + Vitest
93aad49 feat(campeonatos-db): schema Drizzle inicial de DINAMYT Campeonatos
4af622a chore(monorepo): inicializa monorepo pnpm/Turborepo + paquete @dinamyt/shared
```
(El ecosystem se estabilizó antes en `D:\Repositorios\dinamyt-ecosystem`, commit `7fe5577`.)
