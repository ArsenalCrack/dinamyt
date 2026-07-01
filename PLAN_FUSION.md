# DINAMYT — Plan de fusión COMBAT + PROJECT (con roles)

> Documento vivo. Creado 2026-07-01. Objetivo: guiar la construcción de la versión
> unificada de Campeonatos. Léelo junto a `HANDOFF.md` y `RUN_LOCAL.md`.

## 1. Visión

Unificar en el monorepo TS lo mejor de dos proyectos de referencia (que **no se
tocan**, son solo fuente de lógica/UX):

- **`D:\hapkido\DINAMYT-COMBAT`** (Flask + Next, Socket.IO) — **el evento en vivo**:
  puntuación de combate y figuras en tiempo real, pantalla pública para TV, tablero
  offline, llaves visuales, tatamis, reportes. → **La experiencia "campeonato EN
  CURSO" debe verse IGUAL que COMBAT.**
- **`D:\hapkido\DINAMYT-PROJECT`** (Angular + Spring) — **la creación/gestión**:
  crear/configurar campeonatos, estados, inscripciones e invitaciones, tatamis con
  "robo de modalidades", dashboards por rol. → **La creación usa esta lógica, con
  el estilo visual actual del monorepo.**

Regla de oro: **crear** = lógica de PROJECT con estilo actual · **en vivo** = clon
visual/funcional de COMBAT.

## 2. Roles (contrato ya existente)

`CampeonatosRole = 'admin' | 'coach' | 'competitor' | 'judge'` (en `@dinamyt/shared`)
+ `is_super_admin`. Mapa de acceso previsto:

| Rol | Puede |
| --- | --- |
| super_admin / admin | Todo: crear/configurar campeonatos, tatamis, llaves, asignar jueces, reportes |
| organizer (admin de su org) | Crear/gestionar sus campeonatos y el evento en vivo |
| judge | Solo puntuar (combate/figuras) en el tatami asignado (`/juez`, `/tatami/[id]`) |
| coach | Inscribir a sus competidores; ver resultados/historial |
| competitor | Aceptar invitaciones, elegir modalidades, ver su historial inmutable |

El token ya trae `role_campeonatos`; falta **usarlo** para gatear rutas/acciones en
web y API.

## 3. Inventario COMBAT (a replicar en el "en vivo")

Rutas (Next): `/admin`, `/admin/campeonato/[id]` (tatamis + categorías + llaves +
jueces), `/admin/campeonato/[id]/llaves`, `/admin/campeonato/[id]/reportes`,
`/juez`, `/pantalla`, `/tablero` + `/tablero/pantalla` (offline JC), `/tatami/[id]`.
Componentes clave: `BracketTree`, `LlavePanel`, `LlavesSection`, `PodioLlave`,
`GrupoFigurasPanel`, `AlertSystem`, `PanelColapsable`. Realtime: Socket.IO
namespace `/combate` (hoy el monorepo usa `ws` crudo).

## 4. Inventario PROJECT (a replicar en la "creación")

- `secciones/ArbolBuilder` → **ya portado** en `campeonatos-core/generarSecciones`.
- Creación/edición/publicación de campeonato + estados (`BORRADOR→LISTO→EN_CURSO→
  FINALIZADO`).
- Inscripciones + **invitaciones** (el competidor acepta y elige modalidades).
- Live: **gestión de tatamis** + asignar modalidad/categoría a un tatami + **"robo
  de modalidades"** entre tatamis.
- Dashboards por rol.

## 5. Estado actual del monorepo (qué YA hay)

- Dominio (`core`): categorización R1-R5, generación de secciones (árbol), figuras,
  brackets, saltos, **motor de combate (port fiel de COMBAT)**.
- API (`campeonatos-api`): crear campeonato + modalidades, inscribir (R1-R5),
  generar/asignar secciones, bracket, persistir combate, `/me`.
- Web: `/admin` (crear/listar), `/admin/[id]` (inscribir), `/admin/[id]/secciones`
  (generar→asignar→llave), `/admin/combate` (juez de mesa por WS), `/pantalla`.
- WS de combate (`campeonatos-combat`).

## 6. Brechas (lo que falta para la visión)

1. **Roles**: gatear API (más allá del scope) y navegación/UX por rol.
2. **Creación completa**: UI de config de categorías (rangos cinturón/edad/peso),
   estados del campeonato, edición/publicación, invitaciones.
3. **Tatamis**: endpoints + UI de gestión, cola FIFO y robo de modalidades
   (el schema `tatamis`/`cola_tatami` ya existe).
4. **En vivo estilo COMBAT**: portar UI (`BracketTree`, `LlavePanel`, `PodioLlave`,
   `/juez`, `/pantalla`, `/tatami`, `/tablero`) con el tema actual; **figuras** en
   vivo; reconciliar realtime (ws vs socket.io).
5. **Reportes** Excel/PDF y **PWA/offline**.
6. **Perfil/historial inmutable** (parcial).

## 7. Hoja de ruta por fases (orden recomendado)

- **Fase 1 — Roles y navegación por rol** ✅ *(hecha 2026-07-01)*.
  - API: `requireRole(scope, roles)` en `plugins/auth.ts` (super-admin bypass);
    aplicado a crear/secciones/asignar/bracket (`admin`), inscribir (`admin`+`coach`),
    persistir combate (`admin`+`judge`). +1 test (10 en campeonatos-api).
  - Web: `lib/session.ts` (decodifica el JWT: rol/`is_super_admin`); redirección
    post-login por rol; `/admin` muestra usuario+rol, oculta "crear" salvo admin,
    "inscribir" solo admin/coach; el juez se redirige a `/admin/combate`.
  - Setup local crea usuarios demo: `juez@dinamyt.com` / `coach@dinamyt.com`
    (`Demo1234!`) con org + suscripción activa, para probar los accesos por rol.
  - Pendiente en fases siguientes: pantallas propias de coach/competitor
    (inscripción/historial) y de juez (`/juez` estilo COMBAT).
- **Fase 2 — Creación/configuración (estilo PROJECT, tema actual)** ✅ *(hecha 2026-07-01, parcial)*.
  - Estados del campeonato: core `transicionValida` + `PATCH /campeonatos/:id/estado`
    (solo avanza un paso) + botón "→ SIGUIENTE" en `/admin`. Verificado.
  - UI de categorías: `GET /campeonatos/:id` (detalle+modalidades) + `PUT
    /campeonatos/:id/modalidades/:modalidad` + editor `ConfigCategorias`
    (género, cinturón con grupos, rangos edad/peso) en la página de secciones →
    `generar-secciones` real. Verificado end-to-end.
  - **Creación completa (2026-07-01, tras feedback de Amir)** alineada con
    DINAMYT-PROJECT: campos `ubicacion/pais/ciudad/alcance/numTatamis(1-12)/
    maxParticipantes(2-10000)/esPublico+codigo/fechas` (migración db 0001);
    validaciones en **core** (edad 4-100, peso 10-400, ámbito, orden de cinturón,
    solapamientos/duplicados) usadas por **API** (422 con detalles) y por el
    **front**; página `/admin/crear`; **cinturón por nombre fijo** (5 grupos,
    individual/rango, sin texto libre); distinción **modalidad** (en qué compite)
    vs **categoría** (cómo se agrupa). Verificado end-to-end.
  - **Pendiente de Fase 2**: inscripción por **invitación** (email + aceptación
    del competidor); crear registros de **tatami** desde `numTatamis` (hoy solo se
    guarda el número); edición completa del campeonato (`/admin/[id]/editar`).
- **Fase 3 — Tatamis y flujo del evento**.
  - Endpoints/UI de tatamis, cola FIFO, asignación y robo de modalidades.
- **Fase 4 — Evento EN VIVO idéntico a COMBAT**.
  - Portar componentes y pantallas (`BracketTree`, `LlavePanel`, `PodioLlave`,
    `/juez`, `/pantalla`, `/tatami`, `/tablero`), figuras en vivo, realtime.
- **Fase 5 — Reportes (Excel/PDF), PWA/offline, historial inmutable, perfil unificado**.

## 8. Próximo paso recomendado

**Fase 1 (roles)**: es la columna vertebral que el usuario pidió explícitamente y de
la que cuelga todo lo demás; está bien acotada y es testeable. Al terminar, seguir
con Fase 2 (creación) y luego Fase 4 (clon de COMBAT en vivo).

## 9. Convenciones al construir

- Un incremento a la vez, con tests (Vitest/PGlite) y commit por incremento.
- **No** tocar `DINAMYT-COMBAT` ni `DINAMYT-PROJECT` (solo leer como referencia).
- Mantener el estilo visual actual en la creación; **clonar** el de COMBAT en el
  vivo. Actualizar este documento y `HANDOFF.md` a medida que se avance.
