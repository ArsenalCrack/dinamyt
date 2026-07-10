# DINAMYT — Monorepo

Ecosistema digital para la gestión del deporte marcial (Hapkido). Monorepo
gestionado con **pnpm workspaces** + **Turborepo**. Cada app es independiente y
desplegable por separado; comparten un único **contrato de identidad**.

## Estructura

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
│   └── membresias-web/         Frontend de mensualidades, asistencia y perfil del alumno
└── packages/
    ├── shared/                 @dinamyt/shared — contrato compartido (tipos del JWT, enums)
    ├── campeonatos-core/       Lógica compartida de campeonatos
    ├── campeonatos-db/         Acceso a datos de campeonatos
    ├── membresias-db/          Acceso a datos de membresías
    └── academy-db/             Acceso a datos de academy
```

> Las apps **delegan la autenticación** en `ecosystem-api`: este firma un JWT
> RS256 y publica la clave en `/auth/jwks`; las demás solo lo verifican y exigen
> su `app_scope` (`campeonatos`, `membresias`, etc.). El contrato vive en
> `@dinamyt/shared` para que emisor y consumidores no se desincronicen.
>
> `apps/membresias-web` también se publica como repo independiente
> ([dinamyt-membresias](https://github.com/ArsenalCrack/dinamyt-membresias))
> para despliegue desacoplado del resto del monorepo.

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
