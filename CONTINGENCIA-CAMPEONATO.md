# DINAMYT — Que el campeonato salga aunque se caiga todo

> **La pregunta que responde este documento:** se cae el VPS, o se va el
> internet, o se va la luz, en pleno campeonato del 9, 10 y 11 de octubre.
> ¿Cómo sigo puntuando combates?

**La respuesta corta: el campeonato no se corre desde internet.** Se corre desde
un PC en el polideportivo, con su propia base de datos, y los celulares de los
jueces se conectan a ese PC por un router que **no necesita internet**. El VPS
es donde los maestros inscriben antes y donde el público ve los resultados
después. Durante el evento, el VPS puede estar apagado y a nadie le importa.

Eso ya está construido (`PLAN-SINCRONIZACION-LOCAL-ONLINE.md` de Campeonatos).
Lo que hace falta es **haberse traído los datos antes**, y eso es lo que
organiza este documento.

> ## ⛔ No se puede empezar en la VPS y pasarse a local a mitad
>
> Es la pregunta que surge sola —«si se va el internet en pleno campeonato, me
> muevo al local y sigo»— y **la respuesta es no**. Tres razones, y la tercera
> lo cierra:
>
> 1. **El paquete no lleva los combates.** `exportar_campeonato()` exporta
>    campeonato, tatamis, usuarios, asignaciones, competidores, inscripciones y
>    llaves. `combates` y `eventos_combate` **no están**: te llevarías las
>    llaves como estaban, sin nada de lo peleado desde entonces.
> 2. **El estado vivo del tatami es un JSON en el servidor**
>    (`_persistir_estados()`, en `sockets/combate_ns.py`) — fuera de la base y
>    fuera del paquete. El marcador en curso, el combate actual, el reloj y las
>    propuestas de los jueces pendientes de mesa no viajan.
> 3. **Sin internet no puedes ni exportar.** La exportación es una llamada HTTP
>    **a la VPS**. El mecanismo que te rescataría necesita justo lo que acaba de
>    fallar.
>
> Por eso el evento **corre en local desde el minuto uno**. No es una precaución
> exagerada: es la única configuración que sobrevive. **El local no es el plan B,
> es el plan A.**

---

## Qué pasa si se cae cada cosa

| Se cae… | Durante el evento | Qué haces |
|---|---|---|
| **El internet del polideportivo** | Nada. La red del evento es un router local sin internet | Nada |
| **El VPS entero** | Nada, si ya importaste el paquete | Nada. Publicas los resultados cuando vuelva |
| **La luz** | Se apaga el PC y el router | UPS y portátil con batería (§1.4). Al volver, la base está donde estaba: se respalda sola cada 10 minutos |
| **El PC del evento** | Ahí sí para el evento | Segundo portátil con la misma copia y el respaldo de `instance/` (§1.5) |
| **El router** | Los celulares pierden la conexión | Router de repuesto, o el hotspot del celular como parche para 8 dispositivos |
| **Te olvidaste de exportar el paquete y el VPS está caído** | **No hay evento** | Nada. Por eso §1.2 se hace tres veces |

> Lee otra vez la última fila. **Es el único fallo que no tiene marcha atrás**, y
> es el único que depende de que alguien se acuerde.

---

# 1 · ANTES (lo que decide si el día 9 hay campeonato)

## 1.1 · Una semana antes (D-7): el simulacro

No es opcional y no se puede improvisar. **Un plan de contingencia que no se ha
ensayado no es un plan, es una intención.**

1. Exporta el paquete del campeonato (§1.2) aunque las inscripciones no estén
   completas.
2. Llévalo al PC del evento e impórtalo.
3. **Desconecta el PC de internet** (quita el cable, apaga el WiFi).
4. Levanta el DINAMYT local (`2-INICIAR.bat`).
5. Con dos celulares conectados al router: entra como juez con el QR de un
   tatami, **corre una llave entera** y mira que los resultados salgan.
6. Apaga el PC de golpe (sí, del botón) y vuelve a encenderlo. Comprueba que la
   base sigue ahí.

✅ Si esos seis pasos salen, el resto de este documento es papeleo. Si alguno
falla, tienes dos semanas para arreglarlo — que es justo para lo que sirve el
simulacro.

## 1.2 · Bajarse el paquete: la víspera, y otra vez esa mañana

```powershell
.\scripts\paquete-campeonato.ps1 -Campeonato 12 -Usb E:\dinamyt
```

Pide el correo y la contraseña del administrador, descarga el paquete completo
—maestros, jueces, competidores, inscripciones, tatamis, asignaciones y
llaves—, comprueba que el archivo se lee y deja una copia en la memoria USB.

**Hazlo tres veces:** D-2, la víspera por la noche y la mañana del evento antes
de salir de casa. Cada copia queda con su fecha; la más nueva manda, y las
viejas son la red por si la última salió a medias.

> **¿Y si prefiero el botón?** Es lo mismo: en el online, campeonato →
> **«⬆️ Exportar campeonato»**, marcando las tres casillas. El guion existe
> para poder repetirlo sin pensar.

## 1.3 · Importar en el PC del evento

1. En el LOCAL: `/admin` → pestaña **Campeonatos** → **«⬇️ Importar campeonato»**.
2. Elige el archivo → **«Analizar archivo»**. Sale exactamente lo que va a pasar
   (cuántos nuevos, cuántos actualizados, cuántos omitidos): es el mismo código
   de la importación real, ejecutado y revertido.
3. Si cuadra → **«✓ Confirmar e importar»**. Se escribe todo de golpe.

Dos cosas que verás y son normales:

- **«N usuarios se crearon SIN contraseña».** Las contraseñas no viajan, a
  propósito. Los jueces entran con el **QR de su tatami**, que no pide clave.
- **Nada se duplica al repetir la importación.** El emparejamiento entre las dos
  instalaciones se hace por `uid`, no por el número de fila: puedes importar el
  paquete de la mañana encima del de la víspera y solo se actualiza lo que
  cambió.

## 1.4 · La lista de la compra

| Qué | Por qué |
|---|---|
| **Router WiFi propio** (no el hotspot de Windows) | Windows corta a 8 dispositivos y la antena del PC no da abasto siendo router y servidor a la vez |
| **Cable Ethernet** PC ↔ router | Más estable que el WiFi para el que sirve a todos |
| **IP fija del PC en el router** (reserva DHCP) | Si la IP cambia a media mañana, los 30 celulares pierden el servidor |
| **UPS** para el PC y el router | Es lo que convierte un corte de luz en un parpadeo |
| **Portátil de respaldo**, apagado, con la copia | §1.5 |
| **Dos memorias USB** con el paquete | Una se pierde |
| **El paquete también en el celular** (correo o WhatsApp a ti mismo) | La tercera copia siempre es la que salva |

## 1.5 · El segundo portátil

Apagado, con el DINAMYT local ya instalado y **una copia de la carpeta
`backend/instance/`** del PC principal. Solo uno encendido a la vez: dos
servidores en la misma red son dos verdades distintas.

## 1.6 · Cuatro cosas que hay que dejar listas y probadas

`[ ]` **La contraseña del admin del LOCAL.** Cámbiala en `backend/.env` (viene
      con `admin@dinamyt.com` / `Dinamyt2026*` de fábrica) y **entra con ella**
      antes del evento. Los usuarios importados llegan sin contraseña: si la del
      admin local tampoco funciona, no entras a tu propio evento.

`[ ]` **El respaldo automático encendido.** `RESPALDO_MINUTOS=10` en el `.env`
      del local: copia la base cada diez minutos a `instance/respaldos/` y
      conserva las últimas 20. Compruébalo mirando que la carpeta se llena.

`[ ]` **El firewall abierto** en el PC del evento (`abrir-firewall.bat`), o los
      celulares no llegan al servidor.

`[ ]` **Si para octubre ya está el SSO** (bloques C1–C7): el local tiene que
      arrancar con `ECOSYSTEM_JWKS_URL` **vacía** y caer a su login propio.
      Pruébalo desconectado de internet. Sin eso, el día del campeonato la app
      le pediría permiso a un servidor que no puede alcanzar — y esa es
      exactamente la razón por la que el plan maestro dice que el modo local no
      se toca.

---

# 2 · EL DÍA

## 2.1 · Encender, en este orden

1. Router.
2. PC por cable, con la IP reservada. Anótala grande en un papel: `192.168.0.30`.
3. `2-INICIAR.bat`.
4. Desde un celular: `http://192.168.0.30:3000`. Si abre, el evento está montado.

## 2.2 · Los jueces

Entran con el **QR de su tatami**. No hay contraseñas que repartir, no hay
correos que verificar, no hay nada que dependa de internet.

## 2.3 · Cada descanso, treinta segundos

Copia `backend/instance/` a la memoria USB. Es la diferencia entre perder media
hora y perder el campeonato.

## 2.4 · Si el PC muere

1. Enciende el portátil de respaldo.
2. Copia en él la carpeta `instance/` de la última copia (la del USB).
3. Arranca. Ponle la **misma IP** que tenía el otro en el router — así los
   celulares no tienen que cambiar de dirección.

---

# 3 · DESPUÉS

## 3.1 · Publicar los resultados

En el LOCAL: campeonato → **Reportes** → **«Exportar resultados»**.
En el ONLINE: `/admin/importar-resultados`.

Viajan los podios y los rankings, que es lo que ve el público. **No se copia la
base entera de vuelta**: lo que pasó en el tatami ya pasó, y lo que le interesa
a la gente son los resultados.

## 3.2 · Guardar el evento

La carpeta `instance/` del PC del evento, entera, a dos sitios distintos. Es la
única copia de cómo se puntuó cada combate.

---

# Anexo · Lo que este plan NO resuelve, y qué haría falta

Escrito aquí para que se decida a tiempo, no el día 9.

| Hueco | Qué pasa hoy | Qué haría falta |
|---|---|---|
| **Inscripciones de última hora** | Un maestro que inscribe a alguien después de que te bajaste el paquete: esa inscripción se queda en el VPS | Cerrar inscripciones la víspera, o volver a importar el paquete de la mañana (que sí las trae) |
| **Resultados en vivo para el público** | Durante el evento, quien mire `campeonatos.dinamyt.org` ve los datos de antes de empezar | Publicar resultados por bloques desde el local cuando haya internet, o aceptarlo y avisarlo |
| **Fotos de los competidores** | Viajan dentro del paquete si están en la ficha | Nada, pero ojo con el peso del archivo si hay muchas |
| **La identidad del ecosistema** | El paquete crea a la gente **sin contraseña** y sin `eco_sub`: el local no sabe nada del ecosistema, que es justo lo que se quiere | Nada. Es el diseño, no un olvido |

---

# Anexo 2 · La solución permanente: traspaso de propiedad

> Lo de arriba resuelve **el campeonato de octubre**. Esto es lo que hay que
> construir para que el de dentro de un año **se resuelva solo**, sin que nadie
> tenga que acordarse de nada. Va después del 14 de octubre.

## El eslabón débil no es la conexión: es la memoria

Vuelve a leer la última fila de «Qué pasa si se cae cada cosa»:

> *«Te olvidaste de exportar el paquete y el VPS está caído → **No hay evento.**»*

Es el único fallo sin marcha atrás, y el único que depende de que **una persona
se acuerde**. Todo lo demás del plan tiene repuesto: hay segundo portátil,
segundo router, UPS y tres copias del paquete. Contra el olvido no hay repuesto.

## Lo que NO se debe construir: sincronización bidireccional

Dos copias que pueden escribir lo mismo a la vez obligan a resolver conflictos
campo a campo — y esa resolución se estrenaría el peor día del año. El propio
plan de sincronización ya lo evaluó y lo descartó como mecanismo principal:
*la red del polideportivo no es fiable, y un sync a medias es peor que un archivo
en USB.*

## Lo que sí: un solo dueño a la vez, y el dueño se traspasa

En vez de resolver conflictos, **hacerlos imposibles**. Tres mecanismos:

### 1 · El local se mantiene caliente solo

Mientras haya internet, la instalación local **descarga el paquete cada pocos
minutos, sola**. Nadie «exporta antes del evento»: el local está *siempre* listo.

En pantalla, siempre visible:

    Al día · última sincronización hace 3 min
    Sin conexión desde las 09:14 · trabajando en local

Si el VPS muere a las seis de la mañana del día 9, el local ya tiene todo lo de
las 5:50. **La memoria sale del camino crítico**, que es el único objetivo real
de este anexo.

### 2 · El campeonato tiene dueño, y se traspasa explícitamente

Un estado nuevo en el campeonato: `sede = nube | local:<id-instalación>`.

- Se marca «este campeonato corre en local» → **la VPS lo pone en solo lectura**.
  Se cierran las inscripciones allí y nadie lo edita.
- El local pasa a ser **el único que escribe**. Todo lo que crea lleva su `uid` y
  el identificador de la instalación.
- Al terminar, el local **devuelve la propiedad**: empuja su delta y la VPS
  reabre.

**Un escritor a la vez.** No hace falta resolver conflictos porque no puede
haberlos, y eso es demostrable — una fusión campo a campo nunca lo es del todo.

### 3 · El transporte es lo de menos

El mismo JSON viaja **por HTTP si hay red, por USB si no**. HTTP es la comodidad;
USB es la garantía. Y como el traspaso del punto 2 ya ocurrió, la vuelta puede
esperar días sin que nada se corrompa.

> Esto automatiza **el estar preparado**, no el momento crítico. Es la diferencia
> que hace que el diseño respete el veredicto de siempre sobre el sync
> automático en vez de contradecirlo.

## Lo que NO puede ser automático, y hay que aceptar

Decidir si el «Juan Pérez» que se inscribió en el tatami es el «Juan Pérez» que
ya tiene cuenta en DINAMYT. El sistema puede **proponer** coincidencias —por
documento, por nombre + club, por fecha de nacimiento— pero **confirma una
persona**. Automatizarlo genera identidades duplicadas: el problema caro.

## Lo que cambia en el código, que es poco

| Cambio | Dónde |
|---|---|
| `Campeonato.sede` + `instalacion_id` | `models/campeonato.py`, vía `schema_compat.py` — sin migraciones |
| Descarga periódica mientras haya red | Nuevo, solo en el local. Reutiliza `exportar_campeonato()` |
| Indicador de frescura | Frontend, una franja siempre visible |
| Bloqueo de solo lectura en la VPS | Un guard sobre el campeonato con `sede != nube` |
| Devolución de propiedad | Extiende el paquete de vuelta con las altas del día |

**Es independiente de B3.** Funciona con la identidad única o sin ella, así que
construirlo no depende de esperar a nadie — y B3 tampoco lo invalida después.

---

## Publicar mientras el evento corre, para que el público lo siga

El paso 3 de arriba deja el transporte abierto a propósito, y aquí está su mejor
uso: **durante el evento, el local publica hacia la VPS cada pocos minutos.**

No es sincronización: es **publicación**. El local sigue siendo el único que
escribe, la VPS solo recibe, y el envío es *best-effort*. Si no hay red cuando
toca, no pasa nada: se publica en el siguiente intento. **El modo de fallo es
«el público ve resultados de hace veinte minutos», no «se para el campeonato».**

Casi todo está construido: `_construir_resultados(camp_id)` ya arma el contenido
—y su docstring dice que lo comparten el endpoint público en vivo y la
exportación—, `ResultadoPublicado` ya tiene `export_uuid` único y `exportado_at`,
`importar_resultados()` ya existe, y `RESPALDO_MINUTOS` ya es el patrón de «haz
esto cada N minutos» en el local.

### Las cinco reglas que lo hacen seguro

1. **Solo hacia arriba.** El local **no descarga nada** durante el evento. En
   cuanto descarga, hay dos escritores.
2. **Instantánea completa, nunca incrementos.** «Lo que cambió desde la última
   vez» exige que las dos partes coincidan en qué se vio — eso es estado, y el
   estado es lo que se rompe con una red intermitente. Una instantánea completa
   es idempotente: mandarla dos veces da igual.
3. **Nunca en el camino de una petición.** Va en un hilo aparte y con timeout
   corto. Si un juez pulsa «punto» y eso espera a la VPS, has metido internet en
   el camino crítico. Ojo con eventlet: una llamada bloqueante en el sitio
   equivocado congela el bucle de sockets.
4. **La VPS, en solo lectura para ese campeonato** (`sede != nube`). Si alguien
   lo edita en el portal, la siguiente publicación se lo lleva por delante.
5. **El público ve la hora del dato**: «Resultados a las 11:42», no «en vivo».
   Con red mala puede haber veinte minutos de retraso, y quien esté decidiendo
   si va al pabellón merece saberlo.

> ⚠️ **El reintento tardío que pisa lo bueno.** Con red inestable, la publicación
> de las 11:40 puede llegar **después** de la de las 11:45. La VPS tiene que
> comparar `exportado_at` y **descartar lo que llegue más viejo que lo que ya
> tiene**. El campo ya existe en el modelo; solo falta usarlo.

> **Y guarda el hash de lo último enviado**: si nada cambió, no mandes. En un
> hotspot de celular eso es la diferencia entre publicar cada tres minutos y
> quemarle los datos a alguien.

---

## La arquitectura: una sola app, dos modos

Se evaluó partir el producto —dejar en la VPS solo lo visual y las inscripciones,
y la lógica de puntuación **solo** en el local— y **se descartó**. La diferencia
entre local y VPS es **de estado, no de código**:

| | Partir la app | **Una app, dos modos** ✅ |
|---|---|---|
| Conflictos de escritura | Imposibles por construcción | Imposibles por el candado de `sede` — misma garantía |
| Codebase | **Dos**, que divergen solos | **Una**. Todo cambio se prueba en los dos lados |
| Campeonato pequeño con buen wifi | **Nunca** se podría correr en la VPS | Se puede, si su `sede` es `nube` |
| Si muere el PC del evento | Segundo portátil, y nada más | Segundo portátil, y **en el peor caso** seguir las llaves que falten en la VPS |
| El camino local | Un producto aparte que se ejercita solo en eventos | El mismo binario de siempre |

La razón de fondo es la misma que la regla 7 de `B3-RIESGOS.md`: **un camino que
solo corre en la emergencia se pudre en silencio.** Si el local es una compilación
distinta, deriva. Si es el mismo binario en otro modo, cada cambio pasa por él.

Y el beneficio que perseguía partirlo —que no haya dos escritores— ya lo da el
candado de propiedad, que además es **reversible** y por campeonato.

---

## El nombre en la red del pabellón

Los jueces **no teclean nada**: el QR del tatami lleva la URL completa
(`/acceso#token=…`, armada desde `ip_local`). Esto solo hace falta para la mesa
y para la pantalla del público.

`[ ]` **Reserva de DHCP** para el PC, que ya está en la lista de la compra.

`[ ]` **Entrada de DNS estática en el router**: `campeonato.dinamyt` →
      `192.168.0.30`. El router ya es el DNS de esa red, así que resuelve para
      todo el que se conecte a él.

`[ ]` **Con punto, no una sola palabra.** `campeonato` a secas lo tratan como
      búsqueda Chrome y varios navegadores de Android. `campeonato.dinamyt` se
      interpreta como dirección.

`[ ]` **Servir en el puerto 80** para quitar el `:3000` de la URL.

> **Y la IP en un papel, grande, igual.** El nombre es comodidad; la IP es la
> garantía. Si el DNS del router falla a media mañana, `http://192.168.0.30`
> sigue funcionando y nadie tiene que entender por qué.
