# Despliegue: Neon + Render + Vercel

Tres servicios, en este orden. La base primero porque su cadena de conexión
hace falta para la API, y la API antes que la web porque su URL hace falta en
Vercel.

| Pieza | Dónde | Qué es |
|---|---|---|
| Base de datos | **Neon** | PostgreSQL serverless |
| API | **Render** | Fastify, puerto 3004 |
| Web | **Vercel** | Next.js (PWA) |

Antes de empezar, genera dos cosas y guárdalas a mano:

```bash
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(48).toString('base64url'))"
```

Y decide el correo y la contraseña del superadmin. Esa cuenta es la única
puerta de entrada al sistema: sin ella nadie puede crear el primer club.

---

## 1. Neon (base de datos)

1. Entra a [neon.tech](https://neon.tech) y crea un proyecto.
   - **Nombre**: `dinamyt-membresias`
   - **Región**: la más cercana a tus alumnos. Si vas a poner la API en Render
     Oregon, usa `AWS US West 2 (Oregon)` para que no viajen los datos en cada
     consulta.
   - **Versión de PostgreSQL**: 16 o 17, cualquiera sirve.

2. En el panel del proyecto, **Connect** → copia la cadena marcada como
   **Pooled connection**. Se ve así:

   ```
   postgresql://neondb_owner:XXXX@ep-algo-a1b2c3-pooler.us-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require
   ```

   Fíjate en el `-pooler` del host: **esa** es la que va, no la directa. Con el
   pooler, la API aguanta muchas más conexiones simultáneas.

   > No te preocupes por el `&channel_binding=require` del final: PostgreSQL
   > rechaza ese parámetro, así que el cliente lo quita solo antes de conectar.
   > Puedes pegar la cadena tal cual.

3. **No hay que crear tablas a mano.** La API aplica las migraciones sola cada
   vez que arranca.

> Neon suspende la base tras unos minutos sin uso en el plan gratuito. La
> primera consulta después de dormir tarda ~1 segundo en despertarla. Es mucho
> menos molesto que el arranque en frío de Render.

---

## 2. Render (API)

1. En [render.com](https://render.com): **New → Blueprint**.
2. Conecta el repositorio `ArsenalCrack/dinamyt-membresias` y elige la rama
   `main`. Render lee el `render.yaml` y propone el servicio
   `dinamyt-membresias-api` ya configurado.
3. Te va a pedir los valores marcados como secretos. Rellena:

   | Variable | Valor |
   |---|---|
   | `MEMBRESIAS_DATABASE_URL` | La cadena *pooled* de Neon, tal cual |
   | `SUPERADMIN_EMAIL` | Tu correo de superadmin |
   | `SUPERADMIN_PASSWORD` | La contraseña que elegiste (mínimo 8 caracteres) |
   | `CORS_ORIGINS` | *Déjala vacía por ahora* — se llena en el paso 4 |
   | `MEMBRESIAS_WEB_URL` | *Igual, en el paso 4* |
   | `VAPID_*` | Opcionales; sáltalas si no quieres avisos push todavía |

   `JWT_SECRET` no te la pide: Render la genera sola y nadie tiene que verla.

4. **Apply**. El primer build tarda unos minutos. Cuando termine, copia la URL
   del servicio (algo como `https://dinamyt-membresias-api.onrender.com`) y
   comprueba que responde:

   ```bash
   curl https://dinamyt-membresias-api.onrender.com/health
   ```

   Debe devolver `{"status":"ok","service":"membresias-api"}`.

5. En **Logs** deberías ver `Superadmin sembrado: tu@correo.com`. Si no aparece
   esa línea ni un error, es que la cuenta ya existía de un despliegue anterior
   — es idempotente a propósito, para que cambiar la variable no te pise una
   contraseña que ya cambiaste a mano.

---

## 3. Vercel (web)

1. En [vercel.com](https://vercel.com): **Add New → Project** → importa
   `ArsenalCrack/dinamyt-membresias`.

2. **Root Directory: déjalo en la raíz del repositorio.** No lo apuntes a
   `apps/membresias-web`. El `vercel.json` de la raíz ya le dice a Vercel qué
   construir y dónde queda la salida; si mueves el root, se rompe la resolución
   del workspace de pnpm.

3. En **Environment Variables**, añade:

   | Variable | Valor |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | La URL de Render, **sin barra al final** |

   Opcionales:

   | Variable | Para qué |
   |---|---|
   | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Avisos push (la misma clave pública que en Render) |
   | `NEXT_PUBLIC_MONEDA` | Moneda distinta al peso colombiano (`MXN`, `USD`, …) |
   | `NEXT_PUBLIC_LOCALE_MONEDA` | Formato de los montos (`es-MX`, `en-US`, …) |

4. **Deploy**. Copia la URL resultante.

---

## 4. Cerrar el círculo (CORS)

La API todavía no deja que la web le hable. Vuelve a Render →
**Environment** y rellena:

| Variable | Valor |
|---|---|
| `CORS_ORIGINS` | `https://tu-web.vercel.app` (sin barra final) |
| `MEMBRESIAS_WEB_URL` | Lo mismo |

Guarda: Render reinicia el servicio solo.

> Si te saltas este paso, la web carga pero se queda en blanco y el login no
> responde. El error solo se ve en la consola del navegador, no en pantalla —
> es la causa más común de "no funciona" y no da ninguna pista útil.

Si más adelante conectas un dominio propio, añádelo a `CORS_ORIGINS` separado
por comas: `https://membresias.tudominio.com,https://tu-web.vercel.app`.

---

## 5. Comprobar que quedó bien

Entra a la web y recorre esto de una sentada:

1. Inicia sesión con el correo y la contraseña del superadmin.
2. Crea un club.
3. En ese club, **Nombrar maestro**.
4. Cierra sesión y entra con el maestro. Debe ver su club, no el panel del
   superadmin.
5. **Alumnos → Nuevo alumno.**
6. Abre la ficha del alumno: debe verse su carnet QR. Dale a **Imprimir** y
   revisa la vista previa — solo debe salir la tarjeta, sin menús.
7. **Planes → Nuevo plan**, y **Calendario**: marca los días que abre el club.
   Sin días marcados, el check-in responde "hoy no hay clase".
8. **Panel → Registrar pago** al alumno.
9. **Kiosco**: escanea el carnet con la cámara del celular.

Prueba también el interruptor de tema y el de idioma, y en el celular
"Añadir a pantalla de inicio" para instalar la PWA.

---

## Costos y límites

| Servicio | Gratis | Cuándo conviene pagar |
|---|---|---|
| **Neon** | 0.5 GB, se suspende al rato sin uso | Cuando el club crezca; el arranque tras dormir es ~1 s |
| **Render** | Se duerme a los 15 min; despertar tarda ~1 min | **Pronto.** Un maestro esperando un minuto en la puerta del salón con alumnos entrando es inaceptable. $7/mes lo quita |
| **Vercel** | Generoso, pero la capa Hobby es de uso **no comercial** | Si cobras por la plataforma, sus términos piden el plan Pro |

El eslabón que primero va a molestar es Render, no la base de datos.

---

## Si algo falla

| Síntoma | Causa casi segura |
|---|---|
| Web en blanco, login no responde | Falta `CORS_ORIGINS` en Render, o lleva barra final |
| `unrecognized configuration parameter` en los logs | Cadena de Neon rara; comprueba que sea la *pooled* |
| `Falta JWT_SECRET` y el servicio no arranca | La variable no se generó; créala a mano en Render |
| No aparece `Superadmin sembrado` | Ya existía. Si perdiste la clave, cambia el correo del superadmin y reinicia para sembrar otra cuenta |
| El primer acceso del día tarda un minuto | Render dormido. Es el plan gratis |
| El check-in dice "hoy no hay clase" | Falta marcar los días en **Calendario** |
