# DINAMYT — Que las tres apps se sientan una sola

> **El objetivo, en una frase:** que alguien entre al portal, salte a Membresías
> o a Campeonatos y **no note que cambió de aplicación**. Mismos botones, mismos
> colores, mismos títulos en el mismo sitio, y siempre un camino de vuelta.

Hoy son tres productos que nacieron por separado y se nota: tres logins que se
ven distinto, tres paletas parecidas pero no iguales, botones con otra forma, y
—lo que más rompe la ilusión— **callejones sin salida**: entras a Campeonatos y
no hay forma de volver al portal sin escribir la dirección a mano.

Este es el bloque **B5**, y va **después de que la identidad esté en reposo**.
No antes: mover CSS mientras se mueve el login es cómo se rompen las dos cosas
a la vez.

---

## 1. La regla que hace que esto no se deshaga

> **Los colores, los tamaños y las formas se definen UNA vez y las tres apps los
> leen. Ninguna app define un color propio.**

Sin esa regla, la unificación dura hasta el siguiente cambio: alguien ajusta un
azul en una app, y las otras dos se quedan atrás para siempre.

`[ ]` **Un archivo de tokens compartido** (`packages/shared/estilos.css`):
      colores, tipografías, radios, sombras y espaciados como variables CSS
      (`--gold`, `--bg-card`, `--accion`, `--danger`, `--radio`, `--sombra`…).
      El portal ya usa esa forma de nombrar; se extiende a las otras dos.

> **Por qué CSS y no un paquete de componentes React.** Campeonatos y Membresías
> son Next, pero el frontend de Campeonatos tiene su propia historia y el modo
> local corre sin red. Un archivo de variables lo consumen los tres sin cambiar
> de arquitectura ni añadir una dependencia que haya que versionar. Los
> componentes compartidos vendrán después, si hacen falta.

`[ ]` **El logo y el favicon, uno solo**, servidos desde el mismo sitio.

---

## 2. La pantalla de entrada, idéntica en las tres

Es la primera que se ve y la que más delata que son tres productos.

| Elemento | Cómo queda en las tres |
|---|---|
| Logo arriba, centrado | Mismo tamaño y **clicable: lleva al portal** |
| Título | «Iniciar sesión», misma tipografía y posición |
| Subtítulo | «Una cuenta para todo DINAMYT» |
| Correo y contraseña | Mismos campos, mismo alto, mismo radio |
| **Ojo de la contraseña** | En las tres. La mitad de los «no puedo entrar» son una letra mal tecleada en un celular |
| Botón principal | Mismo color, mismo alto, mismo texto: «Entrar» |
| **«Entrar con DINAMYT»** | El botón que salta al portal y vuelve con la sesión hecha |
| **«¿No tienes cuenta? Regístrate»** | Lleva **al portal**, nunca a un registro propio: las cuentas nacen en el ecosistema |
| «¿Olvidaste tu contraseña?» | Lleva **al portal**. Necesita el bloque B2 (correo) |
| Mensajes de error | Mismo estilo, y **el mensaje del servidor**, no el nombre del código HTTP |

`[ ]` Membresías: ya tiene «entrar con DINAMYT»; falta el ojo, el logo clicable
      y que «Regístrate» apunte al portal.
`[ ]` Campeonatos: le falta todo lo de esta tabla.
`[ ]` Portal: ojo ✅ (20 ago). Falta la página de «olvidé mi contraseña».

---

## 3. El camino de vuelta

Una app del ecosistema **nunca es un callejón sin salida**.

`[ ]` **El logo, en cualquier pantalla, lleva al portal.** Es la convención que
      la gente ya conoce de otros sitios y no hay que explicarla.
`[ ]` **«Volver a mi ecosistema»** en el menú de usuario de las tres apps.
`[ ]` **El selector de apps** del portal (Membresías · Campeonatos · Academy)
      también dentro de cada app, para saltar sin pasar por el portal.
`[ ]` Al cerrar sesión en una app, se cierra **en el ecosistema** y se vuelve al
      portal. Hoy cada una cierra la suya y la otra sigue abierta, que es la
      forma más rápida de que alguien crea que se salió y no lo hizo.

---

## 4. Lo mismo, en el resto de las pantallas

`[ ]` **Botones**: un solo catálogo (principal, secundario, peligro, enlace) con
      el mismo alto, radio y tipografía.
`[ ]` **Tarjetas y tablas**: mismo borde, misma sombra, mismo espaciado.
`[ ]` **Avisos** (error, aviso, éxito): mismos colores y misma posición.
`[ ]` **Formularios**: etiqueta arriba, ayuda debajo, error debajo del campo.
`[ ]` **Cargando**: un solo indicador, no tres.
`[ ]` **Vacíos**: «todavía no hay nada aquí» con el mismo dibujo y tono.
`[ ]` **Móvil primero**: el 90 % entra desde el celular. Lo que no funcione con
      una mano no está terminado.

---

## 5. Cómo se comprueba que quedó

No con la sensación de que «se ve parecido»:

1. Capturas de las tres pantallas de entrada, una al lado de la otra. Si se
   distinguen por algo que no sea el nombre de la app, falta trabajo.
2. Saltar portal → Membresías → Campeonatos → portal **sin escribir una sola
   contraseña** y sin usar la barra de direcciones.
3. Hacerlo en un celular de verdad, con datos móviles.

---

## Lo que NO se toca en este bloque

- **El combate en vivo y la puntuación de Campeonatos.** Esa pantalla está hecha
  para gritar números a dos metros de distancia, no para parecerse al portal.
- **El carnet y el QR de Membresías**, que están diseñados para imprimirse.
- **El modo local de Campeonatos**: tiene que seguir arrancando sin ecosistema,
  con su propio login. Ahí el botón «entrar con DINAMYT» simplemente no aparece.
