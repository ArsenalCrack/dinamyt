# Guías web · auditoría 002 · estilos compartidos y portal · 16 oct 2026

> **Informe con fecha, no lista viva.** Lo que se elija corregir se sigue en
> `auditoria/ESTADO.md`; este archivo no se actualiza.

Skill `web-design-guidelines` (Vercel), con las reglas bajadas el 16 oct de
`vercel-labs/web-interface-guidelines` (`command.md`, 191 líneas). Revisado:
`packages/shared/estilos.css` entero (pinta las cuatro webs) y
`apps/ecosystem-portal/src` (59 archivos, ~19.000 líneas): búsquedas por regla
y un analizador de JSX para los campos y los botones, y cada hallazgo
confirmado leyendo el código. Prioridad: **MEDIA** cuando alguien no puede usar
algo (teclado, lector de pantalla); **BAJA** cuando es pulido o rendimiento. No
salió ninguna ALTA.

**Tres reglas de la guía no se aplican tal cual**, porque son de un sitio en
inglés: los títulos no van en «Title Case» (en español van como se escriben, y
aquí los titulares van en mayúsculas por `DESIGN.md`); las comillas son «» y no
“”; y «segunda persona» ya es el tuteo de toda la app.

## Hallazgos

| # | Prioridad | Dónde | Qué | Por qué |
|---|---|---|---|---|
| 1 | MEDIA | 7 campos | Campos con solo placeholder o con la etiqueta sin unir: el correo de invitación (`admin/page.tsx:835`), «Buscar club» (`admin/page.tsx:1399`, `mi-organizacion/page.tsx:666`), la ciudad escrita a mano (`PaisCiudad.tsx:80`: «Ciudad» es un `<span>`), el correo de `/verificar` sin registro (`verificar/page.tsx:207`: `<Campo>` sin `htmlFor` y el campo sin `id`) y los dos «Repítela» (`poner-contrasena/page.tsx:120`, `recuperar/page.tsx:210`) | Un lector de pantalla dice «campo de texto» y nada más; y el placeholder se borra al escribir |
| 2 | MEDIA | 9 archivos | Los avisos que salen después de una acción («Guardado», el error) se pintan sin `role="status"`/`role="alert"`: `perfil/page.tsx:668`, `miembro/[id]/page.tsx:467`, `mi-club/page.tsx:147,282`, `Apariencia.tsx:223`, `CodigoYSolicitudes.tsx:686`, `EntrarAClub.tsx:148`, `PanelRecaudo.tsx:601`, y los errores de `poner-contrasena` y `recuperar` | Quien no ve la pantalla pulsa «Guardar» y no se entera de si se guardó. `<Campo>` ya lo hace bien con los errores de cada campo; falta el aviso general |
| 3 | MEDIA | `CampanaOrg.tsx:348` | El botón «✕» que cierra los avisos del club no tiene nombre | El lector lo anuncia como «multiplicación» o no dice nada |
| 4 | BAJA | `estilos.css:554,587,606` | `transition: var(--transition, all 0.15s ease)` en el globo de tema e idioma: `--transition` no existe en ninguna de las cuatro webs, así que queda `transition: all` | Anima todo lo que cambie, también lo que no debe. Basta con nombrar `opacity`, `border-color`, `background` y `color` |
| 5 | BAJA | `estilos.css:808`, `globals.css:367` | El «¿seguro?» (`.confirmar-caja`) y el desplegable (`.selectmenu-panel`) se desplazan por dentro sin `overscroll-behavior: contain` | En el celular, al llegar al final de la lista, se mueve la página de detrás |
| 6 | BAJA | `estilos.css:491` | `.display` (todos los titulares) sin `text-wrap: balance` | Un titular que parte en dos líneas deja una palabra sola abajo |
| 7 | BAJA | `estilos.css:418` | Ni `touch-action: manipulation` ni `-webkit-tap-highlight-color` | En Android, cada toque deja un destello gris encima del botón |
| 8 | BAJA | `estilos.css:1078,1102,1183` | Los `:hover` de `.btn`, `.btn-outline` y `a.card` no van dentro de `@media (hover: hover)` | En el celular, después de tocar, la tarjeta se queda levantada y el botón de contorno dorado hasta que tocas otra cosa |
| 9 | BAJA | `estilos.css:423,1245` | `min-height: 100vh` en `body` y en `.eco-login` | En el celular `100vh` cuenta la barra del navegador: el login queda más alto que la pantalla y salta al desplazarse. Es `100dvh` |
| 10 | BAJA | `estilos.css:1422` | Las tres rayas del menú animan `top` | Solo `transform` y `opacity` van por la tarjeta gráfica; `top` recalcula la página |
| 11 | BAJA | `perfil/page.tsx:396` | La barra de «perfil completo» con `transition-all` (anima el ancho) | Lo mismo que el 4 y el 10, en un solo sitio |
| 12 | BAJA | `page.tsx:367` | Las pestañas de la portada (Membresías, Campeonatos, Academy) tienen `role="tab"` pero no responden a ← → | El patrón de pestañas que anuncian promete flechas; con Tab se llega igual, pero no es lo que dice |
| 13 | BAJA | `mi-club`, `mi-organizacion`, `miembro/[id]`, `perfil`, `registro:366` | Ningún campo de datos lleva `name`, y casi ninguno `autocomplete`: teléfono, sitio web, ciudad, documento | El celular no ofrece autocompletar tu teléfono; y en las fichas de OTRA persona hace falta lo contrario, `autocomplete="off"`, para que el gestor de contraseñas no meta tus datos |
| 14 | BAJA | todo el portal | `translate="no"` no se usa en ningún sitio | El traductor de Chrome convierte «DINAMYT» y los términos de hapkido (Kyong Go, Gam Jeum, Hong, Chung) en otra cosa |
| 15 | BAJA | `mi-organizacion/page.tsx:666` | La búsqueda de clubes no busca con Enter (la de `/admin` sí) | Dentro de un `<form>`, Enter busca y el teclado del celular muestra «Buscar» |

## Lo que pasa

- El anillo de foco (`:focus-visible`, oro, 2 px) es global y gana a todo; los
  campos lo sustituyen con borde y halo.
- El correo usa `type="email"`, el teclado de correo, sin corrector ni
  mayúscula (`PROPS_CORREO`); el código, `one-time-code` en la primera casilla
  y pegar reparte las seis cifras.
- Los diálogos llevan `role="dialog"`/`alertdialog`, `aria-modal` y se cierran
  con Escape; las acciones destructivas preguntan antes (`confirmarYHacer`).
- `color-scheme` en los dos temas, `theme-color` igual al fondo, `<select>`
  con fondo y color explícitos, fuentes con `next/font` (precarga y `swap`).
- Fechas con `Intl.DateTimeFormat` y el idioma de la persona; las cifras con
  `tabular-nums`; «Cargando…» con su `…`.
- El zoom no está bloqueado y el portal apaga las animaciones con «reducir
  movimiento» (`globals.css:157`).
- Las imágenes llevan `alt`; los escudos tienen tamaño por CSS, así que no
  empujan la página al cargar.
- Sin `viewport-fit=cover`, el portal no necesita `safe-area-inset`.

## Visto de paso, para las auditorías que siguen

- **Campeonatos bloquea el zoom**: su `<meta name="viewport">` lleva
  `maximum-scale=1.0, user-scalable=no` (`dinamyt-combat/frontend/src/app/layout.tsx:71`),
  que es justo lo que la guía y WCAG 1.4.4 prohíben, y `viewport-fit=cover` sin
  ningún `safe-area-inset`. Y su `globals.css` no responde a «reducir
  movimiento», así que las animaciones del CSS compartido le llegan siempre.
- Membresías y Academy sí tienen su regla de «reducir movimiento».
