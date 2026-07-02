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
  - **Tatamis materializados** ✅ *(2026-07-01)*: al crear el campeonato se
    insertan filas 1..`numTatamis` en `tatamis` (y `GET /campeonatos/:id/tatamis`
    auto-materializa los campeonatos previos).
  - **Edición completa** ✅ *(2026-07-01)*: `PATCH /campeonatos/:id` (solo
    BORRADOR/LISTO; re-valida con el core, sincroniza tatamis —no reduce si hay
    cola— y modalidades —no quita si hay inscripciones—) + página
    `/admin/[id]/editar` que reusa el formulario compartido `CampeonatoForm`.
  - **Invitaciones** ✅ *(2026-07-01, noche — confirmado por Amir: reales + in-app)*:
    tabla `invitaciones` (migración 0003, única por campeonato+email); el
    admin/coach invita por email (`POST /campeonatos/:id/invitaciones`, correo
    real vía SMTP **best-effort** — sin `SMTP_HOST` queda solo in-app); el
    competidor las ve al iniciar sesión (`GET /invitaciones/mias`, guard
    `requireAuth` **sin scope**, badge de pendientes en el header) y al aceptar
    completa datos + elige modalidades (validadas R1-R5 y contra las
    habilitadas) → inscripción vinculada a su cuenta (`ecosystemUserId`).
    Páginas: `/invitaciones` (competidor) + sección en `/admin/[id]`.
  - **Vista pública sin registro** ✅ *(estilo PROJECT `/campeonatos` +
    `details/:id`)*: `GET /campeonatos/publico` ahora lista LISTO/EN_CURSO/
    FINALIZADO públicos (BORRADOR y privados no); el detalle público incluye
    info general + modalidades; página `/campeonatos` (explorar agrupado por
    estado) y `/pantalla/[id]` enriquecida con la ficha del evento.
- **Fase 3 — Tatamis y flujo del evento** ✅ *(hecha 2026-07-01)*.
  - API (`routes/tatamis.ts`, con test de integración PGlite y verificación
    E2E contra el stack local): `GET /campeonatos/:id/tatamis` (tatamis + cola
    con secciones), `POST /tatamis/:id/cola` (encolar FIFO; una sección solo
    puede estar en una cola activa), `POST /tatamis/:id/iniciar|finalizar`
    (admin+judge; sincroniza estado de sección y tatami LIBRE/OCUPADO),
    `POST /cola/:id/promover` (al frente), `POST /cola/:id/robar` (**robo de
    modalidades**: mover una sección EN_ESPERA a otro tatami) y
    `DELETE /cola/:id`. IDs malformados → 400 (guard de UUID).
  - UI `/admin/[id]/tatamis`: grid responsive de tatamis (badge EN VIVO/LIBRE,
    sección en curso, cola numerada con promover/robar/quitar) + panel de
    secciones disponibles para encolar.
  - **Decisión de diseño**: se descartó la regla de PROJECT de reservar los dos
    últimos tatamis para saltos; el admin asigna libremente cualquier sección a
    cualquier tatami (más flexible y sin casos especiales).
- **Fase 4 — Evento EN VIVO idéntico a COMBAT**.
  - Portar componentes y pantallas (`BracketTree`, `LlavePanel`, `PodioLlave`,
    `/juez`, `/pantalla`, `/tatami`, `/tablero`), figuras en vivo, realtime.
- **Fase 5 — Reportes (Excel/PDF), PWA/offline, historial inmutable, perfil unificado**.

## 8. Próximo paso recomendado (actualizado 2026-07-01, tarde)

Hecho hoy además de Fases 1-3: **jueces por tatami** (modelo COMBAT
`AsignacionJuez`: tabla `jueces_tatami` con rol `arbitro`/`j1..j7` único por
tatami + UI), **catálogo geográfico** (todos los países/ciudades en la
creación), **pantalla pública EN VIVO** (`/pantalla/[id]`: tatamis + resultados
con refresco 5 s + enlace al juez de mesa desde la cola), **logo oficial de
COMBAT** en ambas webs, **landing pública del portal** y **panel de
administración del ecosystem** (`/admin` del portal: orgs → miembros con rol →
suscripciones org/personales).

Orden recomendado de lo que sigue:

1. **Fase 4 (continuar) — en vivo estilo COMBAT**: portar `/juez` (puntuación
   por réferi de esquina desde el móvil), `/tatami/[id]` (vista del tatami),
   `BracketTree`/`LlavePanel`/`PodioLlave` (llaves visuales con avance), y
   `/tablero` offline; figuras en vivo (paneles de 5-7 jueces); reconciliar
   realtime (hoy `ws` crudo; COMBAT usa Socket.IO — mantener `ws`).
   El acceso del juez debe gatearse con su asignación (`jueces_tatami.userEmail`
   vs email del token).
2. **Invitaciones** (cierre de Fase 2): email al competidor + aceptación
   eligiendo modalidades (RF de PROJECT).
3. **Resultados de figuras/saltos** persistidos y visibles en la pantalla.
4. **Reportes Excel/PDF** y **PWA/offline** (Fase 5) + perfil/historial
   inmutable visible al competidor.
5. **Ecosystem**: pasarela de pago real para planes (hoy asignación manual del
   super-admin) y self-service del admin de org (hoy el panel es solo
   super-admin).

## 8b. UX/UI (2026-07-01)

La web de Campeonatos ya tiene identidad y sistema de diseño propios:

- **Logo** (`components/Logo.tsx` + favicon `app/icon.svg`): rayo dorado sobre
  placa oscura, wordmark DINAMYT.
- **Shell de admin** (`app/admin/layout.tsx` + `components/AdminHeader.tsx`):
  header sticky con logo, navegación (Campeonatos / Juez de mesa / Pantalla),
  usuario + rol y Salir; se oculta en `/admin/login`; responsive (nav pasa a
  segunda fila en móvil).
- **Sistema de estilos** (`globals.css`): tokens (`--danger/--ok/--info/--hong/
  --chung`) y clases `.btn(-gold|-outline|-danger|-sm)`, `.card`, `.badge(-gold|
  -live|-ok|-info)`, `.msg-error/.msg-ok` — reemplazan los estilos inline.
- **Formulario compartido** `CampeonatoForm` (crear + editar, validación del core
  en cliente) y páginas responsive (grids `sm:`/`md:`/`xl:`).

## 9. Convenciones al construir

- Un incremento a la vez, con tests (Vitest/PGlite) y commit por incremento.
- **No** tocar `DINAMYT-COMBAT` ni `DINAMYT-PROJECT` (solo leer como referencia).
- Mantener el estilo visual actual en la creación; **clonar** el de COMBAT en el
  vivo. Actualizar este documento y `HANDOFF.md` a medida que se avance.
