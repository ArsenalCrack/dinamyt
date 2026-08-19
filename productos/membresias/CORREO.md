# Correo en DINAMYT Membresías — investigación

> **Estado: nada de esto está implementado.** Este documento es el estudio
> previo. Hoy la aplicación no envía un solo email, y eso está dicho a propósito
> en el README: las cuentas nacen de arriba abajo y los avisos salen por la
> campana y por push.

---

## 1. Qué es Resend y qué cuesta

Resend es una API de correo transaccional pensada para desarrolladores. Tiene
SDK oficial de Node (`npm install resend`), y su patrón es devolver
`{ data, error }` en vez de lanzar excepciones — así que un fallo de envío se
comprueba, no se captura.

```js
const { data, error } = await resend.emails.send({
  from: 'DINAMYT <avisos@tudominio.com>',
  to: ['alumno@correo.com'],
  subject: 'Tu mensualidad vence el 20 de agosto',
  html: '…',
});
```

**Precios (agosto 2026):**

| Plan | Al mes | Al día | Dominios | Precio |
|---|---|---|---|---|
| Free | 3 000 | **100** | 1 | 0 |
| Pro | desde 50 000 | sin tope | 10 | desde 20 USD/mes |

El tope que muerde no es el mensual: es **el de 100 al día**. Es la razón más
común por la que un proyecto se sale del plan gratis, porque el correo no sale
repartido a lo largo del mes — sale en tandas.

---

## 2. ¿Se llena el tope de 100 diarios con 60–100 alumnos?

Es la pregunta que importa, así que va con números.

**La respuesta corta: no, ni de lejos… salvo que se mande por correo lo que ya
manda el push.**

El error de cálculo natural es pensar «100 alumnos = 100 correos al día». No lo
es, porque los avisos **no son uno por alumno y día**: son uno por alumno y
EVENTO, y los eventos están repartidos por el calendario.

Con un club de 100 alumnos, todos mensuales:

| Qué | Cuántos al día | De dónde sale |
|---|---|---|
| **Por vencer** (`pre_venc`) | ~10 | Cada alumno entra en la ventana de 3 días una vez al mes: 100 × 3 ÷ 30 |
| **Vencidos** (`venc`) | ~2 | Si un 10 % se atrasa y tarda ~5 días en pagar |
| **Cumpleaños** | ~0,3 | 100 ÷ 365. Un cumpleaños cada tres días |
| **Cuenta nueva** | ~0,2 | Cinco altas al mes es un club que crece bien |
| **Total** | **~12–13 al día** | ~380 al mes, contra un tope de 3 000 |

Sobra sitio: se usa un **13 % del cupo diario** y un **13 % del mensual**.

**Lo único que lo rompe** es mandar por correo el aviso de clase. Ese sí es uno
por alumno y día: 100 alumnos = 100 correos diarios = el tope exacto, todos los
días, y 3 000 al mes = el tope mensual exacto. Un solo aviso de ese tipo se come
la cuota entera y deja sin sitio a lo que de verdad necesita correo.

### La regla, entonces

**El correo es para lo que tiene que llegar aunque el alumno no abra la app.**
Lo demás se queda donde ya está.

| Aviso | Canal | Por qué |
|---|---|---|
| Confirmar la cuenta | **Correo** | Es la única forma de saber que la dirección existe |
| Vencido / mora | **Correo** + push | Toca el bolsillo, y quien deja vencer es justo quien no abre la app |
| Por vencer | Push + campana (correo opcional) | Ya funciona, y es gratis |
| **Hay clase hoy / nota de la semana** | **Push y campana, NUNCA correo** | Es diario y es para todos: él solo agota la cuota |
| Cumpleaños | Campana del maestro | Es para el maestro, y es un dato de pantalla |

Push (Web Push con VAPID) **ya está implementado, es gratis y no tiene tope**.
Ese es el canal del día a día. El correo es el canal de lo excepcional.

### El riesgo de cola que sí hay que vigilar

`generarAvisos` no repite el mismo aviso el mismo día, pero **sí lo repite cada
día**: un alumno vencido que tarda un mes en pagar genera 30 avisos. Con treinta
morosos crónicos, eso son 30 correos diarios de golpe.

Por eso, cuando se implemente, el canal `email` **no debe copiar la cadencia
diaria del push**: el vencido se avisa por correo una vez, y luego como mucho
semanalmente. La campana y el push pueden seguir insistiendo a diario, que no
cuestan nada.

---

## 3. «Tengo un correo personal, ¿sirve?»

**Como remitente, no.** Resend exige verificar un **dominio** por DNS (registros
SPF y DKIM), y verificar un dominio significa poder escribir en su DNS. De
`gmail.com` no manda nadie más que Google. `onboarding@resend.dev` existe para
probar y para nada más.

Pero lo que se busca al decir «quiero usar mi correo» casi siempre es *que las
respuestas me lleguen a mí*, y eso sí se resuelve:

### Opción A — Dominio propio + `reply-to` (recomendada)

Un dominio cuesta unos 10–15 USD al año. Se verifica un **subdominio**
(`avisos.tudominio.com`), que es lo que Resend recomienda para no arriesgar la
reputación del dominio principal, y se manda así:

```
from:     DINAMYT <avisos@tudominio.com>
reply-to: tucorreo@gmail.com
```

El alumno recibe un correo del club, y si contesta, la respuesta cae en el
correo personal de siempre. Con el plan gratis basta para los números de arriba.

Si el club **ya tiene página web**, ya tiene dominio: no hay nada que comprar.

### Opción B — Gmail por SMTP

Técnicamente funciona (con `nodemailer` y una contraseña de aplicación), y el
tope de Gmail es más alto: ~500 al día en una cuenta personal, 2 000 en
Workspace. Pero:

- No es un servicio transaccional: sin registro de envíos, sin webhooks de
  rebote, sin forma de saber si un correo llegó.
- Google puede limitar o marcar la cuenta si detecta envío automatizado, y el
  día que lo haga se cae el correo **y** el correo personal.
- Obliga a guardar una contraseña de aplicación de Google en el servidor.

Sirve para salir del paso; no para que el club dependa de ello.

### Opción C — Resend Pro (20 USD/mes)

Quita el tope diario y sube a 10 dominios. Para 12 correos al día es pagar por
capacidad que no se usa. Se justifica el día que el club tenga varias sedes.

**Recomendación: opción A.** Y con un tope propio en el código (§5), para que el
día que algo se dispare no se descubra por los correos que faltan.

---

## 4. Dónde encaja en esta aplicación

Nada de esto pide arquitectura nueva. Las piezas ya están:

- **El envío va en la API (Render), no en la web.** Es quien tiene el secreto y
  quien ya decide qué avisos existen (`lib/notifications.ts`).
- **Los enlaces se arman con `config.webUrl`**, que ya existe en
  `apps/membresias-api/src/config.ts`.
- **Los tokens de confirmación** salen de `lib/auth/tokens.ts`, que ya emite
  tokens firmados y de vida corta para el QR de acceso rápido.
- **El canal ya está en el esquema.** `canal_notif` tiene el valor `'email'`
  desde la primera migración, y `notifications` tiene `status`
  (`PENDIENTE`/`ENVIADA`/`FALLIDA`) y `sent_at`. Nadie los emite todavía: la
  tabla está preparada para esto y sin estrenar.

Variables nuevas, las mínimas:

```bash
RESEND_API_KEY=re_xxxxxxxx
MAIL_FROM="DINAMYT <avisos@tudominio.com>"
MAIL_REPLY_TO=tucorreo@gmail.com   # opcional
MAIL_DAILY_MAX=90                  # tope propio, por debajo del de Resend
```

**Sin `RESEND_API_KEY`, la aplicación funciona exactamente igual que hoy.** Es
el mismo criterio que ya se aplica al SSO del ecosistema y a `CRON_SECRET`: una
función que no está configurada no existe, en vez de romperse a medias.

---

## 5. El tope propio, y por qué no puede faltar

Si Resend rechaza el correo 101 del día, el envío falla en silencio dentro de un
`try/catch` best-effort y nadie se entera hasta que un alumno dice que no le
llegó nada.

Así que el tope se cuenta **aquí**, no allá:

1. Antes de cada tanda, contar los `notifications` de hoy con `channel='email'`
   y `status='ENVIADA'`.
2. Si se pasa de `MAIL_DAILY_MAX`, no se envía: la fila se queda en `PENDIENTE`
   y sale mañana. Nada se pierde.
3. Se envía **por prioridad**, no por orden de llegada:
   `confirmación de cuenta` → `vencido/mora` → `por vencer`.

Con 90 de tope y ~13 de uso real, el guardián no se activa nunca. Existe para el
día raro: el club que importa 200 alumnos de golpe, o el cron que se dispara dos
veces.

---

## 6. Las dos funciones que vienen después

### 6.1 Confirmación de correo al crear la cuenta

**El problema real que resuelve:** hoy el correo del alumno **lo teclea el
maestro** en la inscripción. Si se equivoca, nadie se entera: la cuenta nace con
una llave que no abre nada, y se descubre semanas después, cuando el alumno
intenta entrar por primera vez. (La API ya valida la *forma* del correo y avisa
de dominios sospechosos como `gmial.com` — ver `lib/validacion.ts` —, pero eso
no puede detectar un `perez` escrito `peres`.)

**Diseño:** columna `email_verified_at` en `users`. Al crear la cuenta se manda
un enlace firmado con `lib/auth/tokens.ts`, con vida de unos días.

**La decisión que hay que tomar antes de escribir nada:** ¿qué pasa con la
cuenta mientras no está confirmada?

- **Entra igual, y la confirmación solo avisa.** El maestro ve un ⚠ en la ficha
  de quien no ha confirmado y puede reenviar el enlace. No rompe nada de lo que
  ya funciona, y sigue detectando el dedazo.
- **Queda en espera.** Más estricto, pero choca de frente con cómo funciona este
  producto: el alumno se inscribe *presencialmente*, con el maestro delante, y
  dejarlo sin entrar hasta que abra el correo convierte una inscripción de dos
  minutos en un trámite.

**Mi recomendación es la primera.** Aquí la confirmación no es una puerta —el
maestro ya sabe quién es esa persona, la tiene enfrente—: es un **detector de
correos mal escritos**, y para eso no hace falta bloquear a nadie.

### 6.2 Avisos por correo

Añadir el canal `email` a `generarAvisos` (`routes/notifications.ts`), junto al
push que ya manda. Con tres condiciones, que salen de todo lo anterior:

1. Solo `venc` y `mora`. `pre_venc` puede quedar en push, o mandarse una sola vez.
2. Sin cadencia diaria por correo (§2).
3. Detrás del tope de `MAIL_DAILY_MAX` (§5).

Y un `POST /webhooks/resend` para los rebotes: un correo que rebota es un correo
mal escrito, y esa es justo la información que le falta al maestro en la ficha.

---

## Fuentes

- [Resend — Introducción](https://resend.com/docs/introduction)
- [Resend — Quickstart de Node.js](https://resend.com/docs/send-with-nodejs)
- [Resend — Dominios](https://resend.com/docs/dashboard/domains/introduction)
- [Resend Pricing 2026 (Nuntly)](https://nuntly.com/resend-pricing)
- [Resend Free Tier explicado (Automation Atlas)](https://automationatlas.io/answers/resend-free-tier-explained-2026/)
