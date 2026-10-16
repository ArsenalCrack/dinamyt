# Campaña de diseño · dónde voy

> **Archivo de trabajo, no documentación.** Dice qué está hecho, qué falta y
> cuál es el siguiente paso de la campaña de diseño de las cuatro webs
> (`HOJA-DE-RUTA.md` §0.4). Al cerrar un paso se cambia su celda y la línea
> «Siguiente paso»; nada de diario. Cuando la campaña termine, este archivo se
> borra: lo que deja como regla vive en `DESIGN.md`, y los informes numerados
> de esta carpeta se quedan como foto con fecha.

## Siguiente paso

**Fase 1, auditar Membresías** con las tres skills (antislop en modo «after»,
`web-design-guidelines`, `redesign-existing-projects`), en su repositorio
`dinamyt-membresias`, sobre sus 36 capturas. Después Campeonatos (ya se sabe
que bloquea el zoom: 002, «Visto de paso») y Academy. El portal y los estilos
compartidos ya están (001, 002, 003); sus números los elige el dueño al cerrar
la fase 1, o antes si quiere.

## Cómo retomar en una sesión nueva

1. Leer este archivo entero: la tabla dice qué app y qué paso tocan.
2. Antes de leer código a mano, preguntar al grafo (`graphify query`,
   `affected`, `explain`; memoria «Graphify»). Tras cambios grandes,
   `graphify update .`
3. Levantar lo que pida el paso con `preview_start` y los nombres de
   `.claude/launch.json` (tabla «Las pantallas»). Caben cinco servidores a la
   vez: `ecosystem-api` y `ecosystem-portal` siempre (son la identidad) y una
   app más cada vez. `node` y `pnpm`, desde PowerShell: en Git Bash `pnpm` no
   encuentra `node`.
4. Al terminar un paso: su celda y «Siguiente paso». Si deja una regla, va a
   `DESIGN.md` (o a `OPERAR.md` si es de operación), no aquí.

## Lo que decidió el dueño (15 oct 2026)

- **Refinar, no rediseñar.** Se quedan los colores, las tres tipografías
  (Archivo, Instrument Sans, IBM Plex Mono), el oro y lo ya decidido en
  `packages/shared/estilos.css`. Se pule lo que hay.
- **El orden:** auditar todo → escribir `DESIGN.md` → corregir app por app.
- **Una sola Membresías:** la de producción, `dinamyt-membresias` en `main`. La
  rama `standalone` se borró el 15 oct (no tenía nada que `main` no tuviera).
- **Las traducciones no se mezclan con el diseño**, para que cada rama que
  revisa thermos sea pequeña. Todo texto que se escriba nuevo entra ya al
  diccionario (`lib/i18n.tsx`). Al final de la campaña va la tarea 7 de la hoja
  de ruta entera: con «English» no queda nada en español.
- **Videos instructivos:** página pública `dinamyt.org/ayuda` en el portal, con
  enlaces desde cada pantalla; MP4 en la VPS, en un subdominio que no pase por
  Cloudflare; el proyecto de los videos en su propio repositorio privado. Se
  construye después del pase de diseño del portal.

## Qué skill va en cada paso

| Paso | Skill | Qué deja |
|---|---|---|
| Capturas | `playwright-cli`, con el Chrome instalado (`open --browser=chrome`) | `capturas/<app>/antes/` y `despues/` (fuera de git) |
| Texto y UI | `antislop`, modo «after» | `NNN-<app>-antislop.md` |
| Guías web | `web-design-guidelines` (baja sus reglas de GitHub cada vez) | `NNN-<app>-guias.md`, en formato `archivo:línea` |
| Diseño | `redesign-existing-projects` para las pantallas de la app; `design-taste-frontend` solo para la portada, `/planes` y `/ayuda`, con `--keep palette,type` | `NNN-<app>-diseno.md` |
| El sistema | El formato de `VoltAgent/awesome-design-md`, con lo nuestro | `DESIGN.md` en la raíz |
| Corregir | `redesign-existing-projects`, siempre dentro de `DESIGN.md` | Una rama por app |
| Revisar el código | `thermos`: **la lanza el dueño**, con la línea que se le da: `/thermos revisa la rama X de los repos … contra main` | Lo de «antes de fusionar», hecho; lo demás, a la hoja de ruta §0.5 |
| Verificar | `playwright-cli` | Capturas «después», comparadas con las de «antes» |

**Choques ya vistos.** `design-taste-frontend` prohíbe la monoespaciada fuera
del código, las etiquetas pequeñas en mayúsculas espaciadas, los filetes de 1px
y más de dos tipografías: las cuatro cosas son de la marca. Manda `DESIGN.md`, y
en su inspector esas reglas van con `--allow`. Tampoco se toman de
`redesign-existing-projects` el cambio de tipografía, las imágenes de relleno
(`picsum`), el cristal ni el grano: van contra «refinar».

## Estado por app

`—` sin empezar · `◐` en curso · `✓` hecho (con el número del informe)

| Pieza | Capturas antes | antislop | Guías | Diseño | Correcciones | thermos | Capturas después | Desplegado |
|---|---|---|---|---|---|---|---|---|
| Estilos compartidos (`packages/shared/estilos.css`, las cuatro webs) | ✓ (son las de las webs) | (dentro de la 001) | ✓ 002 | ✓ 003 | — | — | — | — |
| Portal | ✓ 80 | ✓ 001 (bajas 11–17 sin hacer) | ✓ 002 | ✓ 003 | — | — | — | — |
| Membresías | ✓ 36 | — | — | — | — | — | — | — |
| Campeonatos | ◐ 76 (falta el tatami en combate) | — | — | — | — | — | — | — |
| Academy (sin montar en la VPS) | ◐ 48 (faltan las tres de detalle) | — | — | — | — | — | — | no aplica |
| `/ayuda` (nueva, en el portal) | no aplica | — | — | — | — | — | — | — |

`DESIGN.md`: — (va entre la fase 1 y la 3).

## Las fases

| Fase | Qué | Hecho cuando |
|---|---|---|
| **0 · Preparar** ✓ | Skills instaladas, grafo al día, este archivo, `launch.json` ordenado y 240 capturas «antes» (16 oct). Lo que faltó, en «Huecos de las capturas» | Hecho |
| **1 · Auditar** | Las tres auditorías de cada app, sin tocar código. El dueño elige qué números se corrigen (o «altas y medias», como en la 001) | Un informe por app y skill en esta carpeta |
| **2 · `DESIGN.md`** | Lo decidido en `estilos.css` y en las notas (los tres oros, dónde van mayúsculas, el tatami aparte, el color en modo claro) más lo que salga de la fase 1. El dueño lo aprueba | `DESIGN.md` en la raíz, enlazado desde `README.md` |
| **3 · Corregir** | Primero los estilos compartidos (`repartir-estilos.ps1`), luego portal, Membresías, Campeonatos y Academy, una rama cada una: cambios → capturas «después» → thermos → fusionar → desplegar (`OPERAR.md` Parte 2; nunca durante un campeonato) | Cada fila de la tabla en ✓ |
| **4 · `/ayuda`** | La página de los videos, con el diseño ya hecho | En línea con los videos que estén listos |
| **5 · Traducir** | La tarea 7 de la hoja de ruta, entera | Con «English» no queda texto en español en pantallas, correos, avisos ni impresos |

## Las pantallas

Membresías y Campeonatos se cambian en **su** repositorio y luego se espejan
(`scripts/sync-apps.ps1`). Las cuentas de prueba están en el `README.md` de
cada repositorio y en sus semillas; no se copian aquí.

| Web | Repositorio · `launch.json` | Pantallas |
|---|---|---|
| **Portal** (16) | este · `ecosystem-api` + `ecosystem-portal` (:3000) | `/` · `/planes` · `/privacidad` · `/login` · `/registro` · `/verificar` · `/recuperar` · `/poner-contrasena` · `/salir` · `/dashboard` · `/perfil` · `/configuracion` · `/mi-club` · `/mi-organizacion` · `/mi-organizacion/miembro/[id]` · `/admin` |
| **Membresías** (10) | `dinamyt-membresias` · `membresias-api` + `membresias-web` (:3006) | `/` · `/login` · `/mi` · `/alumnos` · `/alumnos/[id]` · `/asistencia` · `/calendario` · `/estadisticas` · `/planes` · `/admin` |
| **Campeonatos** (20) | `dinamyt-combat` · `campeonatos-api` (:5000) + `campeonatos-web` (:3003) | `/` · `/acceso` · `/login` · `/campeonatos` · `/campeonatos/[id]` · `/resultados` · `/pantalla` · `/local` · `/mi-panel` · `/maestro` · `/juez` · `/tatami/[id]` · `/admin` · `/admin/competidores` · `/admin/importar-resultados` · `/admin/campeonato/[id]` y sus `inscripciones`, `llaves`, `generar-llaves`, `reportes` |
| **Academy** (14) | este · `academy-api` + `academy-web` (:3008); antes, `db:local:setup` con las APIs apagadas | `/` · `/login` · `/aprender` · `/evaluaciones` · `/evaluaciones/[id]` · `/figuras` · `/progreso` · `/notas` · `/certificados/[id]` · `/calendario` · `/tablero` · `/maestro` · `/maestro/revisar/[id]` · `/admin` |

**El tatami y la pantalla pública** (`/tatami/[id]`, `/pantalla`) son otro
registro: se leen a metros y con prisa. No llevan el tratamiento del resto.

## Cómo se sacan las capturas

Con la app levantada (y `ecosystem-api`, que da los pases):

```powershell
node auditoria/herramientas/cuentas.mjs                       # una vez: cuentas del README
node auditoria/herramientas/capturar.mjs portal antes         # o despues; y una ruta suelta al final
```

- Cada pantalla, con cada rol que la ve, en celular (390 × 844, a 2×) y en
  escritorio (1440 × 900), en oscuro y en claro: 4 capturas. El tema se fuerza
  en la página, así que da igual lo que tenga guardado la cuenta. Junto a las
  capturas queda `informe.json` con la ruta final, el código y los errores de
  la página.
- Campeonatos y Academy entran por DINAMYT (`#token=`, como el botón del
  portal); el portal y Membresías, por su formulario.
- **Membresías** tiene sus propias cuentas locales: con su API apagada,
  `node auditoria/herramientas/membresias-cuentas.mjs --poner "Dojo Peñalosa"`
  les pone una contraseña de prueba y la escribe en `cuentas.json`.
- Para mirar una pantalla de un vistazo,
  `py -3.12 auditoria/herramientas/hoja.py <app> antes <pantalla> <rol>` pone
  la de escritorio (oscuro) y la de celular (claro) lado a lado en
  `_hoja__<pantalla>__<rol>.png`.
- **Campeonatos** no traía ningún campeonato en su base local:
  `campeonatos-demo.py` siembra dos, inventados, y las capturas usan sus ids.

## Huecos de las capturas

| Dónde | Qué falta | Cómo se llena |
|---|---|---|
| Campeonatos, `/tatami/1` | Sale «desactivado»: una llave solo se activa desde el panel del juez central, en vivo | A mano en la fase 1: activar la llave del tatami 1 y fotografiar el marcador con el navegador |
| Academy, `/evaluaciones/[id]`, `/certificados/[id]`, `/maestro/revisar/[id]` | La base local no tiene evaluaciones, certificados ni entregas | Crear una evaluación y una entrega de prueba en la fase 1 (es parte del recorrido de la tarea 6.A) |
| Membresías | El club local tiene **un** alumno: las listas se ven más vacías que en un club de verdad | Dar de alta unos alumnos inventados antes de las capturas «después», para comparar con densidad real |
| Portal, `/poner-contrasena` y `/verificar` | Sin enlace válido, enseñan su estado de error | Así está bien: es lo que ve quien llega con un enlace vencido |
