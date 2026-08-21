# DINAMYT — Reglas que no se negocian, y comandos que vas a repetir

> Léelo antes de tocar código o el servidor. Casi todo lo que hay aquí está
> escrito porque **ya se rompió una vez**.

---

# PARTE 1 · Las reglas

## 1.1 Dónde se edita cada cosa

| Si vas a tocar… | Se edita en… | ⚠️ |
|---|---|---|
| Portal, identidad, Academy | `dinamyt` (este repo), en `apps/` | |
| **Membresías** | `D:\Repositorios\dinamyt-membresias` | **NUNCA** en `productos/membresias` |
| **Campeonatos** | `dinamyt-combat` (sin clonar todavía) | **NUNCA** en `productos/campeonatos` |

`productos/` son **espejos** traídos con `git subtree`. Un cambio hecho ahí se
pierde en la siguiente sincronización, **y se pierde en silencio**. Para ponerlos
al día:

```powershell
.\scripts\sync-apps.ps1
```

## 1.2 El orden al desplegar (romperlo tira el login)

1. `git push` desde tu PC — **el VPS clona de GitHub, no de tu disco**.
2. En el servidor: `git pull` → `pnpm install` → **compilar**.
3. **Migrar la base ANTES de reiniciar.** El código nuevo lee columnas que crea
   la migración; al revés, todos los inicios de sesión fallan. Mientras no
   reinicies, el servicio sigue con el código viejo y la base migrada no le
   molesta.
4. Reiniciar el servicio.

> **Membresías es la excepción**: aplica sus migraciones **ella sola al
> arrancar**, y si fallan no arranca. Ahí reiniciar ES migrar.

## 1.3 Qué obliga a volver a compilar

- Cualquier variable **`NEXT_PUBLIC_*`** y `MEMBRESIAS_API_ORIGIN`: viven dentro
  del build. Cambiarlas y solo reiniciar **no hace nada**.
- Cambios en `packages/shared` o `membresias-db`: compilar el paquete **antes**
  que quien lo consume.

## 1.4 Las variables que parecen opcionales y no lo son

| Variable | Dónde | Si falta… |
|---|---|---|
| `TRUST_PROXY_HOPS` | las tres APIs | Todo el mundo cae en el mismo cubo del limitador: 10 inicios de sesión por minuto **para la plataforma entera**. `1` = solo Caddy · `2` = con Cloudflare |
| `ECOSYSTEM_JWKS_URL` | membresias-api | El SSO no existe: saltas desde el portal y te vuelve a pedir la contraseña. **Vacía a propósito solo en el modo local del campeonato** |
| `NEXT_PUBLIC_ECOSYSTEM_PORTAL_URL` | membresias-web | No aparece «entrar con DINAMYT» ni el camino de vuelta |
| `PORTAL_URL` | ecosystem-api | El enlace de invitación lleva a una página que no existe |
| `SMTP_HOST` | ecosystem-api | No hay correo — **y eso es un estado válido**: la invitación devuelve el enlace para mandarlo por WhatsApp |
| `ECOSYSTEM_SYNC_SECRET` | ecosystem-api **y** membresias-api | **El mismo valor en las dos.** Sin él, la foto, el escudo y el cinturón que se guardan en el portal no llegan a Membresías: el carnet se sigue imprimiendo con lo que hubiera. En Membresías `POST /sync/persona` responde 404 |
| `MEMBRESIAS_SYNC_URL` | ecosystem-api | Lo mismo: el portal no sabe a quién avisar. Es el origen de membresias-api (`https://membresias-api.dinamyt.org`), sin barra final |

## 1.5 Lo que nunca se hace

- **Tocar nada entre el 1 y el 13 de octubre.** Campeonato el 9, 10 y 11.
- **Desplegar sin respaldo** si la migración toca datos.
- **Exigir correo para que alguien entre.** Quien no tiene correo usable entra
  con carnet QR o PIN, y su ficha vive sin cuenta.
- **Propagar `is_super_admin` automáticamente.** Se concede a mano, mirando.
- **Romper el modo local de Campeonatos.** Sin internet, sin ecosistema, tiene
  que arrancar igual: es la marcha atrás del día del evento.

---

# PARTE 2 · Comandos

## 2.1 En tu PC, antes de empujar

```bash
pnpm --filter @dinamyt/ecosystem-api exec tsc -p tsconfig.build.json --noEmit
```

```bash
pnpm --filter @dinamyt/ecosystem-api exec jest
```

```bash
pnpm --filter @dinamyt/ecosystem-api reconciliar:ensayo
```

El último levanta un PostgreSQL de verdad (en WebAssembly), le aplica las
migraciones reales y corre la reconciliación dos veces. Si tocas algo de
identidad, esto tiene que seguir en verde.

## 2.2 En el servidor, todos los días

| Para qué | Comando |
|---|---|
| Entrar | `ssh dinamyt@80.190.78.70` |
| ¿Está viva? | `sudo systemctl status dinamyt-id` |
| ¿Por qué falló? | `sudo journalctl -u dinamyt-id -n 50 --no-pager` |
| Reiniciar | `sudo systemctl restart dinamyt-id` |
| Entrar a la base | `sudo -u postgres psql -d dinamyt` |
| Memoria y disco | `free -h` · `df -h /` |

Los servicios son: `dinamyt-id`, `dinamyt-portal`, `membresias-api`,
`membresias-web`, `campeonatos-api`, `campeonatos-web`.

## 2.3 Desplegar

```bash
cd /srv/dinamyt && git pull && pnpm install --frozen-lockfile && pnpm --filter @dinamyt/shared build && pnpm --filter @dinamyt/ecosystem-api build && pnpm --filter @dinamyt/ecosystem-portal build
```

```bash
cd /srv/dinamyt/apps/ecosystem-api && pnpm db:migrate && sudo systemctl restart dinamyt-id dinamyt-portal
```

```bash
cd /srv/membresias && git pull && pnpm install --frozen-lockfile && pnpm --filter @dinamyt/membresias-db build && pnpm --filter @dinamyt/membresias-api build && pnpm --filter @dinamyt/membresias-web build && sudo systemctl restart membresias-api membresias-web
```

## 2.4 Respaldar antes de tocar

```bash
sudo -v && sudo -u postgres pg_dump -Fc dinamyt > ~/respaldo-$(date +%F).dump && sudo mv ~/respaldo-$(date +%F).dump /var/backups/
```

> El `>` lo ejecuta **tu** shell, no `sudo`: escribir directo en `/var/backups`
> da `Permission denied`. Y **nunca** `sudo … | sudo tee …`: los dos `sudo`
> piden contraseña al mismo teclado y se cuelga sin decir por qué.

## 2.5 La reconciliación de identidades

```bash
cd /srv/dinamyt/apps/ecosystem-api && sudo -u postgres RECONCILIACION_DATABASE_URL=postgresql:///dinamyt node scripts/reconciliar-identidades.mjs --informe /tmp/ensayo.json
```

Sin `--aplicar` es un ensayo: hace **todo** el trabajo y deshace la transacción.
El informe va a `/tmp` porque quien escribe es el usuario `postgres`, que no
entra en `/root`.

---

# PARTE 3 · Las trampas que ya nos costaron una tarde

## 3.1 Una transacción olvidada secuestra la base entera

Campeonatos lanza `ALTER TABLE … ENABLE ROW LEVEL SECURITY` **en cada arranque**.
Si hay una sesión `idle in transaction`, ese `ALTER` se queda en cola — **y un
candado exclusivo en cola bloquea a todo el que llega detrás, aunque solo quiera
leer**. Síntoma: `pg_dump` «lento» que en realidad nunca arrancó. Sin un solo
error en ningún registro.

```bash
sudo -u postgres psql -d dinamyt -c "select pid, state, wait_event_type, pg_blocking_pids(pid) as bloqueado_por, left(query,60) from pg_stat_activity where datname='dinamyt';"
```

Si al matar la sesión aparece otra igual, **es la app regenerándola**: párala
(`sudo systemctl stop campeonatos-api`), haz lo tuyo, y levántala.

El parche permanente ya está puesto:
`ALTER DATABASE dinamyt SET idle_in_transaction_session_timeout = '5min'`.

## 3.2 `postgresql:///base` no significa lo mismo para todos

Para `psql` es «por el socket Unix». Para el driver de Node es **TCP a
localhost**, donde PostgreSQL sí pide contraseña — de ahí un
`password authentication failed for user "postgres"` que no tiene nada que ver
con permisos. El guion ya lo resuelve solo; si te pasa con otro, delante:
`PGHOST=/var/run/postgresql`.

## 3.3 El mensaje de error que se comía a sí mismo

NestJS responde `{ "message": "la explicación", "error": "Unauthorized" }`.
`error` es el **nombre del código HTTP**, no una explicación. El portal lo leía
primero, así que todo fallo se veía como «Unauthorized». Si escribes código de
frontend nuevo: **primero `message`**.

## 3.4 Un enlace firmado no es una sesión

Todo lo que firma el ecosistema usa la misma llave RS256. Lo único que
distingue una sesión de un enlace de invitación es el **emisor**, y hay que
comprobarlo: sin eso, un enlace de siete días que viaja por WhatsApp abría
`/auth/me` como sesión iniciada. Si añades otro tipo de token firmado, dale su
propio emisor **y** su `purpose`.

> **Y hay que comprobarlo en cada app que verifique tokens del ecosistema, no
> solo en el ecosistema.** El `verificadorEcosystem` de Membresías aceptaba
> cualquier firma RS256 válida sin mirar el emisor: el mismo enlace de
> invitación entraba ahí como sesión. Corregido el 20 de agosto — exige emisor
> `dinamyt-ecosystem` y rechaza cualquier token con `purpose`. **Campeonatos
> tiene que revisar lo mismo cuando escriba su verificador (bloque C1).**

## 3.5 El bucle entre el login y la pantalla de dentro

Salir de Membresías, pulsar «entrar con DINAMYT» y quedar rebotando entre el
formulario de entrada y el panel del club, sin un solo error en pantalla.
**Eran tres fallos encadenados, y cada uno solo se ve cuando se arreglan los
otros dos:**

1. **El portal daba por sesión cualquier cadena guardada.** No miraba el `exp`,
   así que un token de ayer pasaba todos los guards del navegador: la pantalla
   se pintaba, pedía datos, recibía 401 y rebotaba al login… que volvía a
   encontrar el mismo token. Ahora `obtenerToken()` borra el que ya caducó.
2. **El portal entregaba esa sesión sola.** Con `?redirect=` de una app, la
   devolvía sin preguntar — aunque fuera **de otra persona**. Ahora enseña de
   quién es y ofrece «continuar como…» o «entrar con otra cuenta».
3. **La sesión de Membresías por SSO no era una sesión.** El token del portal
   se quedaba en una variable del navegador y nunca se convertía en cookie:
   funcionaba hasta la primera recarga. Ahora se canjea en `POST /auth/sso`,
   que devuelve la MISMA cookie httpOnly que el login por contraseña.

> **La regla general, para lo que venga:** una sesión es lo que el servidor
> reconoce, no lo que el navegador guardó. Y quien redirige tiene que cambiar
> algo en cada vuelta —borrar el token muerto, pedir una decisión—, o construye
> un bucle sin darse cuenta.

⚠️ Una ruta que abre su propia transacción (`sinFiltroDeClub`) va en la lista
`SIN_CONTEXTO` de `plugins/rls.ts`. Si se olvida, **no da error: se cuelga**,
porque el envoltorio de RLS ya abrió una y PGlite es de una sola conexión.
`/auth/login`, `/auth/acceso-qr` y `/auth/sso` están ahí por eso.

## 3.6 `window.location` en el render de una página que se pre-renderiza

En el servidor `window` no existe, así que esto:

```tsx
href={`${PORTAL}/login?redirect=${encodeURIComponent(
  typeof window !== 'undefined' ? window.location.origin : '')}`}
```

sale al HTML con `?redirect=` **vacío**, y React **no corrige los atributos que
no cuadran al hidratar** — lo dice en la consola: «this won't be patched up».
El enlace se queda roto para siempre: entras por el portal y el portal no sabe
a dónde devolverte. Le pasaba a Academy.

Se calcula **al pulsar**, no al pintar: un `<button>` con `onClick` que arma la
dirección y navega. En Membresías no se notaba porque su botón vive dentro de
un `{sso && …}` que solo aparece después de hidratar.

## 3.7 Un `<select>` cuyo valor no está entre sus opciones MIENTE

No se queda vacío ni avisa: el navegador enseña **la primera opción**. El panel
del super-admin ofrecía `admin, maestro, coach, judge, competitor, member`, y la
reconciliación escribe `student`, `staff` y `guardian`. Resultado: todos los
alumnos importados aparecían como **«admin»** sin serlo. Y lo caro no es la
mentira, es lo que provoca — quien la ve intenta corregirla, y al hacerlo
sobrescribe el rol de verdad con uno inventado.

La regla, para cualquier desplegable de datos existentes:

> **El valor actual va SIEMPRE entre las opciones**, aunque esa pantalla no lo
> pueda asignar. Una línea: `[...new Set([actual, ...asignables])]`.

Vive en `apps/ecosystem-portal/src/lib/roles.ts` (`opcionesDeRol`), junto al
catálogo único de nombres de rol. Antes cada pantalla tenía el suyo y la misma
persona se llamaba «student» en un panel y «Alumno» en otro.

## 3.8 Un rol no es «el» rol: hay cuatro, y por buenas razones

`org_members` guarda el GENERAL (`role`, el del portal: quién gestiona el club)
y uno por app (`role_membresias`, `role_campeonatos`, `role_academy`, la verdad
de cada producto). No sobran —la misma persona es alumno en su club y juez en un
campeonato—, pero la API solo devolvía el general, así que desde fuera parecía
que los datos se contradecían. `GET /organizations/:id/members` devuelve los
cuatro y el portal los enseña. **Si añades una pantalla que toque roles, enseña
de cuál estás hablando.**

## 3.9 Si se pagina, se busca en el SERVIDOR

Paginar y dejar el buscador filtrando en el navegador es **peor que no paginar**:
el buscador solo encuentra a quien ya se descargó, así que el alumno de la
página tres deja de existir. Y no da error — devuelve «no hay nadie», que se lee
como un dato y no como un fallo.

Los tres listados de gente ya lo hacen bien (`?q=` / `?search=` viajan junto a
`limit` y `offset` y se aplican en la consulta): `/users` y `/orgs/:id/users` de
Membresías, y `GET /organizations/:id/members` del ecosistema. **Si añades otro
listado con páginas, la búsqueda va en el `WHERE`.**

Dos detalles que se olvidan siempre:

- **Al escribir hay que volver a la página 1.** Buscar desde la cuarta muestra
  «ninguno» con los resultados esperando en la primera.
- **Espera antes de consultar.** Sin ella, teclear «Rodríguez» dispara nueve
  peticiones y pueden volver desordenadas: la de «Rodrí» llegando después que la
  de «Rodríguez» y pisando el resultado bueno. 250 ms bastan.

## 3.10 Un `<label>` que envuelve un botón lo dispara

El selector de fecha propio (`CampoFecha`) no es un `<input>`: es un `<button>`
que abre un panel. Metido dentro de un `<label>`, pulsar el TEXTO de la etiqueta
abre el calendario — el navegador reenvía el clic al control que envuelve. Se ve
como un panel que se abre solo.

Por eso esos campos usan `<div className="block text-sm">` con un `<span>`
dentro, y no `<label>`. La misma regla vale para cualquier control propio que no
sea un control nativo.

Y como no es un `<input required>`, **el navegador no detecta que está vacío**:
si el campo es obligatorio hay que comprobarlo a mano antes de enviar, o el
error llega del servidor, tarde y en otro sitio de la pantalla.

## 3.11 Cloudflare cambia las reglas del juego

Con la nube naranja: `TRUST_PROXY_HOPS=2`, SSL/TLS en **Full (strict)**, puerto
80 abierto (renovación del certificado), y **ningún registro DNS gris apuntando
a tu IP** — uno solo tira a la basura todo el beneficio. Un subdominio proxiado
sin nada detrás da **525**.

---

# PARTE 4 · Dónde está cada documento

| Documento | Para qué |
|---|---|
| [README.md](README.md) | Qué es cada pieza y cómo está organizado el repo |
| [RUN_LOCAL.md](RUN_LOCAL.md) | Correr todo en tu PC, sin Docker |
| [VPS-PASO-A-PASO.md](VPS-PASO-A-PASO.md) | El servidor, de cero. Anexos: pendientes (C), Cloudflare (D), correo (E) |
| [IDENTIDAD-PASO-A-PASO.md](IDENTIDAD-PASO-A-PASO.md) | Dar cuenta del ecosistema a quien ya existía |
| [PUESTA-AL-DIA.md](PUESTA-AL-DIA.md) | **Desplegar el puente de altas**: código de club, ficha que nace sola, foto y cinturón. Con su marcha atrás |
| [CONTINGENCIA-CAMPEONATO.md](CONTINGENCIA-CAMPEONATO.md) | Si se cae todo el día del campeonato |
| [UNA-SOLA-APP.md](UNA-SOLA-APP.md) | Que las tres apps se sientan una sola (bloque B5) |
| `productos/campeonatos/PLAN-ECOSYSTEM-VPS.md` | El plan maestro y su tablero. **Se edita en `dinamyt-combat`** |
