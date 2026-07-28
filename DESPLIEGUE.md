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
   | `CRON_SECRET` | *Se llena en el paso 4 ter*, junto con el de Vercel |

   `JWT_SECRET` no te la pide: Render la genera sola y nadie tiene que verla.

4. **Apply**. El primer build tarda unos minutos. Cuando termine, copia la URL
   **que aparece arriba en el panel del servicio** y comprueba que responde:

   ```bash
   curl https://TU-SERVICIO.onrender.com/health
   ```

   Debe devolver `{"status":"ok","service":"membresias-api"}`.

   > **No la deduzcas del nombre del `render.yaml`.** Si `dinamyt-membresias-api`
   > ya estaba tomado, Render le pega un sufijo aleatorio y el servicio pasa a
   > llamarse algo como `dinamyt-membresias-api-m0xb`. Copiar la URL «lógica» en
   > vez de la real deja la web apuntando a un host que no existe.

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
   | `MEMBRESIAS_API_ORIGIN` | La URL de Render, **sin barra al final** |
   | `CRON_SECRET` | El secreto de los avisos diarios; el **mismo** que en Render (ver el paso 4 ter) |

   > **No definas `NEXT_PUBLIC_API_URL`.** El navegador no habla con Render
   > directamente: pide a `/api` en el propio dominio de la web y Next reenvía
   > al servidor (ver el rewrite de `next.config.ts`). Así la cookie de sesión
   > la pone el dominio de la web, es de primera parte y ningún navegador la
   > descarta. Si pones ahí la URL de Render, el navegador vuelve a llamar
   > directo y la sesión se pierde al recargar en Safari.
   >
   > Fíjate en que `MEMBRESIAS_API_ORIGIN` **no** lleva el prefijo
   > `NEXT_PUBLIC_`: es a propósito, solo la usa el servidor.
   >
   > **Y se lee al CONSTRUIR, no al arrancar.** Next mete el destino del rewrite
   > dentro del build, así que añadirla o corregirla en el panel **no hace nada
   > hasta que vuelvas a desplegar**: Deployments → el último → ⋯ → *Redeploy*.
   > Comprueba también que esté marcada para el entorno **Production**, no solo
   > para Preview.

   > **Si añades una variable nueva, declárala en `turbo.json`.** Turbo 2 corre
   > cada tarea en un entorno limpio: lo que no esté en el `env` de la tarea
   > `build` **no llega al build**, aunque esté perfectamente puesta en Vercel.
   > El propio Turbo lo avisa en el log del despliegue:
   >
   > ```
   > Warning - the following environment variables are set on your Vercel
   > project, but missing from "turbo.json"
   >   - MEMBRESIAS_API_ORIGIN
   > ```
   >
   > Las `NEXT_PUBLIC_*` tampoco se salvan solas. Todas están ya declaradas en
   > `turbo.json`; si mañana agregas otra, va ahí también.

   **Cómo saber si quedó mal.** La web carga, pero cualquier llamada a la API
   responde 404 con este cuerpo:

   ```
   The page could not be found
   DNS_HOSTNAME_RESOLVED_PRIVATE
   ```

   Eso es Vercel diciendo «el rewrite apunta a una IP privada»: la variable
   estaba vacía en el build y el destino se quedó en `127.0.0.1`. Desde el
   navegador, en la web desplegada:

   ```js
   fetch('/api/health').then(r => r.text()).then(console.log)
   ```

   Si sale ese texto, es esto. Si sale `{"status":"ok"}`, el proxy está bien.
   Desde el commit que añadió el guardarraíl esto ya no puede pasar callado: el
   build de Vercel falla con el motivo escrito.

   Opcionales:

   | Variable | Para qué |
   |---|---|
   | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Avisos push (la misma clave pública que en Render) |
   | `NEXT_PUBLIC_MONEDA` | Moneda distinta al peso colombiano (`MXN`, `USD`, …) |
   | `NEXT_PUBLIC_LOCALE_MONEDA` | Formato de los montos (`es-MX`, `en-US`, …) |

4. **Deploy**. Copia la URL resultante.

### Cambiarle la URL (que no diga «membresías»)

La URL es lo primero que lee un alumno cuando el maestro le pasa el enlace, y
`dinamyt-membresias.vercel.app` suena a que le van a cobrar. El nombre interno
del repositorio da igual: solo hay que cambiar el del **proyecto en Vercel**,
porque de ahí sale el subdominio.

1. Vercel → tu proyecto → **Settings → General → Project Name**. Ponle algo
   como `dinamyt-mi-club`. Al guardar, el dominio pasa a ser
   `dinamyt-mi-club.vercel.app`.

   > El dominio viejo **deja de responder**. Si ya le pasaste el enlace a
   > alguien, avísale.

2. **Actualiza Render.** Este es el paso que se olvida y deja la app inservible:
   `CORS_ORIGINS` y `MEMBRESIAS_WEB_URL` siguen apuntando al dominio anterior.
   Ve a Render → **Environment**, cámbialas por la URL nueva (sin barra final) y
   guarda; el servicio se reinicia solo.

3. Entra a la URL nueva y haz login. Si el login responde pero la pantalla queda
   vacía, es que el paso 2 quedó a medias.

Si más adelante quieres un dominio propio (`club.tudominio.com`), va en
**Settings → Domains**; el mismo paso 2 aplica igual.

---

## 4. Cerrar el círculo

Vuelve a Render → **Environment** y rellena lo que dejaste pendiente:

| Variable | Valor |
|---|---|
| `CORS_ORIGINS` | `https://tu-web.vercel.app` (sin barra final) |
| `MEMBRESIAS_WEB_URL` | Lo mismo |

Guarda: Render reinicia el servicio solo.

> Con el rewrite de Next, las peticiones llegan a Render desde el **servidor**
> de Vercel, no desde el navegador, así que CORS casi no interviene. Aun así
> conviene dejarlo bien puesto: cubre el acceso directo a la API y es lo que
> evita que cualquier otro sitio la use desde un navegador.

Si más adelante conectas un dominio propio, añádelo separado por comas:
`https://membresias.tudominio.com,https://tu-web.vercel.app`

### Cómo viaja la sesión

Vale la pena entenderlo porque explica varias decisiones de la configuración:

```
navegador  ──►  tu-web.vercel.app/api/...   (mismo origen: la cookie viaja)
                        │
                        ▼  rewrite de Next, servidor a servidor
                TU-SERVICIO.onrender.com   (MEMBRESIAS_API_ORIGIN)
```

El navegador **nunca** habla con Render. Si lo hiciera, la cookie de sesión
sería de terceros: Safari las bloquea siempre y Firefox las aísla, y la sesión
se perdería en cada recarga — justo lo que rompía la app en el iPhone. Pasando
por `/api`, quien pone la cookie es el dominio de la web y ningún navegador la
descarta.

De ahí salen dos reglas que no hay que romper:

- En Vercel va `MEMBRESIAS_API_ORIGIN`, **no** `NEXT_PUBLIC_API_URL`.
- En Render, `COOKIE_SAMESITE=lax`. Ponerlo en `none` la volvería de terceros
  otra vez.

---

## 4 bis. Si ya habías desplegado antes

Al hacer `git push`, Render **sí** reconstruye y redespliega el código solo
(Auto-Deploy viene activado). Lo compruebas en la pestaña **Events** del
servicio.

Lo que **no** viaja solo son las variables del `render.yaml`. Un despliegue
normal no vuelve a leer ese archivo: hay que sincronizar el Blueprint. Entra a
**Blueprints → tu blueprint** y aplica los cambios pendientes.

Después, verifica en **Environment** que estas tres estén puestas (son nuevas y
sin ellas la app queda a medias):

| Variable | Valor | Sin ella |
|---|---|---|
| `TRUST_PROXY_HOPS` | `2` | El límite de peticiones por IP se vuelve un cupo global: un solo usuario pesado bloquea a todo el club |
| `COOKIE_SAMESITE` | `lax` | — (es el valor por defecto, pero mejor explícito) |
| `COOKIE_SECURE` | `true` | La cookie de sesión viajaría también por HTTP |

Si prefieres no pelear con el Blueprint, ponlas a mano en **Environment**: es el
mismo resultado.

### Y revisa con qué rol te conectaste

Si en el primer despliegue usaste el usuario `postgres` de Supabase, tus tablas
son suyas y **RLS no te está protegiendo** (tiene `BYPASSRLS`). El nuevo código
te lo dirá en los logs al arrancar:

```
[SEGURIDAD] RLS no está protegiendo: el rol de conexión es SUPERUSER…
```

Para arreglarlo sin perder datos, en el **SQL Editor** de Supabase:

```sql
-- 1. El rol de la aplicación, que NO se salta las políticas.
create role membresias_app with login password 'UNA_CLAVE_LARGA' nobypassrls;
grant create on database postgres to membresias_app;

-- 2. Pasarle lo que ya existe. Hace falta que sea el DUEÑO: las migraciones
--    futuras hacen ALTER TABLE, y eso solo lo puede el dueño.
alter schema membresias owner to membresias_app;

do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'membresias' loop
    execute format('alter table membresias.%I owner to membresias_app', r.tablename);
  end loop;
  for r in
    select t.typname from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'membresias' and t.typtype = 'e'
  loop
    execute format('alter type membresias.%I owner to membresias_app', r.typname);
  end loop;
end $$;
```

Luego cambia el usuario de `MEMBRESIAS_DATABASE_URL` en Render por
`membresias_app` (conservando el sufijo `.PROJECT_REF` del pooler) y su
contraseña. Al reiniciar, ese mensaje de `[SEGURIDAD]` debe desaparecer.

> Ojo: el bloque de arriba solo toca el esquema `membresias`. No uses
> `reassign owned by postgres`, que arrastraría también los objetos internos de
> Supabase.

---

## 4 ter. Los avisos, cada mañana y sin que nadie pulse nada

Sin esto, los avisos de vencimiento solo existen cuando el maestro entra al
panel y pulsa **Generar avisos**. Con esto salen solos a las 8 de la mañana,
para todos los clubes.

Por qué el reloj lo lleva **Vercel** y no la API: el plan gratuito de Render
apaga el servicio cuando nadie lo usa y no ofrece tareas programadas, así que un
temporizador dentro del proceso moriría con él. Vercel trae cron incluido.

La cadena queda así:

```
cron de Vercel  →  GET  /cron/avisos  (en la web)
                →  POST /notifications/cron  (en la API, con x-cron-secret)
                →  recorre los clubes, encola avisos y manda los push
```

**Qué hay que hacer:**

1. Genera un secreto:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```

2. Ponlo como `CRON_SECRET` en **Vercel** (Settings → Environment Variables,
   marcado para *Production*) **y** en **Render** (Environment). **El mismo
   valor en los dos.**

3. Vuelve a desplegar la web. El horario vive en
   `apps/membresias-web/vercel.json` (`0 13 * * *` = 13:00 UTC = 8:00 en
   Colombia); cámbialo ahí si tu club va con otro huso.

4. Compruébalo a mano:

   ```bash
   curl -H "Authorization: Bearer TU_CRON_SECRET" https://tu-web.vercel.app/cron/avisos
   ```

   Debe responder algo como `{"ok":true,"clubes":1,"creados":0,"pushEnviados":0}`.
   `creados: 0` está bien si hoy no vence nadie.

Detalles que cuestan una tarde:

- **Sin `CRON_SECRET` en Render, la API responde 404** a esa ruta. Es a
  propósito: es la única que actúa sin sesión y no puede quedar abierta.
- **Sin `CRON_SECRET` en Vercel**, Vercel no firma la llamada y la ruta de la
  web responde 503.
- **El plan Hobby de Vercel ejecuta los crons una vez al día** y con una hora de
  margen sobre lo programado. Para avisos de vencimiento sobra.
- **La primera llamada del día despierta a Render** y puede tardar cerca de un
  minuto; por eso la ruta reintenta y espera hasta 60 segundos.
- **Los push necesitan además las llaves `VAPID_*`** en Render y
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY` en Vercel. Sin ellas los avisos se generan
  igual y se ven en la campana, pero no llega nada al celular.

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

### Mantener despierta la API con UptimeRobot

Mientras sigas en el plan gratis de Render, un *ping* periódico evita el minuto
de espera del primer acceso del día. En UptimeRobot: **New monitor → HTTP(s)**,
cada **5 minutos**, y como URL la del servicio de **Render** con `/health`:

```
https://TU-SERVICIO.onrender.com/health
```

Debe responder `{"status":"ok","service":"membresias-api"}`.

Tres detalles que importan:

- **La URL de Render, no la de Vercel.** Vercel no se duerme, así que pincharla
  no despierta a nadie. Sirve también `https://tu-web.vercel.app/api/health`,
  que llega a Render por el rewrite y de paso comprueba la cadena entera; pero
  entonces una caída de Vercel se ve como si la API estuviera mal.
- **Copia la URL real del panel de Render**, no la deduzcas del nombre del
  `render.yaml`: si el nombre estaba tomado, Render le pega un sufijo.
- **`/health` no toca la base de datos** — está fuera del contexto RLS a
  propósito. Despierta el proceso sin gastar conexiones de Supabase, y por eso
  mismo **no** evita que Supabase se pause: eso lo evita el uso real del club.

Ojo con las horas: el plan gratis de Render da 750 horas de instancia al mes y
un servicio despierto todo el mes consume ~730. Cabe si es el único servicio
gratis de la cuenta; si hay más, se reparten el cupo y alguno se quedará sin
horas antes de fin de mes.

### Migraciones: el `when` tiene que subir siempre

Drizzle **no** aplica las migraciones por número de archivo, sino por la marca
`when` del `meta/_journal.json`: corre las que superen a la última aplicada, y
guarda ese número en su tabla de control. Una migración con un `when` más bajo
que la anterior **se da por aplicada y no se ejecuta nunca** — sin error y sin
aviso; la columna no aparece y la API responde 500 la primera vez que la use.

Las migraciones 0003 a 0005 llevan marcas escritas a mano con fechas futuras,
así que **toda migración generada por `drizzle-kit` nace por debajo** y hay que
subirle el `when` a mano antes de desplegarla.

No se renumeran esas tres porque bajarlas rompería las bases que ya las
aplicaron: la tabla de control guarda el número viejo y cualquier migración
futura por debajo quedaría ignorada para siempre. La marca de una migración
publicada es historia, no configuración.

La regla la vigila un test (`packages/membresias-db/src/migraciones.spec.ts`):
si falla, sube el `when` de la migración nueva por encima de la anterior.

```bash
pnpm --filter @dinamyt/membresias-db test
```

### Las imágenes: dónde caben y hasta cuándo

Son dos: la **foto de cada alumno** y el **escudo del club** (uno por club, así
que en la cuenta de abajo no pesa).

**Ni Render ni Vercel guardan archivos.** El disco de Render se borra en cada
despliegue y en cada reinicio del plan gratuito; el de Vercel es de solo
lectura. Así que una imagen subida «al servidor» desaparecería sola. Por eso va
dentro de la fila —`users.avatar_url`, `orgs.logo_url`—, en Supabase (ver
`apps/membresias-api/src/lib/imagenes.ts`).

Para que eso no se convierta en un problema, el navegador recorta la foto a un
cuadrado, la reduce a 400×400 y la recomprime en JPEG antes de mandarla. Sale
en torno a **25 KB**, y la API rechaza cualquier cosa por encima de 66 KB.

Con eso, la cuenta de los 500 MB del plan gratis de Supabase:

| Alumnos con foto | Ocupan | De los 500 MB |
|---|---|---|
| 100 | ~2,5 MB | 0,5 % |
| 1 000 | ~25 MB | 5 % |
| 5 000 | ~125 MB | 25 % |
| 10 000 | ~250 MB | 50 % |

Las fotos no son el límite: **el resto de la base crece más rápido que ellas.**
Un club de 100 alumnos con dos años de pagos y asistencias pesa más que sus 100
retratos. Y 10 000 alumnos con foto siguen entrando en el plan gratis.

Lo que sí había que cuidar es el **tráfico**, no el disco: si la foto viajara
dentro del JSON, cada carga del roster de 200 alumnos serían ~5 MB, y los 5 GB
de salida mensual de Supabase se irían en unas mil pantallas. No pasa: la API
devuelve la *dirección* de la foto (`GET /users/:id/foto`), que responde la
imagen en binario con caché de un año. El navegador la pide una vez por alumno
y luego la saca de su propia caché.

**Cuándo mudarse a un bucket** (Supabase Storage, Cloudflare R2): cuando quieras
imágenes de más resolución que la del carnet, o pases de las decenas de miles de
alumnos. Ese día solo cambia dónde se guardan: las columnas ya aceptan un
`https://` y toda la web pasa por `urlFoto()`, así que ni las pantallas ni el
carnet se enteran.

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
| Al recargar la página se cierra la sesión (sobre todo en iPhone) | Tienes `NEXT_PUBLIC_API_URL` puesta en Vercel: el navegador llama directo a Render y la cookie pasa a ser de terceros. Bórrala y deja solo `MEMBRESIAS_API_ORIGIN` |
| Todas las peticiones dan 404 sobre `/api/...` | Falta `MEMBRESIAS_API_ORIGIN` en Vercel, así que el rewrite apunta a `127.0.0.1` |
