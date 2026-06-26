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

Estado global: **`turbo build` 8/8** · **43 tests** (core 32 · db 3 · api 6 · combat 2) · ✅.

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

### `@dinamyt/campeonatos-core` (lógica pura)
- categorización: cinturones, edad, restricciones R1-R5, género de sección, `enRango`,
  clave/nombre de sección.
- puntuación: combate §7.5 (+DQ), figuras §7.2, `desempatesPodio` §7.3.
- brackets §8.3: `generarBracket` (byes, avance) + `avanzar`.
- **saltos §7.4**: `procesarRondaSaltos` (rondas sincronizadas, fallas acumulativas
  por modalidad), `todosSuperaron`, `rankingSaltos`.
- **combate en vivo §7.5**: `aplicarEvento` (reductor puro: marcador por acción,
  penalizaciones, DQ, alerta de superioridad a 12, deshacer, ganador, reset).
- 32 tests.

### `@dinamyt/campeonatos-api` (Fastify, :3002)
Guard `requireScope` (RS256 vs JWKS + scope `campeonatos`). Endpoints: `GET /health`,
`/campeonatos/publico` (público), `/campeonatos`, `/me`, `POST /campeonatos`,
`POST /campeonatos/:id/inscripciones` (valida R1-R5 + perfil provisional + monto),
`POST /secciones/:id/bracket`. BD y verificador inyectables. 6 tests (PGlite).

### `@dinamyt/campeonatos-web` (Next 16, :3003)
Pantalla pública (`/pantalla`) + **panel admin**: `/admin/login` (login delegado al
ecosystem-api), `/admin` (listar + crear campeonato), `/admin/[id]` (inscribir
competidor con feedback de R1-R5). `next build` OK.

### `@dinamyt/campeonatos-combat` (ws, :3005)
Servidor WebSocket local (offline en WiFi). `Salas` mantiene el estado por combate
en memoria y aplica el motor `aplicarEvento` del core; reenvía el estado a la sala.
2 tests (sala + e2e WebSocket).

---

## 5. Qué FALTA (pendiente)

**Campeonatos**
- [ ] **Generación automática de secciones** desde inscripciones (usar `claveSeccion`/
      `enRango`; requiere guardar los cortes de edad/peso por campeonato → nueva tabla
      o columnas de config).
- [ ] Endpoints de la API para: gestión de tatamis y cola FIFO; secciones;
      resultados de figuras/saltos; sincronización del combate (recibir el estado
      final del módulo `combat` y persistir `combates`/`eventos_combate`).
- [ ] Panel de **juez de mesa** en la web (ingresar puntajes; conectar al WS de combate).
- [ ] Endpoint `GET /users/:id/campeonatos-summary` (perfil unificado, RF-CAM-ECO-04).
- [ ] Reportes Excel/PDF (ExcelJS) y PWA/offline.

**Ecosystem**
- [ ] Gestión de organizaciones y suscripciones desde el portal (UI; el API ya existe).
- [ ] Endpoints de perfil (`/users/:id/profile`) y perfil unificado.

**Academy**: no iniciada.

**Operación / infra (tareas de Amir)**
- [ ] Migraciones contra Postgres real: ecosystem (`DATABASE_URL`) y campeonatos
      (`CAMPEONATOS_DATABASE_URL`); luego `db:seed` del ecosystem.
- [ ] Subir el monorepo a un repo `dinamyt` en GitHub (y archivar los 4 viejos).
- [ ] CI/CD (GitHub Actions) y despliegue (Vercel webs · Render/Neon APIs).

### Supuestos a confirmar con Amir
- **Combate**: el motor usa el modelo de **puntos por acción del §7.5** (réferi de
  esquina + juez de mesa + penalizaciones), NO el de "4 jueces que votan" de COMBAT.
- **Saltos**: se asume eliminación al acumular `maxFallas` fallas (por defecto **2**).
- **Desempate §7.3**: se asume que solo aplica ante empate de puntaje.
- **Login cross-origin**: en dev, `campeonatos-web` hace su propio login contra el
  ecosystem (el token de localStorage no se comparte entre orígenes/puertos).

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
