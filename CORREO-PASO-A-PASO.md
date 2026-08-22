# Correo — paso a paso

**Para qué es esto:** para que al alumno le llegue de verdad el código de
verificación cuando crea su cuenta, y el de «olvidé mi contraseña» cuando la
pierde. Hoy el ecosistema **no manda un solo correo**, y eso está así a
propósito: sin proveedor configurado la función de correo no existe, y la
aplicación funciona igual (§6).

## Por dónde empezar

**En tu PC, no en el servidor.** El orden importa: cada bloque se puede probar
solo, y el que tiene una espera larga —el DNS— va al final, cuando ya sabes que
todo lo demás funciona.

| # | Qué | Dónde | Cuánto | Cuesta |
|---|---|---|---|---|
| **0** | **La migración de la base** | Tu PC **y** el VPS | 5 min | 0 |
| **A** | Probar el registro **sin correo** (el código sale por la consola) | Tu PC | 15 min | 0 |
| 1 | Cuenta de Resend + probar el envío a tu propio buzón | Tu PC | 20 min | 0 |
| 2 | Verificar el dominio en el DNS | Cloudflare | 20 min + espera | 0 |
| 3 | Desplegar y poner las variables | El VPS | 15 min | 0 |
| 4 | DMARC y la prueba final | Cloudflare | 10 min | 0 |

> **No hace falta tocar el VPS para saber si esto funciona.** Con el bloque A ves
> el circuito entero en tu máquina, y con el 1 compruebas que el correo sale de
> verdad —Resend deja enviarte a ti mismo sin verificar ningún dominio—. Al
> servidor se sube cuando las dos cosas ya están probadas.

---

## 0 · La migración — **esto va primero, sí o sí** ⏱ 5 min

El registro cambió: **la cuenta ya no se crea al pulsar «Crear cuenta»**, se crea
cuando la persona teclea el código. Mientras tanto, los datos viven en una tabla
nueva —`ecosystem.pending_registrations`— con fecha de caducidad.

**Hasta que esa tabla exista, `/auth/register` y `/auth/verify-email` responden
error 500.**

### 0.1 Primero mira, luego migra

```bash
cd apps/ecosystem-api && pnpm db:diagnostico
```

No escribe nada. Dice a qué base estás apuntando de verdad, dónde está el diario
de migraciones, qué tablas hay y si falta la 0007. **Empieza siempre por aquí**:
los tres fallos de §0.4 dan errores casi idénticos y ninguno se explica solo.

### 0.2 Aplicarla

```bash
pnpm db:migrar
```

Es el migrador de `drizzle-orm`, no `drizzle-kit`. Hace lo mismo —mismo diario,
mismo orden, mismos ficheros— pero **funciona donde `pnpm db:migrate` no**: usa
dependencias de producción y abre la conexión con `prepare: false`. Es
idempotente: lo ya aplicado no se repite.

### 0.3 ¿En tu PC o en el VPS?

**En los dos, pero no son la misma base.**

| | Qué base | Qué hace falta |
|---|---|---|
| **Tu PC** | La embebida (PGlite) en `.localdb/ecosystem` | `PGLITE_DATA` **descomentada** en `apps/ecosystem-api/.env` |
| **El VPS** | El PostgreSQL de verdad | El `.env` de producción, con su `DATABASE_URL` |

En el PC, con `PGLITE_DATA` comentada la API sale a `DATABASE_URL` — y si esa
dirección ya no existe (un proyecto de Supabase borrado, por ejemplo), **todo
falla con errores que hablan de red, no de migraciones**. El diagnóstico lo dice
con esas palabras.

> **PGlite es de un solo proceso.** Para la API antes de migrar, o el migrador no
> podrá abrir la base.

### 0.4 Los tres errores que salen, y cuál es cuál

**a) «tenant or user not found» · `ENOTFOUND` · `ECONNREFUSED`**
La base del `.env` no existe o no responde. No es un problema de migraciones.
Revisa `DATABASE_URL`, o usa la local descomentando `PGLITE_DATA`.

**b) «relation … already exists» — el más confuso**
El diario de migraciones está en el esquema `drizzle`, y este proyecto lo lleva
dentro de `ecosystem` (ver `drizzle.config.ts`). Drizzle mira donde no está, da
la base por vacía y reintenta la primera migración contra tablas que ya existen.
Le pasa a las bases restauradas de un volcado y a las locales sembradas antes de
que `pglite-setup.mjs` lo pasara bien. Se arregla una vez:

```bash
pnpm db:migrar --mover-diario
```

**c) «permission denied»**
Al usuario de la aplicación le falta `CREATE` sobre la base. Drizzle lanza
`CREATE SCHEMA IF NOT EXISTS` antes de cada migración y PostgreSQL comprueba el
permiso **antes** de mirar si el esquema ya está. Como `postgres`, una vez:

```sql
GRANT CREATE ON DATABASE dinamyt TO dinamyt_eco;
```

✅ Con cualquiera de los caminos, `pnpm db:diagnostico` tiene que terminar en
`✔ ecosystem.pending_registrations existe`.

---

## 1 · Resend: la cuenta y el dominio ⏱ 20 min + espera de DNS

Resend es el proveedor de correo transaccional. El plan gratis da **3.000
correos al mes y 100 al día** con un dominio verificado, y para los números de
un club eso sobra (§5).

1. Crea la cuenta en **[resend.com](https://resend.com)**.
2. **Domains → Add Domain →** `dinamyt.org`. Elige la región más cercana.
3. Resend te enseña **los registros DNS que hay que crear**. Cópialos **tal
   cual** en Cloudflare (**DNS only**, la nube gris — no naranja), sin cambiar
   ni un carácter:
   - un `MX` y un `TXT` de SPF sobre el subdominio de envío (`send`),
   - un `TXT` de **DKIM** (`resend._domainkey`).
4. Vuelve a Resend y pulsa **Verify**. Puede tardar unos minutos.

> **Por qué el SPF de Resend va en `send.dinamyt.org` y no en la raíz:** porque
> **solo puede haber UN registro SPF por nombre**. Si en la raíz ya hay otro
> (Cloudflare Email Routing, por ejemplo), meter un segundo rompe los dos y el
> correo empieza a caer en spam sin que nada dé error. Si algún proveedor te
> pide SPF en la raíz, no añadas un segundo: se **fusionan** en una sola línea
> con los dos `include:`.

5. **API keys → Create API Key**, con permiso de envío. **Cópiala: solo se ve
   una vez.**

### Si todavía no quieres tocar el DNS

Resend deja mandar desde `onboarding@resend.dev` sin verificar nada, pero **solo
a la dirección con la que te registraste**. Sirve para probar el circuito
completo tú mismo; no sirve para un alumno. Para eso:

```bash
MAIL_FROM=DINAMYT <onboarding@resend.dev>
```

---

## 2 · Las variables, en el servidor ⏱ 5 min

```bash
sudo nano /srv/dinamyt/apps/ecosystem-api/.env
```

```bash
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASS=re_xxxxxxxxxxxxxxxxxxxx     # la API key del paso 1.5
MAIL_FROM=DINAMYT <no-reply@dinamyt.org>
MAIL_REPLY_TO=soporte@dinamyt.org     # opcional: a dónde caen las respuestas
MAIL_DAILY_MAX=90                     # tope PROPIO, por debajo del de Resend
PORTAL_URL=https://dinamyt.org        # la base del enlace de invitación
```

Es **SMTP y no el SDK de nadie**: Resend, Amazon SES y Gmail hablan los tres
SMTP, así que cambiar de proveedor son cuatro variables y ni una línea de
código.

```bash
sudo systemctl restart dinamyt-id
# `--since` y no `-n 20`: al arrancar, Nest imprime una línea por cada una de
# las 62 rutas DESPUÉS del mensaje del correo. Con la cola corta no se ve.
sudo journalctl -u dinamyt-id --since "5 min ago" --no-pager | grep -iE "correo|smtp"
```

✅ Tiene que decir `Correo por SMTP: smtp.resend.com:587`. Si dice **«SMTP_HOST
sin configurar»**, el `.env` no se guardó o el servicio no se reinició.

> `MAIL_DAILY_MAX` no es adorno. Si Resend rechaza el correo 101 del día, el
> fallo es **silencioso** y nadie se entera hasta que un alumno reclama. Contado
> aquí, el envío 91 no sale y queda escrito en el registro con esas palabras.

### En local

Lo mismo en `apps/ecosystem-api/.env`, con `PORTAL_URL=http://localhost:3000`.
Y si no quieres configurar nada: **el código sale por la consola de la API**,

```
WARN [MailerService] [SIN CORREO] OTP EMAIL_VERIFY para ana@gmail.com: 483920
```

y la pantalla de verificación **avisa de que el servidor no tiene correo**, en
vez de dejar a alguien esperando un correo que nadie mandó.

---

## 3 · DMARC y la prueba ⏱ 10 min

En Cloudflare → **DNS → Add record**:

| Campo | Valor |
|---|---|
| Type | `TXT` |
| Name | `_dmarc` |
| Content | `v=DMARC1; p=none; rua=mailto:soporte@dinamyt.org` |

**Empieza en `p=none`**: significa «avísame, no bloquees». Durante dos semanas
recibes informes de quién manda correo en tu nombre; cuando estén limpios, se
sube a `quarantine` y luego a `reject`. Ponerlo en `reject` el primer día es la
forma más rápida de que tus propios correos dejen de llegar.

### La prueba de que quedó bien

1. En el portal, **Crear cuenta** con un correo tuyo de verdad. Tiene que llegar
   el código de 6 dígitos, y la pantalla tiene que decir a qué dirección fue.
2. Escribe el código: **ahí es donde nace la cuenta**, y entras directo.
3. Mira la cabecera del correo recibido (en Gmail: **⋮ → Mostrar original**).
   ✅ **SPF: PASS**, **DKIM: PASS**, **DMARC: PASS**.
4. Cierra sesión y prueba **«¿Olvidaste tu contraseña?»** con ese mismo correo.
5. Invita a alguien desde el panel del club: ahora el enlace **ya no se
   devuelve** en la respuesta, va por correo, que es como tiene que ser.

---

## 4 · Qué manda correo y qué no

| Aviso | Canal | Por qué |
|---|---|---|
| **Código de verificación del registro** | **Correo** | Es la única forma de saber que la dirección existe |
| **Código de «olvidé mi contraseña»** | **Correo** | Igual: la prueba de que el buzón es suyo |
| Invitación del maestro | **Correo** (o el enlace a mano si no hay proveedor) | |
| Vencido / mora *(Membresías)* | Correo + push | Toca el bolsillo, y quien deja vencer es quien no abre la app |
| Por vencer | Push y campana | Ya funciona, y es gratis |
| **Hay clase hoy** | **Push y campana, NUNCA correo** | Es diario y para todos: él solo agota la cuota |

---

## 5 · Los números, para que no haya sorpresas

El tope que muerde no es el mensual (3.000): es el de **100 al día**.

Con un club de **100 alumnos**:

| Qué | Al día |
|---|---|
| Cuentas nuevas (5 altas al mes) | ~0,2 |
| Recuperaciones de contraseña | ~1 |
| Vencidos / mora | ~2 |
| Por vencer *(si algún día se manda por correo)* | ~10 |
| **Total** | **~13 al día**, ~380 al mes |

Un **13 % del cupo**. Lo único que lo rompe es mandar por correo el aviso de
clase: eso sí es uno por alumno y día, o sea 100 diarios —el tope exacto, todos
los días— y 3.000 al mes, el tope mensual exacto. Por eso ese aviso va por push.

---

## 6 · Sin proveedor de correo, ¿qué se rompe?

**Nada se rompe: hay cosas que no existen.** Es el mismo criterio de
`ECOSYSTEM_JWKS_URL` y `CRON_SECRET`.

| Con `SMTP_HOST` vacía | Qué pasa |
|---|---|
| Crear cuenta desde el portal | El registro queda pendiente y **el código sale por el registro del servidor**. La pantalla lo dice. |
| «¿Olvidaste tu contraseña?» | Igual: el código sale por el registro del servidor |
| Invitación del maestro | **Devuelve el enlace** para mandarlo por WhatsApp |
| Login, SSO, todo lo demás | Funciona exactamente igual |

Es lo que ha permitido que el ecosistema esté en producción desde el 20 de
agosto sin proveedor de correo contratado. Pero el auto-registro **no es
utilizable de verdad** hasta que esto esté puesto: nadie va a llamar al
administrador para pedirle su código.

---

## 7 · Si algo no llega

| Síntoma | Casi siempre es |
|---|---|
| El registro dice «este servidor no tiene el correo configurado» | `SMTP_HOST` vacía, o el servicio sin reiniciar |
| `Falló el envío de …` en el registro | La API key está mal, o el dominio no está verificado en Resend |
| `Tope diario de correo alcanzado` | `MAIL_DAILY_MAX`. Sube el número o mira qué se disparó |
| Llega, pero a spam | Falta DKIM/SPF (paso 1) o el DMARC está mal escrito |
| «No me llegó» y en Resend sí figura enviado | Carpeta de no deseado. El botón **«No me llegó: reenviar»** manda otro (espera de 60 s, máximo 5) |
| El código dice «expirado» al minuto | El registro dura **20 minutos**. Pasados, se borra solo y hay que volver a empezar — el correo y el documento quedan libres otra vez |

---

## Fuentes

- [Resend — Quickstart de Node.js](https://resend.com/docs/send-with-nodejs)
- [Resend — Dominios](https://resend.com/docs/dashboard/domains/introduction)
- El estudio previo de precios y cuotas: `productos/membresias/CORREO.md`
- El despliegue completo del VPS: `VPS-PASO-A-PASO.md`, bloque E
