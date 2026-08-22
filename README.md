# DINAMYT — Ecosistema digital del deporte marcial

Una cuenta para todo: el alumno entra una vez y su club, sus pagos, sus
campeonatos y sus clases lo reconocen. Monorepo pnpm + Turborepo, TypeScript de
punta a punta.

**En producción desde el 20 de agosto de 2026** en un VPS propio
(`dinamyt.org`), con una sola base PostgreSQL y un esquema por app.

| Documento | Para qué |
|---|---|
| **[OPERAR.md](OPERAR.md)** | **Empieza aquí.** Desplegar, migrar, el correo, los respaldos, cómo funciona esto por dentro y las trampas que ya costaron una tarde |
| [MONTAR-VPS.md](MONTAR-VPS.md) | El servidor desde cero. Solo si hay que rehacerlo |
| [CONTINGENCIA-CAMPEONATO.md](CONTINGENCIA-CAMPEONATO.md) | Si se cae el VPS, el internet o la luz en pleno campeonato |

---

## Las piezas

| Pieza | Puerto dev | Qué es |
|---|---|---|
| `apps/ecosystem-api` | 3001 | Identidad y suscripciones (NestJS). **El único que emite tokens** |
| `apps/ecosystem-portal` | 3000 | Portal: registro, login, perfil, «Mi club», «Mi organización», panel de administración (Next) |
| `apps/academy-api` / `-web` | 3007 / 3008 | Enseñanza por cinturón: contenidos, tareas, notas, historial (PWA) |
| `apps/academy-figuras` | 3009 | IA de figuras: MediaPipe + DTW, correcciones con marcas de tiempo (Python) |
| `packages/shared` | — | El contrato del JWT. **Fuente de verdad única** para las tres apps |
| `packages/academy-db` | — | Esquemas Drizzle de Academy |
| `productos/membresias` | 3004 / 3006 | **Espejo** de `dinamyt-membresias`: mensualidades, asistencia, kiosco, carnet |
| `productos/campeonatos` | 5000 / 3003 | **Espejo** de `dinamyt-combat`: inscripciones, llaves, combate en vivo |

Las apps **delegan la autenticación** en `ecosystem-api`: este firma un JWT
RS256 y publica la clave en `/auth/jwks`; las demás solo lo verifican y exigen su
`app_scope` (`membresias`, `campeonatos`, `academy`).

```
dinamyt/
├── apps/            ← vive AQUÍ. Se edita aquí.
├── packages/        ← vive AQUÍ.
├── productos/       ← ESPEJOS. NO se editan aquí (ver abajo).
│   ├── campeonatos/            <- ArsenalCrack/dinamyt-combat
│   └── membresias/             <- ArsenalCrack/dinamyt-membresias
└── scripts/
    ├── sync-apps.ps1           Pone al día los espejos
    ├── respaldar-produccion.ps1
    ├── verificar-respaldo.ps1
    ├── paquete-campeonato.ps1  El paquete offline del día del evento
    └── diario-migraciones.mjs
```

### La regla de `productos/`

Campeonatos y Membresías **tienen su propio repositorio y ahí es donde se
trabaja**. Lo que hay en `productos/` es un espejo traído con `git subtree`, que
conserva su historial completo.

> **Nunca se edita nada dentro de `productos/`.** Un cambio hecho ahí se pierde
> en la siguiente sincronización, y se pierde en silencio: `git subtree pull` no
> avisa de lo que aplasta.

```powershell
.\scripts\sync-apps.ps1                       # los dos
.\scripts\sync-apps.ps1 -Producto membresias  # solo uno
.\scripts\sync-apps.ps1 -Local                # desde el disco, sin pasar por GitHub
```

**No están en el workspace de pnpm** (`pnpm-workspace.yaml` solo mira `apps/*` y
`packages/*`). Cada uno se construye desde su carpeta con su propio lockfile: si
compartieran resolución de dependencias, una discrepancia de versiones dejaría
sin construir a los tres productos a la vez.

**El despliegue clona los tres repositorios**, no este espejo — así un despliegue
nunca depende de que alguien se acordara de sincronizar.

---

## Correr esto en tu PC

**No hace falta instalar ninguna base de datos.** Se usa **PGlite** (PostgreSQL
embebido en WebAssembly) persistido en `.localdb/`. Sin Docker, sin Supabase, sin
el PostgreSQL del sistema.

### 1 · Una sola vez

Node 18+ y pnpm 11+ (`corepack enable` activa la versión fijada en
`packageManager`). Compruébalo en **PowerShell**, no en Git Bash — ahí puede que
`node` no esté en el PATH.

```powershell
pnpm install; pnpm build
```

Las **claves RS256** ya están en `apps/ecosystem-api/keys/`. Si faltaran:

```powershell
openssl genpkey -algorithm RSA -out apps/ecosystem-api/keys/private.pem -pkeyopt rsa_keygen_bits:2048; openssl rsa -in apps/ecosystem-api/keys/private.pem -pubout -out apps/ecosystem-api/keys/public.pem
```

Los `.env` ya existen y apuntan a PGlite. La línea que lo decide es
`PGLITE_DATA` en `apps/ecosystem-api/.env`: mientras esté descomentada, se
**ignora** `DATABASE_URL`.

> ⚠️ Nunca subas `.env`, `keys/` ni `.localdb/` a git (ya están en
> `.gitignore`).

### 2 · Crear la base local

```powershell
pnpm --filter @dinamyt/ecosystem-api db:local:setup
```

```powershell
pnpm --filter @dinamyt/academy-db db:local:setup
```

> ⚠️ **PGlite es de un solo proceso.** Corre los setups con las APIs
> **apagadas**. Si un segundo proceso abre la misma carpeta `.localdb/*`, el
> data-dir se corrompe y todo muere con `RuntimeError: Aborted()` en
> `_pg_initdb`. Remedio: parar todo, borrar la carpeta y repetir — los datos
> locales son de prueba y regenerables.

Eso crea el super-admin, los planes y **usuarios demo por rol**:

| Usuario | Contraseña | Qué ve |
|---|---|---|
| `admin@dinamyt.com` | `CambiaEstaClaveFuerte123!` | Todo: las apps y el panel `/admin` del portal |
| `orgadmin@dinamyt.com` | `Demo1234!` | Administra el Club Demo |
| `maestro@dinamyt.com` | `Demo1234!` | Panel del maestro: gente, entrada al club, ficha |
| `owner@dinamyt.com` | `Demo1234!` | Panel del club en Membresías (roster, pagos, kiosco) |
| `alumno1@` · `alumno2@dinamyt.com` | `Demo1234!` | Portal del alumno |
| `coach@` · `juez@` · `juezesquina@` · `competidor@dinamyt.com` | `Demo1234!` | Los roles de Campeonatos |
| `profesor@` · `estudiante@dinamyt.com` | `Demo1234!` | Academy en :3008 |

### 3 · Levantar las apps

Las del monorepo, con Turbo:

```powershell
pnpm dev
```

O una por una:

```powershell
pnpm --filter @dinamyt/ecosystem-api start:dev
```

| Filtro | Puerto |
|---|---|
| `@dinamyt/ecosystem-api` (`start:dev`) | 3001 |
| `@dinamyt/ecosystem-portal` | 3000 |
| `@dinamyt/academy-api` | 3007 |
| `@dinamyt/academy-web` | 3008 |

**Membresías y Campeonatos no están en este workspace**, así que sus filtros no
resuelven aquí. Se levantan desde SU repositorio:

```powershell
pnpm --dir D:\Repositorios\dinamyt-membresias\apps\membresias-api dev
```

```powershell
pnpm --dir D:\Repositorios\dinamyt-membresias\apps\membresias-web dev
```

`.claude/launch.json` ya trae esas dos entradas resueltas
(`standalone-membresias-api` y `-web`), y ahí están todos los puertos.

**Figuras con IA** (opcional). La primera vez:
`cd apps/academy-figuras && python -m venv .venv && .venv\Scripts\pip install -r requirements-service.txt`. Luego:

```powershell
apps\academy-figuras\.venv\Scripts\python -m uvicorn service.main:app --port 3009 --app-dir apps/academy-figuras
```

### 4 · Comprobar que está sano

```powershell
pnpm turbo build test
```

---

## El recorrido, de punta a punta

Con el portal y el ecosystem arriba, en http://localhost:3000:

1. **Crear cuenta.** Sin `SMTP_HOST` el código de verificación no llega por
   correo: **sale por el registro de la API** (`[SIN CORREO] OTP …`). La cuenta
   nace justo cuando se teclea ese código.
2. **Fundar un club** (con `maestro@`) o **entrar a uno**: en el dashboard,
   «Entrar a un club» con el código que reparte el maestro.
3. **El maestro acepta**, en «Mi organización» → «Entrada al club». O invita él,
   por correo: la persona la acepta en su propio dashboard.
4. **Saltar a Membresías**: el botón del dashboard lleva el token en el
   fragmento (`#token=…`) y la ficha del alumno **nace sola** al aterrizar.
5. **El super-admin** (`admin@`) en `/admin`: organizaciones, accesos rápidos,
   suscripciones con su renovación mes a mes y su historial de pagos.

Qué pasa por debajo en cada uno de esos pasos, y por qué está hecho así:
[OPERAR.md](OPERAR.md), parte 4.
