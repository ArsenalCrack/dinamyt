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
