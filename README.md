# DINAMYT — Monorepo

Ecosistema digital para la gestión del deporte marcial (Hapkido). Monorepo
gestionado con **pnpm workspaces** + **Turborepo**. Cada app es independiente y
desplegable por separado; comparten un único **contrato de identidad**.

## Estructura

```
dinamyt/
├── apps/
│   └── ecosystem-api/    Servicio central de identidad y suscripciones (NestJS)
│       (próximamente: ecosystem-portal, campeonatos-web/api/combat, academy-*)
└── packages/
    └── shared/           @dinamyt/shared — contrato compartido (tipos del JWT, enums)
```

> Las apps **delegan la autenticación** en `ecosystem-api`: este firma un JWT
> RS256 y publica la clave en `/auth/jwks`; las demás solo lo verifican y exigen
> su `app_scope` (`academy`, `campeonatos`). El contrato vive en `@dinamyt/shared`
> para que emisor y consumidores no se desincronicen.

## Requisitos

- Node.js 18+
- pnpm 11+ (`corepack enable` activa la versión fijada en `packageManager`)

## Uso

```bash
pnpm install          # instala todas las workspaces
pnpm build            # build de todo el grafo (turbo respeta dependencias)
pnpm dev              # modo desarrollo
```

Para correr una app concreta, ver su README (ej. `apps/ecosystem-api/README.md`).
