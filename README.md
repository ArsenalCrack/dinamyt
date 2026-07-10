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

- **Correr en local**: ver [RUN_LOCAL.md](RUN_LOCAL.md) (PGlite embebido, sin Docker).
- **Desplegar gratis en la web**: ver [DESPLIEGUE_WEB.md](DESPLIEGUE_WEB.md).
- **Estado del proyecto / handoff**: ver [HANDOFF.md](HANDOFF.md).

Verificación: `pnpm build` y `pnpm test` (Turbo, 15/15).
