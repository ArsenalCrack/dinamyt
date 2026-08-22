# DINAMYT — Ecosistema digital del deporte marcial

Monorepo (pnpm + Turborepo, TypeScript full-stack) del ecosistema DINAMYT:
identidad única + apps federadas por suscripción (JWT RS256 verificado contra
`/auth/jwks`; ninguna app tiene login propio).

| Pieza | Puerto dev | Qué es |
| --- | --- | --- |
| `apps/ecosystem-api` | 3001 | Identidad y suscripciones (NestJS). **El único que emite tokens.** |
| `apps/ecosystem-portal` | 3000 | Portal: login/registro, verificación de correo, dashboard, planes, admin (Next) |
| `apps/academy-api` / `-web` | 3007 / 3008 | Enseñanza por cinturón: contenidos, tareas, notas, historial (PWA) |
| `apps/academy-figuras` | 3009 | IA de figuras: MediaPipe + DTW, correcciones con timestamps (Python) |
| `packages/shared` | — | Contrato del JWT. **Fuente de verdad única** para las tres apps |
| `packages/academy-db` | — | Esquemas Drizzle de academy |
| `productos/campeonatos` | 3003 / 5000 | **Espejo** de `dinamyt-combat`: Flask + Next + Socket.IO |
| `productos/membresias` | 3006 / 3004 | **Espejo** de `dinamyt-membresias`: Fastify + Next PWA |

## Cómo está organizado esto

```
dinamyt/
├── apps/            ← vive AQUÍ. Se edita aquí.
│   ├── ecosystem-api/          Identidad y suscripciones (NestJS)
│   ├── ecosystem-portal/       Portal del ecosystem (registro, SSO, perfil)
│   ├── academy-api/            Backend de academia
│   ├── academy-web/            Frontend de academia (PWA)
│   └── academy-figuras/        Servicio IA de figuras con MediaPipe (Python)
├── packages/        ← vive AQUÍ.
│   ├── shared/                 @dinamyt/shared — contrato del JWT
│   └── academy-db/             Acceso a datos de academy
├── productos/       ← ESPEJOS. NO se editan aquí (ver abajo).
│   ├── campeonatos/            <- ArsenalCrack/dinamyt-combat
│   └── membresias/             <- ArsenalCrack/dinamyt-membresias
└── scripts/
    ├── sync-apps.ps1           Pone al día los espejos
    ├── respaldar-produccion.ps1
    ├── verificar-respaldo.ps1
    └── diario-migraciones.mjs
```

### La regla de `productos/`

Campeonatos y Membresías **tienen su propio repositorio y ahí es donde se
trabaja**. Lo que hay en `productos/` es un espejo traído con `git subtree`, que
conserva su historial completo.

> **Nunca se edita nada dentro de `productos/`.** Un cambio hecho ahí se pierde
> en la siguiente sincronización, y se pierde en silencio: `git subtree pull` no
> avisa de lo que aplasta. Si hay que tocar Campeonatos o Membresías, se abre SU
> repositorio.

Para ponerlos al día:

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

> Las apps **delegan la autenticación** en `ecosystem-api`: este firma un JWT
> RS256 y publica la clave en `/auth/jwks`; las demás solo lo verifican y exigen
> su `app_scope` (`campeonatos`, `membresias`, `academy`). El contrato vive en
> `@dinamyt/shared` para que emisor y consumidores no se desincronicen.

## Requisitos

- Node.js 18+
- pnpm 11+ (`corepack enable` activa la versión fijada en `packageManager`)

## Uso y Documentación

> **Empieza por [REGLAS-Y-COMANDOS.md](REGLAS-Y-COMANDOS.md)**: dónde se edita
> cada cosa, el orden al desplegar, las variables que parecen opcionales y no lo
> son, y las trampas que ya costaron una tarde. Casi todo lo que hay ahí está
> escrito porque se rompió una vez.

| Documento | Para qué |
|---|---|
| [REGLAS-Y-COMANDOS.md](REGLAS-Y-COMANDOS.md) | Las reglas y los comandos de siempre |
| [RUN_LOCAL.md](RUN_LOCAL.md) | Correr todo en tu PC (PGlite embebido, sin Docker) |
| [VPS-PASO-A-PASO.md](VPS-PASO-A-PASO.md) | El servidor, de cero. Es lo que corre hoy en `dinamyt.org`. Anexos: pendientes (C), Cloudflare (D), correo (E) |
| [IDENTIDAD-PASO-A-PASO.md](IDENTIDAD-PASO-A-PASO.md) | Dar cuenta del ecosistema a quien ya existía en Membresías y Campeonatos |
| [PUESTA-AL-DIA.md](PUESTA-AL-DIA.md) | El puente de altas: la ficha de Membresías que nace sola desde el portal |
| [FUENTE-DE-VERDAD-PASO-A-PASO.md](FUENTE-DE-VERDAD-PASO-A-PASO.md) | Los datos de la persona se escriben en el portal y Membresías los lee (y el espejo que los lleva hasta el carnet) |
| [CORREO-PASO-A-PASO.md](CORREO-PASO-A-PASO.md) | Que al alumno le llegue el código: Resend, el DNS y la migración que va **antes** |
| [CONTRASENA-UNICA.md](CONTRASENA-UNICA.md) | Una contraseña para todo DINAMYT: se fija en el portal y Membresías la copia (Campeonatos, después de octubre) |
| [CONTINGENCIA-CAMPEONATO.md](CONTINGENCIA-CAMPEONATO.md) | Si se cae el VPS, el internet o la luz en pleno campeonato |
| [UNA-SOLA-APP.md](UNA-SOLA-APP.md) | Que las tres apps se sientan una sola (bloque B5) |
| [HANDOFF.md](HANDOFF.md) | Estado del proyecto **congelado en julio de 2026**. Histórico |

**El plan maestro** (el tablero de bloques B0…B5) vive, por ahora, dentro del
espejo: `productos/campeonatos/PLAN-ECOSYSTEM-VPS.md`. **Se edita en el repo
`dinamyt-combat`**, nunca aquí.

Verificación rápida: `pnpm install`, `pnpm build` y `pnpm test` (Turbo, 15/15).
