# Diseño · auditoría 003 · estilos compartidos y portal · 16 oct 2026

> **Informe con fecha, no lista viva.** Lo que se elija corregir se sigue en
> `auditoria/ESTADO.md`; este archivo no se actualiza.

Skill `redesign-existing-projects` (pasos «Scan» y «Diagnose», sin tocar
código) y, en la portada y `/planes`, el inspector de `design-taste-frontend`
(`inspect.mjs` a 1440, 768 y 390 px). Mirado sobre las 80 capturas «antes» del
portal (`auditoria/capturas/portal/antes/`, celular y escritorio, oscuro y
claro, con cada rol) y su código. **Refinar, no rediseñar** (decisión del 16
oct): nada de lo que sigue cambia los colores, las tres tipografías ni el oro.
Prioridad: **MEDIA** cuando se ve roto o confunde a quien lo usa; **BAJA**
cuando es pulido.

**Scan.** Next.js 16 y React 19; Tailwind 4 (`@import "tailwindcss"`) más
`packages/shared/estilos.css` en `@layer components`; fuentes con `next/font`
(Archivo 800, Instrument Sans, IBM Plex Mono 400–600). Radios variados (tarjeta
0.75 rem, botón y campo 0.5, diálogo 0.9), tema oscuro y claro completos.

## Hallazgos

| # | Prioridad | Dónde | Qué | Por qué |
|---|---|---|---|---|
| 1 | MEDIA | `.pubctl` (estilos compartidos: las cuatro webs) | En el celular, el botón flotante 🌐 de tema e idioma tapa contenido: el borde del campo «Teléfono» del registro, el lado de una tarjeta de `/planes`, la última letra de «4 jueces + central» en la portada | Está fijo abajo a la derecha, y en un teléfono de 390 px todo lo que pasa por debajo queda tapado: el texto de la derecha, los bordes de las tarjetas. En las pantallas sin sesión sale siempre |
| 2 | MEDIA | `mi-organizacion`, `admin` | Los títulos de pantalla tienen dos gramáticas: «MI PERFIL», «CONFIGURACIÓN», «MI CLUB» y «PLANES» van en titular (Archivo, mayúsculas, blanco); «Mi club» (el del maestro) y «Administración del ecosistema» van en oro, en minúscula y en otra letra | El mismo nivel de la jerarquía se ve de dos maneras según la pantalla |
| 3 | MEDIA | `src/app/` | No hay `not-found.tsx`, `error.tsx` ni `global-error.tsx` | Una dirección que no existe o un fallo enseñan la pantalla blanca de Next, en inglés y sin salida. Membresías ya tiene las tres |
| 4 | MEDIA | portada, `/planes`, `/privacidad` | El texto corrido de las páginas públicas va a 14 px (inspector: `body-size`). La política de privacidad es una página larga de texto legal a 14 px en una columna estrecha | Para leer, 16 px. Las pantallas de gestión pueden seguir a 14 |
| 5 | MEDIA | portada, barra | Letra demasiado pequeña: 21 bloques de menos de 13 px en la portada (las etiquetas de las cifras, «tatamis a la vez», a 11 px) y «ECOSISTEMA» debajo de la marca a **8,3 px** (`.marca-app` es 0.46 em de 1.125 rem) | Lo que se lee no baja de 12 px; a 8 px en una pantalla normal es una raya gris |
| 6 | MEDIA | todo el portal | 512 estilos en línea, y 274 de ellos son el mismo `style={{ color: 'var(--text-muted)' }}` (ya existe `.muted`) | Es la vía por la que el tema claro se rompió antes (la barra negra, los botones con letra negra). Con los tokens en el `@theme` de Tailwind 4 queda `text-muted`, `text-gold`, `border-line`; no cambia nada a la vista, pero cada arreglo de diseño de la fase 3 se hace en un sitio y no en doscientos |
| 7 | BAJA | panel, perfil, configuración, mi club | En escritorio casi todo es una columna de ~600 px en medio de 1440 | Las tarjetas que no dependen una de otra («Cómo veo DINAMYT» y «Tu hora»; «Tus aplicaciones» y «Mi organización») caben en dos columnas desde ~1024 px. Los formularios largos se quedan en una |
| 8 | BAJA | `/planes` | El tercer plan queda solo en una fila de dos columnas, y repite las diez líneas de los otros dos | Tres columnas en escritorio (o el combinado a lo ancho y destacado), y «Todo lo de los dos planes» en vez de repetir la lista |
| 9 | BAJA | `/planes` | Sin barra ni logo arriba, solo «← Inicio» | Quien llega por un enlace no ve de quién es la página; la portada sí tiene barra |
| 10 | BAJA | escudos sin logo | Todos los clubes que empiezan por «Club» salen con «CL» («Club Heredero Prueba», «Club Membresías Demo») | Las iniciales salen de la palabra «Club». Saltar Club, Escuela, Academia, Liga y Federación: «HP», «MD» |
| 11 | BAJA | «Mi club» | «Por definir» y «Sin dato» van en negrita, igual que un dato de verdad | El vacío tiene que verse vacío: en gris y sin negrita |
| 12 | BAJA | perfil | «5 PENDIENTE(S)» (y «2 PENDIENTE(S)» en Campeonatos) | Se escribe con el número: «5 pendientes», «1 pendiente» |
| 13 | BAJA | pie, ficha del miembro | Palabras en inglés: «DINAMYT Ecosystem · Hapkido» en el pie (la barra dice «ECOSISTEMA»), «Edición del staff» en la ficha de un competidor | Junto al «← Dashboard» de la auditoría 001 (nº 12) |
| 14 | BAJA | `/admin` | En el celular dice «Selecciona una organización a la izquierda», y la lista está arriba. Y «el rol viaja en su token como `role_campeonatos`» | Lo primero es falso en el teléfono; lo segundo es jerga de programador en pantalla |
| 15 | BAJA | «Actualizar contraseña», «Enviar invitación» | El botón de enviar está apagado antes de escribir | No dice por qué no se puede pulsar. La guía pide el botón activo hasta que empiece la petición, y el error junto al campo que falta |
| 16 | BAJA | `.btn-danger` en claro | «Borrar mi cuenta» es contorno rojo en oscuro y botón relleno en claro | `estilos.css` dice que el modo claro «no es otro diseño»; aquí cambia la forma, no solo la luz |
| 17 | BAJA | `layout.tsx` | La vista previa al compartir (`og:image`) es el ícono cuadrado de 512 | En WhatsApp sale solo el escudo. Una imagen de 1200 × 630 con el titular; y la misma idea para cada video de `/ayuda`, que se compartirán por ahí |
| 18 | BAJA | barra | No hay «Saltar al contenido» | Con teclado, cada pantalla obliga a pasar por la barra entera |
| 19 | BAJA | `/login` en escritorio | Una tarjeta de 380 px sola en 1440 px, sin nada de la marca alrededor | La franja de cinturones, que es la firma, cabe encima de la tarjeta; no hace falta más |
| 20 | BAJA | portada | El titular (60 px, 4,2 vw) pesa lo mismo que el marcador de al lado (inspector: `focal-point`) | Subirlo a ~5,5 vw en escritorio le da un punto de partida a la mirada |

## Lo que el inspector marca y se defiende

`design-taste-frontend` está hecha para páginas de marketing con su propio
estilo de casa, y una parte choca con la marca a propósito:

- **El titular en tres líneas** («SE ACABÓ / EL CUADERNO / DEL CLUB.») es la
  composición, no un titular que no cabe.
- **La sombra del marcador**: es una maqueta que flota sobre la página.
- **El blanco hueso `#f3f1e8`** es el primero de la franja de cinturones.
- **Las tres tipografías, las etiquetas en mono y las mayúsculas** son la
  marca (`.eyebrow`, `.microetiqueta`); van con `--allow`.
- **Sin fotografías**: no hay fotos reales del club todavía, y la regla es no
  inventarlas. Cuando existan (o los videos), la portada las pide.
- **Los emoji** (✓ 🌐 ✉) ya están en la auditoría 001, nº 13.

## Lo que pasa

Foco visible en todo, la página actual marcada en la barra, `:hover` y
`:active` en los botones, la espera con el escudo latiendo, estados vacíos
escritos («Aún no tienes disciplinas registradas», «Todavía no hay ningún pago
registrado»), contenedor con ancho máximo, datos de ejemplo verosímiles, sin
frases de relleno, favicon, «← Volver» en cada pantalla y la política enlazada
en el pie (los Términos esperan al abogado: 001, nº 6).
