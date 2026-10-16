---
version: 1
name: DINAMYT
description: "Ecosistema de cuatro webs para clubes de hapkido en Colombia (portal, Membresías, Campeonatos y Academy) que tienen que sentirse una sola casa. Tinta casi negra (#0e0e15) con un modo claro completo, un oro de marca que son tres (letra, titular y relleno), un verde de acción con letra blanca, y la franja de cinturones como firma. Titulares en Archivo ExtraBold ancha y en mayúsculas; cuerpo en Instrument Sans; etiquetas, cifras y códigos en IBM Plex Mono. Deportivo, directo y sin adornos: se refina lo que hay, no se rediseña."

colors:
  # Oscuro (por defecto). El claro está en «Colores».
  canvas: "#0e0e15"
  surface-card: "#15151f"
  surface-elevated: "#1d1d2a"
  surface-input: "#0a0a11"
  bar: "rgba(14, 14, 21, 0.86)"
  border: "#262635"
  border-strong: "#3a3a4e"
  border-field: "#666579"
  ink: "#f3f1e8"
  ink-muted: "#a19db8"
  gold: "#f0b800"
  gold-large: "#f0b800"
  gold-fill: "#f0b800"
  gold-dim: "#c99a00"
  action: "#00875a"
  on-action: "#ffffff"
  action-hover: "#006b47"
  danger: "#ff5577"
  ok: "#3ecf8e"
  info: "#4d9fff"
  warn: "#ff9d2e"
  hong: "#e8002a"
  chung: "#2266ff"

typography:
  display:
    fontFamily: Archivo
    fontWeight: 800
    fontStretch: 118%
    textTransform: uppercase
    letterSpacing: -0.015em
    lineHeight: 0.98
  page-title:
    fontFamily: Archivo
    fontSize: 30px
    fontWeight: 800
    textTransform: uppercase
  body:
    fontFamily: Instrument Sans
    fontSize: 14px
    lineHeight: 1.5
  body-public:
    fontFamily: Instrument Sans
    fontSize: 16px
    lineHeight: 1.6
  eyebrow:
    fontFamily: IBM Plex Mono
    fontSize: 11.5px
    fontWeight: 500
    textTransform: uppercase
    letterSpacing: 0.22em
  micro-label:
    fontFamily: IBM Plex Mono
    fontSize: 11.2px
    fontWeight: 500
    textTransform: uppercase
    letterSpacing: 0.08em
  badge:
    fontFamily: IBM Plex Mono
    fontSize: 11px
    fontWeight: 600
    textTransform: uppercase
    letterSpacing: 0.08em
  button:
    fontFamily: Instrument Sans
    fontSize: 14px
    fontWeight: 600

rounded:
  sm: 8px
  card: 12px
  dialog: 14px
  pill: 9999px

spacing:
  card-padding: 16px
  container: 1180px
  touch-target: 44px

components:
  button-action:
    backgroundColor: "{colors.action}"
    textColor: "{colors.on-action}"
    rounded: "{rounded.sm}"
    padding: 8px 16px
  button-brand:
    backgroundColor: "{colors.gold-fill}"
    textColor: "#14141e"
    rounded: "{rounded.sm}"
  button-outline:
    backgroundColor: transparent
    border: "{colors.border-strong}"
    textColor: "{colors.ink}"
  button-danger:
    backgroundColor: transparent
    border: "{colors.danger}"
    textColor: "{colors.danger}"
  card:
    backgroundColor: "{colors.surface-card}"
    border: "{colors.border}"
    rounded: "{rounded.card}"
    padding: "{spacing.card-padding}"
  text-input:
    backgroundColor: "{colors.surface-input}"
    border: "{colors.border-field}"
    rounded: "{rounded.sm}"
  badge:
    rounded: "{rounded.pill}"
    typography: "{typography.badge}"
---

# DINAMYT · el sistema de diseño

> **Esto es la regla.** Lo que dice aquí manda sobre cualquier skill de diseño,
> sobre el gusto del día y sobre lo que haga otra web. Si una pantalla necesita
> algo que esto no cubre, se decide, se escribe aquí y luego se programa. Los
> valores exactos viven en `packages/shared/estilos.css` (las cuatro webs lo
> comparten; Membresías y Campeonatos reciben una copia con
> `scripts/repartir-estilos.ps1`).

## Resumen

Cuatro aplicaciones con una sola cuenta: el **portal** (dinamyt.org: la cuenta,
el club, las organizaciones), **Membresías** (mensualidades y asistencia),
**Campeonatos** (inscripciones, llaves y el marcador en vivo) y **Academy**
(contenidos por cinturón). La gente salta de una a otra, así que la regla
número uno es que **no se note el salto**: la misma barra, los mismos botones,
las mismas tarjetas, la misma marca.

Quien la usa: maestros que llevan su club desde el celular, alumnos (muchos
menores), acudientes, jueces en el tatami y federaciones. Casi todo pasa en un
teléfono, a menudo de pie y con prisa.

El carácter es **deportivo y directo**: titulares anchos en mayúsculas, la
tinta oscura del coliseo, el oro de la marca usado con medida y la franja de
cinturones (hueso, oro, verde, azul, rojo, negro) como firma.

## Colores

Los tokens de arriba son el **tema oscuro**, que es el de por defecto. El
**tema claro** existe entero (`html[data-theme='light']`) y **no es otro
diseño: es el mismo con otra luz**. Solo cambian colores; la forma de cada
componente es la misma en los dos.

| Papel | Oscuro | Claro | Para qué |
|---|---|---|---|
| `--bg` | `#0e0e15` | `#eef0f4` | La página |
| `--bg-card` | `#15151f` | `#ffffff` | Tarjetas, diálogos, la barra |
| `--bg-elevated` | `#1d1d2a` | `#e4e7ee` | Lo que va encima de una tarjeta: el renglón activo, la cabecera de una ficha |
| `--border-campo` | `#666579` | `#828895` | Solo el borde de los campos: 3:1 contra todo lo que lo rodea (WCAG 1.4.11) |
| `--text` / `--text-muted` | `#f3f1e8` / `#a19db8` | `#12121a` / `#565669` | Texto y texto secundario, los dos ≥4.5:1 en página y tarjeta |

**El oro son tres, y no se mezclan:**

- `--gold` es la **letra pequeña**: enlaces, `.eyebrow`, insignias. En claro es
  `#9f5e00`, porque tiene que dar 4.5:1 sobre blanco y sobre el gris de la
  página.
- `--gold-grande` es la **letra grande** (≥24 px en negrita): la palabra en oro
  de un titular (`.acento`) y la marca. En claro `#c58700` (3:1, lo que WCAG
  pide a lo grande): un oro de verdad, no marrón.
- `--gold-fill` es el **relleno**, con letra oscura encima (el botón del
  login). Vivo en los dos temas.

**El verde de acción** (`--accion #00875a`) es el botón del día a día, con
**letra blanca siempre** y en los dos temas: es el verde más vivo que aguanta
blanco encima (4.55:1). Por eso su hover **oscurece**.

**Los acentos tienen que verse vivos**, también en claro. No se oscurece un
color hasta que pase el contraste (eso le quita croma): se fija la luminosidad
que pide AA y dentro de ella se elige el color con más croma. Cada estado tiene
su `-fill` vivo para cuando es fondo (`--danger-fill`, `--ok-fill`,
`--info-fill`, `--warn-fill`).

**Hong (rojo) y Chung (azul)** son reglamento, no decoración: los lados de un
combate en las cuatro apps.

`apps/ecosystem-portal/src/lib/contraste.test.mts` mide el contraste de los
tokens en los dos temas: si alguien toca un color, lo dice antes del
despliegue.

## Tipografía

| Papel | Letra | Dónde | Regla |
|---|---|---|---|
| **Titular** (`.display`) | Archivo 800, ancho 118 %, mayúsculas, −0.015 em, interlineado 0.98 | El título de cada pantalla, los de sección, la marca | Uno por pantalla en `<h1>`; `text-wrap: balance` |
| **Antetítulo** (`.eyebrow`) | IBM Plex Mono 500, 0.72 rem, mayúsculas, +0.22 em | Encima de un titular | Tres o cuatro palabras; nunca un párrafo |
| **Nombre de un dato** (`.microetiqueta`) | IBM Plex Mono 500, 0.7 rem, mayúsculas, +0.08 em | Encima de una cifra o de un valor; cabeceras de tabla | Pesa menos que el dato que nombra |
| **Cuerpo** | Instrument Sans | Todo lo demás | 14 px en las pantallas de gestión; **16 px en lo que se lee** (la portada, `/planes`, `/privacidad`, `/ayuda`) |
| **Cifras y códigos** (`.mono`) | IBM Plex Mono con `tabular-nums` | Montos, marcadores, códigos de club, versiones | Las cifras que se comparan, siempre en columnas iguales |

**Mayúsculas solo en esos tres papeles** (titular, antetítulo, nombre de un
dato). Todo lo demás va como se escribe, y en español con **frase capital**:
«Crear campeonato», no «Crear Campeonato». Sí llevan mayúscula los nombres
propios y el vocabulario del deporte: «Juez Central», «Hong», «Chung».

**Nada que se lea baja de 11 px.** Las etiquetas en mono (antetítulo, dato,
insignia) viven entre 11 y 12 px; el resto del texto, desde 12. «ECOSISTEMA»
debajo de la marca también.

**Los nombres de personas y clubes van tal como están guardados** (Membresías
los guarda en mayúsculas desde la migración 0011).

## Layout

- **Contenedor de 1180 px** con márgenes de 16 px en el celular. Las
  pantallas de una sola tarea (un formulario, el perfil) pueden ir más
  estrechas, a ~640 px; **las que tienen tarjetas independientes pasan a dos
  columnas desde 1024 px** en vez de dejar dos tercios de la pantalla vacíos.
- **La barra de arriba** (`.navbar`) es la misma en las cuatro: marca a la
  izquierda, los enlaces del día a día en el medio (desde 860 px), la campana y
  el chip de la cuenta a la derecha, y el resto en el panel del chip.
- **El pie** (`.pie`) es el mismo en las cuatro: quién es y dónde pedir ayuda;
  debajo, de quién es, la línea de IA y la versión. En las pantallas sin
  sesión lleva además **el tema y el idioma**, a la vista (ver «Componentes»).
- **Cada pantalla tiene salida**: «← Volver» o el chip de la cuenta. Ninguna es
  un callejón.

## Profundidad

- En **oscuro**, las superficies se separan por un escalón de tono
  (`--bg` → `--bg-card` → `--bg-elevated`) y un borde suave.
- En **claro**, las tarjetas se separan con **sombra** tenue y azulada, no con
  borde luminoso.
- Las sombras fuertes son solo para **lo que flota**: el panel del menú, los
  desplegables, los diálogos.
- La barra es translúcida con desenfoque, y tiene fondo opaco de respaldo.

## Formas

- Radios: **8 px** en botones y campos, **12 px** en tarjetas, **14 px** en
  diálogos, **pastilla** en insignias y en el chip de la cuenta.
- **La franja de cinturones** (`.cinturon`, 4 px, seis colores) es la firma:
  bajo la portada, en el login, y donde haga falta decir «esto es DINAMYT» sin
  palabras. Tiene su versión para claro (el hueso pasa a gris).
- **Los íconos son SVG propios**, de trazo, del color de la letra
  (`currentColor`). **No se usan emoji como íconos**: cada sistema los dibuja
  distinto y no siguen el tema.

## Componentes

**Botones** (`.btn` + variante). Tres gramáticas y ninguna más:

| Variante | Cuándo |
|---|---|
| `.btn-gold` (verde de acción, letra blanca) | La acción del día a día: guardar, cobrar, inscribir. Una por zona |
| `.btn-cta` (oro con letra oscura) | Solo la marca: «Entrar» del login y las portadas |
| `.btn-outline` | Lo secundario: cancelar, ver, filtrar |
| `.btn-danger` (contorno rojo, en los dos temas) | Lo que borra o corta: siempre pide confirmación antes |

`.btn-sm` es el pequeño (~26 px). En pantallas táctiles todo lo demás mide al
menos **44 px** (`@media (pointer: coarse)`). **El botón de enviar está activo
hasta que empieza la petición**; si falta algo, el error sale junto al campo y
el foco va al primero que falla.

**Tarjetas** (`.card`): fondo, borde, radio 12 y relleno 16 incluido. Una
tarjeta que es un enlace se levanta al pasar el ratón (solo con ratón:
`@media (hover: hover)`).

**Campos**: fondo `--bg-input`, borde `--border-campo`, radio 8. **Cada campo
tiene una etiqueta unida** (`<label htmlFor>` o envolvente; `<Campo>` en el
portal), con `name` y `autocomplete` (los datos de quien escribe: `tel`,
`email`, `url`…; las fichas de OTRA persona: `off`). El correo, con
`type="email"`, sin corrector ni mayúscula automática.

**Avisos**: los de un campo, debajo del campo y con `aria-live`. Los de una
acción («Guardado», el error de guardar), con `role="status"` o `role="alert"`
(`<Mensaje>` en el portal) para que también los oiga quien no ve la pantalla.

**Insignias** (`.badge`): pastilla, mono en mayúsculas, el color por el estado
(`-ok`, `-gold`, `-danger`, `-info`, `-warn`).

**El «¿seguro?»** (`Confirmar.tsx`): tapa la pantalla, «Cancelar» primero en
el orden del teclado y abajo en el celular; lo irreversible lleva borde rojo y
lo dice con todas las letras.

**Tema e idioma sin sesión**: en el pie, dos selectores a la vista («Oscuro |
Claro», «Español | English»). Con sesión, en el panel del chip de la cuenta.
Nada de botones flotantes encima del contenido.

**La espera** (`.cargando`): el escudo latiendo y una línea que dice QUÉ se
espera («Cargando tu perfil…»), con alto reservado.

## Qué sí y qué no

**Sí**

- Escribir cada pantalla una vez y que se vea bien en los dos temas: los
  colores salen de los tokens.
- Los colores en clases (`.muted`, o las de Tailwind que leen los tokens:
  `text-muted`, `text-gold`), no en `style={{ color: … }}`.
- Decir qué falta en cada error, y cómo arreglarlo.
- Un vacío que se vea vacío: «Sin dato» en gris y sin negrita.
- Los plurales con el número: «1 pendiente», «5 pendientes».

**No**

- La raya larga (—) en los textos de la interfaz (lo comprueba
  `textos.test.mts`).
- Palabras en inglés donde hay una en español («Dashboard», «staff»).
- «(s)» para el plural, «Oops», signos de exclamación en un «guardado».
- Jerga de programador en pantalla (`token`, `role_*`, nombres de tablas).
- Imágenes de relleno, fotos de banco, cristal, grano o degradados de adorno.
- Un estilo de CSS sin capa en la hoja compartida sin decir por qué: lo no
  capado gana a todo `@layer components` (así se rompieron dos veces los
  botones).

## Responsive

| Ancho | Qué cambia |
|---|---|
| < 640 px | Una columna; el pie se apila centrado; las tablas pasan a fichas |
| ≥ 640 px | El pie en dos extremos; formularios a dos columnas donde quepa |
| ≥ 860 px | La barra muestra los enlaces del día a día y el nombre en el chip |
| ≥ 1024 px | Las tarjetas independientes a dos columnas |
| ≥ 1180 px | El contenedor deja de crecer |

Alturas de pantalla completa con `100dvh` (en el celular `100vh` cuenta la
barra del navegador). `prefers-reduced-motion` apaga las animaciones en las
cuatro webs.

## El tatami es otro registro

El marcador del tatami, la pantalla pública y sus alertas a pantalla completa
se proyectan en una pared y se leen a diez metros, con prisa: **van en
mayúsculas, enormes y medidos al píxel**. No llevan el tratamiento del resto, y
ningún cambio general se aplica ahí sin mirarlo en esa pantalla.

## Cómo se comprueba

- El contraste: `pnpm --filter @dinamyt/ecosystem-portal test`
  (`contraste.test.mts`, `textos.test.mts`).
- Que las cuatro webs llevan los mismos estilos:
  `scripts/repartir-estilos.ps1 -Comprobar`.
- Cómo se ve: `node auditoria/herramientas/capturar.mjs <app> despues` y
  comparar con las de «antes» (`auditoria/ESTADO.md`).
