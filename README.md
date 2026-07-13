# DINAMYT — Ecosistema digital del deporte marcial

Monorepo (pnpm + Turborepo, TypeScript full-stack) del ecosistema DINAMYT:
identidad única + apps federadas por suscripción (JWT RS256 verificado contra
`/auth/jwks`; ninguna app tiene login propio).

| App | Puerto dev | Qué es |
| --- | --- | --- |
| `apps/ecosystem-api` | 3001 | Identidad y suscripciones (NestJS) |
| `apps/ecosystem-portal` | 3000 | Portal: login/registro, dashboard, planes, admin (Next) |
| `apps/campeonatos-api` / `-web` / `-combat` | 3002 / 3003 / 3005 | Torneos con puntuación en vivo (Fastify / Next / WebSocket) |
| `apps/membresias-api` / `-web` / `-agent` | 3004 / 3006 / 7070 | Mensualidades, asistencia y kiosco del club |
| `apps/academy-api` / `-web` | 3007 / 3008 | Enseñanza por cinturón: contenidos, tareas, notas, historial (PWA) |
| `apps/academy-figuras` | 3009 | IA de figuras: MediaPipe + DTW, correcciones con timestamps (Python) |
| `packages/shared` · `*-db` · `campeonatos-core` | — | Contrato JWT, esquemas Drizzle y dominio puro |

```
dinamyt/
├── apps/
│   ├── ecosystem-api/          Servicio central de identidad y suscripciones (NestJS)
│   ├── ecosystem-portal/       Portal del ecosystem (login SSO, perfil global)
│   ├── campeonatos-api/        Backend de campeonatos
│   ├── campeonatos-web/        Frontend de gestión de campeonatos (inscripciones, roles, cuadros)
│   ├── campeonatos-combat/     Pantalla en vivo del tatami / juez central (COMBAT)
│   ├── membresias-api/         Backend de mensualidades y asistencia
│   ├── membresias-agent/       Agente/worker de membresías (notificaciones, vencimientos)
│   ├── membresias-web/         Frontend de mensualidades, asistencia y perfil del alumno
│   ├── academy-api/            Backend de academia (Hapkido, evaluaciones)
│   ├── academy-web/            Frontend de academia (estudiantes y maestros)
│   └── academy-figuras/        Servicio IA de figuras con MediaPipe (Python)
└── packages/
    ├── shared/                 @dinamyt/shared — contrato compartido (tipos del JWT, enums)
    ├── campeonatos-core/       Lógica compartida de campeonatos
    ├── campeonatos-db/         Acceso a datos de campeonatos
    ├── membresias-db/          Acceso a datos de membresías
    └── academy-db/             Acceso a datos de academy
```

> Las apps **delegan la autenticación** en `ecosystem-api`: este firma un JWT
> RS256 y publica la clave en `/auth/jwks`; las demás solo lo verifican y exigen
> su `app_scope` (`campeonatos`, `membresias`, `academy`). El contrato vive en
> `@dinamyt/shared` para que emisor y consumidores no se desincronicen.

## Requisitos

- Node.js 18+
- pnpm 11+ (`corepack enable` activa la versión fijada en `packageManager`)

## Uso y Documentación

- **Correr en local**: ver [RUN_LOCAL.md](RUN_LOCAL.md) (PGlite embebido, sin Docker).
- **Desplegar gratis en la web**: ver [DESPLIEGUE_WEB.md](DESPLIEGUE_WEB.md).
- **Estado del proyecto / handoff**: ver [HANDOFF.md](HANDOFF.md).

Verificación rápida: `pnpm install`, `pnpm build` y `pnpm test` (Turbo, 15/15).
