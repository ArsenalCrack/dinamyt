# Despliegue: Supabase + Render + Vercel

Tres servicios, en este orden. La base primero porque su cadena de conexión
hace falta para la API, y la API antes que la web porque su URL hace falta en
Vercel.

| Pieza | Dónde | Qué es |
|---|---|---|
| Base de datos | **Supabase** | PostgreSQL gestionado |
| API | **Render** | Fastify, puerto 3004 |
| Web | **Vercel** | Next.js (PWA) |

Antes de empezar, genera esto y guárdalo a mano:

```bash
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(48).toString('base64url'))"
```

Y decide el correo y la contraseña del superadmin. Esa cuenta es la única
puerta de entrada: sin ella nadie puede crear el primer club.

---

## 1. Supabase (base de datos)

1. En [supabase.com](https://supabase.com) → **New project**.
   - **Nombre**: `dinamyt-membresias`
   - **Database Password**: genérala y **guárdala**, no se vuelve a mostrar.
   - **Región**: la más cercana a tus alumnos. Si la API va a Render Oregon,
     usa `West US (Oregon)` para que los datos no crucen el continente en cada
     consulta.

2. **Usa un proyecto NUEVO, no el que ya tenías.** El anterior sirvió a la
   versión vieja de Membresías, la que dependía del ecosistema DINAMYT. Si
   reutilizas ese, la migración corre igual y no rompe nada, pero los alumnos
   guardados apuntan a identidades del ecosistema que aquí no existen: quedan
   invisibles en el roster. Vas a creer que perdiste datos.

3. **Connect** (arriba del panel) → pestaña **Transaction pooler** → copia la
   cadena. Se ve así:

   ```
   postgresql://postgres.abcdefghijklm:[TU-PASSWORD]@aws-0-us-west-1.pooler.supabase.com:6543/postgres
   ```

   Reemplaza `[TU-PASSWORD]` por la contraseña del paso 1.

   > **No uses la conexión directa** (`db.<ref>.supabase.co:5432`). Supabase la
   > sirve solo por IPv6 salvo que pagues el add-on de IPv4, y Render no hace
   > salidas por IPv6: la API no conectaría nunca y el error no dice por qué.
   > El *pooler* funciona por IPv4 y además aguanta más conexiones.

4. **Crea un rol propio para la aplicación.** Este paso no es opcional si
   quieres que el aislamiento entre clubes de la base de datos sirva de algo.

   El usuario `postgres` que Supabase te da por defecto tiene `BYPASSRLS`: se
   salta **todas** las políticas de Row Level Security sin avisar. Conectando
   con él, esa capa de seguridad queda de adorno y nada te lo dice.

   En **SQL Editor**, ejecuta (cambia la contraseña):

   ```sql
   create role membresias_app with login password 'UNA_CLAVE_LARGA' nobypassrls;
   grant create on database postgres to membresias_app;
   ```

   Después, en la cadena de conexión del paso 3, reemplaza el usuario
   `postgres` por `membresias_app` (conservando el sufijo `.PROJECT_REF` que
   usa el pooler) y pon la contraseña que acabas de crear.

   La API crea el esquema y las tablas con ese rol, así que las posee — y como
   las políticas usan `FORCE ROW LEVEL SECURITY`, se le aplican igual. Al
   arrancar verás en los logs de Render si quedó bien:

   ```
   [SEGURIDAD] RLS no está protegiendo: el rol de conexión es SUPERUSER…
   ```

   Si ese mensaje aparece, te conectaste con el rol equivocado.

5. **No hay que crear tablas a mano.** La API aplica las migraciones sola cada
   vez que arranca.

> Supabase da la cadena **sin** `sslmode`, y con eso el cliente de PostgreSQL
> abriría el socket sin cifrar, con la contraseña dentro. Esta app fuerza TLS
> por su cuenta cuando el host no es local, así que puedes pegarla tal cual.

---

## 2. Render (API)

1. En [render.com](https://render.com): **New → Blueprint**.
2. Conecta `ArsenalCrack/dinamyt-membresias`, rama `main`. Render lee el
   `render.yaml` y propone el servicio `dinamyt-membresias-api` configurado.
3. Rellena los valores que te pide:

   | Variable | Valor |
   |---|---|
   | `MEMBRESIAS_DATABASE_URL` | La cadena del *transaction pooler*, con la contraseña puesta |
   | `SUPERADMIN_EMAIL` | Tu correo de superadmin |
   | `SUPERADMIN_PASSWORD` | La contraseña que elegiste (mínimo 8 caracteres) |
   | `CORS_ORIGINS` | *Déjala vacía por ahora* — se llena en el paso 4 |
   | `MEMBRESIAS_WEB_URL` | *Igual, en el paso 4* |
   | `VAPID_*` | Opcionales; sáltalas si no quieres avisos push todavía |

   `JWT_SECRET` no te la pide: Render la genera sola y nadie tiene que verla.

4. **Apply**. El primer build tarda unos minutos. Cuando termine, copia la URL
   del servicio y comprueba que responde:

   ```bash
   curl https://dinamyt-membresias-api.onrender.com/health
   ```

   Debe devolver `{"status":"ok","service":"membresias-api"}`.

5. En **Logs** deberías ver `Superadmin sembrado: tu@correo.com`. Si no aparece
   ni esa línea ni un error, la cuenta ya existía de un despliegue anterior: es
   idempotente a propósito, para que cambiar la variable no te pise una
   contraseña que ya cambiaste a mano.

---

## 3. Vercel (web)

1. En [vercel.com](https://vercel.com): **Add New → Project** → importa
   `ArsenalCrack/dinamyt-membresias`.

2. **Root Directory: `apps/membresias-web`.**

   Es el paso que hay que hacer bien. Vercel busca `next` en el `package.json`
   **de esa carpeta** para saber que es un proyecto Next.js; si lo dejas en la
   raíz del repositorio, el build muere con:

   ```
   Error: No Next.js version detected.
   ```

   Vercel reconoce solo el `pnpm-workspace.yaml` de la raíz e instala desde
   ahí. Si aun así el install fallara por no encontrar el lockfile, entra a
   **Settings → Build and Deployment** y activa *Include source files outside
   of the Root Directory in the Build Step*.

   No toques Build Command ni Output Directory: con el Root Directory bien
   puesto, los valores por defecto son los correctos.

3. En **Environment Variables**:

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

La API todavía no deja que la web le hable. Vuelve a Render → **Environment**:

| Variable | Valor |
|---|---|
| `CORS_ORIGINS` | `https://tu-web.vercel.app` (sin barra final) |
| `MEMBRESIAS_WEB_URL` | Lo mismo |

Guarda: Render reinicia el servicio solo.

> Si te saltas este paso, la web carga pero se queda muerta y el login no
> responde. El error solo se ve en la consola del navegador, no en pantalla —
> es la causa número uno de "no funciona" y no deja ninguna pista útil.

Si más adelante conectas un dominio propio, añádelo separado por comas:
`https://membresias.tudominio.com,https://tu-web.vercel.app`

### Por qué conviene un dominio propio (y no es solo estética)

Con `vercel.app` + `onrender.com`, la web y la API son **sitios distintos**, así
que la cookie de sesión es una cookie de terceros. El `render.yaml` ya la marca
`SameSite=None` para que funcione, pero:

- **Safari las bloquea siempre**, y Firefox las aísla. En un iPhone, la sesión
  se pierde al recargar la página. La app tiene un respaldo en memoria, así que
  se puede trabajar con la pestaña abierta, pero no es lo que quieres para una
  PWA instalada.

La solución de fondo es servir ambos bajo el mismo dominio, por ejemplo
`membresias.tudominio.com` (Vercel) y `api.tudominio.com` (Render). Ahí la
cookie deja de ser de terceros y todo el problema desaparece. Cuando lo hagas,
cambia `COOKIE_SAMESITE` a `lax` en Render.

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

Para ver los datos por dentro: Supabase → **Table Editor** → esquema
`membresias` (no `public`; ahí no hay nada).

---

## Costos y límites

| Servicio | Gratis | Cuándo conviene pagar |
|---|---|---|
| **Supabase** | 500 MB; el proyecto se pausa tras ~1 semana sin actividad | Cuando el club esté en marcha. Un proyecto pausado hay que reactivarlo a mano desde el panel |
| **Render** | Se duerme a los 15 min; despertar tarda ~1 min | **Pronto.** Un maestro esperando un minuto en la puerta del salón con alumnos entrando es inaceptable. $7/mes lo quita |
| **Vercel** | Generoso, pero la capa Hobby es de uso **no comercial** | Si cobras por la plataforma, sus términos piden el plan Pro |

El eslabón que primero va a molestar es Render. El segundo es la pausa por
inactividad de Supabase, que en un club con clases toda la semana no debería
llegar a dispararse.

---

## Si algo falla

| Síntoma | Causa casi segura |
|---|---|
| `No Next.js version detected` en Vercel | El **Root Directory** no es `apps/membresias-web` |
| Web en blanco, login no responde | Falta `CORS_ORIGINS` en Render, o lleva barra final |
| La API no conecta y el error no dice nada claro | Usaste la conexión **directa** de Supabase (IPv6). Cambia a la del *transaction pooler* |
| `password authentication failed` | No reemplazaste `[TU-PASSWORD]` en la cadena, o la contraseña lleva caracteres que hay que escapar en una URL (`@`, `:`, `/`, `#`) |
| `Falta JWT_SECRET` y el servicio no arranca | La variable no se generó; créala a mano en Render |
| No aparece `Superadmin sembrado` | Ya existía. Si perdiste la clave, cambia `SUPERADMIN_EMAIL` y reinicia para sembrar otra cuenta |
| El primer acceso del día tarda un minuto | Render dormido. Es el plan gratis |
| El check-in dice "hoy no hay clase" | Falta marcar los días en **Calendario** |
| No veo mis tablas en Supabase | Están en el esquema `membresias`, no en `public` |
| `[SEGURIDAD] RLS no está protegiendo` en los logs | Te conectaste como `postgres`, que tiene `BYPASSRLS`. Usa el rol `membresias_app` del paso 1.4 |
| `permission denied for schema membresias` | Al rol `membresias_app` le falta `grant create on database` |
| Al recargar la página se cierra la sesión (sobre todo en iPhone) | Cookie de terceros bloqueada por el navegador. Ver el apartado del dominio propio |
