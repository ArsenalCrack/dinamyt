# DINAMYT — Estado del proyecto y Handoff

> Documento vivo. Última actualización: 2026-07-01.
> Para correr TODO en local paso a paso (portal → campeonatos desde el navegador),
> ver **`RUN_LOCAL.md`**. Para el plan de la versión unificada (fusión de
> COMBAT + PROJECT con roles), ver **`PLAN_FUSION.md`**.
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
| Referencia — evento EN VIVO | `D:\hapkido\DINAMYT-COMBAT` (Flask+Next; **no tocar**) |
| Referencia — creación/gestión | `D:\hapkido\DINAMYT-PROJECT` (Angular+Spring; **no tocar**) |
| Specs (Word) | `D:\Repositorios\DINAMYT_Ecosystem_DocumentoPrincipal_v1.docx` · `DINAMYT_Campeonatos_Requerimientos_v3.docx` · `DINAMYT_Academy_DocumentoPrincipal_v2.docx` |
| Memoria del asistente | `C:\Users\amirs\.claude\projects\D--Repositorios-dinamyt\memory\` |

GitHub: los repos viejos siguen en `github.com/ArsenalCrack/*` (academy, campeonatos,
ecosystem, shared). **Sus carpetas locales `D:\Repositorios\dinamyt-*` fueron
BORRADAS el 2026-07-01** tras verificar que estaban 100% pusheadas (el código ya
vive en el monorepo). **El monorepo aún NO tiene remoto** (rama local `master`).

---

## 3. Estructura del monorepo y estado

```
dinamyt/
├── packages/
│   ├── shared/             @dinamyt/shared            ✅ contrato JWT + enums
│   ├── campeonatos-db/      @dinamyt/campeonatos-db   ✅ schema Drizzle + migración + ./testing
│   └── campeonatos-core/    @dinamyt/campeonatos-core ✅ dominio puro (categorización, puntuación, brackets, saltos, combate)
└── apps/
    ├── ecosystem-api/       @dinamyt/ecosystem-api    ✅ NestJS — identidad central
    ├── ecosystem-portal/    @dinamyt/ecosystem-portal ✅ Next 16 — login/registro/dashboard/planes
    ├── campeonatos-api/     @dinamyt/campeonatos-api  ✅ Fastify — endpoints reales
    ├── campeonatos-web/     @dinamyt/campeonatos-web  ✅ Next 16 — pantalla pública + panel admin
    └── campeonatos-combat/  @dinamyt/campeonatos-combat ✅ WebSocket (ws) — combate en vivo offline
```

Estado global: **`turbo build` 8/8** · **`turbo test` 8/8** (core 44 · db 3 ·
campeonatos-api 10 · combat 2 · ecosystem-api 4) · ✅.
**Fase 1 de la fusión (roles) HECHA** — ver `PLAN_FUSION.md`.

### Stack y versiones
pnpm 11.5 · Turborepo 2.10 · TypeScript 5.7 · NestJS 11 · Fastify 5 · Next 16.2.7 ·
React 19.2.4 · Tailwind 4 · Drizzle ORM 0.45 · `jose` 6 (RS256) · `ws` 8 · Vitest 3 ·
PGlite (tests de BD en memoria).

### Puertos (dev)
| App | Puerto |
| --- | --- |
| ecosystem-portal | 3000 |
| ecosystem-api | 3001 |
| campeonatos-api | 3002 |
| campeonatos-web | 3003 |
| academy-web (futuro) | 3004 |
| campeonatos-combat (WS) | 3005 |

---

## 4. Qué está HECHO (por paquete)

### `@dinamyt/shared`
Contrato: interfaz `JwtPayload` + tipos `AppScope`, `CampeonatosRole`, `OrgType`,
`SubscriptionStatus`, `PaymentStatus`.

### `@dinamyt/ecosystem-api` (NestJS)
Identidad. Endpoints `/auth/*`, `/organizations*`, `/subscriptions*`,
`/subscription-plans*`. `buildToken()` calcula `app_scopes` desde suscripciones
activas. Estabilizado (CORS, seed super-admin+planes, README, `.gitignore` de
`keys/`). Llaves RS256 en `apps/ecosystem-api/keys/` (NO versionadas). Compila,
arranca y sirve `/auth/jwks`. **Flujos con BD (login/seed) no probados contra una BD real.**

### `@dinamyt/ecosystem-portal` (Next 16, :3000)
Login, registro (+ consentimiento Ley 1581), verificación OTP, dashboard (accesos
a apps según `app_scopes`), página pública de planes. `next build` OK.

### `@dinamyt/campeonatos-db` (Drizzle)
Schema `campeonatos` (15 tablas; DB propia que referencia user_id/org_id por UUID).
`modalidad` distingue `salto_altura`/`salto_longitud`; `resultados_figura` tiene
`distancia_alcanzada`. Migración `0000_naive_adam_destine`. Expone `./testing`
(`createTestDb` con PGlite). 3 tests.

### `@dinamyt/campeonatos-core` (lógica pura) — 44 tests
- categorización: cinturones, edad, restricciones R1-R5, género de sección, `enRango`,
  clave/nombre de sección.
- **generación de secciones**: `generarSecciones` — árbol Modalidad→Género→Cinturón→
  Edad→Peso (portado del proyecto Angular/Spring `DINAMYT-PROJECT/ArbolBuilder`); el
  admin configura por modalidad listas `individual`/`rango`.
- figuras: `totalFigura` §7.2, `desempatesPodio` §7.3. (`puntuacion.ts` aún expone la
  tabla §7.5 por acción, pero el combate en vivo NO la usa — ver abajo.)
- brackets §8.3: `generarBracket` (byes, avance) + `avanzar`.
- **saltos §7.4**: `procesarRondaSaltos` (rondas sincronizadas, fallas acumulativas
  por modalidad, `maxFallas=3`: inicial + 2 repeticiones), `todosSuperaron`, `rankingSaltos`.
- **combate en vivo**: `aplicarEvento` — **port fiel de DINAMYT-COMBAT** (4 réferis de
  esquina j1-j4 + juez central; `calcularMarcador` = promedio de jueces activos +
  árbitro; KyongGo/GamJeum con DQ a 6/3; alerta de superioridad a 12; punto de oro;
  cronómetro; deshacer; declarar/descalificar ganador; reset).

### `@dinamyt/campeonatos-api` (Fastify, :3002)
Guard `requireScope` (RS256 vs JWKS + scope `campeonatos`). Endpoints: `GET /health`,
`/campeonatos/publico` (público), `/campeonatos`, `/me`, `POST /campeonatos` (con
config de categorías por modalidad), `POST /campeonatos/:id/inscripciones` (valida
R1-R5 + perfil provisional + monto), `POST /campeonatos/:id/generar-secciones` +
`GET .../secciones`, `POST /campeonatos/:id/asignar-secciones` (empareja cada
inscripción con su sección por cinturón/peso/edad/género), `POST /secciones/:id/bracket`,
`POST /secciones/:id/combates` (persiste el snapshot). BD y verificador inyectables.
9 tests (PGlite).

### `@dinamyt/campeonatos-web` (Next 16, :3003)
Pantalla pública (`/pantalla`) + **panel admin**: `/admin/login` (login delegado al
ecosystem-api), `/admin` (listar + crear campeonato), `/admin/[id]` (inscribir
competidor con feedback de R1-R5), `/admin/combate` (**juez de mesa**: WebSocket de
combate en vivo, puntúa por réferi, faltas, declarar ganador). `next build` OK.

### `@dinamyt/campeonatos-combat` (ws, :3005)
Servidor WebSocket local (offline en WiFi). `Salas` mantiene el estado por combate
en memoria y aplica el motor `aplicarEvento` del core; reenvía el estado a la sala.
2 tests (sala + e2e WebSocket).

---

## 5. Qué FALTA (pendiente)

### ⭐ Perfil e historial de progreso — INMUTABLE (transversal)
Cada persona debe ver su historial: en qué campeonatos participó, sus resultados y su
avance académico (Academy). **Requisito clave: el historial es INMUTABLE** — guarda el
estado *al momento de participar*, no el actual. Ej.: si compitió con cinturón amarillo
y hoy tiene uno superior, el historial debe seguir mostrando **amarillo**; igual con
todos los datos (cinturón, peso, club, edad, nombre…).
- [ ] Snapshot completo por participación (hecho: cinturón + peso en la inscripción;
      falta club/edad/nombre y aplicar el mismo criterio a los resultados).
- [ ] `GET /users/:id/campeonatos-summary` — historial de campeonatos del usuario.
- [ ] Historial/progreso académico en Academy (cuando se inicie).
- [ ] Perfil unificado en el portal del ecosystem (RF-ECO-10/22) que combina ambos.

**Campeonatos**
- [ ] Endpoints de gestión de tatamis y cola FIFO; resultados de figuras/saltos.
- [ ] Reportes Excel/PDF (ExcelJS) y PWA/offline.

> Hecho ya: generación + persistencia de secciones, **asignación de inscripciones a
> secciones por cinturón/peso**, panel de juez de mesa (`/admin/combate`) y
> persistencia del combate (`POST /secciones/:id/combates`).
>
> Hecho el 2026-06-30 (esta sesión):
> - **UI del flujo admin**: nueva página `/admin/[id]/secciones` que cablea
>   generar-secciones → asignar-inscripciones → generar-llave (los endpoints ya
>   existían; ahora se usan desde el navegador).
> - **Panel de combate** (`/admin/combate`): cronómetro (la mesa emite el tick por
>   WebSocket), selector de ronda (R1-R3/Oro), aprobación de Punto de Oro, botones
>   **↶ Deshacer** (réferi y árbitro) y **Guardar resultado** (persiste vía
>   `?seccion=<uuid>`).
>
> Pendiente cercano: definir rangos de categorías (cinturón/edad/peso) desde la UI
> (hoy «Generar secciones» usa `{ genero: 'mixto' }` por defecto → 1 sección por
> modalidad) y **enlazar el combate desde el bracket** (elegir la pelea desde la
> llave, en vez de teclear el ID).

**Ecosystem**
- [ ] Gestión de organizaciones y suscripciones desde el portal (UI; el API ya existe).
- [ ] Endpoints de perfil (`/users/:id/profile`) y perfil unificado.

**Academy**: no iniciada.

**Operación / infra (tareas de Amir)**
- [ ] Migraciones contra Postgres real: ecosystem (`DATABASE_URL`) y campeonatos
      (`CAMPEONATOS_DATABASE_URL`); luego `db:seed` del ecosystem.
- [ ] Subir el monorepo a un repo `dinamyt` en GitHub (y archivar los 4 viejos).
- [ ] CI/CD (GitHub Actions) y despliegue (Vercel webs · Render/Neon APIs).

### Decisiones confirmadas por Amir (2026-06-26 / 2026-06-30)
- **Combate**: modelo **tal cual DINAMYT-COMBAT** (4 réferis de esquina + juez central) — portado.
- **Saltos**: intento inicial + 2 repeticiones; al 3.er fallo, eliminado (`maxFallas=3`).
- **Secciones**: el admin define los rangos al crear el campeonato (lógica del proyecto
  Angular/Spring `D:\hapkido\DINAMYT-PROJECT`, ya portada en `generarSecciones`).
- **Auth cross-origin (2026-06-30)**: la arquitectura objetivo es **SSO por
  redirección** (login único en el portal; las apps redirigen a
  `PORTAL/login?redirect=<callback>` y reciben el token). Razón: funciona en local
  y en producción aunque los dominios difieran, y elimina el login duplicado y el
  problema de CORS del login. **Aún no implementado**: por ahora cada app tiene su
  propio login (per-app). Ver «Aún por confirmar / pendiente».
- **Suscripciones (2026-06-30)**: se asignan **manualmente** por ahora (no hay UI de
  compra ni pasarela). Para dar acceso a un usuario normal, insertar una suscripción
  con scope `campeonatos` (ver `RUN_LOCAL.md` §6). El **super-admin** entra a
  cualquier app **sin suscripción** gracias a un bypass en el guard de campeonatos.

### Aún por confirmar / pendiente
- **Desempate §7.3**: se asume que solo aplica ante empate de puntaje.
- **SSO por redirección**: decidido como objetivo (arriba), falta implementarlo
  (login único en el portal + callback con token). Mientras tanto, login per-app.

---

## 6. Cómo correr y verificar

```bash
cd D:\Repositorios\dinamyt
pnpm install
pnpm build            # turbo: 8/8
pnpm --filter @dinamyt/campeonatos-core test   # (y -db, -api, -combat) 
```

Por app (dev): `pnpm --filter <pkg> dev` (o `start:dev` en ecosystem-api).
Migraciones: `pnpm --filter @dinamyt/campeonatos-db db:generate|db:migrate`.
Claves RS256 (en `apps/ecosystem-api/`):
```bash
openssl genpkey -algorithm RSA -out keys/private.pem -pkeyopt rsa_keygen_bits:2048
openssl rsa -in keys/private.pem -pubout -out keys/public.pem
```
Cada app/paquete tiene `.env.example` → copiar a `.env`.

---

## 7. Gotchas / convenciones (IMPORTANTE)

- **`D:\` (raíz del disco) es un repo git.** Nunca `git add -A`/`git status` desde una
  carpeta sin `.git` propio bajo `D:\`. El monorepo ya tiene su `.git`.
- **El sandbox bloquea** comandos que combinan `git reset` o un `Select-String`/grep
  con patrones tipo `\.env$`. Commitear con comandos simples y rutas explícitas; nunca
  `keys/` ni `.env` (ya ignorados).
- **pnpm 11 bloquea build-scripts**; aprobados en `pnpm-workspace.yaml > allowBuilds`
  (esbuild, unrs-resolver, sharp).
- **No hay Docker ni Postgres local** → tests de BD con **PGlite**.
- **Drizzle**: `decimal` vuelve como string con escala (`'0.00'`); `uuid` exige UUID
  válido (el `sub` del ecosystem siempre lo es).
- **Next 16**: la opción `eslint` ya no existe en `next.config`. Avisos `LF→CRLF` inocuos.
- **Node en la terminal**: usar **PowerShell** (ahí están `node`/`pnpm`). En Git Bash
  puede que `node` no esté en el PATH y `pnpm test` falle con "node no se reconoce".
- **CORS en dev**: las dos APIs permiten `http://localhost:3000` **y** `:3003` por
  defecto (código + `.env.example`). `campeonatos-web` (3003) llama a `ecosystem-api`
  (3001) para el login; sin el 3003 en `CORS_ORIGINS` el navegador lo bloquea.
- **Super-admin**: `requireScope` (campeonatos-api) deja pasar a `is_super_admin`
  sin exigir el scope. Un usuario normal SÍ necesita la suscripción.
- **Jest + ESM (ecosystem-api)**: `jose`/`uuid` son ESM puro; el `transformIgnorePatterns`
  del `package.json` (`/node_modules/.pnpm/(?!(jose|uuid)@)`) los deja transformar.
  Sin eso, los specs de auth fallan con `Unexpected token 'export'`.
- **Tests flaky en frío**: `campeonatos-api` y `-combat` tienen `vitest.config.ts`
  con `testTimeout: 20000` (el primer test de cada archivo carga fastify/ws en frío).
- **`CAMPEONATOS_DATABASE_URL`** puede ser **el mismo** connection string que el
  `DATABASE_URL` del ecosystem: son schemas distintos (`campeonatos` vs `ecosystem`)
  en el mismo Postgres.
- **BD local sin servidor (PGlite)**: si `PGLITE_DATA` / `CAMPEONATOS_PGLITE_DATA`
  están en el `.env`, los clientes usan **PGlite embebido** (persistido en `.localdb/`,
  gitignored) en vez de postgres-js. Se activa así el arranque local sin Docker ni
  Postgres. Setup: `db:local:setup` en ecosystem-api y campeonatos-db. Para
  producción se comentan esas envs y se usan `DATABASE_URL`/migraciones drizzle-kit.
  Detalle completo en `RUN_LOCAL.md`. Los clientes de BD son **lazy** (proxy): no
  abren conexión hasta el primer uso. **PGlite ≠ socket**: `pglite-socket` no es
  compatible con postgres-js (se cuelga); por eso se usa PGlite **en-proceso**.
- **Bug corregido**: la 1.ª migración del ecosystem no creaba el schema
  (`CREATE SCHEMA "ecosystem"`), a diferencia de la de campeonatos. Ya añadido
  `CREATE SCHEMA IF NOT EXISTS "ecosystem"` al inicio del `0000_*.sql` (habría
  fallado también contra Supabase en un deploy limpio).

---

## 8. Handoff a una sesión nueva (instrucciones para mí mismo)

1. **Lee la memoria** (`...\memory\`): `MEMORY.md` + `dinamyt-ecosystem-arquitectura`,
   `dinamyt-campeonatos-plan`, `dinamyt-saltos-reglas`.
2. **Lee este HANDOFF.md** y, si necesitas detalle de reglas, las specs `.docx`.
3. **Verifica el estado**: `cd D:\Repositorios\dinamyt && pnpm build` (8/8) y los tests.
   Revisa `git log --oneline`.
4. **Respeta las decisiones** de la §1; no reintroduzcas Flask ni polirepo; no toques
   `DINAMYT-COMBAT`.
5. **Confirma con Amir** los supuestos de la §5 antes de profundizar en combate/saltos/
   secciones.
6. Trabaja una pieza a la vez, con tests (Vitest/PGlite), commits por incremento con
   comandos git simples, y **actualiza este documento** a medida que avances.

---

## 9. Historial de commits (monorepo)

```
e121618 feat(campeonatos): asignacion inscripcion->seccion por cinturon + snapshot inmutable
12ca535 feat(campeonatos-web): panel de juez de mesa (combate en vivo por WebSocket)
7a44396 feat(campeonatos): persistencia del resultado de combate (sync)
a504cff feat(campeonatos): config de categorias + generacion de secciones
2fdb19d refactor(combate): port fiel del motor de DINAMYT-COMBAT (modelo de 4 jueces)
3787ce7 feat(campeonatos-core): generacion de secciones (arbol) + saltos maxFallas=3
e46129c docs: actualiza HANDOFF — saltos, panel admin y combate
ffc9434 feat(campeonatos-combat): servidor WebSocket + motor de combate en vivo
d8d7f96 feat(campeonatos-web): panel admin (login + crear campeonato + inscribir)
1a7c223 feat(campeonatos): motor de Saltos + split de modalidad (altura/longitud)
d00a20f feat(ecosystem-portal): portal Next 16 con login/registro/verificacion
6c379f1 feat(campeonatos-web): scaffold Next 16 + pantalla publica
e90ae16 feat(campeonatos-api): endpoints reales con core + db (inscripcion categorizada)
f58330a feat(campeonatos-core): logica de dominio pura y testeada
bab1113 feat(campeonatos-api): esqueleto Fastify con guard JWT del ecosystem
72cc21b test(campeonatos-db): verificacion automatica con PGlite + Vitest
93aad49 feat(campeonatos-db): schema Drizzle inicial de DINAMYT Campeonatos
4af622a chore(monorepo): inicializa monorepo pnpm/Turborepo + paquete @dinamyt/shared
05833a7 docs: HANDOFF.md — estado completo del proyecto y guia de continuidad
```
(El ecosystem se estabilizó antes en `D:\Repositorios\dinamyt-ecosystem`, commit `7fe5577`.)
