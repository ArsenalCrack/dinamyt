# DINAMYT — Operar el ecosistema

> Léelo antes de tocar código o el servidor. Casi todo lo que hay aquí está
> escrito porque **ya se rompió una vez**.
>
> Para montar el servidor desde cero: [MONTAR-VPS.md](MONTAR-VPS.md).
> Para saber qué es cada pieza y correrlo en tu PC: [README.md](README.md).
> Lo que queda por hacer, en orden: [HOJA-DE-RUTA.md](HOJA-DE-RUTA.md).
> El día del campeonato, sin internet: `INICIAR-LOCAL.md` de Campeonatos
> (`D:\Repositorios\dinamyt-combat`, espejado en `productos/campeonatos/`).

**Estado: en producción desde el 20 de agosto de 2026**, en un VPS propio, con
una sola base PostgreSQL y un esquema por app. Todo lo que hable de Vercel,
Render o Supabase es historia: está en el registro de git, no aquí. Lo mismo
los planes ya cumplidos: las decisiones que siguen mandando están en §1.6.

> **Al cambiar comportamiento, buscar qué sección lo cuenta.** Lo que más
> engaña en un documento así no es una ruta que ya no existe: es un nombre que
> sigue ahí y ahora hace otra cosa.

---

# PARTE 1 · Las reglas

## 1.1 Dónde se edita cada cosa

| Si vas a tocar… | Se edita en… | ⚠️ |
|---|---|---|
| Portal, identidad, Academy | `dinamyt` (este repo), en `apps/` | |
| **Membresías** | `D:\Repositorios\dinamyt-membresias` | **NUNCA** en `productos/membresias` |
| **Campeonatos** | `D:\Repositorios\dinamyt-combat` | **NUNCA** en `productos/campeonatos` |

`productos/` son **espejos** traídos con `git subtree`. Un cambio hecho ahí se
pierde en la siguiente sincronización, **y se pierde en silencio**: `git subtree
pull` no avisa de lo que aplasta. Para ponerlos al día:

```powershell
.\scripts\sync-apps.ps1
```

**El despliegue clona los tres repositorios**, no este espejo — así un despliegue
nunca depende de que alguien se acordara de sincronizar.

> ⚠️ **Y el aviso tiene una segunda mitad, que es la que muerde de verdad:
> estar desfasado también es silencioso.** Como el despliegue no los usa, nadie
> los sincroniza por obligación y se quedan atrás sin que nada lo diga. El 3 de
> septiembre de 2026, `productos/membresias` iba **ocho commits por detrás** —
> del 1 de septiembre—, así que quien buscara ahí un fallo estaría leyendo
> código de hace una semana y podría pasar la tarde depurando algo **ya
> arreglado**.
>
> **La regla práctica, para las dos direcciones:** antes de leer código de
> `productos/` para entender un fallo, o de escribir una línea en él, comprueba
> contra el repositorio de verdad. Si tienes que mirar más de un archivo, corre
> `sync-apps.ps1` primero. Y si estás escribiendo: **no estás en el sitio.**

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
- **Archivos de `apps/ecosystem-api/src/assets/`** (hoy, el escudo de los
  correos): los copia `nest build` gracias a `nest-cli.json`. Si el correo sale
  sin logo, es que `dist/assets/` está vacío.

## 1.4 Las variables que parecen opcionales y no lo son

| Variable | Dónde | Si falta… |
|---|---|---|
| `TRUST_PROXY_HOPS` | las tres APIs | Todo el mundo cae en el mismo cubo del limitador: 10 inicios de sesión por minuto **para la plataforma entera**. `1` = solo Caddy · `2` = con Cloudflare |
| `ECOSYSTEM_JWKS_URL` | membresias-api **y campeonatos-api** | El SSO no existe: saltas desde el portal y te vuelve a pedir la contraseña. Y ahora también: «Salir» ya no pasa por el portal, así que la sesión de DINAMYT queda viva (§5.12). **Vacía a propósito solo en el modo local del campeonato** — salvo en el PC del evento que quiera subir solo los resultados al volver la red (F8, `INICIAR-LOCAL.md` §7.2, junto con `CAMPEONATOS_ONLINE_URL` en `https://`); sin internet no estorba, porque el QR del juez ya no sale a la red. El portal le devuelve el pase solo a `http://localhost:3000` / `127.0.0.1:3000` —el PC visto desde sí mismo, nunca su IP de la LAN— (`destinoSeguro`, `apps/ecosystem-portal/src/lib/apps.ts`) |
| `NEXT_PUBLIC_ECOSYSTEM_PORTAL_URL` | membresias-web **y campeonatos-web** | No aparece «entrar con DINAMYT» ni el camino de vuelta. En Campeonatos el valor por defecto ya es `https://dinamyt.org`, así que solo estorba si el portal vive en otro dominio |
| `NEXT_PUBLIC_CAMPEONATOS_URL` | ecosystem-portal | `PORTAL/salir?redirect=…` **descarta el destino** —está en lista blanca (`lib/apps.ts`)— y quien sale de Campeonatos aterriza en el login del portal en vez del suyo. Sin ella vale `http://localhost:3003`, que en el VPS no es nadie |
| `PORTAL_URL` | ecosystem-api | El enlace de invitación lleva a una página que no existe, y el pie de los correos apunta a ninguna parte |
| `SMTP_HOST` | ecosystem-api | No hay correo — **y eso es un estado válido**: ver §3 |
| `CRON_SECRET` | ecosystem-api | El aviso diario de suscripciones **no existe** (la ruta responde 404). El botón del panel sigue funcionando |
| `ECOSYSTEM_SYNC_SECRET` | ecosystem-api, membresias-api **y campeonatos-api** | **El mismo valor en las tres.** En Membresías: la foto, el escudo, el cinturón, la contraseña **y el rol** que se guardan en el portal no llegan — el carnet se sigue imprimiendo con lo que hubiera, la contraseña vieja sigue valiendo, y cambiar a alguien a maestro no se nota allí (§4.7). En **Campeonatos**: el tema y el idioma **no viajan en ninguna de las dos direcciones** (§4.21), y el juez que se da de alta en `/admin` nace con contraseña de allí, **sin cuenta de DINAMYT** (§4.4). Es a propósito que el PC del evento NO la lleve |
| `MEMBRESIAS_SYNC_URL` | ecosystem-api | Lo mismo: el portal no sabe a quién avisar. Es el origen de membresias-api (`https://membresias-api.dinamyt.org`), sin barra final |
| `MEDIA_PUBLIC_URL` | ecosystem-api | **El interruptor de las fotos en disco** (§4.20). Sin ella no falla nada: las imágenes se siguen guardando incrustadas en la fila, como siempre. Con ella van al disco **y** el espejo las manda absolutas — las dos cosas a la vez, y por eso es una sola variable. ⚠️ **Tiene que ser `https://`**: Membresías solo acepta `data:` o `https://`, y su rechazo es mudo |

## 1.5 Lo que nunca se hace

- **Desplegar durante un campeonato, ni la víspera.** Con gente delante y una
  llave en marcha no se sube nada, y punto; el día anterior solo entran
  arreglos, nada de estrenos. El resto del tiempo se trabaja normal: congelar
  semanas enteras amontona lo aplazado en un solo despliegue grande, que es la
  forma más segura de estrenar un fallo. *(Hoy no hay campeonato con fecha: el
  de octubre de 2026 no se celebró.)*
- **Desplegar sin respaldo** si la migración toca datos.
- **Exigir correo para que alguien ENTRE cada día.** El alumno marca asistencia
  con su carnet QR o su PIN, sin escribir nada. Eso no se toca.

  > **Darse de alta sí pide correo, y es a propósito** *(precisado el 30 ago
  > 2026)*. El menor usa el de su padre o su madre — es la dirección que se
  > verifica, y verificarla es el punto: es lo que convierte una fila en una
  > persona con cuenta. Lo que no se puede es pedirlo para el gesto diario.
- **Propagar `is_super_admin` automáticamente.** Se concede a mano, mirando.
- **Dejar a alguien fuera de lo que administra, y menos a sí mismo.** Ya pasó:
  una ✕ en el panel sacó al MAESTRO de su propio club, y el club se quedó sin
  quien editara su ficha, repartiera su código o mirara a su gente — su maestro
  incluido, porque el permiso cuelga de esa misma fila. Hoy lo impiden las dos
  reglas del servidor (§4.7-bis), **en las tres aplicaciones**; si hace falta
  cerrar un club de verdad, **primero se desactiva**.
- **Romper el modo local de Campeonatos.** Sin internet, sin ecosistema, tiene
  que arrancar igual: es la marcha atrás del día del evento.

## 1.6 Las decisiones de fondo

Vienen de los planes ya cumplidos —`PLAN-ECOSYSTEM-VPS.md` y
`PLAN-CAMPEONATOS.md`, borrados el 26 sep 2026; siguen en la historia de
`dinamyt-combat` (`git show 9e1d4e1:PLAN-CAMPEONATOS.md`)—. El código las cita
como «F3 de PLAN-CAMPEONATOS» o «D9»; esto es lo que siguen mandando:

| # | Decisión | Dónde se nota |
|---|---|---|
| 1 | **El ecosistema es el único emisor de identidad.** Las apps validan el RS256 contra el JWKS; no firman pases | §4.1 |
| 2 | **Una base `dinamyt`, un esquema por app** | §2.5, §2.6 |
| 3 | **Los repos de Campeonatos y Membresías mandan**; el monorepo los espeja | §1.1 |
| 4 | **Las cuentas nacen en el ecosistema.** El maestro crea *fichas* e *invita* | §4.4 |
| 5 | **El club vive en el ecosistema** (`organizations`); cada app guarda un espejo | §4.5, §4.16 |
| 7 | **Las altas del día del evento no suben solas**: se pasan a mano desde `instance/` | `INICIAR-LOCAL.md` §0 |
| 8 | **Una base de código, y un candado decide quién opera** cada campeonato (`sede`) | **Sin hacer** — `HOJA-DE-RUTA.md` |
| 9 | **Durante el evento el local publica hacia arriba y nunca descarga** | **Sin hacer** — `HOJA-DE-RUTA.md` |
| 10 | **El documento es la llave entre un competidor y una persona** (`competidores.documento` ↔ `users.document_id`) | §4.13 |
| 11 | **La organización contrata y sus clubes heredan**; Membresías sigue siendo por club | §4.5 |
| 12 | **El login propio de cada app es la marcha atrás y no se retira**; lo que se retira es *crear cuentas* | §4.13 |
| D1 | El panel del alumno en Campeonatos es **de solo mirar**; inscribir es del maestro | §4.13 |
| D2 · D9 | **El portal da papeles en Campeonatos, y lo que dio el portal lo quita el portal** al entrar (`roles_del_portal`). Lo puesto a mano en la consola y `admin` no se tocan | §4.13 |
| D5 | **El competidor sin club también se inscribe**: su ficha no depende de tener cuenta | §4.13 |
| D8 | **El juez de internet nace en DINAMYT** (`/sync/alta`, `app: campeonatos`); el interruptor es `ECOSYSTEM_SYNC_SECRET`, no `ECOSYSTEM_JWKS_URL` | §4.4 |
| D10 | **El plan vencido en Campeonatos lo corta el pase, y basta.** La consola no le pone contraseña a una cuenta de DINAMYT. Nunca afecta al modo local | §4.16 |

Y los límites que se aceptaron sabiendo que no tienen arreglo:

- **Pasarse a local a mitad de campeonato es imposible** (`INICIAR-LOCAL.md` §0).
- **Dos personas creadas sin red en dos sitios son dos identidades.** El sistema
  puede proponer coincidencias —documento, nombre + club, nacimiento—, pero
  **confirma una persona**.
- **Una sesión revocada sigue entrando en Campeonatos y Academy hasta 30 min**:
  verifican la firma sin preguntar a nadie (§4.11).
- **Sin internet no existe el ecosistema**: en el PC del evento se entra con la
  contraseña de esa instalación o con el QR del tatami.

---

# PARTE 2 · Comandos

## 2.1 En tu PC, antes de empujar

```bash
pnpm turbo build test
```

```bash
pnpm --filter @dinamyt/ecosystem-api reconciliar:ensayo
```

```bash
pnpm --filter @dinamyt/ecosystem-api sesion:ensayo
```

El segundo levanta un PostgreSQL de verdad (en WebAssembly), le aplica las
migraciones reales y corre la reconciliación dos veces. Si tocas algo de
identidad, esto tiene que seguir en verde.

El tercero hace lo mismo con el reloj de las sesiones, y **pone la base en la
zona del VPS a propósito**: es lo único que destapa el desfase de §5.1-bis, que
en local no se ve porque PGlite arranca en UTC.

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

> **Para leer un registro de arranque, `--since` y no `-n 20`.** Nest imprime
> una línea por cada una de sus rutas al arrancar, así que la cola corta se
> traga los mensajes que importan:
> ```bash
> sudo journalctl -u dinamyt-id --since "5 min ago" --no-pager | grep -iE "correo|smtp"
> ```

## 2.3 Desplegar el ecosystem

```bash
cd /srv/dinamyt && git pull && pnpm install --frozen-lockfile && pnpm --filter @dinamyt/shared build && pnpm --filter @dinamyt/ecosystem-api build && pnpm --filter @dinamyt/ecosystem-portal build
```

```bash
cd /srv/dinamyt/apps/ecosystem-api && pnpm db:migrar
```

```bash
sudo systemctl restart dinamyt-id dinamyt-portal && sudo systemctl status dinamyt-id --no-pager
```

> **`db:migrar`, no `db:migrate`.** El segundo es `drizzle-kit`, que es una
> **devDependency**: en un servidor instalado con `--prod` no está, y falla con
> «drizzle-kit: not found», un error que no dice nada de bases de datos.
> `db:migrar` usa el migrador de `drizzle-orm` —mismo diario, mismo orden,
> mismos ficheros— y funciona con dependencias de producción.

## 2.3-bis Desplegar Academy

```bash
cd /srv/dinamyt && git pull && pnpm install --frozen-lockfile && pnpm --filter @dinamyt/shared build && pnpm --filter @dinamyt/academy-db build && pnpm --filter @dinamyt/academy-api build && pnpm --filter @dinamyt/academy-web build
```

```bash
cd /srv/dinamyt/packages/academy-db && pnpm db:migrar
```

```bash
sudo systemctl restart academy-api academy-web && sudo systemctl status academy-api --no-pager
```

> ⚠️ **Academy todavía no está montada en la VPS** (§4.14): estos comandos son
> para cuando lo esté. El montaje, en MONTAR-VPS Anexo B.
>
> **`db:migrar`, no `db:migrate`** — la misma trampa que en el ecosystem.
>
> Si falla con **«type … already exists»**, el diario está en el esquema
> equivocado (lo dejaban así las bases sembradas por la versión vieja de
> `db:local:setup`). Una vez, mirando lo que dice:
>
> ```bash
> cd /srv/dinamyt/packages/academy-db && pnpm db:migrar --mover-diario
> ```

## 2.4 Desplegar Membresías

```bash
cd /srv/membresias && git pull && pnpm install --frozen-lockfile && pnpm --filter @dinamyt/membresias-db build && pnpm --filter @dinamyt/membresias-api build && pnpm --filter @dinamyt/membresias-web build && sudo systemctl restart membresias-api membresias-web
```

Aquí reiniciar ES migrar. Si la API **no arranca**, es que la migración falló:
ese es el aviso, no un misterio.

## 2.4-bis Desplegar Campeonatos

```bash
cd /srv/campeonatos && git pull && backend/venv/bin/pip install -r backend/requirements.txt && cd frontend && npm ci && npm run build && sudo systemctl restart campeonatos-api campeonatos-web && systemctl is-active campeonatos-api campeonatos-web
```

> **El `pip install` no sobra**, aunque el despliegue de siempre fuera solo
> `git pull` + compilar la web: el pase del ecosistema es RS256 y PyJWT lo
> verifica con `cryptography`, que antes no estaba en el entorno. Sin ese paso,
> Campeonatos arranca y **rechaza todos los pases** con un error de librería que
> no menciona ninguna llave.

> Campeonatos **no migra**: crea lo que le falta al arrancar
> (`schema_compat`). Lo que eso implica —y por qué una vez tiró el servicio
> media mañana— está en §5.1-ter.

## 2.5 Respaldar antes de tocar

```bash
sudo -v && sudo -u postgres pg_dump -Fc dinamyt > ~/respaldo-$(date +%F).dump && sudo mv ~/respaldo-$(date +%F).dump /var/backups/ && sudo ls -lh /var/backups/
```

> El `>` lo ejecuta **tu** shell, no `sudo`: escribir directo en `/var/backups`
> da `Permission denied`. Y **nunca** `sudo … | sudo tee …`: los dos `sudo`
> piden contraseña al mismo teclado y se cuelga sin decir por qué.
>
> Si se queda colgado, **no es lento: está haciendo fila detrás de un candado**.
> Ver §5.1 — casi siempre es Campeonatos, y se resuelve parándolo un minuto.

## 2.6 Diagnóstico de la base

```bash
cd /srv/dinamyt/apps/ecosystem-api && pnpm db:diagnostico
```

No escribe nada. Dice a qué base apunta de verdad, dónde está el diario de
migraciones, qué tablas hay y cuáles faltan. **Empieza siempre por aquí** cuando
algo de migraciones no cuadre: los tres fallos típicos dan errores casi
idénticos y ninguno se explica solo.

| Lo que dice | Qué es |
|---|---|
| `tenant or user not found` · `ENOTFOUND` · `ECONNREFUSED` | La base del `.env` no existe o no responde. No es un problema de migraciones |
| `relation … already exists` | El diario está en el esquema `drizzle` y este proyecto lo lleva dentro de `ecosystem`. Se arregla una vez: `pnpm db:migrar --mover-diario` |
| `permission denied` | Al usuario de la app le falta `CREATE`. Como `postgres`: `GRANT CREATE ON DATABASE dinamyt TO dinamyt_eco;` |

## 2.6-bis ¿Llega lo que se guarda a Membresías?

```bash
cd /srv/dinamyt/apps/ecosystem-api && pnpm espejo:diagnostico
```

No escribe nada: manda un aviso vacío y cuenta qué contestó Membresías. Existe
porque **el espejo está hecho para no romper nada cuando falla** (§4.7), y el
precio de eso es que cuando no funciona no se nota: se nota una semana después,
cuando el carnet sale con la foto vieja.

| Lo que dice | Qué es |
|---|---|
| `EL ESPEJO ESTÁ APAGADO` | Falta `MEMBRESIAS_SYNC_URL` o `ECOSYSTEM_SYNC_SECRET` aquí. En local es lo normal; en el VPS no |
| `NO SE LLEGA A ESA DIRECCIÓN` | membresias-api no responde, o la URL no es su origen. No es cosa de secretos |
| `404, y es a propósito` | Allí `ECOSYSTEM_SYNC_SECRET` está vacía y la ruta no existe. Ponle la misma y reinicia |
| `SECRETO DISTINTO (401)` | Las dos la tienen, pero no es la misma |
| `EL CANAL ESTÁ ABIERTO` | Funciona. Y debajo sale **lo que el espejo NO lleva**, que es lo que casi siempre se está buscando |

## 2.6-ter Devolver a alguien a su club

```bash
cd /srv/dinamyt/apps/ecosystem-api && sudo -u postgres RESTAURAR_DATABASE_URL=postgresql:///dinamyt node scripts/restaurar-membresia.mjs --persona correo@de.la.persona --club "Nombre del club"
```

Sin `--aplicar` es un **ensayo**: hace el trabajo entero dentro de una
transacción y la deshace, así que lo que imprime es lo que pasaría de verdad.
Cuando lo que diga sea lo que esperabas, el mismo comando con `--aplicar`.

Quitar a un miembro **borra** su fila de `org_members`: no hay papelera. Y si el
que salió era el maestro, el portal no lo arregla —el alta es una invitación que
él mismo tendría que mandar, y acaba de quedarse sin panel—. Lo fiel de verdad
es el respaldo (§2.5); esto es para cuando no lo hay.

El nombre se puede teclear **sin tildes** («condor cucuta» encuentra «Cóndor
Cúcuta»): las dos mitades se aplanan, la búsqueda aquí y la columna allí con
`translate()`. Si aun así no cuadra nada, el error **enseña la lista** de lo que
hay con sus ids, para copiar el bueno y repetir con `--club <id>` — que es el
cruce exacto y el que conviene usar cuando algo se resiste.

> Después de restaurarlo, **tiene que volver a entrar**: el rol viaja dentro del
> token y el suyo sigue siendo el de antes hasta que caduque (30 min) o cierre
> sesión.

## 2.7 El reloj de los avisos

**Los dos avisos —el de las suscripciones de los clubes y el de las
mensualidades de los alumnos— necesitan que alguien los dispare cada día.** Está
encendido en la VPS desde el 29 de agosto de 2026 (`dinamyt-avisos.timer`, a las
08:00). Si faltara, no falla nada: sencillamente no ocurre, que es la clase de
avería más difícil de ver. Lo de abajo es para un servidor nuevo; el final, para
comprobarlo.

Primero, el secreto del ecosistema (Membresías ya tiene el suyo desde el
montaje):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Esa cadena va a `CRON_SECRET` en `/srv/dinamyt/apps/ecosystem-api/.env`. **Sin
ella la ruta responde 404 a propósito**: una ruta sin autenticar que manda correo
a todos los clubes no puede quedarse abierta «por si acaso».

```bash
sudo install -m 750 -o dinamyt -g dinamyt /srv/dinamyt/scripts/avisos-diarios.sh /usr/local/bin/dinamyt-avisos
```

```bash
sudo tee /etc/systemd/system/dinamyt-avisos.service >/dev/null <<'EOF'
[Unit]
Description=DINAMYT — avisos diarios (suscripciones y mensualidades)
After=network-online.target

[Service]
Type=oneshot
User=dinamyt
ExecStart=/usr/local/bin/dinamyt-avisos
EOF
```

```bash
sudo tee /etc/systemd/system/dinamyt-avisos.timer >/dev/null <<'EOF'
[Unit]
Description=Dispara los avisos de DINAMYT una vez al día

[Timer]
OnCalendar=*-*-* 08:00:00
Persistent=true

[Install]
WantedBy=timers.target
EOF
```

`Persistent=true` no es un detalle: si el servidor estuvo apagado a las ocho, el
aviso sale al arrancar en vez de perderse ese día.

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now dinamyt-avisos.timer && systemctl list-timers dinamyt-avisos --no-pager
```

Probarlo sin esperar a mañana, y ver qué contestó cada API:

```bash
sudo systemctl start dinamyt-avisos && sudo journalctl -u dinamyt-avisos -n 20 --no-pager
```

✅ Dos líneas, una por app. `[ecosystem/suscripciones] ok: {"revisadas":…}` y
`[membresias/mensualidades] ok: {"clubes":…}`. Si alguna dice «sin CRON_SECRET»,
a esa `.env` le falta la variable.

## 2.8 La reconciliación de identidades

```bash
cd /srv/dinamyt/apps/ecosystem-api && sudo -u postgres RECONCILIACION_DATABASE_URL=postgresql:///dinamyt node scripts/reconciliar-identidades.mjs --informe /tmp/ensayo.json
```

Sin `--aplicar` es un ensayo: hace **todo** el trabajo y deshace la transacción.
El informe va a `/tmp` porque quien escribe es el usuario `postgres`, que no
entra en `/root`.

### Tiene que ser `postgres`, y el guion lo comprueba

Correrlo con el rol de la aplicación **no vale**, y no falla en silencio: se
planta con este mensaje.

    Base dinamyt, conectado como dinamyt_eco.
    ✗ No se cambió nada: la transacción se deshizo entera.
    El rol "dinamyt_eco" no es superusuario. Las tablas de Membresías y
    Campeonatos tienen RLS en modo FORCE: un rol normal vería solo una parte de
    las filas, y el guion daría por reconciliado lo que nunca vio.

**Ese es el comportamiento correcto**, no un estorbo. Con RLS en `FORCE`, un rol
normal ve un subconjunto de las filas — así que el ensayo saldría corto y
diríamos «no queda nadie por reconciliar» sobre gente que el guion nunca llegó a
ver. La bandera `--sin-superusuario` existe para saltárselo, y su propia ayuda la
llama peligrosa: **no la uses para un ensayo del que te vayas a fiar.**

Las demás banderas:

| Bandera | Qué hace |
|---|---|
| `--aplicar` | Escribe de verdad. Sin ella, ensayo en seco |
| `--informe <ruta.json>` | Guarda el detalle completo |
| `--url <cadena>` | La conexión, si no va por `RECONCILIACION_DATABASE_URL` |
| `--crear-clubes-campeonatos` | Crea también los clubes que solo conoce Campeonatos |
| `--ayuda` | Las lista todas |

> ⚠️ **Mientras corra, no reinicies `campeonatos-api`.** La reconciliación
> mantiene una transacción abierta sobre las tablas, y Campeonatos lanza
> `ALTER TABLE` al arrancar: es exactamente el bloqueo de §5.1-ter, solo que con
> los papeles cambiados. Espera a que termine.

### Los superadmins de cada app se ponen a mano

*(La reconciliación se aplicó el 29 de agosto de 2026: 0 cuentas creadas, 46
personas enlazadas. Se puede volver a correr sin miedo: en seco por defecto.)*

El guion **detecta pero no concede** los superadmins de las apps, y es
deliberado: un guion que reparte permisos de administrador no debe existir. Hay
**tres banderas independientes**, una por app:

| App | Tabla | Columna |
|---|---|---|
| Ecosystem | `ecosystem.users` | `is_super_admin` |
| Membresías | `membresias.users` | `is_super_admin` |
| Campeonatos | `campeonatos.usuarios` | `es_superadmin` |

Hoy solo queda `admin@dinamyt.org`. Para verlos:

```bash
sudo -u postgres psql -d dinamyt -P pager=off -c "select 'membresias' as app, email, is_super_admin as super from membresias.users where is_super_admin union all select 'campeonatos', email, es_superadmin from campeonatos.usuarios where es_superadmin order by app, email;"
```

> ⚠️ **Se quita la bandera; NO se borra la cuenta.** Campeonatos tiene diez claves
> foráneas contra `usuarios.id` y su aislamiento por workspace filtra por
> `created_by`: borrar una cuenta que creó competidores o tatamis deja esas filas
> con un dueño inexistente, **y entran en la base pero el administrador deja de
> verlas**. Sin error, sin aviso, y se descubre el día del campeonato.

> ⚠️ **Y antes de quitarse el propio permiso, entrar con el que va a quedar.**
> Es la misma regla que el portal ya aplica a la gente: nadie se saca ni se
> degrada a sí mismo sin que quede alguien con las llaves.

## 2.9 El ensayo de punta a punta

**Se corre antes de cada campeonato, y después de cualquier despliegue que
toque login, roles o identidad.** El fallo del rol de agosto tenía cuatro
eslabones y cada uno tapaba al siguiente (§4.7): ninguno se veía leyendo el
código; se vieron recorriendo el camino con una persona real y mirando el log.
Para Campeonatos, el guion de pantallas es `PRUEBAS-PLAN-CAMPEONATOS.md` (en
`dinamyt-combat`).

`scripts/ensayo.sh` responde cada comprobación y **solo lee**: se puede correr
en producción a media tarde. La otra mitad es una ventana con
`sudo journalctl -u dinamyt-id -f` abierta todo el rato: un
`WARN [EspejoMembresias]` es un aviso que no se aplicó.

| Paso | En pantalla | En la base (`bash scripts/ensayo.sh …`) |
|---|---|---|
| 0 · Partida | — | `estado`: las apps `active`, **los dos hashes del secreto iguales**, `POST /sync/alta` → **401** (un 404 es que falta `ECOSYSTEM_SYNC_SECRET`). Anota el resumen |
| 1 · Estructura | En `/admin`: una federación, su administrador, un club dentro y afiliarle otro que ya exista | `federacion 'NOMBRE'`: los clubes colgando y alguien con rol `admin` |
| 2 · Herencia | Darle plan a la federación | `herencia alguien@delclub.com` (del club **hijo**): sale el plan de la federación como eslabón |
| 3 · Alta desde Membresías | Un alumno con correo nuevo; vuelve el enlace de contraseña | `persona el@nuevo.com`: cuenta con `tiene_contrasena = f`, **`enlazada = t`**, `contrasena_propia = f` |
| 4 · Que entre | Abre el enlace, pone contraseña, portal → Membresías; cobrarle, asistencia y carnet | `persona` otra vez: `tiene_contrasena = t` |
| 5 · El rol | Cambiarle el rol a auxiliar desde el portal | `rol el@nuevo.com`: `esperado_membresias` = `en_membresias` y `tiene_roles_de_app_escritos = f`. Si no cuadra, `espejo` |
| 6 · Campeonatos | Entrar con un maestro, inscribir y **salir**: volver al portal no te mete dentro (§5.12). A un alumno el portal le ofrece su panel, no la consola (§4.13) | — |
| 7 · Cierre | — | `resumen && sueltas`: `fichas_sueltas` **no puede haber subido** |

**Anota los números del cierre cada vez, aquí debajo**: ese número solo dice
algo comparado con la vez anterior.

| Fecha | `fichas_sueltas` | Notas |
|---|---|---|
| 31 ago 2026 | 0 de 36 | Tras la reconciliación |

---

# PARTE 3 · El correo

## 3.1 Enviar ya funciona. Recibir, todavía no

Son dos mitades independientes, y hoy solo está puesta una:

| Mitad | Para qué | Con qué | Estado |
|---|---|---|---|
| **Enviar** | Códigos de verificación, invitaciones, avisos de vencimiento | **Resend**, por SMTP | ✅ **en producción** |
| **Recibir** | Que `soporte@` y `admin@dinamyt.org` lleguen a un buzón de verdad | **Cloudflare Email Routing** | ✅ **en producción** — §3.5 |
| **Política del dominio** | Que nadie pueda mandar correo diciendo ser DINAMYT | **DMARC**, gestionado por Cloudflare | ✅ **publicada en `p=none`** — §3.5 |

## 3.1-bis Sin `SMTP_HOST`, la función de correo NO EXISTE

Sigue siendo verdad, y es lo que permite que **en tu PC no haga falta ningún
proveedor**: sin la variable no se rompe nada, la función sencillamente no
existe. Es el mismo criterio que el SSO y `CRON_SECRET`, y es lo que permitió
que el ecosistema estuviera en producción antes de contratar a nadie.
Quien llama recibe un `false` y decide qué contar:

- El **código del registro** sale por el registro del servidor
  (`[SIN CORREO] OTP …`).
- La **invitación del maestro** devuelve el enlace en pantalla, para mandarlo
  por WhatsApp. En cuanto el correo funciona, deja de devolverse: el enlace es
  una llave, y quien invita no debería ser quien la reparte.

## 3.2 Las variables

```
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASS=            la API key del proveedor
MAIL_FROM=DINAMYT <no-reply@dinamyt.org>
MAIL_REPLY_TO=soporte@dinamyt.org
MAIL_DAILY_MAX=90     tope propio, por debajo del del proveedor
PORTAL_URL=https://dinamyt.org
```

Es SMTP y no el SDK de nadie: Resend y Amazon SES hablan los dos SMTP, así que
cambiar de proveedor son cuatro variables y ni una línea de código.

**El tope se cuenta aquí, no en el proveedor.** Si Resend rechaza el correo 101
el fallo es silencioso y nadie se entera hasta que alguien reclama. Con el tope
propio, el envío 91 no sale y queda escrito en el registro con esas palabras.

Montar Resend y el DNS (SPF, DKIM, DMARC): [MONTAR-VPS.md](MONTAR-VPS.md),
Anexo E.

## 3.3 Qué manda correo

| Correo | Cuándo |
|---|---|
| Código de verificación | Al crear una cuenta. **La cuenta no existe hasta que se teclea el código** |
| Código de recuperación | «¿Olvidaste tu contraseña?» |
| Cuenta creada por el maestro | El maestro invita a alguien sin cuenta: enlace para poner contraseña |
| Invitación a un club | El maestro invita a alguien que **sí** tiene cuenta: la acepta en su DINAMYT |
| Solicitud aceptada o rechazada | El maestro responde a quien entró con el código del club |
| Vencimiento de suscripción | Al maestro, cuando su club está por vencer o ya venció (§4.5) |

Todos llevan el escudo **adjunto** (`cid:`) y no enlazado: Outlook y Thunderbird
no bajan imágenes remotas hasta que la persona pulsa «descargar», y el correo
con el código de verificación es el peor momento para que la marca aparezca como
un cuadro roto.

## 3.4 Comprobar que quedó

```bash
sudo journalctl -u dinamyt-id --since "5 min ago" --no-pager | grep -iE "correo|smtp"
```

✅ Tiene que decir `Correo por SMTP: smtp.resend.com:587`.

Después, en el portal: **Crear cuenta** con un correo tuyo de verdad, mira la
cabecera del mensaje (en Gmail: **⋮ → Mostrar original**) y comprueba
**SPF: PASS**, **DKIM: PASS**, **DMARC: PASS**.

## 3.5 Cómo quedó montado el correo

Montado el 29 de agosto de 2026 y comprobado en el DNS contra tres
resolutores (`1.1.1.1`, `8.8.8.8` y `9.9.9.9`), que es lo único que cuenta:
el panel puede decir que sí y el DNS decir que no.

| Registro | Valor | Para qué |
|---|---|---|
| `MX` raíz | `route1/2/3.mx.cloudflare.net` | **Recibir** en `soporte@` y `admin@` |
| `TXT` SPF raíz | `v=spf1 include:_spf.mx.cloudflare.net ~all` | Quién puede mandar como el dominio |
| `MX` + SPF en `send.dinamyt.org` | `…amazonses.com` | **Enviar** por Resend |
| `TXT` `resend._domainkey` | la clave DKIM | Firma con `d=dinamyt.org` — **es lo que alinea el DMARC** |
| `TXT` `_dmarc` | `v=DMARC1; p=none; rua=mailto:…@dmarc-reports.cloudflare.net` | Política del dominio, informes al panel de Cloudflare |

Cómo se montó cada pieza: [MONTAR-VPS.md](MONTAR-VPS.md), **Anexo E**.

### Tres cosas que hay que saber para no romperlo

**1 · Un solo registro SPF por nombre, y un solo TXT de DMARC.** El SPF de la
raíz es de Email Routing y el de `send` es de Resend: viven en nombres distintos
a propósito. Meter un segundo SPF en el mismo nombre **los rompe los dos**, en
silencio y con el correo cayendo en spam; se fusionan en una línea con los dos
`include:`. Y **dos** registros `_dmarc` equivalen a **ninguno**: la norma manda
descartar el dominio entero.

**2 · Un fragmento sin `=` dentro del `_dmarc` lo invalida a medias.** Pasó al
montarlo: quedó un `mailto:…` suelto delante del `rua=`. Los analizadores
permisivos lo saltan y los estrictos descartan el registro, así que el DMARC
funciona «según a quién le preguntes» — que es peor que no tenerlo, porque
parece que sí. Si se edita a mano, se comprueba después con `Resolve-DnsName`
o `dig`, nunca mirando el panel.

**3 · Las respuestas de soporte gastan la cuota de los códigos.** El «Enviar
como» de Gmail (Anexo E.5) sale por el SMTP de Resend, o sea del mismo bote de
**100 al día** — y `MAIL_DAILY_MAX` no las cuenta, porque se cuenta dentro del
código de ecosystem-api. Hoy sobra sitio; cuando no sobre, buzón propio.

### La política DMARC, y la pieza que sostiene todo el correo

Hoy está en `p=none` («avísame, no bloquees»); los informes van al panel de
Cloudflare (**Email → DMARC Management**). Subirla a `quarantine` y después a
`reject` es una tarea con su procedimiento en `HOJA-DE-RUTA.md`. Lo que no
caduca:

> **El SPF de la raíz no cubre lo que enviamos.** Autoriza al MX de Cloudflare,
> que es para RECIBIR; el correo sale por Resend desde `send.dinamyt.org`. DMARC
> pasa con SPF **o** con DKIM, y aquí quien alinea es el DKIM, que firma con
> `d=dinamyt.org`. Consecuencia: **`resend._domainkey` es la única pieza que
> sostiene todo el correo saliente.** Si se rota la clave en Resend y no se
> actualiza ese TXT, con `p=none` no se nota; con `quarantine`, todos los
> enlaces de contraseña van a spam.

Cualquier cambio se comprueba en el DNS, **nunca mirando el panel**:

```powershell
(Resolve-DnsName -Name _dmarc.dinamyt.org -Type TXT).Strings
```

## 3.6 Que DINAMYT salga en Google

*(5 de septiembre de 2026)*

**No salía, y el motivo era que no había nada.** El sitio llevaba en línea desde
el 20 de agosto sin `robots.txt`, sin `sitemap.xml` y sin `metadataBase`: ningún
buscador tenía forma de saber qué páginas existen ni cuál es la dirección buena
de cada una. No era un problema de posicionamiento — era que nadie había puesto
el cartel.

### Lo que ya está hecho (y se despliega con el código)

| Archivo | Qué hace |
|---|---|
| `src/app/robots.ts` | Deja entrar a la portada y cierra lo que hay detrás de una sesión |
| `src/app/sitemap.ts` | Las tres páginas públicas: `/`, `/planes`, `/privacidad` |
| `src/app/layout.tsx` | `metadataBase`, canónica, Open Graph y Twitter Card |

`metadataBase` es la que sostiene el resto: sin ella Next emite el Open Graph
con rutas relativas (`/logo.png`) y ni Google ni WhatsApp saben de qué dominio
son. Se comprueba con:

```bash
curl -s https://dinamyt.org/robots.txt && curl -s https://dinamyt.org/sitemap.xml | head -20
```

### La propiedad en Google Search Console

**Verificada**, por los dos caminos —comprobados los dos el 26 sep 2026—: la
etiqueta HTML (`GOOGLE_SITE_VERIFICATION` en el `.env` del portal, que se lee
**al compilar**) y el TXT `google-site-verification=…` en la raíz del DNS. La
propiedad de tipo **Dominio** cubre también `club.`, `campeonatos.` y
`academy.`, y solo se verifica por DNS.

Si algún día hay que repetirlo, las dos trampas de la primera vez:

| Lo que pasó | Cómo se arregla |
|---|---|
| El TXT se escribió con nombre `dinamyt.org` y quedó en `dinamyt.org.dinamyt.org` | Cloudflare añade el dominio solo: el nombre es `@` |
| El token era de una propiedad «Prefijo de URL» y no de «Dominio» | Copiar el token de ESA propiedad |

```bash
dig +short TXT dinamyt.org @1.1.1.1
```

Enviar el sitemap (`https://dinamyt.org/sitemap.xml`) y pedir la indexación va
**después de poner los precios de verdad en `/planes`**: lo que Google guarde el
primer día es lo que enseñará durante semanas (`HOJA-DE-RUTA.md`).

### Por qué la portada se indexa aunque sea `'use client'`

Porque Google ejecuta JavaScript. Pero lo hace en una segunda pasada y con
retraso, así que **el `<title>` y la `description` del `layout` son lo que de
verdad cuenta**: esos sí van en el HTML desde el primer byte. Es el motivo de
cuidarlos y de que digan solo lo que el software hace hoy.

### Buscar «dinamyt» no es lo mismo que buscar «software para club de hapkido»

Lo primero llegará solo en cuanto el dominio esté verificado: es un nombre
propio y no compite con nadie. Lo segundo es posicionamiento de verdad —
contenido, enlaces, tiempo— y no lo arregla ningún archivo de configuración.

---

# PARTE 4 · Cómo funciona esto por dentro

Las decisiones que ya son ley. Si vas a añadir una pantalla o una app, empieza
por aquí.

## 4.1 Una identidad, y una sola

`ecosystem-api` es **el único que emite tokens**. Firma un JWT RS256 y publica
la clave en `/auth/jwks`; las demás apps solo lo verifican y exigen su
`app_scope` (`campeonatos`, `membresias`, `academy`). El contrato vive en
`@dinamyt/shared` para que emisor y consumidores no se desincronicen.

**El SSO es por fragmento**: el portal salta a `…/login#token=…`. Va detrás de
la almohadilla a propósito — eso no llega al servidor ni queda en los registros
de nadie. La app lo canjea por su propia cookie de sesión al aterrizar.

## 4.2 Quién eres y qué abres son dos preguntas distintas

| | Sale de | Es |
|---|---|---|
| **Quién eres** | `org_members`: a qué club perteneces y con qué rol en cada app | Identidad. No se apaga porque nadie haya pagado |
| **Qué abres** | `subscriptions`: qué apps habilita el plan del club | Comercial |

Mezclarlas dejaba `org_id` y los roles en `null` para todo club sin suscripción
activa —es decir, para todos los recién reconciliados—: la gente entraba sin club
y las apps no sabían quién era.

**Hay cuatro roles por persona, y no sobran.** El GENERAL (`role`, del portal:
quién gestiona el club) y uno por app (`role_membresias`, `role_campeonatos`,
`role_academy`, la verdad de cada producto). La misma persona es alumno en su
club y juez en un campeonato. Si añades una pantalla que toque roles, **enseña
de cuál estás hablando**.

## 4.3 El token se queda viejo, y hay que refrescarlo

Dentro del token van el club, los roles y `app_scopes` — y todo eso lo cambia
**otra persona**: el maestro que acepta una solicitud, el admin que activa la
suscripción. Quien tuviera la sesión abierta seguía con el token de cuando
entró, así que el alumno recién aceptado abría DINAMYT y no veía ni su club ni
sus aplicaciones. Y Membresías tampoco le creaba la ficha, porque eso sale del
`org_id` del token.

`POST /auth/refresh` vuelve a firmarlo con lo que la base dice ahora. El
dashboard del portal lo llama al abrir y después de aceptar una invitación.
**Si añades una pantalla donde algo cambie la pertenencia, refresca ahí también.**

## 4.4 Entrar a un club siempre lo deciden DOS

Y solo cambia quién habla primero:

| Camino | Quién empieza | Quién acepta |
|---|---|---|
| **El código del club** (`org_join_requests`) | La persona teclea el código | El maestro, en «Entrada al club» |
| **La invitación** (`org_invitations`) | El maestro manda un correo | La persona, en su dashboard |
| **El alta desde Membresías** (`POST /sync/alta`) | El maestro, con el alumno delante | La persona, al poner su contraseña |
| La reconciliación | — | Nadie: viene de datos que ya existían |

**Ninguno mete a nadie sin su visto bueno.** La fila de `org_members` nace
cuando alguien dice que sí, y con ella la ficha de Membresías —que se crea sola
la primera vez que entre (`lib/aprovisionar.ts` allí)—.

El super-admin sí puede colocar a alguien directo (`POST /organizations/:id/invite`):
administra el ecosistema entero y a veces tiene que. El maestro no.

### El alta que empieza en Membresías y acaba aquí

El maestro inscribe a su alumno **en su app**, con la persona delante, y ese
gesto no se le puede quitar: es como se llena un club. Con el club federado,
ese botón hace dos cosas en orden (antes creaba una cuenta local de Membresías,
con `eco_sub` vacío, que ningún aviso del espejo alcanzaba):

1. Le pide al ecosistema que cree la cuenta y la pertenencia al club
   (`POST /sync/alta`, con el secreto compartido). Por dentro es **la misma
   invitación** que manda el maestro desde el portal: misma función, mismas
   reglas, mismo enlace de «poner contraseña».
2. Crea la ficha de Membresías **ya enlazada** (`eco_sub` puesto).

| | |
|---|---|
| **El orden importa** | Primero allá, después aquí. Al revés, cada vez que el ecosistema no contestara quedaría una ficha suelta — justo lo que se está cerrando. Si el alta de allá falla, aquí no se crea nada y el maestro ve el motivo que dio DINAMYT |
| **El maestro ya no reparte contraseñas** | La pone su dueño con el enlace de invitación. Es la misma regla que ya regía el cambio de contraseña, aplicada al alta |
| **Sin correo saliente, el enlace vuelve** | Y la pantalla de alumnos lo enseña para pasarlo por WhatsApp (§3). Con el correo funcionando, quien inscribe no ve la llave |
| **`owner` no viaja por esa puerta** | El dueño de un club no se da de alta desde el formulario de alumnos, y repartir el mando de un club por una ruta de servidor a servidor no es algo que deba poder pasar |
| **Se añadió `guardian` al catálogo del club** | El acudiente existía en Membresías desde siempre y aquí faltaba: un alta de acudiente se estrellaba contra un 400 |

> **Campeonatos hace lo mismo con sus jueces** (D8, §1.6):
> `POST /api/auth/register` → `POST /sync/alta` con
> `app: campeonatos`, que **solo** traduce `juez → judge`, en la organización
> del admin. El maestro no viaja por esta puerta (en DINAMYT es gestor de club,
> y aquí dueño en Membresías), ni el admin. En Campeonatos el interruptor es
> `ECOSYSTEM_SYNC_SECRET`, no `ECOSYSTEM_JWKS_URL`: el PC del evento lleva la
> segunda desde F8 y ese día no tiene red.
>
> **Una respuesta de alta sin `ecoSub` es un error, no un éxito**: así nacería
> una ficha suelta. Si `ensayo.sh sueltas` sube, mirar primero `inviteMember`
> (reenviar la invitación de quien ya era miembro sin contraseña).

> **Membresías sola sigue creando la cuenta ella.** Sin `ECOSYSTEM_JWKS_URL` no
> hay portal al que pedirle nada: el producto independiente y **el modo del día
> del campeonato** funcionan exactamente como antes, con la contraseña que ponga
> el maestro. Es la misma marcha atrás de §4.13, y por eso `POST /users` no se
> retira: cambia de comportamiento según haya ecosistema o no.

## 4.5 Las suscripciones se renuevan, no se recrean

Una suscripción de club es **una fila que se extiende**, no una fila nueva cada
mes. Renovar (`POST /subscriptions/:id/renovar`) hace tres cosas de un gesto:
extiende la fecha, deja el pago escrito en `subscription_payments` y reactiva la
que estuviera suspendida por no pagar.

El ciclo cuenta **meses, no días** (`common/ciclo.ts`), igual que Membresías con
las mensualidades de los alumnos:

- Quien renueva **antes** de vencer encadena desde su fecha: no pierde los días
  que le quedaban.
- Quien renueva **tarde** empieza hoy: no recibe gratis los meses que estuvo
  vencido.
- El **día ancla** se conserva. Quien paga el 5 sigue venciendo el 5 aunque un
  mes se retrase al 12. Y quien empezó el 31 de enero vence el 28 de febrero y
  el **31** de marzo — sumar días perdería ese día en cada mes corto.

**El historial no es `paid_amount`.** Ese número solo dice cuánto se ha pagado en
total; no dice cuándo, ni cómo, ni qué meses compró, ni quién lo recibió. Cuando
un club reclama que ya pagó agosto, lo que se mira es la tabla.

Los avisos:

| Para quién | Dónde | Cuándo |
|---|---|---|
| **Para ti** | Tarjeta «⏳ Vencimientos» arriba de `/admin`. Solo aparece si hay algo | Siempre que abras el panel |
| **Para el maestro** | Correo | Al entrar en «por vencer» (7 días antes), al vencer, y una vez por semana mientras siga sin pagar |

El disparo diario es `POST /subscriptions/avisos/cron` con la cabecera
`x-cron-secret`. Sin `CRON_SECRET` la ruta responde 404: una ruta sin autenticar
que manda correo a todos los clubes no puede quedarse abierta «por si acaso».
Cómo encender el reloj: §2.7.

### La federación contrata y sus clubes heredan

Es la **decisión 11** del plan maestro, y desde el 29 de agosto de 2026 el
ecosistema la cumple: GHA Venezuela paga el plan de Campeonatos y **sus clubes
afiliados lo abren**, sin que cada uno tenga que contratar el suyo.

Cómo se calcula, al firmar cada pase: se parte de los clubes de la persona
(`org_members`), se **sube por `parent_id`** hasta la raíz y se suma lo que abre
cada eslabón de la cadena (`common/jerarquia.ts` + `buildToken`).

| | |
|---|---|
| La herencia **baja, nunca sube** | Un club con plan propio no se lo pasa a su federación, ni a los clubes hermanos |
| El plan propio **se suma** al heredado | Un club afiliado que además paga Membresías abre las dos cosas |
| Que Membresías se venda **por club** | Es comercial, y lo decide **qué plan contrata la federación** (`apps_included`), no el código. Si a una federación se le vende un plan que incluye `membresias`, sus clubes lo abren |
| Un `parent_id` en círculo **no cuelga el login** | Tope de 10 saltos y corte al reconocer a alguien por segunda vez, con sus casos en `jerarquia.spec.ts` |

> ⏱️ **No es instantáneo, y no es un fallo.** Los `app_scopes` viajan dentro del
> pase, que dura 30 minutos (§4.11). Afiliar un club —o darle plan a la
> federación— se nota **en la siguiente renovación del pase o al volver a
> entrar**. Si alguien necesita verlo ya: que salga y entre.

### El club tiene Membresías y su federación también: ¿cuál manda?

**Ninguno. No compiten: se suman.** `app_scopes` es la UNIÓN de todo lo que
abre cada eslabón de la cadena —el plan del club, el de su federación, y las
suscripciones personales de la persona— y después se quitan los repetidos
(`buildToken`, paso 3). No hay «fuente de verdad» que gane, porque la pregunta
que se responde ahí no es *cuál plan* sino *qué apps abre esta persona*, y a esa
pregunta dos planes que dicen `membresias` contestan lo mismo.

Con lo cual, para el ACCESO da igual cuál sobre. Pero **no da igual para nada
más**, y esto es lo que hay que tener claro:

| | |
|---|---|
| **Se cobra dos veces** | Son dos filas de `subscriptions` con su monto cada una, y el panel de recaudo suma las dos como esperado del mes. Nada detecta que el club está pagando algo que su federación ya le da |
| **Vencer no se nota** | Si el del club caduca y el de la federación sigue vivo, nadie pierde el acceso — y por tanto nadie avisa de que hay una suscripción vencida. El aviso de vencimiento (§4.6) sí sale, al maestro |
| **Quitar el de la federación tampoco** | Mientras el del club siga activo. El «se rompió al desafiliar» aparece solo cuando lo heredado era lo único que había |

> **Qué hacer cuando pasa.** Decidir **quién paga** y dejar una sola
> suscripción viva: si paga la federación por todos, la del club se deja
> vencer o se pasa a `CANCELLED`; si el club paga lo suyo, el plan de la
> federación no debería incluir `membresias`. Mientras las dos estén `ACTIVE`,
> los números del panel de recaudo están inflados por esa diferencia.

### Quién afilia un club, y por qué a uno se le pregunta y al otro no

Hay **dos caminos**, y la diferencia no es un descuido: es de quién es cada uno.

| Desde… | Quién | Qué pasa |
|---|---|---|
| «Mi organización» | El `admin` de la **federación** | **Invita.** Le llega al maestro del club, que acepta o rechaza. Nada cambia hasta que responda |
| `/admin` | El **super-admin** | **Afilia en el acto.** No se le pregunta a nadie. Y lo puede deshacer con la ✕ |

La invitación existe para que una federación no se lleve un club ajeno sin que
su maestro diga que sí — es la misma regla que entrar a un club (§4.4). **El
super-admin no está en esa conversación**: monta la estructura del ecosistema y
desde ese mismo panel ya crea, desactiva y borra organizaciones. Pedirle que se
mandara una invitación a sí mismo y se la aceptara desde otra cuenta era
ceremonia, no salvaguarda.

Lo que sí hacía falta era **poder deshacerlo**: cada club afiliado lleva su ✕ en
el panel. Un panel que afilia de un clic y solo se corrige con SQL es peor que
uno que no afilia.

**El panel enseña además la estructura** —cada federación con sus clubes debajo,
y al final los que no cuelgan de nadie—, que es lo que antes no se veía: en una
lista plana, un club afiliado y uno huérfano se ven igual.

| Regla | Por qué |
|---|---|
| Un club que ya cuelga de OTRA federación **no se mueve de un tirón** | Hay que sacarlo primero. Mover en un paso le quita a toda su gente unos planes y le da otros sin que nadie llegue a leer que pasó; el paso de en medio **es** el aviso |
| Sacar un club **le quita lo heredado, no lo suyo** | Lo que el club pague por su cuenta se queda |
| Afiliar cierra la invitación que estuviera esperando | Al maestro no se le sigue preguntando algo que ya pasó |
| Nada de esto se nota al instante | Los `app_scopes` viajan en el pase (30 min). Quien lo necesite ya: que salga y entre |

> ⚠️ **Una federación creada desde `/admin` nace sin nadie dentro**, y mientras
> no tenga miembros no aparece en «Mi organización» de nadie (el panel lo
> avisa). No impide afiliar, pero ponerle administrador es lo correcto. Una
> federación admite los roles `admin` y `judge`, y nada más.

### El panel de recaudo

`GET /subscriptions/resumen` responde todo lo que pinta la tarjeta «📊 Recaudo y
estado» de `/admin`. **La distinción que hace que los números se puedan
explicar** es la misma que ya hace el panel del maestro en Membresías:

| | Qué es |
|---|---|
| **Recaudado** | La caja: lo que entró este mes, venga de donde venga |
| **Devengado** | Lo que le CORRESPONDE a este mes |

Un club que paga tres meses de golpe en agosto mete todo ese dinero en la caja
de agosto, pero le toca a agosto, septiembre y octubre. Con una sola cifra,
agosto parecía extraordinario y octubre un desastre.

**Esperado al mes** es lo que entraría si todos renovaran, y solo cuenta lo que
está vivo: una suscripción suspendida no va a pagar el mes que viene, y meterla
infla la previsión.

> **Los colores de las barras no son el oro de marca.** El oro (`#f0b800`) y el
> azul de aviso (`#4d9fff`) se salen por arriba de la banda de luminosidad sobre
> tinta: brillan tanto que las barras se comen la lectura del eje. Los dos que se
> usan (`--serie-1`, `--serie-2` en `globals.css`) son los que pasan las seis
> comprobaciones del validador contra ese fondo, incluida la separación para
> daltonismo. **Si añades una serie, valídala; no la elijas a ojo.**

## 4.6 Qué le llega a cada quien, y por dónde

Son dos sistemas de avisos distintos, con dos destinatarios distintos y dos
canales distintos. Confundirlos es fácil y caro:

| Avisa a | De qué | Por dónde | Quién lo manda |
|---|---|---|---|
| **El maestro** | Su club le vence la suscripción a DINAMYT | **Correo** (Resend) | `ecosystem-api` |
| **El alumno** | Su mensualidad del club vence | **Notificación en la app** (campana) y **Web Push** al celular | `membresias-api` |

### Al alumno NO le llega correo, y es a propósito

**Membresías no tiene proveedor de correo.** No es un olvido ni algo a medio
hacer: no tiene ni la dependencia instalada. La razón es la regla que sostiene
todo el producto — **quien no tiene correo usable también entra** (carnet QR o
PIN), y su ficha vive sin cuenta. Un aviso por correo dejaría fuera justo a la
gente a la que el maestro más persigue para cobrar.

Su canal es el **Web Push**: la app es una PWA, el alumno la instala en su
celular y el aviso le llega ahí, gratis y sin límite mensual. Y queda además en
la campana de la app, para cuando entre.

> **El portal también se instala, desde el 31 de agosto de 2026.** Manifest,
> service worker e iconos —incluido el `maskable`, que es el que Android
> recorta, y el `apple-icon` de 180 px que iOS pide aparte—. Que la app del
> club se instalara y la del ecosistema no era una diferencia que no respondía
> a nada: es la misma cuenta y la misma gente.
>
> Su service worker **no cachea datos y es deliberado**: aquí se ve quién
> pertenece a un club y quién pidió entrar, y servir eso de caché enseñaría
> decisiones viejas como si fueran de ahora. Solo guarda el App Shell, para que
> abrir desde el icono sin señal no acabe en el dinosaurio del navegador.

> **Ojo con el tope si alguna vez se piensa en correo para alumnos.** Resend
> gratis da **100 al día** para todo DINAMYT. Con quinientos alumnos, un aviso
> de vencimiento al mes se come el cupo en tres días — y con él los códigos de
> verificación de las cuentas nuevas, que son los que no pueden fallar.

### Quién recibe qué (desde el 1 sep 2026 son DOS avisos, no uno)

El reloj diario (§2.7) llama a `generarAvisos` para cada club, y de ahí salen
**dos** clases de push, automáticos los dos — nadie pulsa nada:

| A quién | Qué dice | A dónde lleva |
|---|---|---|
| **Al alumno / acudiente** | «Tu mensualidad venció el …» — uno por su propia membresía | `/mi` |
| **Al maestro / auxiliar** | «Hoy: 3 alumnos con la mensualidad vencida y 1 por vencer» — **uno solo por club** | `/` (el panel) |

**Por qué el del maestro es un resumen y no uno por alumno.** Un club de treinta
genera doce avisos una mañana de fin de mes, y doce notificaciones seguidas no
se leen: se barren de un gesto, y de paso se aprende a barrer las del día
siguiente. Uno que dice cuántos y de qué clase cabe en la pantalla bloqueada y
basta para decidir si se abre la app ahora o después de clase.

**No crea fila en `notifications`.** El maestro ya ve esos avisos en su campana
—son los de sus alumnos, `GET /notifications?all=1`—; una fila suya sería la
misma información contada dos veces en la misma pantalla. El push es el empujón
para ir a mirar, no un aviso nuevo.

**Sale una sola vez al día.** `generarAvisos` se sale arriba si no hubo avisos
nuevos (el dedup por membresía y tipo), así que el botón «Generar avisos» del
panel no manda un segundo resumen por pulsarlo otra vez.

### Qué hace falta para que lleguen, y cómo se diagnostica un 0

Tres piezas, las tres puestas desde el 3 de septiembre de 2026: las llaves VAPID
(en `membresias-api/.env`, con la pública igual en la web), el reloj diario
(§2.7) y **gente suscrita**. Si el aviso diario vuelve a decir
`pushEnviados: 0`, hay dos causas y la segunda se olvida: que nadie se haya
suscrito, **o que el botón de activar no haga nada** (§5.19). Contar
suscripciones:

```bash
sudo -u postgres psql -d dinamyt -P pager=off -c "select 'membresias' app, count(*) suscripciones from membresias.push_subscriptions union all select 'ecosystem', count(*) from ecosystem.push_subscriptions;"
```

Se pide solo: la primera vez que alguien entra le sale una tarjeta —«¿Te
avisamos?»— y **solo si dice que sí** se dispara el permiso del navegador, que
se pide una vez en la vida (gastarlo en un cuadro sin contexto es perder el
canal para siempre). Una vez por navegador (`dinamyt.avisos.preguntado`). En
Membresías se le pregunta a todo el mundo, con la frase según quién sea; en el
portal, solo a quien **gestiona** un club.

> **Y sí, el portal también manda push desde el 1 sep 2026.** `ecosystem-api`
> escribe el aviso del club y, detrás, lo empuja al celular de sus gestores
> (`common/push.ts`, tabla `ecosystem.push_subscriptions`). Usa **las mismas
> llaves VAPID** que Membresías — VAPID identifica a quien envía, DINAMYT, no a
> la app que envía. Si a `ecosystem-api` le faltan las `VAPID_*`, no se envía
> nada y **no se rompe nada**: los avisos siguen en la campana del portal.

> ⚠️ **Dónde mirar, que cuesta una confusión.** `membresias-web` **no tiene
> `.env`**: sus variables viven en **`.env.production`**. Buscar en el archivo
> equivocado hace parecer que falta la clave pública cuando está puesta. Y
> `NEXT_PUBLIC_*` se hornea **en el build**: si algún día se cambia, hay que
> reconstruir la web, no basta con reiniciarla.

## 4.6-bis Las dos campanas, y la regla que las gobierna

Hay **dos**, en dos aplicaciones, para dos personas distintas. Confundirlas
lleva a buscar un aviso donde no está:

| Campana | Dónde | De quién es | Qué cuenta |
|---|---|---|---|
| **Del club** | Portal DINAMYT (`components/CampanaOrg.tsx`) | De quien **gestiona** una organización | Quién pide entrar, quién entró, quién rechazó la invitación, quién se fue |
| **De la mensualidad** | Membresías (`components/Avisos.tsx`) | Del **alumno** (y el maestro ve las de su club) | Vencimientos, mora, clases agotadas |

### La regla que comparten: un aviso que ya no es verdad no se enseña

Las dos lo hacen, y por caminos distintos porque su naturaleza es distinta:

- En **Membresías** se calcula al leer (`vigentes`, en `routes/notifications.ts`).
  El alumno paga, su vencimiento se mueve, y el «tu mensualidad venció» deja de
  devolverse en la siguiente consulta. No se guarda nada: el estado de la
  membresía ya viaja en la misma consulta.
- En el **portal** se apaga al responder (`resolverPor`, sobre
  `org_notifications.resolved_at`). Solo lo hace «alguien quiere entrar», que
  es el único aviso que **es una tarea**; los demás son noticias y se quedan
  como historia del club.

**Por qué importa tanto.** Una campana que acumula rojos por cosas ya hechas
se deja de mirar a la tercera vez, y entonces tampoco se ve la que sí importaba.
Antes de esto: el maestro de Membresías veía «ocho alumnos deben» con los ocho
ya pagados, y en el portal la bandeja de solicitudes no avisaba de nada — había
que acordarse de abrirla, y se han quedado personas días esperando.

### Y las otras tres reglas

- **A quien lo hizo no se le avisa.** El maestro que acepta una solicitud no
  necesita que le cuenten que acaba de aceptarla. Sin esto, el que más trabaja
  es el que más ruido tiene en su campana.
- **Cada aviso lleva a donde se hace algo con él.** El destino lo decide el
  servidor —`common/avisos-org.ts` en el portal— junto con el tipo de aviso, y
  no un `switch` en el navegador: así un tipo nuevo no puede salir sin sitio a
  donde llevar. Una solicitud lleva a su bandeja; un vencido de Membresías, a
  la ficha del alumno con el cobro ya a la vista (`/alumnos/:id#cobrar`).
- **Se vacía de una en una.** Abrir la campana ya **no** marca todo como leído.
  Antes lo hacía, y eso rompía dos cosas a la vez: quien tenía nueve avisos la
  abría para mirar UNO y los otros ocho desaparecían sin haberlos visto —lo
  leído no vuelve a la lista, en ninguna de las dos apps—, y el número saltaba
  de 9 a 0 de un tirón. Un número que no se puede seguir con los ojos deja de
  informar de nada.

  Ahora leer uno baja el número en uno. Cada renglón tiene además un **✓** para
  darlo por leído sin ir a ninguna parte —hay avisos que no piden nada, «entró
  alguien nuevo»— y con dos o más pendientes sale un **«marcar todo»** en la
  cabecera del panel, que es una decisión de la persona y no un efecto
  secundario de haber abierto algo.

  Rutas: `POST /notifications/:id/leido` (Membresías) y
  `POST /organizations/avisos/:id/leido` (portal), las dos solo sobre avisos de
  quien las llama.

### La campana del CLUB tiene su propia marca (`staff_read_at`)

En Membresías la misma fila la miran dos personas para dos cosas distintas: para
el alumno es un recado —«tu mensualidad venció»— y para el maestro es una tarea
—«a éste hay que cobrarle»—. Con una sola marca no se podía servir a los dos, y
lo que salía era esto: **la campana del club era lo único de la aplicación que
no respondía a haberla mirado.** El maestro abría el aviso, lo leía, y ahí
seguía, un día y otro.

Desde la migración `0018_visto_por_el_maestro` —**la de Membresías**— hay dos
columnas:

> ⚠️ **Hay dos `0018` y no son la misma.** Cada repositorio lleva su propio
> diario, así que los números se repiten: `0018` en Membresías es esta, y `0018`
> en `ecosystem` es `bajas_reversibles` (§4.15). Al buscar una migración por
> número **hay que decir de qué esquema**, o se acaba mirando el archivo
> equivocado — que es exactamente lo que pasa con `0017`, que en Membresías es
> `fechas_con_zona` y aquí es `sesion_recordada`.

| Columna | De quién | Qué la escribe |
|---|---|---|
| `read_at` | Del **alumno** | `POST /notifications/:id/leido` · `/leidos` |
| `staff_read_at` | De **quien lleva el club** | `POST /notifications/:id/visto` · `/vistos` |

Tres cosas que conviene saber de la de arriba:

- **Descarta el ASUNTO, no el renglón.** El generador escribe una fila por
  alumno **y por día** mientras siga debiendo, así que detrás del renglón hay
  otras trece iguales. `/visto` marca todas las de esa (membresía, tipo): si
  marcara una sola, al recargar aparecería la de ayer diciendo lo mismo y
  parecería que el botón no hizo nada.
- **La lista del club sale colapsada** (`DISTINCT ON` por membresía y tipo, el
  más reciente). Antes un moroso de dos semanas ocupaba catorce renglones con
  la misma frase y tapaba a todos los demás.
- **No distingue un gestor de otro**, a propósito: la campana del club es una
  lista de trabajo compartida, como una bandeja de equipo, y lo caro sería que
  maestro y auxiliar tuvieran que descartar cada uno la misma tarea. Lo que se
  pierde es poco — el aviso vuelve mañana si el alumno sigue debiendo, y la
  deuda se ve igual en la lista de alumnos, que es de donde se cobra. (La
  campana del portal sí lleva fila por persona: allí los avisos son noticias
  —quién entró, quién se fue—, no tareas compartidas.)

## 4.7 La persona se edita en el portal; la ficha, en su app

| Dato | Dónde vive | Quién lo edita |
|---|---|---|
| Nombre, correo, documento, teléfono, nacimiento, foto, género | `ecosystem.users` | La persona, en el portal |
| Cinturón, «entrena desde», tipo de sangre, contacto de emergencia | `ecosystem` | El maestro **y la persona la primera vez** (§4.15) |
| Sede, horarios, contacto, escudo del club | `ecosystem.organizations` | Los gestores del club |
| Plan, pagos, asistencia, kiosco | `membresias` | El club, en su app |

> ⚠️ **El rol por app solo se escribe cuando alguien lo pide de verdad** (§4.15):
> una columna `role_*` puesta sin motivo es una excepción que deja al portal sin
> mandar.

Membresías dejó de tener formulario para los datos de la persona: los **lee**.
Y como quien imprime el carnet es Membresías, el portal le **avisa** cada vez
que se guarda (`POST /sync/persona`, `/sync/club`, `/sync/contrasena`, con
`x-dinamyt-sync`). Sin ese aviso, el maestro sube la foto en el portal y el
carnet sigue saliendo con las iniciales para siempre.

**Es un aviso y no una escritura directa** porque Membresías se vende sola y
puede estar en otra máquina; escribir en las tablas de otra app obliga a que las
dos migren a la vez para siempre.

### Lo que el espejo NO lleva (y por qué Membresías no se enteró)

Los tres avisos llevan **datos de la persona y del club**: nombre, teléfono,
foto, cinturón, «entrena desde», nacimiento, tipo de sangre, contacto de
emergencia; nombre, ciudad y escudo del club; y el hash de la contraseña.

**No viaja a qué club pertenece cada quien, ni con qué rol.** Eso vive en
`ecosystem.org_members` aquí y en `membresias.users.org_id` allí — dos tablas
distintas que nadie sincroniza. Quitar a alguien de un club en el portal, o
cambiarle el rol, **no se nota en Membresías**: allí sigue en su club, con su
plan y su historial.

Eso es deliberado: el dinero y la asistencia de un alumno no pueden desaparecer
porque alguien pulse una ✕ en otra aplicación. Pero tiene dos consecuencias que
conviene tener escritas:

- El día que la ✕ sacó al maestro de su club, Membresías **no se enteró**, y por
  eso el carnet y los pagos siguieron en su sitio. Fue suerte, no diseño.
- Cuando alguien sale de un club **de verdad**, hay que darlo de baja en las dos.

Para comprobar que el canal está vivo: §2.6-bis.

### Cómo viaja el rol, y los cuatro eslabones que se rompieron

*(30 ago 2026.)* «Le puse maestro y solo se vio en Campeonatos» eran cuatro
fallos encadenados, y **cada uno tapaba al siguiente**. Están arreglados; quedan
aquí como mapa por si algo vuelve:

| | Qué pasaba | Lo que hay ahora |
|---|---|---|
| 1 | `maestro` no está en el catálogo de Membresías y el rol viajaba `null` | Se **traduce** (`common/roles-por-app.ts`, tabla de abajo) |
| 2 | Aun traducido, el rol del pase solo se leía al CREAR la ficha | El portal **avisa**: `POST /sync/rol`, al cambiar el rol en `/admin` o «Mi organización» |
| 3 | El aviso no encontraba la ficha sin enlazar y contestaba 200 | `/sync/rol` busca **también por correo** y ata la ficha (`eco_sub`); lo que no se aplica sale como `warn` en el log de `dinamyt-id` |
| 4 | `role_membresias` escrita mandaba sobre el general | **Cambiar el rol general vacía las tres columnas de app** |

| App | Su catálogo |
|---|---|
| Campeonatos | `admin` · `maestro` · `coach` · `competitor` · `judge` |
| Membresías | `owner` · `staff` · `guardian` · `student` |
| Academy | `admin` · `teacher` · `student` |

El maestro del dojang es `owner` en Membresías y `teacher` en Academy; el coach
es `staff`; el alumno es `competitor` en Campeonatos. Lo que no tiene
equivalente —el `judge`, que es de la federación— viaja `null`: mejor no decir
nada que degradar al azar. **Una ampliación de permisos no se cuela de propina
en el arreglo de otra cosa**: por eso `owner` no se traduce a `maestro` en
Campeonatos.

Reglas de `/sync/rol`: no toca la PERTENENCIA (sacar a alguien de un club no le
borra pagos ni asistencia); Membresías rechaza el aviso que dejaría un club sin
ningún `owner` (§4.7-bis); la ficha sin cuenta (carnet QR o PIN) no se toca;
nunca rompe el guardado; y **`is_super_admin` no viaja nunca** (§1.5). Vaciar
las columnas de app se lleva un rol puesto a propósito (el `judge` de quien es
alumno en su club): el diálogo lo avisa, y `POST /organizations/:id/invite` los
vuelve a escribir uno por uno.

**En Campeonatos** el rol viaja de otra forma, sin `/sync/rol`: lo que dio el
portal lo quita el portal al entrar (D9, §4.13). **En Academy no viaja**: el
rol local manda después de la primera vez (`HOJA-DE-RUTA.md`).

#### Por qué no llegó: dónde mirar

```bash
sudo journalctl -u dinamyt-id -n 100 --no-pager | grep -i "sync/rol"
```

```bash
sudo -u postgres psql -d dinamyt -P pager=off -c "select e.email, e.id as eco_id, om.role as rol_portal, om.role_membresias, m.id as ficha, m.eco_sub, m.role as rol_membresias, m.is_super_admin from ecosystem.users e left join ecosystem.org_members om on om.user_id = e.id left join membresias.users m on m.email = e.email where e.email ilike '%CORREO%';"
```

| Lo que se ve | Qué significa |
|---|---|
| `ficha` vacío | Esa persona no existe en Membresías |
| `eco_sub` vacío | La ficha no estaba enlazada. El siguiente cambio de rol la ata y lo aplica |
| `rol_membresias` distinto de lo traducido | El aviso no llegó: mira el log de arriba |

### Varios maestros en un club, y qué imprime el carnet

**No chocan, y no hay ningún límite.** `membresias.users.role` es una columna
por persona, sin unicidad: un club puede tener los `owner` que haga falta — de
hecho la regla del último dueño (§4.7-bis) existe precisamente porque suele
haber varios.

Dos cosas distintas, que es donde está la confusión:

| En el carnet | De dónde sale |
|---|---|
| **El tipo de carnet** («Carnet de maestro», «Carnet de alumno») y la etiqueta del rol | El `role` de **la persona del carnet**. Dos maestros son dos carnets que dicen maestro |
| **El nombre del maestro** impreso en el carnet de un ALUMNO | `club.ownerName`, y ahí sí se elige **uno**: el `owner` activo más antiguo del club (`order by created_at`, `limit 1`) |

Es decir: el carnet de un alumno nombra al **fundador** del club, no «al que le
toque». Es estable —no cambia de un día para otro— pero es una elección
arbitraria: hoy no existe la idea de «maestro principal». Si algún día hace
falta que sea otro, es un campo en el club, no un accidente de `created_at`.

## 4.7-bis Nadie se queda sin quien mande, y nadie se echa a sí mismo

> Quitar a alguien no lo borra sin rastro: la fila se copia a
> `org_member_bajas` y readmitir la devuelve con sus cuatro roles (§4.15). Las
> reglas de abajo deciden a quién se puede quitar.

`org_members` es lo que decide quién administra una organización: el rol
`maestro`, `owner` o `admin` en esa fila. Todo cuelga de ahí — el panel de «Mi
organización», la ficha del club, el código de entrada, la lista de gente.

Así que **si esa fila se borra, quien la pierde se queda fuera en el acto**, y
si era la única de mando, el club entero queda huérfano. Y no se arregla solo:
el alta de miembros ya no mete a nadie a mano —es una invitación que la persona
acepta— y quien tendría que mandarla es justamente el que acaba de salir.

Son **dos reglas**, y ninguna se deduce de la otra:

| | Qué prohíbe | A quién protege |
|---|---|---|
| **1 · A sí mismo, nunca** | Quitarte o degradarte tú, en una organización que administras. Aunque queden otros diez administradores | A la **persona**, de sí misma: pierde su club de un clic y no puede deshacerlo |
| **2 · El último, tampoco** | Que nadie —ni el super-admin, ni el admin de la federación— deje una organización sin ningún gestor propio | A la **organización**, de cualquiera |

La regla 1 es la del **dueño del plan**: el que compró la suscripción y tiene los
permisos no puede echarse de lo que paga. La 2 no la cubría, porque un club con
un maestro y un auxiliar-admin no se quedaba huérfano — pero el maestro sí se
quedaba fuera.

Viven en el SERVICIO y no en la pantalla
(`OrganizationsService.exigirQueNoSeRompaElMando`) porque a `org_members` se
entra por tres puertas —la ✕, el desplegable de rol y el panel de Accesos— y
cualquiera de las tres hacía el mismo daño. Las dos responden **409** con el
mensaje diciendo qué hacer.

- Solo cuentan los gestores **propios**. El admin de la federación padre PUEDE
  gestionar el club (§4.2), pero un club cuyo único gestor vive en la federación
  es un club huérfano igual.
- Pasar de `maestro` a `admin` sí se puede, también a uno mismo: los dos mandan.
- **La salida:** sobre una organización **desactivada** las dos se levantan.
  Cerrar un club es desactivarlo, vaciarlo y borrarlo — tres pasos a propósito,
  porque `remove()` exige que esté vacío y sin esta puerta no se podría cerrar
  ninguno.

### Lo mismo en las otras dos

El agujero era el mismo en las tres, con distinto nombre. Membresías y Academy
ya cerraban el «me elimino», pero **ninguna cerraba el «me degrado»**, que es la
misma puerta: el rol es lo que abre el panel, así que ponerse el de alumno se
cierra la administración igual de rápido y con la misma marcha atrás (ninguna).

| App | Dónde | Qué se cerró |
|---|---|---|
| Ecosistema | `organizations.service.ts` | Quitarse **y** degradarse, más la regla del último |
| Membresías | `routes/users.ts`, `PATCH /users/:id` | Cambiarse el rol a uno mismo. Desactivarse y borrarse ya estaban. El superadmin sí puede, porque tiene cómo deshacerlo |
| Academy | `routes/admin.ts`, `PATCH /admin/users/:id` | Quitarse el `localRole` de `admin`. Suspenderse y eliminarse ya estaban |

> **Membresías se despliega aparte** (§2.4) y su código vive en
> `D:\Repositorios\dinamyt-membresias` — nunca en `productos/membresias` (§1.1).

Y como red aparte, cada baja y cada ascenso quedan escritos en el registro del
servicio (`Baja: … sale de … (era maestro; lo hace …)`), que es lo único que
queda cuando la fila ya no está:

```bash
sudo journalctl -u dinamyt-id --since "2 days ago" --no-pager | grep -E "Baja:|Mando:"
```

Para deshacerlo cuando ya pasó: §2.6-ter.

## 4.8 Una contraseña para todo DINAMYT

Se fija en el portal y las apps la **copian**. Nunca al revés, y nunca en dos
sitios a la vez.

**Viaja el hash de bcrypt, nunca la contraseña.** No hace falta: bcrypt guarda su
propio costo dentro del hash, así que `compare` acepta igual el de 12 rondas del
ecosistema y el de 10 de Membresías.

Sale la copia desde `change-password`, `reset-password`, `set-password` y
`verify-email`. **El único que NO copia** es el rehash tras un login correcto con
una contraseña heredada: ahí la contraseña no cambió, solo se guardó con otro
costo (`{ espejar: false }`).

Una ficha **sin** `eco_sub` —el alumno sin correo, que entra por carnet QR o
PIN— no tiene cuenta del ecosistema y este aviso no la toca jamás. Su contraseña
sigue siendo asunto de su club.

## 4.9 Que las tres apps se sientan una sola

> Los colores, los tamaños y las formas se definen **una** vez y las tres apps
> los leen. Ninguna app define un color propio.

Los tokens viven en `packages/shared/estilos.css` (§4.22): tinta profunda + oro
de marca, Archivo + Instrument Sans + IBM Plex Mono. El desplegable propio
—`SelectMenu`— es el **mismo componente** en las tres: el `<select>` nativo se
pinta con los colores del sistema operativo, y en Android abre su propia hoja a
pantalla completa.

**Una app del ecosistema nunca es un callejón sin salida**: el logo lleva al
portal desde cualquier pantalla.

Lo que **no** se unifica: el combate en vivo de Campeonatos (está hecho para
gritar números a dos metros), el carnet de Membresías (está hecho para
imprimirse) y el modo local de Campeonatos (arranca sin ecosistema, con su
propio login).

## 4.9-bis Se pregunta antes de lo que le cambia la vida a otro

Membresías lleva tiempo preguntando antes de borrar una clase. El portal no
preguntaba nada: la ✕ de una fila de miembro quitaba a esa persona **al primer
toque**, y así salió el maestro de su propio club. El mismo botón, en el celular,
mide 40 px y vive pegado a otros cuatro.

Ahora hay un diálogo propio (`components/Confirmar.tsx`), y no el `confirm` del
navegador: conserva lo que aquel tenía a favor —es modal, tapa la lista, **el
foco arranca en «Cancelar»**, así que quien viene dando Enter a ciegas cancela—
y no arrastra lo que tenía en contra: aquí cabe el nombre entero, se lee con la
tipografía de la casa y ningún navegador móvil lo silencia «para el resto de la
sesión».

Se pregunta por **lo que le cambia a otra persona el acceso, el rol o el
dinero**, no solo por lo que borra:

| Se pregunta | No se pregunta |
|---|---|
| Quitar a un miembro · cambiarle el rol | Guardar la ficha del club, subir el escudo |
| Desactivar un club · eliminarlo | Activarlo (devuelve acceso: equivocarse no quita nada) |
| Aceptar o rechazar una afiliación, una solicitud o una invitación | Buscar, paginar, mirar |
| Cambiar el código del club · cerrar la entrada por código | Crear una organización o una suscripción nueva |
| Borrar o suspender una suscripción · renovarla dándola por pagada | Corregir fechas en el formulario de edición |
| Dar un acceso rápido (puede **sobrescribir** el rol que ya tenía) | |
| Mandar los avisos de vencimiento (son correos de verdad) | |

La regla para decidir: **¿lo nota alguien que no está delante de esta
pantalla?** Si sí, se pregunta. Crear cosas nuevas no se pregunta, porque lo que
se crea de más se borra.

Y lo que el servidor no va a dejar hacer, la pantalla **no lo ofrece**: en tu
propia fila de la lista de gente no hay ✕ y el desplegable de rol va bloqueado,
con una insignia «Tú» y el motivo en el `title` (§4.7-bis). Un botón que existe
para contestar que no se puede es peor que no tenerlo.

## 4.10 El mapa de la API del ecosistema

El contrato que consumen las apps —lo único que no se puede cambiar sin avisar a
las otras tres— es el payload del JWT. Vive en `@dinamyt/shared`:

```ts
interface JwtPayload {
  sub: string;               // user_id (UUID del ecosistema)
  email: string;
  fullName: string;
  org_id: string | null;     // el club de la pertenencia
  app_scopes: string[];      // sale de las SUSCRIPCIONES, no de los roles
  role_membresias: string | null;
  role_campeonatos: string | null;
  role_academy: string | null;
  is_super_admin: boolean;
  jti: string;               // LA SESIÓN a la que pertenece este pase (§4.11)
  timezone: string | null;   // dónde está la persona (§4.12)
}
```

Una app lo valida así, **sin llamar al ecosistema en cada petición**: se baja la
clave pública de `GET /auth/jwks`, verifica la firma RS256, comprueba **el
emisor** (§5.4) y que su scope esté en `app_scopes`.

### `/auth`

| Ruta | Quién | Qué |
|---|---|---|
| `POST /register` | pública | **No crea la cuenta**: deja un registro pendiente (caduca a los 20 min) y manda el código |
| `POST /verify-email` | pública | **Aquí nace la cuenta**, y devuelve `access_token` |
| `POST /resend-code` | pública | Otro código (espera de 60 s, máx. 5 envíos) |
| `GET /disponibilidad` | pública | `?email=&documentId=` — lo consulta el formulario mientras se escribe |
| `POST /login` · `/forgot-password` · `/reset-password` | pública | |
| `POST /set-password` | pública | Canjea el enlace de invitación del maestro |
| `POST /refresh` | sesión | Vuelve a firmar el token con lo de ahora (§4.3) |
| `GET /me` · `POST /change-password` | sesión | Cambiar la contraseña **cierra las demás sesiones** (§4.11) |
| `POST /logout` | **firma** | Cierra ESTA sesión de verdad. Acepta el pase **vencido**: si no, salir tarde no cerraba nada (§5.12) |
| `POST /logout-all` | sesión | Cierra todas las demás («me la dejé abierta en otro lado») |
| `GET /sesiones` · `DELETE /sesiones/:id` | sesión | Dispositivos conectados, y cerrar uno |
| `POST /verify-token` · `GET /jwks` | las apps | `verify-token` **sí** mira si la sesión sigue abierta; `jwks` no puede |

### `/organizations`

| Ruta | Quién | Qué |
|---|---|---|
| `POST /join` | sesión | Pedir entrar con el código del club |
| `GET /solicitudes/mias` · `GET /invitaciones/mias` | sesión | Lo que pedí y lo que me ofrecen |
| `POST /solicitudes/:id/responder` | gestor | El maestro acepta o rechaza |
| `POST /invitaciones/:id/responder` | la persona invitada | Acepta o rechaza |
| `GET` y `POST /:id/invitaciones` · `DELETE /invitaciones/:id` | gestor | Invitar, listar, retirar |
| `GET`, `POST` y `DELETE /:id/codigo` · `GET /:id/solicitudes` | gestor | El código y su bandeja |
| `GET /avisos` · `POST /avisos/leidos` | gestor | **La campana del club** (§4.6-bis). Sin `:id`: quien lleva dos clubes tiene UNA campana |
| `GET /mi-club` · `POST /mi-club` | sesión | Ver mi club · fundar el mío |
| `GET /mias` · `PATCH /:id` · `GET /:id/members` | gestor | Lo que administro |
| `POST /:id/invite` | super-admin | Alta directa, sin preguntar (§4.4) |
| `PATCH` y `DELETE /:id/members/:userId` | gestor | Cambiar rol · quitar. **409 si te lo haces a ti mismo, o si es el último que manda** (§4.7-bis) |
| `GET /clubes` · `POST /:id/invitar-club` · `GET /invitaciones-club/mias` | varios | Federación ↔ club, **por invitación** |
| `POST /:id/afiliar-club` · `DELETE /:id/clubes/:clubId` | super-admin | Afiliar **a dedo** · sacarlo. Sin preguntarle al maestro (§4.5) |

> **El espejo hacia Membresías** son cinco avisos salientes, no rutas de
> aquí: `POST /sync/persona`, `/sync/club`, `/sync/contrasena`, `/sync/rol` y
> `/sync/pertenencia`, todos con la cabecera `x-dinamyt-sync`. Viven en
> `common/espejo-membresias.ts` y los recibe `membresias-api`. Qué lleva cada
> uno y qué NO: §4.7.
>
> El último es la baja: sacar a alguien del club aquí le retira el acceso allá
> —**sin borrarle la ficha**, que es donde están sus pagos y su asistencia—.
> Antes no viajaba, y había que dar de baja a la misma persona dos veces, en
> dos aplicaciones.
>
> **Y dos de vuelta**, las únicas rutas de ESTA API que no piden sesión: las
> abre el mismo secreto compartido, y sin él responden 404.
> `POST /sync/alta` es Membresías dando de alta a alguien en su club (§4.4);
> `POST /sync/acceso` es Membresías diciendo que le encendió o le apagó el
> acceso a alguien, que es lo que hace que el portal deje de ofrecer una app
> que va a contestar 403. Viven en `modules/sync/`, aparte del controlador de
> organizaciones, para no dejar rutas sin sesión en medio de treinta que sí la
> exigen.
>
> **Y las de Campeonatos** *(24–26 sep 2026)*, por el mismo secreto:
> `GET /sync/clubes` (el directorio, para invitar clubes, F5);
> `POST /sync/alta` con `app: campeonatos` (el admin da de alta a un JUEZ, y
> solo a un juez: D8); `GET /sync/miembros?maestro=<sub>` (la gente de los
> clubes donde ese `sub` es maestro o coach en Campeonatos, para inscribirla
> sin teclearla — sin correo ni teléfono, y la regla de a quién se contesta
> se aplica AQUÍ); y `POST /sync/aviso-campeonato` (la campana del club: «te
> invitaron a un campeonato»). Todas validan que los ids sean uuid: otra cosa
> era un 500 de PostgreSQL.

> **Las dos rutas de afiliar, que son distintas a propósito:**
> `POST /organizations/:id/invitar-club` la usa el `admin` de la federación y
> **crea una invitación**; `POST /organizations/:id/afiliar-club` la usa el
> super-admin y **escribe el `parent_id` directamente**. Su deshacer es
> `DELETE /organizations/:id/clubes/:clubId`, con el mismo guardia. El porqué
> del reparto está en §4.5.

### `/subscriptions` y `/subscription-plans`

Todo del super-admin, salvo `GET /subscriptions/org/:orgId` (autenticado) y
`GET /subscription-plans` (pública, la usa `/planes`).

| Ruta | Qué |
|---|---|
| `POST /subscriptions` · `POST /subscriptions/user` | Crear, de organización o personal |
| `POST /subscriptions/:id/renovar` | **Extiende la fecha y deja el pago escrito** (§4.5) |
| `GET /subscriptions/:id/pagos` | El historial |
| `GET /subscriptions/vencimientos` | Lo que vence esta semana y lo que ya venció |
| `POST /subscriptions/avisos` | Mandar los correos ahora |
| `POST /subscriptions/avisos/cron` | El disparo diario (`x-cron-secret`) |
| `POST /subscriptions/membresias/sincronizar` | **El barrido de planes, AHORA**, con el detalle club por club (§4.16) |
| `PATCH /subscriptions/:id/payment` | Un abono suelto: paga deuda, no mueve la fecha |
| `PATCH /subscriptions/:id` · `/:id/status` · `DELETE /:id` | Corregir, suspender, borrar |

> **Borrar una suscripción con pagos está prohibido en el servidor.** No es una
> comprobación de la pantalla: borrar la fila se llevaría por delante el
> historial de ese dinero. Para eso está suspender, que corta el acceso y
> conserva la historia.

Hay ejemplos listos para usar en
[`apps/ecosystem-api/requests/auth.http`](apps/ecosystem-api/requests/auth.http).

## 4.11 El token no es la sesión: es su pase

La sesión es una fila de `ecosystem.sessions` y el token lleva su id en
`jti`. Si la fila está revocada, el pase no abre — por perfecta que sea su firma.

**Tres relojes, y hacen falta los tres:**

| | Cuánto | Para qué |
|---|---|---|
| Inactividad | 20 min | El computador prestado que alguien dejó abierto |
| Tope absoluto | 12 h | Que quien toca la pantalla cada rato vuelva a escribir su contraseña alguna vez |
| Revocación | inmediata | Salir, salir de todos lados, cambiar o recuperar la contraseña |

Los dos primeros dependen de la casilla «mantener la sesión iniciada»
(`sessions.recordada`, §4.15): una sesión recordada **no tiene reloj de
inactividad** y su tope es de 30 días. **La revocación es inmediata para
todas**, recordadas incluidas.

**El pase dura 30 minutos, y de eso depende todo lo demás.** Academy y
Campeonatos verifican la firma sin preguntarle nada a nadie —es lo que las hace
rápidas e independientes—, así que una sesión cerrada sigue entrando en ellas
exactamente lo que le quede al pase. Con media hora ese es el peor caso, y **no
hay que tocar ni una línea de esas apps**: el único que firma es el ecosystem, y
cuando el navegador vuelve a pedir pase, aquí se comprueba la fila y se dice que
no.

Por eso `JWT_EXPIRES_IN` **solo puede acortar**. Un valor mayor se ignora y se
avisa por consola: que una variable de entorno olvidada debilite esto en
silencio es justo el agujero que se vino a tapar.

**En el navegador** (`lib/sesion.ts`, igual en el portal y en Academy):

- El pase va a `sessionStorage` si no se marca «mantener la sesión iniciada», y
  entonces muere al cerrar el navegador. La decisión viaja además con la
  sesión, porque el reloj de inactividad lo aplica el servidor (§4.15).
- `VigilanteDeSesion` avisa un minuto antes del cierre por inactividad y renueva
  el pase **solo si ha habido actividad**. Esa condición no es un detalle: sin
  ella, una pestaña olvidada renovaría para siempre y el reloj de inactividad no
  serviría de nada.

## 4.12 La hora de cada quien

Dos cosas que parecen la misma y no lo son:

- Una **fecha civil** —un vencimiento, un cumpleaños— es un día del calendario y
  **no tiene zona**. El 31 es el 31 en Bogotá y en Tokio. Se guarda al mediodía
  UTC (`fechaCivilAInstante`) y se pinta fijando `timeZone: 'UTC'`
  (`fechaCivil`). Convertirla no la traduce: la corre un día. Eso pasaba —
  `new Date('2026-08-31')` es la medianoche UTC, que en Bogotá es el 30.
- Un **instante** —cuándo se registró un pago, cuándo entró alguien— sí tiene
  zona, y va en la de quien lee.

**En pantalla nunca hizo falta guardar nada**: el navegador sabe dónde está. Lo
que sí hacía falta es para lo que se escribe en el SERVIDOR, cuando la persona
no está delante — los correos de vencimiento y los avisos de Academy salían con
la hora del VPS (`TZ=America/Bogota`) para todo el mundo.

| Dónde | Qué manda | Para qué |
|---|---|---|
| `users.timezone` | dónde está la PERSONA | Los correos y avisos que se le escriben |
| `organizations.timezone` | dónde está el CLUB | Horarios, asistencia y el «hoy» de los vencimientos |

La de la persona la detecta el navegador y viaja en las cabeceras
`X-Zona-Horaria` y `X-Idioma` (que **tienen que estar en `allowedHeaders` del
CORS**: si no, el navegador no llega ni a mandar la petición). Se guarda sola en
cada login y en cada renovación, así que a quien viaja le llegan las cosas en su
hora sin tocar nada. Elegirla a mano en el perfil marca `timezone_manual` y la
protege de esa detección — una preferencia que se borra sola no es una
preferencia.

La del club es distinta a propósito: «la clase es a las 7 pm» es hora **del
salón**, y convertirla a la de un maestro que está de viaje sería el error
contrario.


## 4.13 Entrar a Campeonatos desde DINAMYT

El botón del dashboard lleva el pase
en el fragmento (`/login#token=…`), Campeonatos lo verifica contra el JWKS del
ecosistema y abre **su propia cookie de sesión**. Sin segunda contraseña.

### Las dos puertas de `POST /auth/sesion`

| Entra con… | Quién la usa | Sesión que abre |
|---|---|---|
| **El pase del ecosistema** (RS256) | Quien salta desde el portal | **12 h** |
| **Su token propio** (HS256) | El **QR del juez**, que no se toca | 72 h |

Las 12 h no son un capricho: la sesión del ecosistema **se puede revocar**, y
esta cookie ya no depende de ella. Doce horas cubren una jornada de competencia
entera y acotan cuánto sobrevive aquí una sesión que allá ya se cerró. El QR
conserva sus 72 porque se reparte por la mañana y tiene que aguantar el fin de
semana **sin internet**.

### Tener el plan no es operar un campeonato

Es la distinción que hizo falta en cuanto la federación pudo pagar Campeonatos
para todos sus clubes (§4.5): **cualquier alumno de un club afiliado trae
`campeonatos` en sus `app_scopes`**. Y la consola de Campeonatos solo sabe de
administrar, inscribir y puntuar.

**El alumno SÍ entra** — no a la consola, sino a **su panel** (`/mi-panel`): sus inscripciones
con su estado y el motivo si se la rechazaron, sus próximos campeonatos, su
maestro, sus resultados y sus números.

| Papel en el pase | Qué pasa |
|---|---|
| `admin` · `maestro` · `coach` · `judge` | Entra a la consola |
| `competitor` · `student` | **Entra a su panel.** Su fila nace con `competidor` de principal |
| ninguno de los anteriores | **No entra** (`sin_consola`), y se le dice por qué con un enlace de vuelta al portal |

La regla vive en los **dos** lados: el portal elige el botón
(`entraACampeonatos` en `lib/roles.ts`) y el servidor decide la fila
(`rol_principal` en `app/espejo.py`). Ofrecer el botón no es la seguridad; es
no mandar a nadie a una puerta que le van a cerrar. **Lo que le cierra la
consola** a quien solo compite es `require_personal()` en `api/scoping.py`, y
**lo que acota su panel** es que `/api/mi/*` filtra siempre por el `eco_sub`
de la sesión.

#### La ficha y la cuenta

Que la persona entre no basta: su panel tiene que saber **qué ficha de atleta
es suya**. Eso lo dice `competidores.eco_sub` —el `sub` de su cuenta, no el id
de su fila, que cambia entre la instalación de internet y la del evento—, y lo
escriben tres caminos:

| Camino | Quién | Lo que exige |
|---|---|---|
| **Reclamarla** desde su panel | La persona | Documento **y** fecha de nacimiento que cuadren. Cinco intentos cada quince minutos. «No existe» y «la fecha no cuadra» contestan lo mismo |
| **Enlazarla a mano** en `/admin/competidores` | El administrador de esa ficha | Que la persona haya entrado ya una vez (el `sub` sale de su espejo) |
| **El paquete** entre instalaciones (F6-c) | El importador | Nada: viaja con la ficha |

En los tres **no se pisa un enlace puesto**: si la ficha ya es de otra cuenta,
se para y lo mira una persona — primero se desenlaza, a la vista.

Los resultados del panel salen **exactos** de las llaves generadas desde el 13
de septiembre de 2026 (llevan `competidor_uid`) y **«sin confirmar»** de todo
lo anterior, buscados por nombre y club **solo en los campeonatos donde esa
ficha está inscrita**. Los que suben del PC del evento llevan su ficha
(`competidor_uid`) desde el 26 sep 2026.

> **Al que no opera no se le esconde la tarjeta**: quien opera salta a su
> consola con el pase; **quien no, va a las páginas públicas** de Campeonatos
> (campeonatos abiertos y resultados), que no piden sesión.

> **Y la fila de un alumno nace cuando ENTRA, no cuando firma el pase.** Hasta
> F3 su pase no creaba ninguna: una federación con doscientos alumnos habrían
> sido doscientas filas de gente que no va a entrar nunca. Esa razón sigue en
> pie, y por eso la fila nace al canjear el pase —la primera vez que la persona
> abre Campeonatos—, y en `/admin` los competidores quedan detrás de un
> contador «+N competidores» para no tapar al personal.

### La fila local es un espejo, y su rol manda

`usuarios.eco_sub` guarda el `sub` de la cuenta del ecosistema. Al entrar: si ya
hay espejo se usa; si existe una fila con ese correo se **enlaza** (toda la
gente que ya operaba antes); si no existe, se crea — con una contraseña
aleatoria que nadie conoce, así que **por el formulario no se entra con ella**.

**Los papeles: el portal da, y lo que dio el portal lo quita el portal** (D2 y
D9, §1.6). `usuarios.roles_del_portal` recuerda la procedencia: al entrar, un
papel que llegó del portal y que el pase ya no trae se retira; lo puesto a mano
en la consola y `admin` no se tocan nunca. Así un cambio en el portal no degrada
en silencio al administrador de un campeonato en marcha.

### Puntuar pide identidad *(desde el 26 de septiembre de 2026)*

Antes el socket del tatami (`/combate`) aceptaba cualquier papel sin token.
Ahora, para `arbitro` y `j1`–`j4` hace falta un token de esta
instalación de alguien activo que sea superadmin, admin dueño del campeonato o
juez **asignado a ese tatami con ese papel** — el QR del juez es exactamente
eso. La pantalla sigue abierta y es de solo lectura.

La salida de emergencia, solo para el PC del evento y solo con gente delante:
`TATAMI_SIN_IDENTIDAD=1` en `backend/.env` y reiniciar
(`INICIAR-LOCAL.md` §8). En la VPS no se pone nunca.

### El login propio de Campeonatos NO se retira

Es **la marcha atrás del día del evento**: sin internet no hay ecosistema al
que preguntar, y una app que solo sabe entrar por SSO no arranca ese día
(decisión 12). Lo que contradecía «las cuentas nacen en el ecosistema» era
`POST /auth/register`, y se **convirtió**: con el puente entero, el juez nace en
DINAMYT (D8, §4.4); sin él —el PC del evento— sigue siendo la puerta de
siempre. La consola ya no le pone contraseña a una cuenta de DINAMYT (D10).
Quedan cuentas viejas con contraseña propia que siguen entrando por aquí aunque
su club deje de pagar (`HOJA-DE-RUTA.md`).

### El maestro estrena su club al entrar

El pase trae `org_id` —un identificador—, y aquí hace falta el **nombre**:
`usuarios.club` es texto libre y es lo que se imprime en la llave, en el acta y
en la planilla. Así que al crear el espejo se le pregunta al ecosistema por esa
organización, **con el pase de la propia persona**: responde lo que ella ya
puede ver y Campeonatos no guarda ninguna credencial más. La raíz de la API se
deriva de `ECOSYSTEM_JWKS_URL`, así que no hay una segunda variable que pueda
apuntar a otro sitio.

| | |
|---|---|
| **Solo si no tiene club** | Los clubes los edita el administrador y un maestro puede dirigir varios dojangs. Rellenar por encima en cada inicio de sesión borraría ese trabajo — y con él la delegación, que es como se agrupan los reportes |
| **Solo a los maestros** | El juez puntúa donde lo asignen. Preguntarlo sería una petición al ecosistema por cada juez que entra la mañana del campeonato |
| **Falla hacia fuera** | Dos segundos de espera; si el ecosistema no contesta se entra igual y sin club. Un ecosistema lento no puede impedir que un maestro entre |

### `eco_sub` es `uuid` en PostgreSQL y texto en SQLite

En PostgreSQL la columna es `uuid` con índice único (la creó la
reconciliación). Declararla `String` a secas dejaba buscar (PostgreSQL
convierte el literal) pero la **lectura devolvía un objeto `UUID`**, y comparar
ese objeto con la cadena del pase da distinto **siempre**: a quien llegara por
la puerta del correo se le habría contestado «ese correo ya está enlazado con
otra cuenta» siendo él mismo. Un fallo que **en SQLite no aparece**, que es
donde corren las pruebas y el modo local.

Cerrado por tres lados: el modelo usa el tipo nativo en PostgreSQL (devolviendo
texto), la comparación normaliza con `str()`, y `schema_compat` crea la columna
como `uuid` para que una base nueva tenga la misma forma que la de producción.

### La trampa del `kid`, que costó una tarde

`PyJWKClient` **solo considera «llave de firma» la que lleva `kid`**. El JWKS
del ecosistema publicaba una sola llave sin él, así que Campeonatos rechazaba
todos los pases con *«el JWKS no contiene ninguna llave de firma»* — un mensaje
que no nombra el `kid` por ninguna parte. `jose` (Membresías) se apaña con una
llave única, y por eso allá el SSO funcionó a la primera.

Arreglado en el ecosistema: firma con `kid` y lo publica, usando la **huella
RFC 7638** de la propia llave. Con eso **ya se pueden rotar llaves** — publicar
las dos, firmar con la nueva, retirar la vieja—, que sin `kid` era imposible.

> ⚠️ **Al desplegar el ecosistema, los pases viejos siguen valiendo** (no llevan
> `kid` y Campeonatos usa entonces la llave única), pero **si algún día el JWKS
> publica dos llaves sin `kid`, Campeonatos se niega**: ahí no se adivina.

---

## 4.14 Academy: escrita, probada y sin montar

**En la VPS no existe** *(comprobado por SSH el 26 sep 2026)*: no hay servicios
`academy-api`/`academy-web`, ni sus `.env`, ni bloque en el Caddyfile, y el
registro `academy` se borró del DNS al encender la nube naranja (MONTAR-VPS
Anexo D.2). Hasta ese día esta sección decía que estaba «desplegada y
respondiendo»: no era verdad. Encenderla es la tarea A de `HOJA-DE-RUTA.md`.

En código sí está entera, hecha contra los RF-ACA-01…28 del documento de
requisitos: `academy-api` con **24 pruebas en verde** contra PGlite,
`academy-web` con sus catorce pantallas, y el login va contra el ecosistema:
Academy no tiene contraseñas propias.

**El botón del portal es un interruptor**: `ACADEMY_EN_EL_PORTAL` en
`apps/ecosystem-portal/src/lib/apps.ts`, hoy `false`. Para encenderlo: `true` y
**recompilar el portal** (§1.3; el comando es §2.3). Los planes que incluyen
`academy` siguen dando su scope y el rol sigue viajando en el pase.

> ⚠️ **Lo que a propósito NO apaga:** la lista blanca de `appsDelEcosistema()`,
> en ese mismo archivo, sigue incluyendo Academy. Es la que valida a dónde puede
> volver `/salir`. **Apagar un botón no puede romper una salida.**

## 4.15 Sesiones recordadas, bajas reversibles y roles sin excepciones

*(2–4 sep 2026; casi todo salió de usar el portal desde un Android.)*

### «Mantener la sesión iniciada» (migración `0017`)

`sessions.recordada` hace que la decisión viaje con la sesión y la aplique el
servidor, que es quien lleva el reloj de inactividad:

| | Inactividad | Tope absoluto |
|---|---|---|
| **Recordada** | ninguna | 30 días (`RECORDADA_DIAS`) |
| **Sin marcar** | 20 min | 12 h |

Es **por sesión, no por cuenta** (el celular sí, el computador del club no), y
el defecto es `false`. La recordada **se cierra igual en cuanto alguien la
revoca**, y por eso `listar()` no la esconde aunque lleve horas quieta: es la
que hay que poder cerrar el día que se pierde el teléfono. Hacen falta los dos
relojes, el del servidor y el vigilante del navegador.

### Quitar a alguien del club se puede deshacer (migración `0018`)

`org_member_bajas` guarda la fila **entera antes de borrarla**, y readmitir la
vuelve a escribir con los cuatro roles y la fecha de entrada.

**Por qué una tabla aparte y no un `removed_at`**: `org_members` responde
«¿es miembro?» en casi cien sitios. Marcar en vez de borrar obligaría a añadir
«y que no esté dada de baja» a todos, y el día que se olvide uno, alguien a
quien echaron sigue entrando. Con la tabla aparte, fila presente = es miembro, y
lo que se gana es memoria. La bandeja descarta por consulta a quien ya volvió
por otro camino.

### El rol por app solo se escribe cuando alguien lo pide (migración `0020`)

Las columnas `role_membresias`, `role_campeonatos` y `role_academy` son
**excepciones** y **mandan sobre el general**. Aceptar una solicitud escribía
`student` a mano (también a un entrenador), el portal lo mandaba desde
`CodigoYSolicitudes.tsx` e `invitarPersona` tenía su propio defecto: tres
sitios. Ya no lo escribe ninguno, y `0020_rol_sin_excepciones` vació lo escrito
**solo donde repetía la traducción** (una excepción de verdad, como el alumno
que es `judge` en su federación, no se tocó).

> ⚠️ **El acudiente es `guardian`, no `coach`.** Se guardaba como `coach`, y
> `coach` **abre la consola de Campeonatos**: el acudiente de un menor podía
> entrar a la mesa de un torneo.

### Los topes de cada campo, en un solo sitio

`LIM`, en `lib/validacion.ts`, tiene el tope de cada tipo de campo (portal, el
login de Academy y los formularios de Campeonatos). El del correo vive en
`PROPS_CORREO` y el de la contraseña en `CampoContrasena` (bcrypt mira 72
caracteres). **Nunca más estricto que el servidor**: cortar antes de lo que la
API acepta deja a alguien sin poder escribir su propio apellido.

Las trampas de esos días están en la Parte 5: §5.17 (`?redirect=` pegado en el
historial), §5.18 (`badge`), §5.19 (el permiso tras un `await`), §5.20 (la
campana que volvía a subir), §5.21 (símbolos que Android no trae) y §5.22
(cuatro píxeles de desborde).

## 4.16 El plan vencido cierra el club, y el plan contratado lo crea

*(3 de septiembre de 2026 · migración `0019_plan_del_club` en **Membresías**)*

Dos agujeros opuestos con la misma causa, y por eso se arreglaron juntos: **el
ecosistema sabía lo del plan y Membresías no se enteraba, en los dos sentidos.**

### 1 · El plan vencía y el club seguía trabajando

Aquí los `app_scopes` se filtran por `status = 'ACTIVE' AND ends_at > now()` al
firmar el pase (§4.2), así que un plan vencido deja de abrir Membresías **desde
el portal**: la tarjeta desaparece del dashboard y el salto por `#token=` no
lleva scope.

**Pero Membresías tiene login propio.** Quien ya tiene ficha allí entra por el
formulario de siempre y no vuelve a pasar por el ecosistema nunca. Así que el
plan vencía, la tarjeta desaparecía del portal, y el club seguía cobrando,
pasando lista e imprimiendo carnets **indefinidamente**.

> **El candado estaba puesto en una puerta y la otra no tenía cerradura.** Es la
> misma forma del fallo de §4.7 —el portal decidía algo y la otra app no se
> enteraba—, pero con dinero de por medio.

`orgs.plan_bloqueado_desde` es la cerradura de la segunda puerta. **Se aplica en
`plugins/auth.ts`**, dentro de `requireAuth`, junto al cerrojo de club inactivo
que ya existía: es el único punto por el que pasan todas las rutas autenticadas,
y ya consultaba la fila del club, así que no cuesta ni un viaje más.

**402 y no 403**, y la diferencia no es cosmética: 403 es «no te dejan» y de eso
no se sale solo; esto es «hay que pagar», y termina en cuanto alguien pague. La
web mira ese código para enseñar la pantalla que explica (`PorteroPlan`) en vez
de llenarse de «no se pudo cargar la lista».

### Por qué NO se reutilizó `is_active`

Porque son dos cosas que se veían igual:

| | Qué significa | Quién lo deshace |
|---|---|---|
| `is_active = false` | El superadmin apagó este club | Solo él, mirando |
| `plan_bloqueado_desde` | Su plan venció | **Se deshace solo** al pagar |

Juntarlas haría que una renovación **resucitara un club que el superadmin apagó
a propósito**, y sin que a nadie le constara por qué volvió. Con columnas
separadas, cada llave abre su cerrojo y hacen falta las dos abiertas.

### Quién sigue entrando, y por qué cada uno

· **El superadmin**, como en el mantenimiento: es quien tiene que poder mirar.
· **El login**, o el maestro se quedaría fuera sin llegar a leer POR QUÉ está
  fuera — que es el 403 mudo que ya costó una tarde en el portal.
· **El espejo (`/sync/*`), y esta es la que no se puede olvidar**: es por donde
  llega el aviso de que YA PAGARON. Bloquearlo dejaría al club encerrado con la
  llave dentro, que es peor que el problema original. Tiene su prueba.

### Los dos disparadores, y ninguno sobra

**Vencer es un no-evento**: nadie llama a nadie cuando pasa una fecha.

· **Al cambiar algo** —crear, renovar, corregir, cancelar, borrar una
  suscripción—, `revisarPlanDelClub` recalcula y avisa. Es lo que hace que
  **renovar surta efecto en el acto** y no a la mañana siguiente, con el maestro
  delante habiendo pagado.
· **El barrido diario** (`barrerPlanes`, dentro de `POST /subscriptions/avisos/cron`,
  §2.7), que es lo único que se entera de que ayer venció uno.

Y **se recalcula en vez de mirar la fila que se tocó**, porque un club puede
abrir Membresías por dos caminos que se suman: su plan y el de su federación
(§4.5). Cancelar el suyo no lo deja fuera si su federación paga.

> El barrido manda **todos** los clubes cada mañana, no solo los que cambiaron.
> Un aviso viaja por la red y se pierde: si Membresías estuvo caída justo el día
> que venció un club, ese club se quedaría abierto para siempre. Repetirlo
> convierte un aviso perdido en un retraso de un día. Al otro lado es
> idempotente: **volver a decir «bloqueado» no reinicia la fecha**, porque
> «desde cuándo» es justo el dato que delata un aviso que no llegó.

### 2 · El club con plan que no aparecía en Membresías

El otro sentido, y se veía todos los días: **en Membresías solo salían los
clubes creados en Membresías**. Una organización nacida en el portal y con plan
contratado no llegaba nunca — todos los avisos del espejo buscan por
`eco_org_id`, no encontraban fila, contestaban «no encontrado» y se quedaban tan
tranquilos. **El club estaba pagado y no existía.**

El apaño a mano lo empeoraba: crearlo allí con el mismo nombre daba **dos clubes
que se llaman igual y no son el mismo**, porque el creado a mano nace sin
`eco_org_id` y sigue sin recibir nada.

Ahora `/sync/plan` con `alDia: true` lo **crea** si no está, con su `eco_org_id`
puesto — o sea enlazado desde el primer segundo. Tres detalles:

· **Con el plan vencido no crea nada.** Un club que nunca llegó a existir no
  necesita nacer bloqueado: necesita no nacer.
· **Sin nombre tampoco.** Crear «(sin nombre)» sería peor que no crear.
· **Un slug que choca no tumba el alta**: se le pega un sufijo del `eco_org_id`.
  Dos clubes «Dinamyt» en dos ciudades es un caso normal, y un alta que se cae
  por eso deja al club pagado y sin existir, que es lo que se vino a arreglar.

> **El barrido diario es además la red que los recoge.** Los clubes que
> contrataron antes de que esto existiera aparecen solos en la primera pasada,
> sin que nadie tenga que tocarlos uno a uno.

### 3 · El botón: el barrido, ahora y con el porqué

Para el hueco que se nota el mismo día —un club contrata, se activa su
suscripción y no aparece en Membresías—, en el panel del super-admin, arriba: **🔗 Membresías — quién la abre**, con
`⟳ Sincronizar ahora`. Es la MISMA operación del cron
(`POST /subscriptions/membresias/sincronizar`, con sesión en vez de secreto), y
es inofensiva de repetir: no manda un solo correo y no reinicia ninguna fecha de
bloqueo.

**Lo que de verdad aporta es el detalle**, porque la causa más común **no** es
que el aviso se perdiera:

| Lo que dice | Qué hacer |
|---|---|
| `sigue EN REVISIÓN` | **La causa número uno.** La suscripción nace en `PENDING_REVIEW` a propósito y hasta que no se pone en «Activa» el club **no abre nada** — ni por el portal ni por Membresías. En la fila se lee «En revisión», que no parece una avería |
| `venció el …` | La fila sigue diciendo «Activa»: lo que caduca es la FECHA, no el `status`. Registrar el pago |
| `no tiene ningún plan que incluya Membresías` | Se contrató el de otra app, o se le venció y se borró la fila |
| `su aviso no llegó` | **No es un problema de datos**: falta `MEMBRESIAS_SYNC_URL` o `ECOSYSTEM_SYNC_SECRET`, o Membresías no respondió |

> **La lista no enseña a todo el que no abre**, y es a propósito: una federación
> que solo compró Campeonatos no abre Membresías y no le pasa nada. Salen los
> que tienen un plan de Membresías que no está funcionando, y los que **existen
> allí y quedaron en pausa** aunque ya no tengan plan — ésos sí, porque su gente
> no puede entrar ahora mismo. Los avisos que no salieron van en la cifra roja
> de arriba y no fila por fila: cuando el espejo está apagado fallan todos.

La frase la elige `common/porque-no-abre.ts`, que es una función pura y se
prueba sola: entre varias suscripciones nombra **la que está más cerca de
abrir** —la que alguien puede tocar hoy—, y si el plan es de la federación lo
dice, para no mandar al maestro a buscar una fila que no es suya.

### Y en Campeonatos, por qué NO hay nada equivalente

Porque **Campeonatos no tiene tabla de clubes**. `usuarios.club` es texto libre
en la fila de la persona, que se rellena preguntándole el nombre al ecosistema
la primera vez que entra (§4.13). No hay un registro de clubes del que un club
pueda estar ausente: si su maestro entra, su club aparece impreso en la llave y
en el acta; si no entra, no hay nada que enseñar.

**Membresías era distinta justamente porque sí tiene ese registro** —y un panel
de superadmin que lo lista—, así que un club sin nadie dentro era invisible y
parecía no existir.

El bloqueo por plan vencido **tampoco está en Campeonatos**, y es a propósito
(D10, §1.6): lo corta el pase. Un club cerrado por una columna mal puesta a
mitad de un campeonato es peor que uno que operó un mes de más. **Academy no lo
necesita**: no tiene login propio, así que toda entrada pasa por un pase que ya
no trae `academy` si el plan venció.

## 4.17 Lo que el super-admin ve, que no es lo que ve un maestro

*(3 de septiembre de 2026)*

Su panel de Membresías enseñaba lo mismo que el de un maestro —gente, y la gente
de cada club— y le ofrecía **crear clubes**. Las dos cosas están mal por el mismo
motivo: **el super-admin no administra alumnos ni crea clubes, administra
clubes que se crean en otro sitio.**

· **«Nuevo club» ya no sale con el portal conectado.** Los clubes nacen en el
  portal y bajan por el espejo; crearlos allí los dejaba **sin `eco_org_id`**, o
  sea sin escudo, sin plan y sin recibir un solo aviso. En su lugar se dice
  dónde se crean, que es la pregunta que deja el hueco.

  **Es una condición y no un borrado**: corriendo sola —Membresías se vende por
  su cuenta— sí se crean ahí, y el formulario sigue estando. Lo decide
  `GET /auth/config` (`sso`). Mientras no se sabe, no se enseña: enseñarlo de
  más crea clubes rotos, de menos solo obliga a recargar.

· **Y arriba, las cifras que sí son suyas**: clubes, activos, **en pausa por
  plan**, **sin enlazar al portal**, y personas. Las dos del medio van en rojo
  **solo si no son cero** — un «0» en rojo enseña a ignorar el color, y entonces
  el día que sea 3 tampoco se verá. Son las dos que disparan una llamada: o
  alguien pagó y no le abre, o alguien no ha pagado.

· **Y desde el 4 de septiembre, esas dos cifras se pueden seguir hasta el club.**
  Decían «2 en pausa por plan» y la lista de abajo se veía **idéntica**: no había
  manera de saber a cuáles dos. Ahora cada club lleva su etiqueta y son **tres
  cosas distintas que antes se confundían**:

  | Etiqueta | Quién lo hizo | Cómo se deshace |
  |---|---|---|
  | **Suspendido** | El super-admin, aquí | Con «Reactivar», aquí |
  | **En pausa por plan** | El ecosistema, por `plan_bloqueado_desde` | **Solo pagando en el portal.** «Reactivar» no lo toca |
  | **Sin enlazar** | Nadie: nació aquí, sin `eco_org_id` | No recibe escudo, ni plan, ni avisos |

  El club en pausa dice además **desde cuándo**, que es el dato que distingue
  «venció ayer» de «lleva tres semanas y el aviso se perdió». Y sobre el resumen
  hay una línea que explica qué es la pausa, porque la palabra sugiere que se
  hizo aquí y es justo lo contrario — sin ella, la reacción es buscar el
  interruptor que no existe. Solo sale si hay alguno: explicar algo que no está
  pasando es ruido.

### Reglas del panel que salieron de usarlo

- **Las cifras de clubes reparten el total, no se solapan**: cada club está en
  uno y solo uno de **Operando**, **En pausa por plan** o **Suspendido** (el que
  manda, porque es el que el super-admin puede deshacer). La lista usa el mismo
  reparto: una etiqueta por club.
- **`user_subscriptions` no tiene pantalla de alta**, pero sigue dando
  `app_scopes`: la tarjeta aparece solo si queda alguna, con su botón de
  borrar. Un permiso vivo que nadie puede ver ni retirar no puede existir.
- **El dinero se escribe como se lee**: `<CampoDinero>` en todos los importes
  (miles separados al teclear; devuelve el valor crudo).
- **Un `placeholder` no es un valor**: «cuánto costó» nace con la cifra
  calculada; «cuánto entregó» vacío = pagó todo.
- **Esconder lo seleccionado contradice la pantalla**: si el club elegido
  cuelga de una federación plegada, se enseña igual.
- **Ciudad y país no son texto libre** (`PaisCiudad`), y el nombre de una
  organización pasa por `validarNombreOrganizacion`.
- **Un buscador dice qué está haciendo** —aún no busco, buscando, no
  encontré—, y una respuesta lenta no pisa a una más nueva.

### «Ir a DINAMYT» y «Salir», separados

En las tres apps federadas. Hacen lo mismo desde lejos —los dos te sacan de la
aplicación— pero uno te lleva a tu portal y **el otro te cierra la sesión**, y
equivocarse cuesta volver a escribir la contraseña. Pegados, al pasar el ratón
los dos fondos se tocaban y parecían un solo bloque. Medio rem no es decoración:
es el margen de un dedo en un teléfono.

## 4.18 El cobro es por persona, y se cuenta al renovar

*(3 de septiembre de 2026 · migración `0019_cobro_por_persona`)*

Los planes tenían un importe **fijo** —y los que había en la base eran de
relleno: `Plan Membresías` a 60.000, `Academy` a 50.000—. Un club de 15 alumnos
y uno de 300 no pueden pagar lo mismo: con precio fijo, **o el pequeño no entra
o el grande está regalado**.

Y había una consecuencia menos obvia: `subscriptions.total_amount` se fijaba al
crear la fila, así que el importe era una **constante**. El panel de recaudo
sumaba números que dejaban de significar algo en cuanto un club crecía.

### La decisión: prepago, sobre el padrón del día que renueva

De las tres formas razonables de contar, se eligió ésta y las razones se
sostienen entre sí:

| Cuándo se cuenta | Por qué no |
|---|---|
| **Al renovar** ✅ | — |
| Al vencer (postpago) | El club acaba el mes debiendo una cifra que nadie le anunció. Y es la más fácil de bajar: quitas cuarenta alumnos la víspera, pagas, y los devuelves |
| El máximo del periodo | Es lo más justo, pero necesita un año de censo que nadie guardaba — y una carga masiva mal hecha infla la factura |

**Lo decisivo es que el resto del sistema ya era prepago**: se paga y se activa
un mes, y desde el 3 de septiembre el impago además **bloquea** (§4.16). Cobrar
por detrás significaría bloquear a alguien por una deuda que se generó sola.

Lo que crezca a mitad de mes se cobra **en la renovación siguiente**, que es
cuando se vuelve a contar.

### Qué cuenta como persona facturable

**Toda persona activa del club**: fila en `org_members` de esa organización y
`users.is_active`. Alumnos, auxiliares y el maestro.

Es una **definición y no una preferencia**: sin ella la cifra depende de la
consulta que se escriba ese día. Se eligió porque es una sola consulta, no
admite interpretación y **se audita contra la pantalla** — el número que factura
es el mismo que el maestro ve en su lista de gente.

> ⚠️ **Cada club cuenta a los suyos.** Quien pertenece a dos clubes cuenta en
> los dos, y es lo correcto: son dos clubes usando el servicio para la misma
> persona. Repartirla haría que la factura de un club dependiera de a qué otros
> clubes se apuntó su gente, y eso no se le puede explicar a nadie.

### Los dos números, y dónde se ponen

`subscription_plans` estrena `price_per_user` y `min_users`, y se editan en
**«Tarifa de cada plan»**, en `/admin`, debajo del recaudo — que es donde se
explica la cifra de arriba.

· **Sin `price_per_user`, el plan sigue cobrándose por `price_monthly`.** Es lo
  que hace que aplicar la migración **no le cambie el precio a nadie**: el
  precio cambia cuando alguien escribe el número. Y vaciar el campo es la
  marcha atrás, sin tocar la base.
· **`min_users` es el mínimo facturable.** Nadie factura tres alumnos: un club
  que arranca con cuatro paga una cifra que no cubre ni el soporte. Un club
  vacío paga el mínimo, no cero — si no, quedaría abierto gratis.

⚠️ **Cambiar la tarifa NO recalcula lo ya cobrado.** Quien pagó ayer pagó con la
tarifa de ayer. Es lo correcto, y no es lo que uno espera al pulsar «Guardar»:
por eso la pantalla lo dice.

### El alta también calcula, y no solo la renovación

Fue el agujero que quedó del primer intento: `renovar` ya contaba el padrón y
**el alta seguía pidiendo un monto a mano**. O sea que el primer periodo de cada
club se cobraba con un número inventado y solo a partir del segundo empezaba a
tener sentido — **justo al revés de lo que hace falta**, porque el alta es la
que fija la expectativa del club.

Ahora `POST /subscriptions` calcula igual que `renovar`, y el formulario enseña
la cuenta antes de crear nada:

```
GET /subscriptions/cotizar?orgId=…&planId=…
```

Devuelve `personas` y `facturadas` **por separado**, que no son lo mismo cuando
hay mínimo: ver «40 personas → se cobran 40» junto a «4 personas → se cobran 10»
es lo que hace que el mínimo se entienda sin que nadie lo explique.

> El campo del monto **sigue siendo editable**, porque hay cobros que se pactan
> —un descuento del primer mes, una cortesía—. Lo que cambia es que dejarlo
> vacío ya no significa «sin importe»: significa «el que calculó el servidor».

⚠️ **La cuenta se pide al servidor, no se repite en el navegador.** Es la misma
regla de siempre: la cuenta que factura tiene que ser una sola, o llega el día
en que la pantalla dice una cifra y el recibo otra.

### `billed_users`: por qué se guarda el padrón, y no solo el importe

`subscriptions.billed_users` guarda **por cuánta gente se cobró el periodo
vigente**. Solo con el importe no se puede contestar a «¿por qué me cobraron
esto?», que es la primera pregunta cuando la cifra cambia cada mes — y para
entonces el padrón de hoy ya no es el del día de corte. `null` = se cobró con el
modelo viejo.

### El censo diario, que es lo único que no se recupera

`ecosystem.org_headcount` guarda una fila por club y día con su padrón. Lo
escribe el barrido diario (§4.16), que ya recorre todos los clubes: sale gratis.

**Hace falta aunque el cobro no lo use**, y ésa es la parte que se olvida:

· El panel proyecta lo que entrará el mes que viene sin recontar en cada carga.
· Es lo único que dice si un club **crece o se está vaciando**.
· Y el día que se quiera evaluar el cobro por el máximo del periodo, hará falta
  un año de datos que hoy no guardaba nadie.

Idempotente por la clave `(org_id, dia)`: correr el barrido dos veces el mismo
día actualiza la fila en vez de duplicarla.

### Empezar limpio: `scripts/resetear-cobros.sh`

Mezclar importes fijos viejos con importes por padrón nuevos deja un histórico
con dos criterios, y el panel sumaría peras con manzanas. Con tres clubes y un
puñado de filas, empezar limpio cuesta menos que explicar para siempre por qué
enero se cobró de otra manera.

> ⚠️ **Qué pagos son estos, que es lo primero que hay que tener claro.** Los del
> **super-admin cobrándole a los clubes su plan**. NO son las mensualidades que
> el maestro le cobra a sus alumnos. Son dos cobros en dos esquemas distintos:
>
> | Se borra | No se toca |
> |---|---|
> | `ecosystem.subscriptions` | `membresias.plans` — las tarifas del club |
> | `ecosystem.subscription_payments` | `membresias.payments` — lo que el ALUMNO le paga a su maestro |
> | | `membresias.memberships`, `membresias.attendances` |
>
> **La regla, por si algún día se edita ese guion: si la tabla empieza por
> `membresias.`, no se toca ahí.** Esa es la caja del club y no es nuestra. El
> guion lo comprueba al final imprimiendo `pagos_de_alumnos_INTACTOS`, que tiene
> que salir igual antes y después.

Las personales (`user_subscriptions`) **no se borran** salvo que se pidan con
`--tambien-personales`: son otra cosa —alguien comprándose Academy para sí
mismo— y no están en el cambio de modelo.

⚠️ **Al borrar las suscripciones, ningún club abre nada** hasta que se las
vuelva a crear: los `app_scopes` salen de ahí, y el barrido siguiente pondrá
Membresías en pausa para todos. **Se corre cuando se vayan a recrear enseguida,
no un viernes.** En seco por defecto, como la reconciliación (§2.8).

### «Esperado al mes» es lo pactado, no el padrón de hoy

*(Corregido el 5 sep 2026: se recalculaba con el padrón en cada carga.)* Son dos
cifras porque son dos preguntas:

| Cifra | Qué contesta | De dónde sale |
|---|---|---|
| **Esperado al mes** | Lo **pactado** del ciclo vigente. Fijo hasta la próxima renovación | `subscriptions.total_amount ÷ renewal_months` |
| **Al renovar** | Lo que se cobrará en la **próxima** renovación con el padrón de hoy | `importeDelPeriodo(plan, censo)` |

La regla vive en `mensualComprometido` (`common/cobro-por-persona.ts`) y **no
recibe el censo**, a propósito; seis pruebas la protegen.

---

## 4.19 El importe que todavía nadie ha pagado no es una factura

*(3 de septiembre de 2026)*

### El caso que pasa SIEMPRE la primera vez

Se le crea la suscripción a un club que **todavía no ha subido a su gente**:
cero personas, así que se cobra el mínimo. Al día siguiente el maestro sube a
sus ochenta alumnos… y la suscripción sigue diciendo el mínimo, porque el
importe se fijó al crearla.

Se le cobra por diez a un club de ochenta, y **nadie se entera hasta que alguien
mira**.

### La regla, y por qué hacen falta sus dos mitades

**Un importe que nadie ha pagado todavía no es una factura: es un presupuesto.**

| Mientras… | El importe… |
|---|---|
| `paid_amount = 0` | **sigue al padrón**, y se corrige solo cada mañana |
| entró el primer peso | **se congela** |

· Sin la primera mitad, el caso de arriba se repite con cada club nuevo y hay
  que acordarse a mano — que es como se olvida.
· Sin la segunda, el importe cambiaría **después** de que el club pagó, y eso
  rompe lo único que este modelo prometía: que sabes cuánto pagas antes de
  pagar. **Una factura que se mueve sola no es una factura.**

Lo hace el barrido diario (`recalcularNoPagadas`), y hay un botón **«↻
Actualizar monto»** para no esperar a mañana. El botón **solo sale si no hay
pagos**: ofrecer uno que va a contestar «no puedo» es peor que no ofrecerlo.
`forzar` existe para el caso raro, y asume lo que significa.

### «Renovar» pasó a ser «Registrar pago»

Porque es lo que se hace: **entró plata a caja y se apunta**. Que además
extienda la fecha es la consecuencia, no la acción — y llamarlo «renovar» hacía
pensar en un trámite del sistema en vez de en un movimiento de dinero.

Los dos campos siguen separados —«cuánto costó» y «cuánto entregó»— porque son
dos hechos distintos: con uno solo, quien recibe la mitad tiene que elegir entre
mentir en el precio o mentir en lo pagado. Lo que cambia es que **el precio ya
viene puesto con la cuenta de verdad** (padrón × tarifa) en vez de con el
importe fijo viejo, y debajo se enseña de dónde sale.

### El tipo de suscripción calcula las fechas

Antes había que teclear «desde» y «hasta». Es la misma cuenta cada vez y hacerla
a mano es como se cuela un club con un periodo de once meses. Ahora se elige
**mensual, trimestral, semestral o anual**, y las fechas salen solas — editables
debajo para el caso raro. Mover «desde» arrastra «hasta», o cambiar el inicio
dejaría un periodo de otra duración sin que nadie lo pidiera.

`renewalMonths` se guarda al crear, así que **la renovación hereda el ciclo**: un
club trimestral no se renueva por un mes porque alguien no se acordó.

> ⚠️ **`sumarMeses` no usa `setMonth`**, y no es purismo: `new Date('2026-01-31')`
> con `setMonth(+1)` da **el 3 de marzo**, porque el 31 de febrero no existe y
> JavaScript desborda al mes siguiente. Un club que contrata el 31 de enero
> acabaría con el periodo terminando en marzo. Aquí el día se **recorta al
> último del mes destino**, que es lo que espera cualquiera.

### Y el plan del club, por fin, en la campana

`avisarVencimientos` mandaba un correo a los gestores. Está bien para quien lo
lee — pero **el maestro vive en la campana**: es donde ve que alguien quiere
entrar y que alguien se fue. Su propia suscripción era lo único que no aparecía
ahí, o sea que **la única cosa que puede cerrarle la aplicación entera era la
que menos se veía**.

Tres tipos nuevos en `AVISOS_ORG`, y es el mismo trato que Membresías le da al
alumno con su mensualidad:

| Aviso | ¿Tarea? |
|---|---|
| `plan_por_vencer` | **Sí** — deja de ser verdad al pagar |
| `plan_vencido` | **Sí** — igual |
| `plan_pagado` | No: es una noticia, ya está hecho |

Los dos primeros se resuelven **solos** al registrar el pago (`resolverPor`), sin
que nadie los marque. Un «tu plan vence en 5 días» que sigue ahí una semana
después de haber pagado es exactamente lo que enseña a ignorar la campana.

> El aviso a la campana va **fuera** del `try` del correo: que no haya SMTP
> configurado no puede dejar al maestro sin saber que su plan vence.

### Lo que el barrido informa ahora

`barrerPlanes` disparaba los avisos sin esperarlos, así que informaba de lo que
**intentó** y no de lo que llegó: se corría el cron, salía `alDia: 8`, y en
Membresías seguían viéndose tres. **El número decía que todo fue bien y la
pantalla decía que no**, que es la peor combinación para diagnosticar.

Ahora espera a cada uno y devuelve:

| Campo | Qué mirar |
|---|---|
| `creados` | Clubes que tenían plan y **no existían** allí: nacieron ahora |
| `sinEspejo` | Contestaron «no lo tengo» y no se pudo crear: sin plan, o sin nombre |
| `noLlego` | **Si no es cero, el problema no es de datos**: falta `MEMBRESIAS_SYNC_URL` o el secreto, o Membresías no responde |

Y el espejo dice en el log cuándo no salió siquiera, con el motivo — antes se
callaba si faltaba la configuración.

## 4.20 Dónde vive una foto

*(4 de septiembre de 2026)*

La foto de cada persona (`users.avatar_url`) y el escudo de cada club
(`organizations.logo_url`) **se guardaban dentro de la fila**, como data-URL.
Fue la decisión correcta mientras el disco se borraba en cada despliegue: ni un
bucket que contratar, ni credenciales de otro servicio. Ya no lo es.

Una sola foto incrustada multiplicaba por dieciocho el listado de miembros
(medido: 2 394 → 44 014 bytes), y las fotos entraban enteras en el volcado
diario.

### Las tres formas de una imagen

La columna es `text` y admite tres cosas, cada una de un sitio:

| Forma | De dónde sale |
|---|---|
| `data:image/…` | Incrustada. Es lo que manda la web, que la recorta y la recomprime antes (`comprimirAvatar`) |
| `/media/<hash>.<ext>` | Ya en el disco. La escribe `guardarImagen` y la sirve Caddy |
| `http(s)://…` | Alojada fuera. Un club puede tener las suyas donde quiera |

**Las viejas siguen valiendo**, y por eso esto se pudo desplegar sin migrar
nada: quien tenga su foto incrustada la sigue viendo igual.

### Por qué el nombre es el hash del contenido

Porque es lo que permite cachear un año sin servir nunca la vieja: si el
contenido cambia, cambia el nombre. Y trae un regalo — **escribir es
idempotente**. Dos personas con la misma imagen acaban en el mismo archivo, y
volver a guardar la de siempre no escribe nada, que es el caso normal: la
pantalla de perfil reenvía la foto cada vez que se guarda cualquier otro campo.

### El interruptor es UNO, y es a propósito

`MEDIA_PUBLIC_URL`. Sin ella, la imagen se sigue guardando incrustada. Con ella,
va al disco **y** el espejo sabe mandarla absoluta.

Que sea la misma variable para las dos cosas no es pereza: es lo que impide
encenderlo a medias. La foto se copia a Membresías tal cual, y allí
`imagenGuardada` acepta un `data:` o un `https://` **y nada más**. Un `/media/…`
relativo lo rechazaría, y **ese rechazo no lo ve nadie**: la foto quedaría bien
en el portal y dejaría de llegar al carnet. Es el mismo silencio de §4.7.

Por eso `espejarPersona` y `espejarClub` la convierten en
`https://id.dinamyt.org/media/…` antes de mandarla — que es una de las dos
formas que el otro lado **ya aceptaba, sin cambiar una línea allí**. Y le sienta
mejor todavía: al no ser una imagen incrustada, su `direccionImagen` la devuelve
tal cual y el carnet la carga directa.

> ⚠️ En producción tiene que ser `https://`. En local vale `http://localhost:3001`
> y el espejo se quejará con un WARN, que es el comportamiento correcto.

### Lo que no se inventó, que es casi todo

Las dos mitades ya estaban escritas en el monorepo, en dos aplicaciones
distintas, y lo que se hizo fue juntarlas:

· **De Academy** (`academy-api/src/lib/uploads.ts` y su `app.ts`): la allowlist
  de formatos, la verificación de FIRMA —los primeros bytes tienen que ser del
  formato que el archivo dice— y servir el resultado como dato inerte
  (`nosniff` + una CSP que no deja ejecutar nada). **SVG queda fuera a
  propósito**: puede llevar scripts.
· **De Membresías** (`membresias-api/src/lib/imagenes.ts`): la forma exacta del
  data-URL que se acepta, y el hash del contenido como identidad de la imagen.

### Y una cosa que Membresías resolvió y aquí no se podía copiar

Membresías nunca manda la foto en un listado: manda la dirección de una ruta que
la sirve en binario. Eso aquí **no valía**, y está escrito en el propio código
(`organizations.service.ts`): el portal autentica con `Bearer` en la cabecera y
un `<img src="…">` no manda cabeceras, así que esa ruta respondería 401. Hacía
falta primero darle al portal una cookie de sesión.

**El disco lo resuelve por el otro lado, y por eso este pendiente valía doble:**
un archivo cuyo nombre es el hash de su contenido no necesita autenticación
ninguna. El nombre *es* la llave.

### El escudo se valida, porque el daño no se ve aquí

Las tres rutas que escriben `logoUrl` pasan por `validarLogo`. Sin eso entraba
cualquier cosa, y lo que pasara de los 90 000 caracteres de `/sync/club` se
guardaba en el portal y **no llegaba al carnet**, en silencio.

### Dónde está cada cosa

| Pieza | Archivo |
|---|---|
| El almacén | `apps/ecosystem-api/src/common/almacen-imagenes.ts` |
| Las tres formas, validadas | `common/validacion.ts` (`validarAvatar`, `validarLogo`) |
| Servirlas en local | `main.ts` (`useStaticAssets`) |
| La conversión para el espejo | `common/espejo-membresias.ts` (`absolutaMedia`) |
| Resolver la ruta en el portal | `ecosystem-portal/src/lib/api.ts` (`urlImagen`) |
| Mover las que ya estaban | `scripts/fotos-al-disco.mjs` (en seco por defecto) |
| Su ensayo, contra PGlite | `scripts/probar-fotos-al-disco.mjs` |

## 4.21 Cómo quiere ver DINAMYT cada quien

*(5 de septiembre de 2026)*

El tema y el idioma son de la PERSONA, no de la aplicación. Viven en
`users.theme` y `users.locale`, se eligen en el perfil del portal —donde ya
estaba «Tu hora»— y valen en las cuatro webs y en cualquier dispositivo.

### Por qué NO basta con el navegador

Porque `localStorage` es **por origen**, y las cuatro apps viven en subdominios
distintos: `dinamyt.org`, `club.dinamyt.org`, `campeonatos.dinamyt.org`,
`academy.dinamyt.org`.

Membresías y Campeonatos **ya tenían modo claro** —esto no se construyó de
cero—, cada una guardándolo en su propio navegador y con su propia clave
(`membresias_theme`, `dinamyt_theme`). O sea que quien prefiere el claro tenía
que pedirlo una vez por app, y otra vez en cada teléfono. Eso es exactamente lo
contrario de §4.9.

Así que la verdad vive en la fila y el navegador se queda una **copia**. La
copia hace falta y no sobra: es lo que permite pintar el tema bueno **antes de
saber quién eres**, sin el fogonazo oscuro que se lee como un fallo.

### Los tres valores del tema, y por qué `sistema` es uno de ellos

`sistema` · `claro` · `oscuro`. `sistema` es el de por defecto y hace de «no
consta» sin necesitar una bandera aparte — que es la diferencia con la zona
horaria, donde el valor detectado y el elegido son del mismo tipo y hubo que
inventar `timezone_manual` para distinguirlos.

### El idioma sí necesitaba esa bandera, y le faltaba

`users.locale` existía desde el trabajo de zonas y **ya se llenaba solo**: el
navegador manda `X-Idioma` en cada login y renovación (§4.12).

Pero `anotarZona` lo escribía **siempre**, sin mirar si alguien lo había
elegido. O sea que poner «English» a mano duraba hasta el siguiente inicio de
sesión, porque el navegador dice `es-CO`. Una preferencia que no sobrevive a
entrar no es una preferencia — la misma lección de `timezoneManual`, que a la
columna gemela se le había pasado. De ahí `locale_manual` (migración `0021`).

### Los colores, en un solo archivo

`packages/shared/estilos.css`. Antes había **cuatro copias** de la paleta, una
por web. Tres decían lo mismo token por token; **Campeonatos se había desviado
en ocho de los diez que comparte** —otro `--bg`, otro `--bg-card`, otro
`--text`—, así que saltar del portal a Campeonatos era cruzar a un gris
distinto sin saber por qué.

Los valores que quedaron son **los de Membresías**, enteros. No es una media
entre las cuatro: es una de ellas, para que el resultado sea un diseño y no un
promedio.

> ⚠️ Membresías y Campeonatos están en **otros repositorios** (§1.1) y no en
> este workspace, así que no pueden importarlo por el nombre del paquete. Para
> ellas se copia con `sync-apps.ps1`. Membresías ya coincide —es el original—;
> **Campeonatos es la que hay que alinear, en SU repositorio.**

### El único token que no es una traducción directa

El oro. En claro baja de `#f0b800` a `#a37400`: el de la marca sobre blanco da
**1.9:1** de contraste, que es ilegible. Lleva su motivo escrito al lado para
que nadie lo «arregle» devolviéndolo.

### Dónde está cada cosa

| Pieza | Archivo |
|---|---|
| Los colores, y el modo claro | `packages/shared/estilos.css` |
| El tema: aplicar, guardar, anti-parpadeo | `lib/tema.ts` (portal y Academy) |
| Los textos, es/en | `lib/i18n.tsx` (portal y Academy) |
| Elegirlos | `components/Apariencia.tsx`, en el perfil del portal |
| El control flotante 🌐 | `components/ControlesApariencia.tsx` (Academy, igual que Membresías) |
| Validación | `common/validacion.ts` (`validarTema`, `validarIdioma`) |
| Las columnas | migración `0021_tema_e_idioma` |

Lo que falta —que Academy pregunte la preferencia al ecosistema, y los textos
sin traducir— está en `HOJA-DE-RUTA.md`.

### La preferencia viaja en los dos sentidos

El tema y el idioma viajan **dentro del pase**, que sirve para pintar sin pedir
nada; pero un pase de hace veinte minutos dice el tema de hace veinte minutos.
Por eso se pregunta, y **después** de pintar:

| Momento | Qué pinta |
|---|---|
| Antes del primer píxel | La copia local (`localStorage`) y la cookie compartida `.dinamyt.org` (`dinamyt_tema`, `dinamyt_idioma`) — sin esto vuelve el fogonazo |
| Al montar | Lo que dice el pase — instantáneo, sin red |
| En cuanto contesta el servidor | **La verdad**, y corrige si difiere |
| Al volver a la pestaña | Otra vez la verdad |

```
GET  /users/me/apariencia        ← el portal, con su pase
GET  /sync/apariencia/:ecoSub    ← Membresías y Campeonatos, por el secreto compartido
POST /sync/apariencia            ← la ida, desde esas dos
```

- `<AplicarApariencia />` va en el `layout` de las cuatro webs: lo que vale en
  todas las pantallas no puede depender de acordarse de ponerlo en cada una.
- `escucharTemaDelSistema()` repinta cuando el teléfono pasa a oscuro,
  **mientras la elección siga siendo `sistema`**, y no guarda nada.
- ⚠️ **Nadie pregunta sin sesión**: un 401 en Membresías o Campeonatos manda al
  login, y el marcador del tatami se ve sin entrar y proyectado en una pared
  (`haySesionProbable`, `useAuth().user`).
- Sin `ECOSYSTEM_SYNC_SECRET` la lectura devuelve `null` y la pantalla se queda
  con lo que tenía: Campeonatos arranca sin internet el día del evento.
- **Membresías guarda su propia copia** (`users.theme`, `users.locale`, su
  migración `0020`): para el alumno de carnet QR o el club que usa Membresías
  sola, «su cuenta» ES esa fila.

**«Lo cambio en el portal y Campeonatos sigue igual»** tiene dos causas mudas:
que a `campeonatos-api` le falte `ECOSYSTEM_SYNC_SECRET` (ahora lo dice al
arrancar: `EL ESPEJO DE APARIENCIA ESTÁ APAGADO`), o que esa persona tenga
`usuarios.eco_sub` en `NULL` (se llena sola la primera vez que entra desde el
portal):

```bash
sudo journalctl -u campeonatos-api --since "10 min ago" | grep ecosistema
```

```bash
sudo -u postgres psql -d dinamyt -c "select count(*) filter (where eco_sub is null) as sin_enlazar, count(*) as total from campeonatos.usuarios;"
```

> **Regla de Membresías que salió de aquí: se consulta por `req.db`, nunca por
> `app.db`**, salvo en los guards que corren antes del contexto. Contra PGlite
> `app.db` cuelga la petición; contra PostgreSQL corre fuera de RLS.

| Pieza | Dónde |
|---|---|
| Escuchar el tema del sistema | `escucharTemaDelSistema()` en `lib/tema.ts` / `lib/theme.ts` (las cuatro) |
| Aplicarlo en todas las pantallas | `components/AplicarApariencia.tsx` |
| Leer la verdad, portal | `GET /users/me/apariencia` → `UsersService.aparienciaDe` |
| Leer la verdad, las otras dos | `GET /sync/apariencia/:ecoSub` |
| El puente de Membresías | `leerAparienciaDelEcosistema` (`lib/alta-ecosistema.ts`) |
| El puente de Campeonatos | `leer_apariencia` (`backend/app/espejo.py`) |

## 4.22 Un solo diseño para las cuatro webs

*(5 de septiembre de 2026)*

Cada web tenía **su copia** del sistema visual y las copias se habían separado
(Campeonatos, con otra tipografía y 8 de 10 colores distintos; el portal, con
botones y login propios). Se copiaba la pantalla de al lado y se retocaba, que
es como se separan las cosas que no tienen un solo sitio.

### El modelo es Membresías

No es una media entre las cuatro: es **una de ellas, entera**. Un promedio no es
un diseño — es lo que queda cuando nadie decide.

Todo vive en `packages/shared/estilos.css`: los colores, el modo claro, la
tipografía de rol, los botones, las tarjetas, las insignias, los campos y la
pantalla de entrar.

### Cómo llega a cada app

· **Portal y Academy** lo importan por el nombre del paquete:
  `@import '@dinamyt/shared/estilos.css'`.
· **Membresías y Campeonatos** no pueden —viven en otros repositorios y a
  propósito no están en el workspace (§1.1)—, así que se les **copia**:

  ```powershell
  .\scripts\repartir-estilos.ps1            # reparte
  .\scripts\repartir-estilos.ps1 -Comprobar # solo dice si alguna está desfasada
  ```

  El archivo llega como `src/app/estilos-ecosistema.css` con una cabecera que
  avisa de que es generado. **Después hay que commitear en cada repositorio.**

### Las clases del login llevan prefijo `eco-`, y no es manía

Campeonatos ya tenía `.login-logo`, `.login-card` y `.login-wrapper` definidas
en un `<style>` dentro de su propia página — y **su `.login-logo` es un
contenedor, no la imagen**. Sin el prefijo, la regla compartida lo habría
encogido a 56×56 y le habría roto la portada. Cuatro apps compartiendo hoja de
estilos es exactamente donde un nombre genérico se convierte en un fallo a
distancia.

### El modo claro, rehecho con números

El que había venía de Membresías y tenía **un fallo de accesibilidad que nadie
había medido**: `--gold: #a37400` sobre blanco da **4.15:1**, por debajo del
4.5:1 que exige WCAG AA. El antetítulo de cada pantalla se leía mal.

Y al corregirlo aparece el segundo problema: un oro que pasa como TEXTO es
oscuro, y de fondo se ve embarrado. El botón «Entrar» lleva texto oscuro
**encima** del oro, y con el oro oscuro eso daba 3.86:1 — el botón de marca,
ilegible.

**Por eso el oro son dos tokens y no uno:**

| Token | Para qué | En claro |
|---|---|---|
| `--gold` | La LETRA | `#9a6a00` — 4.73:1, pasa AA |
| `--gold-fill` | El RELLENO (el CTA) | `#f0b800` — se queda vivo, y con texto oscuro da 10:1 |

Es la solución de siempre para una marca luminosa en tema claro: **el color no
se apaga, se cambia de sitio.**

Los acentos también subieron de croma sin perder contraste — se veían apagados
porque estaban oscurecidos para que pasaran, en vez de elegidos para que ya
pasaran:

| | Antes | Ahora | Croma | Contraste |
|---|---|---|---|---|
| acción | `#17784f` | `#0a7d52` | 81 % → 92 % | 5.16:1 |
| peligro | `#c4213f` | `#d61f3f` | 83 % → 86 % | 5.09:1 |
| bien | `#167a4d` | `#00875a` | 82 % → 100 % | 4.55:1 |
| aviso | `#1b5fbf` | `#0b62d6` | 86 % → 95 % | 5.63:1 |

Y el fondo bajó de `#f4f4f8` a `#eef0f4`: con el fondo casi blanco, una tarjeta
blanca no se distinguía de la página y todo se veía plano.

### La paleta del correo es la única copia que queda, y tiene guardián

`mailer.service.ts` repite los colores a mano porque un correo no puede importar
una hoja de estilos —Gmail la tira— ni usar `var(--bg)`, que Outlook no
entiende. `paleta-correo.spec.ts` compara los dos archivos y falla si se
separan: **nadie mira su propio correo de verificación dos veces**, así que sin
esa prueba el correo sería lo último en notarse.

### Por qué Campeonatos no se parecía, y no era Flask

El backend sirve JSON y no pinta un píxel: la causa era el CSS, y son reglas que
siguen valiendo:

1. **Una regla sin capa gana SIEMPRE a una capada**, sin importar orden ni
   especificidad. Campeonatos no usa Tailwind, así que sus reglas van sin capa,
   y un `.btn`, `.card` o `.input` propio **anula entero** al compartido (que va
   en `@layer components`). No hay aviso: parece que el archivo no se cargó.
2. **El área táctil de 44 px, solo con dedo** (`@media (pointer: coarse)`) y
   **nunca sobre `.btn-sm`**, que en esa app sale unas 130 veces.
3. **La caja de los campos no se redefine**, y los títulos van del color del
   texto: el oro se reserva para el antetítulo y la marca.
4. **«DINAMYT» se escribe de un solo color**, salvo en `/pantalla` (la
   proyección para el público), que lo pide con `.logo-acento`.
5. **Hong y chung son reglamento, no decoración**: `--chung` no se redefine. Sí
   se quedan los derivados de competición (`--chung-vivid`, `--chung-light`).

> **Comprobación de que no vuelve a pasar.** Cruzando los selectores de
> `estilos-ecosistema.css` con los de `globals.css`, a Campeonatos solo le
> quedan cinco en común —`:root`, `html`, `body` y las dos de Edge— y todos
> añaden, no sustituyen. Si algún día aparece un `.btn` o un `.card` en esa
> lista, es este mismo fallo otra vez.

## 4.23 Qué versión está corriendo

*(5 de septiembre de 2026)*

Ahora se ve, en el pie de cada web: `v2026.09.05`.

### Por qué CalVer y no SemVer

Porque aquí no se publican «versiones»: se despliega cuando algo está listo, a
veces varias veces al día, y las cuatro webs y las tres APIs salen del mismo
git. En ese mundo un `1.4.7` no responde la única pregunta que se hace de
verdad delante de un problema:

> «¿esto que estoy viendo es de antes o de después del arreglo?»

Una fecha sí. Y como en un día puede haber tres despliegues, la fecha sola
tampoco basta: el hash del commit lo cierra. En pantalla va `v2026.09.05`; al
dejar el cursor encima, `2026.09.05+8cacddf` — que es lo que hay que pegar en un
reporte.

### Qué cuenta como una actualización

**Cualquier despliegue.** No hay una lista de cambios que merezcan número y
otros que no: si el código que corre cambió, la versión cambia. El propósito de
este dato no es celebrar novedades, es poder decir qué está corriendo — y el
arreglo de una línea que nadie nota es justo el que más falta hace identificar
cuando alguien escribe «me sigue pasando».

### De dónde sale

Del **commit**, no del reloj de quien compila (`next.config.ts` de cada web):
dos personas compilando el mismo código tienen que obtener la misma versión.
Sin git —un tarball, un contenedor sin `.git`— dice `dev`, que es lo honesto.

---

# PARTE 5 · Las trampas que ya costaron una tarde

## 5.1 Una transacción olvidada secuestra la base entera

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

## 5.1-bis `DEFAULT now()` en una columna sin zona no es la hora que crees

**Costó un despliegue entero.** Al día siguiente de poner las sesiones
revocables, entrar y ser echado al instante con «tu sesión se cerró sola tras 20
minutos sin actividad» — recién entrado, sin haber estado quieto un segundo.

El mecanismo, que no se parece en nada al síntoma:

- Casi todas las columnas de fecha del ecosistema son `timestamp` **sin zona**.
- Postgres escribe `now()` como **la hora de pared de la base**. En el VPS eso
  es `America/Bogota`, porque PostgreSQL sigue al sistema y ahí se corrió
  `timedatectl set-timezone America/Bogota`.
- Drizzle **lee** las columnas sin zona dando por hecho que lo guardado es UTC
  (`mapFromDriverValue` hace `valor + '+0000'`).

Las dos mitades usan convenios distintos. Una fila escrita por la base y leída
por la aplicación aparece **cinco horas en el pasado**.

**En local no se ve**, y por eso llegó a producción: PGlite arranca en `GMT`,
que coincide con lo que espera Drizzle. Cuadraba por casualidad.

**La regla:** si una fecha se va a comparar con `Date.now()`, la escribe
**JavaScript**, nunca `DEFAULT now()`. Lo que se escribe desde JS va y vuelve
en UTC por los dos lados, y la zona de la base deja de importar.

> **Y la regla que la sustituye, desde `0012_fechas_con_zona`** (aplicada en
> producción): **la columna lleva zona**. Sobre `timestamptz` lo
> guardado es un instante, así que `now()` y `new Date()` escriben lo mismo y
> deja de importar quién la rellene. Recordar un convenio en cada columna es
> justo lo que falló; el tipo no se olvida.
>
> Lo que **no** cambia: una fecha civil —un cumpleaños, el día en que vence una
> suscripción— no lleva zona ni la quiere. Esas se quedan como están.
>
> `0012` pasó a `timestamptz` las 35 columnas de instante de `ecosystem` (16
> tablas), **cada una con su propio `USING`**: convertir a secas estropea lo que
> escribió la aplicación. Hubo que auditar quién escribe cada una —siempre
> `now()` (Bogotá), siempre `new Date()` (UTC), y los `updated_at` mixtos,
> separados por la distancia a su `created_at`—. Si algún día se convierte otra
> columna de instante: respaldo delante (no hay vuelta atrás automática),
> `SHOW timezone;` tiene que decir `America/Bogota`, y el ensayo
> `cd apps/ecosystem-api && pnpm zonas:ensayo`. Membresías hizo lo mismo en su
> repositorio (`0017_fechas_con_zona`, con `current_setting('TimeZone')` porque
> se instala en bases en UTC); Campeonatos no lo necesita (sus defaults son de
> Python, en UTC). Las seis columnas de **día** (`birth_date` ×2 y los
> `starts_at`/`ends_at` de las suscripciones) se quedaron sin zona a propósito:
> su tipo correcto es `date` (`HOJA-DE-RUTA.md`).

En `sessions` las columnas ya **no tienen** `defaultNow()` —ni en el esquema de
Drizzle ni en la base (migración 0011)—, así que el tipo obliga a dar el valor
y esto no puede volver por descuido. El ensayo que lo vigila:

```bash
cd apps/ecosystem-api && pnpm sesion:ensayo
```

Levanta PGlite **en la zona de Bogotá** a propósito, y además comprueba que un
`now()` de la base seguiría saliendo 300 minutos desviado: si esa comprobación
falla, es que el ensayo se está corriendo en UTC y no está probando nada.

## 5.1-ter Campeonatos se bloqueaba contra sí mismo al arrancar

**Costó una mañana de servicio caído, el 29 de agosto de 2026.** El síntoma:
`campeonatos.dinamyt.org` cargaba la página, pero **todo lo que colgaba de
`/api/` y `/socket.io/` se quedaba esperando para siempre** — ni un 502, ni un
error en ningún registro, y `systemctl` diciendo `active`.

El mecanismo, que no se parece al síntoma:

1. `wsgi.py` siembra al arrancar. `seed_admin()` hace
   `Usuario.query.filter_by(email=…).first()` y, **cuando el admin ya existe y
   ya es superadmin, sale por una rama sin `commit()`**
   (`seed_admin.py:24-26`). La transacción del ORM queda abierta reteniendo un
   `ACCESS SHARE` sobre `usuarios`.
2. Diez líneas después, `ensure_rls()` lanza
   `ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY` **desde otra conexión del
   pool** (`rls.py:205`, `db.engine.begin()`). Pide `ACCESS EXCLUSIVE` sobre esa
   misma tabla y **espera a su propio hermano**.
3. A los cinco minutos exactos, `idle_in_transaction_session_timeout` mata la
   sesión ociosa y el `ALTER` consigue por fin el candado…
4. …pero el cierre del contexto de Flask hace `ROLLBACK` sobre una conexión ya
   muerta, el worker sale con código 3, **gunicorn apaga el master entero**
   («Worker failed to boot») y systemd lo levanta. Ciclo de cinco minutos, para
   siempre.

**El `try/except` de `wsgi.py` no protege de esto**, y su comentario engaña por
eso: **un bloqueo no es una excepción**. La excepción llega cinco minutos tarde
y en el cierre del contexto, fuera del `try`.

### Cómo se distingue de §5.1

- `NRestarts` sube solo. El reinicio manual «funciona» y a los cinco minutos
  vuelve a caer.
- Directo al puerto, saltándose Caddy, **también** se cuelga:
  `curl -m 12 http://127.0.0.1:5000/`.
- Y sobre todo, en `pg_stat_activity` el bloqueado y el bloqueador son **el
  mismo usuario**:

```bash
sudo -u postgres psql -d dinamyt -P pager=off -c "select pid, usename, state, wait_event_type, pg_blocking_pids(pid) as bloqueado_por, now()-xact_start as tx_edad, left(query,60) from pg_stat_activity where datname='dinamyt' order by xact_start nulls last;"
```

Si los dos son `dinamyt_camp`, es esto — y **no se arregla matando conexiones**:
matarlas es exactamente lo que ya hace el timeout cada cinco minutos.

### El arreglo

Una línea en `wsgi.py`, entre los seeds y el bloque de RLS, que suelta el
candado antes del DDL:

```python
    db.session.commit()
```

> ✅ **Cerrado el 29 ago 2026** en `dinamyt-combat` (`7a740cd`, ya en `main`),
> desplegado y con el espejo del monorepo al día. De propina, `rls.py` pone
> ahora `SET LOCAL lock_timeout = '5s'` antes de cada sentencia: no evita el
> bloqueo, pero hace que **falle en cinco segundos y se imprima** en «RLS
> incompleto» en vez de colgar el arranque en silencio — que es exactamente lo
> que costó la mañana.

### La trampa del despliegue, que volvió a tirarlo media hora

Con el arreglo ya escrito, el servicio **se cayó otra vez**. El parche estaba en
una rama **empujada pero sin fusionar a `main`**, y el despliegue hizo lo que
decía el manual:

- `git checkout -- backend/wsgi.py` → **descartó el parche vivo** del servidor.
- `git pull` → **no trajo nada**, porque en `main` no había nada nuevo.

El servidor se quedó con el código roto y volvió al bucle. **Antes de descartar
un parche que está sosteniendo el servicio, comprueba que lo que va a
sustituirlo ya está en la rama que vas a traer:**

```bash
git -C /srv/campeonatos fetch origin && git -C /srv/campeonatos log --oneline -1 origin/main
```

Y si el arreglo vive en una rama sin fusionar, se trae ella directamente en vez
de esperar a `main` — es un avance rápido y no hay conflicto posible:

```bash
cd /srv/campeonatos && git fetch origin && git merge --ff-only origin/<rama> && sudo systemctl restart campeonatos-api
```

✅ La comprobación que no miente, después de cualquier despliegue: que el
arreglo **esté en el archivo**, no que el comando saliera sin error.

```bash
grep -c "db.session.commit()" /srv/campeonatos/backend/wsgi.py; grep -c "lock_timeout" /srv/campeonatos/backend/app/rls.py
```

## 5.13 Bajo eventlet, un nombre que no resuelve cuelga diez segundos

**Síntoma:** entrar a Campeonatos desde el portal responde **422** y el registro
dice:

    [ecosistema] pase rechazado: PyJWKClientConnectionError:
    Fail to fetch data from the url, err: "<urlopen error [Errno -3] Lookup timed out>"

Y al mismo tiempo, desde el mismo servidor:

```bash
curl -s -o /dev/null -w "dns=%{time_namelookup}s total=%{time_total}s codigo=%{http_code}
" https://id.dinamyt.org/auth/jwks
```

…responde **200 en 95 ms, con el DNS en 9 ms**. No es la red, no es el
cortafuegos y no es el token.

**Es eventlet.** Campeonatos corre con `gunicorn -k eventlet`, que sustituye la
resolución de nombres de Python por la suya (greendns) y no se entiende con el
`systemd-resolved` de esta máquina. Medido el 30 de agosto: **10,4 s hasta
rendirse**, y —esto es lo peor— **el `timeout` de la petición no lo acota**,
porque no llega a haber petición. Con un solo worker, esos diez segundos son la
app entera parada.

**El arreglo es no usar nombres**: el ecosistema corre en esta misma máquina.

    ECOSYSTEM_JWKS_URL=http://127.0.0.1:3001/auth/jwks

Con eso son **0,01 s**, sin DNS, sin TLS y sin el rodeo por Cloudflare para
pedirle una llave pública a un vecino. La alternativa —`EVENTLET_NO_GREENDNS=yes`
en la unidad de systemd— también funciona, pero cambia el comportamiento de todo
el proceso para arreglar una consulta.

> **Membresías no tiene este problema** y por eso su SSO nunca lo enseñó: es
> Node, con su propio resolutor. La trampa es de las apps Python con eventlet.

## 5.2 `postgresql:///base` no significa lo mismo para todos

Para `psql` es «por el socket Unix». Para el driver de Node es **TCP a
localhost**, donde PostgreSQL sí pide contraseña — de ahí un
`password authentication failed for user "postgres"` que no tiene nada que ver
con permisos. El guion ya lo resuelve solo; si te pasa con otro, delante:
`PGHOST=/var/run/postgresql`.

## 5.3 El mensaje de error que se comía a sí mismo

NestJS responde `{ "message": "la explicación", "error": "Unauthorized" }`.
`error` es el **nombre del código HTTP**, no una explicación. El portal lo leía
primero, así que todo fallo se veía como «Unauthorized». Si escribes código de
frontend nuevo: **primero `message`**.

## 5.4 Un enlace firmado no es una sesión

Todo lo que firma el ecosistema usa la misma llave RS256. Lo único que distingue
una sesión de un enlace de invitación es el **emisor**, y hay que comprobarlo:
sin eso, un enlace de siete días que viaja por WhatsApp abría `/auth/me` como
sesión iniciada. Si añades otro tipo de token firmado, dale su propio emisor
**y** su `purpose`.

> **Y hay que comprobarlo en cada app que verifique tokens del ecosistema, no
> solo en el ecosistema.** El `verificadorEcosystem` de Membresías aceptaba
> cualquier firma RS256 válida sin mirar el emisor. Corregido el 20 de agosto.
> **Campeonatos tiene que revisar lo mismo cuando escriba su verificador.**

## 5.5 El bucle entre el login y la pantalla de dentro

Salir de Membresías, pulsar «entrar con DINAMYT» y quedar rebotando entre el
formulario y el panel del club, sin un solo error en pantalla. **Eran tres
fallos encadenados, y cada uno solo se ve cuando se arreglan los otros dos:**

1. **El portal daba por sesión cualquier cadena guardada.** No miraba el `exp`,
   así que un token de ayer pasaba todos los guards del navegador. Ahora
   `obtenerToken()` borra el que ya caducó.
2. **El portal entregaba esa sesión sola.** Con `?redirect=` de una app, la
   devolvía sin preguntar — aunque fuera **de otra persona**. Ahora enseña de
   quién es y ofrece «continuar como…» o «entrar con otra cuenta».
3. **La sesión de Membresías por SSO no era una sesión.** El token se quedaba en
   una variable del navegador y nunca se convertía en cookie: funcionaba hasta
   la primera recarga. Ahora se canjea en `POST /auth/sso`, que devuelve la
   MISMA cookie httpOnly que el login por contraseña.

> **La regla general:** una sesión es lo que el servidor reconoce, no lo que el
> navegador guardó. Y quien redirige tiene que cambiar algo en cada vuelta
> —borrar el token muerto, pedir una decisión—, o construye un bucle sin darse
> cuenta.

⚠️ Una ruta de Membresías que abre su propia transacción (`sinFiltroDeClub`) va
en la lista `SIN_CONTEXTO` de `plugins/rls.ts`. Si se olvida, **no da error: se
cuelga**, porque el envoltorio de RLS ya abrió una y PGlite es de una sola
conexión. `/auth/login`, `/auth/acceso-qr` y `/auth/sso` están ahí por eso.

## 5.6 `window.location` en el render de una página que se pre-renderiza

En el servidor `window` no existe, así que esto:

```tsx
href={`${PORTAL}/login?redirect=${encodeURIComponent(
  typeof window !== 'undefined' ? window.location.origin : '')}`}
```

sale al HTML con `?redirect=` **vacío**, y React **no corrige los atributos que
no cuadran al hidratar** — lo dice en la consola: «this won't be patched up». El
enlace se queda roto para siempre. Le pasaba a Academy.

Se calcula **al pulsar**, no al pintar: un `<button>` con `onClick` que arma la
dirección y navega.

## 5.7 Un desplegable cuyo valor no está entre sus opciones MIENTE

No se queda vacío ni avisa: enseña **la primera opción**. El panel del
super-admin ofrecía `admin, maestro, coach, judge, competitor, member`, y la
reconciliación escribe `student`, `staff` y `guardian`. Resultado: todos los
alumnos importados aparecían como **«admin»** sin serlo. Y lo caro no es la
mentira, es lo que provoca — quien la ve intenta corregirla, y al hacerlo
sobrescribe el rol de verdad.

> **El valor actual va SIEMPRE entre las opciones**, aunque esa pantalla no lo
> pueda asignar. Una línea: `[...new Set([actual, ...asignables])]`.

Vive en `apps/ecosystem-portal/src/lib/roles.ts` (`opcionesDeRol`), junto al
catálogo único de nombres de rol.

## 5.8 Si se pagina, se busca en el SERVIDOR

Paginar y dejar el buscador filtrando en el navegador es **peor que no paginar**:
solo encuentra a quien ya se descargó, así que el alumno de la página tres deja
de existir. Y no da error — devuelve «no hay nadie», que se lee como un dato.

Dos detalles que se olvidan siempre:

- **Al escribir hay que volver a la página 1.** Buscar desde la cuarta muestra
  «ninguno» con los resultados esperando en la primera.
- **Espera antes de consultar.** Sin ella, teclear «Rodríguez» dispara nueve
  peticiones y pueden volver desordenadas. 250 ms bastan.

## 5.9 Un `<label>` que envuelve un botón lo dispara

`CampoFecha` y `SelectMenu` no son `<input>`: son `<button>` que abren un panel.
Metidos dentro de un `<label>`, pulsar el TEXTO de la etiqueta abre el panel — el
navegador reenvía el clic al control que envuelve. Se ve como un panel que se
abre solo.

Por eso esos campos usan `<div className="block text-sm">` con un `<span>`
dentro, y no `<label>`. Y como no son `<input required>`, **el navegador no
detecta que están vacíos**: si el campo es obligatorio hay que comprobarlo a
mano antes de enviar.

## 5.10 Un hijo de un flex con `shrink-0` no envuelve: desborda

Si un bloque de botones lleva `flex-wrap` **y** `shrink-0`, no puede encogerse,
así que su `flex-wrap` nunca llega a aplicarse: se sale de la tarjeta y empuja
la página entera hacia los lados en el celular. Pasó al añadir dos botones a la
fila de suscripciones.

> Después de tocar una fila con controles, comprueba a 375 px:
> `document.documentElement.scrollWidth > clientWidth`.

## 5.11 Cloudflare cambia las reglas del juego

Con la nube naranja: `TRUST_PROXY_HOPS=2`, SSL/TLS en **Full (strict)**, puerto
80 abierto (renovación del certificado), y **ningún registro DNS gris apuntando
a tu IP** — uno solo tira a la basura todo el beneficio. Un subdominio proxiado
sin nada detrás da **525**.

## 5.12 «Salir» que hay que pulsar dos veces

Salir de Membresías, ver el login un instante… y aparecer otra vez dentro. A la
segunda sí se salía del todo. **Tres causas, y las tres se ven igual desde
fuera**, que es lo que hacía tan difícil creer que fuera un solo fallo:

1. **La web decidía con una marca suya si pasar por el portal.** Quien entra por
   DINAMYT tiene DOS sesiones: la cookie de Membresías y la del portal, en otro
   dominio y solo cerrable pasando por él. Si esa marca del `localStorage`
   faltaba —la borraba cualquier 401, y nunca existía si se había entrado con
   contraseña— no se pasaba por el portal, la sesión de DINAMYT quedaba viva, y
   el siguiente «entrar con DINAMYT» metía a la persona dentro sin enseñar una
   sola pantalla. Ahora **lo dice el servidor** en la respuesta del logout, y
   estando federado se pasa por `PORTAL/salir` **siempre**.
2. **Un logout fallido se daba por bueno.** Si `POST /auth/logout` no salía —API
   dormida en Render, 503 de mantenimiento, un corte— se limpiaba lo local y se
   seguía como si nada. La cookie seguía valiendo, y la vuelta aterrizaba en
   `/login`, que es **la pantalla que mete dentro a quien tenga sesión**. A la
   segunda la API ya estaba despierta. Ahora se vuelve a `/login?salida=portal`
   (o `?salida=sola` sin ecosistema), que **no entra a nadie**, dice en voz alta
   lo que se cerró, y remata el cierre si detecta que quedó sesión viva.
3. **El pase vencido no cerraba nada.** El pase dura 30 min y la sesión hasta 12
   h (§4.11). Quien volvía a una pestaña abierta y pulsaba Salir tenía el pase
   vencido: el guard contestaba 401, el navegador se quedaba sin su copia y la
   fila seguía abierta —y su pase todavía entraba en Academy y Campeonatos—.
   `POST /auth/logout` ya no lleva guard: verifica **solo la firma**, tolerando
   hasta 12 h de vencimiento. Revocar solo quita acceso, nunca lo da.

> **La regla:** salir no puede depender de que la red funcione, de que el pase
> esté en fecha, ni de una marca que el navegador puede haber perdido. Y la
> pantalla en la que se aterriza al salir **no puede ser la que deja entrar**.

### Lo mismo en Campeonatos, y qué era distinto

*(30 de agosto de 2026)* En cuanto se pudo saltar desde el portal (§4.13),
volvió el mismo síntoma: salir de Campeonatos, volver a DINAMYT y estar dentro
otra vez sin ver una pantalla. **Era la causa 1 sola**, y las otras dos no
aplicaban igual:

| | Membresías | Campeonatos |
|---|---|---|
| **1. No se pasaba por el portal** | Lo decidía una marca del `localStorage` | **No se pasaba nunca**: «Salir» solo cerraba su propia cookie |
| **2. El logout fallido se daba por bueno** | Sí | Sí — y `logoutAPI` seguía tragándoselo en silencio |
| **3. El pase vencido no cerraba nada** | Sí | **No**: `POST /auth/logout` aquí nunca tuvo guard |

El arreglo es el de Membresías, pieza por pieza: el servidor dice en la
respuesta del logout si hay portal (`{ok, portal}`, y `portal` es
`ECOSYSTEM_JWKS_URL` puesta — no una marca del navegador), se pasa por
`PORTAL/salir` **siempre** que lo haya, y se aterriza en `/login?salida=portal`
(o `?salida=sola` sin ecosistema), que **no canjea ningún `#token=`**, dice qué
se cerró, y remata el cierre —dos intentos como mucho— si `GET /auth/me` revela
que la cookie sobrevivió.

> **Ojo con la pantalla que deja entrar: aquí es `/`, no `/login`.** El login de
> Campeonatos nunca metió a nadie dentro; quien lo hace es la raíz, que lee el
> perfil cacheado y reenvía a `/admin`, `/maestro` o `/juez`. Por eso salir
> aterriza en `/login` y no en `/` — y por eso `?salida` hace falta igual: sin
> él, el `#token=` que quedara en la URL abriría sesión otra vez en la misma
> pantalla en la que se acaba de cerrar.

> Con esto **las tres apps aplican la misma regla**, que era lo que faltaba para
> poder recordarla.

### Y aún se podía volver atrás a la consola

*(30 ago 2026, el mismo día)* Salir funcionaba, pero la flecha atrás devolvía a
la pantalla de la que se acababa de salir —con el diálogo de «¿cerrar sesión?»
todavía abierto, porque el navegador la restaura del **bfcache** tal como
estaba—. Ahí no funcionaba nada: la sesión estaba cerrada de verdad y cada
petición contestaba 401. **Una pantalla muerta que parece viva es peor que no
poder volver.**

La causa era `window.location.href`, que **empuja** una entrada al historial.
Con `location.replace` se sustituye, y la flecha atrás lleva a donde se estaba
antes de entrar a la consola. Lo mismo en `PORTAL/salir`, que además rebotaba:
volver atrás a esa pantalla la hacía cerrar sesión y reenviar otra vez.

> **La regla:** una salida no es una navegación. Lo que se deja atrás no puede
> quedar a una flecha de distancia.

## 5.16 `${v:-X}` no imprime «X»: imprime el valor

Un guion de diagnóstico enseñaba la **huella** del secreto compartido, para
poder comparar las dos instalaciones sin poner el secreto en pantalla. La línea:

```bash
printf '%s\n' "${v:+$(printf '%s' "$v" | sha256sum | cut -c1-12)}${v:-SIN PONER}"
```

La idea era «si está puesta, la huella; si no, SIN PONER». Lo que hace de verdad
es **las dos cosas seguidas**: `${v:+…}` da la huella, y `${v:-SIN PONER}` da
**el contenido de `v`** —`:-` solo usa el texto alternativo cuando la variable
está vacía—. Así que salió la huella pegada al secreto en claro, en la terminal
de producción y en su scrollback. Hubo que rotarlo.

Arreglado con un `if` de cinco líneas. **La regla:** en la línea que enseña algo
que no se puede enseñar, no hay ingenio que valga la pena. Y si un guion imprime
un secreto una vez, ese secreto ya no vale: se rota, no se tapa.

## 5.15 Un archivo generado que está versionado bloquea el despliegue

```
error: Your local changes to the following files would be overwritten by merge:
        apps/membresias-web/next-env.d.ts
Aborting
```

`next-env.d.ts` **lo escribe `next build`**, y su contenido cambia con la versión
de Next y con si `.next/` existe. Estando versionado, el servidor lo modifica al
compilar y **el siguiente `git pull` se planta** — todos los despliegues, para
siempre, por un archivo que no tiene nada dentro que valga la pena conservar.

Arreglado el 30 de agosto de 2026: fuera del índice y dentro de `.gitignore` en
los tres repositorios (`ecosystem-portal` ya lo tenía; a `academy-web` y a
`membresias-web` les faltaba). Se regenera solo al arrancar el build, incluso en
un clon recién hecho.

Si te lo encuentras en un despliegue viejo, o con otro archivo generado:

```bash
cd /srv/membresias && git checkout -- apps/membresias-web/next-env.d.ts && git pull
```

> **La regla:** lo que compila el servidor no se versiona. Si `git status` en el
> VPS enseña archivos modificados que nadie tocó a mano, esos son.

## 5.14 Un aviso fuera de la pantalla es un botón roto

«El botón de quitar miembros no funciona.» No estaba roto: el servidor
contestaba —a veces que sí, a veces con el 409 de «es la única persona que
manda en esta organización» (§4.7-bis)— y el portal pintaba la respuesta en un
párrafo **debajo del título**, arriba del todo.

En `/mi-organizacion` y en `/admin`, la lista de gente está a dos o tres
pantallas de scroll de ahí. Se pulsaba la ✕, se confirmaba, el diálogo se
cerraba… y no pasaba nada visible. La explicación estaba escrita, decía
exactamente qué hacer, y **nadie la leyó nunca**.

Arreglado con `components/Aviso.tsx`, que va fijo sobre la página: se ve desde
cualquier punto. El «hecho» se retira solo a los cinco segundos; **el error no**,
porque los del servidor traen instrucciones y un aviso que se desvanece se lee
a medias.

> **La regla:** el resultado de una acción se enseña donde está la mano que la
> pulsó, no donde empieza la página. Una pantalla que se queda callada después
> de un clic **es** un botón roto, aunque el servidor haya hecho su trabajo.

Del mismo día y de la misma familia: **el diálogo de confirmar no bloqueaba el
scroll** de la página de detrás. Se leía la pregunta sobre una fila, el dedo
arrastraba el fondo, y al cerrar se estaba en otra parte de la lista sin saber a
quién se acababa de responder. Una línea (`body { overflow: hidden }` mientras
está abierto) en el portal y en Campeonatos.

## 5.17 Un parámetro de un solo viaje que lo guarda el navegador

*(2 de septiembre de 2026)* El `?redirect=` del login **no se guardaba en ningún
sitio de la aplicación**, y por eso el síntoma sonaba imposible: «el desvío a
Membresías se queda pegado». Es al revés, y ahí está la trampa:

> **Quien guarda la barra de direcciones es el NAVEGADOR** — en el historial, en
> el autocompletado, en la pestaña restaurada y en el acceso directo de la
> pantalla de inicio. Un parámetro pensado para un viaje era, de hecho, **el
> estado permanente del login**.

**Cómo se manifestó, que es lo que costó atar:** alguien en Android con su cuenta
guardada abre el portal → el gestor de contraseñas rellena **y envía** el
formulario solo → el envío dispara el botón principal, que decía «Entrar y volver
a Membresías» → y la persona aterriza en Membresías cuando quería su cuenta de
DINAMYT. **No llegaba nunca al dashboard**, y no había hecho un solo clic.

El arreglo tiene tres partes y ninguna sobra:

· **El login lo consume.** Lo lee, lo guarda mientras dura la pantalla y lo
  **borra de la barra** con `replaceState`. Lo que queda en el historial —y
  mañana en el autocompletado— es un `/login` limpio.
· **Sobrevive a un F5** en `sessionStorage`, pero **solo se rescata si la
  pantalla llegó por una RECARGA**. En cualquier otra llegada se olvida: si no,
  la pestaña restaurada resucitaría un desvío ya terminado.
· **Un desvío sin corroborar se degrada, no se descarta.** Si llega de un enlace
  viejo, un marcador o uno pegado en un chat, enviar el formulario entra al
  portal y volver a la app baja al **segundo** botón, que es `type="button"` y el
  autocompletado no puede disparar. Ninguna de las dos puertas desaparece; lo
  único que cambia es cuál se puede disparar sola.

⚠️ **La comprobación es el referente, y NO es de seguridad.** De eso sigue
encargándose la lista blanca de `destinoSeguro`. Confundir las dos lleva a
quitar una de las dos y creer que la otra la cubría.

Y una consecuencia de §5.6 que reapareció aquí: **el destino se calcula después
de montar**, no en el primer render. Esta pantalla también se pinta en el
servidor, donde no hay barra ni referente, y calcularlo antes dejaba al servidor
diciendo «Entrar» y al navegador otra cosa — un fallo de hidratación de manual.

## 5.18 `badge` no es una imagen: es una plantilla

*(3 de septiembre de 2026)* El aviso llegaba al teléfono con **un círculo
amarillo y dentro una mancha blanca**. Se adivinaba un trozo de la D y el pie que
sobresale, y nada más.

> **Android le quita al `badge` todo el color y se queda solo con el canal
> alfa**, pintando de blanco lo que sea opaco. No es una imagen que se muestra:
> es una silueta que se rellena.

Estaba puesto `/logo.png` —el logo a color, donde el oro y el trazo oscuro son
**igual de opacos**—, así que la silueta que salía era la **forma exterior
entera**. El dibujo de dentro no existía. **Y no había forma de arreglarlo
cambiando colores: el color no llegaba a pintarse.**

`/badge-96.png` está hecho para esto y **se deriva del logo** en vez de dibujarse
aparte (`scripts/icono-notificacion.py`): el alfa sale de la **luminancia**, así
que el oro queda opaco y el trazo oscuro —que es lo que separa las formas— queda
transparente. Los huecos viajan dentro de la silueta y la D se sigue leyendo.

Tres detalles que no son obvios:

· **La rampa de luminancia va alta (120–200).** Los grises intermedios son el
  antialias del trazo, y mandarlos a transparente es lo que abre el hueco.
· **Las separaciones se ensanchan tres pasos de erosión.** En el original miden
  dos píxeles de 256, y al bajar a los 24 puntos de la barra de estado
  desaparecen: la figura se funde otra vez con la D. Con cuatro o cinco pasos se
  convierte en un palo — se probaron los tres niveles **al tamaño real** antes de
  elegir.
· **Lleva margen (76 de 96)**, porque Android lo mete dentro de un círculo y sin
  margen la pierna que sobresale queda recortada.

`icon` **no se toca**: ese es el grande que va al lado del texto y no se enmascara.

⚠️ **Sube la versión de la caché del shell** al cambiarlo, o el service worker
viejo sigue sirviendo el icono viejo de caché. Academy no manda push y
Campeonatos no tiene service worker, así que no les afecta.

## 5.19 Un permiso que se pide después de un `await` ya no tiene gesto

*(3 de septiembre de 2026)* **Los avisos no se podían activar desde un
computador.** Se pulsaba el botón y no salía ningún cuadro — sin error, sin nada.

`activarPush` registraba el service worker y esperaba a `ready` **antes** de pedir
el permiso.

> **El permiso solo se puede pedir mientras dura la activación que deja el clic**,
> unos segundos. Esos dos `await` se la comían.

En el celular llegaba a tiempo porque el service worker **ya estaba instalado de
la visita anterior**; en el PC casi siempre es la primera vez, la instalación
tarda, el gesto caduca y el navegador **ignora la petición sin decir nada**. De
ahí que pareciera un problema de escritorio y no de orden de las llamadas.

Ahora el permiso va primero. **El miedo que ordenaba esto al revés confundía los
dos desenlaces:** lo que se gasta es un NO; un permiso concedido se reutiliza. Y
el `catch` genérico —que se tragaba el motivo real— es lo que hizo que esto
durara tanto sin diagnóstico.

De paso el botón dejó de decir «al celular»: se pulsa igual desde el PC.

> **Cuenta doble**, porque este fallo falsificaba una métrica: `pushEnviados = 0`
> se leía como «nadie se ha suscrito» (§4.6), y parte era «a mucha gente el botón
> no le hacía nada». Un contador a cero no dice por qué.

## 5.20 Marcar leído y navegar a la vez: el número vuelve a subir

*(2 de septiembre de 2026)* **El mismo fallo que la campana de Membresías**, y
por el mismo motivo: aparecería igual en el portal en cuanto un club juntara
solicitudes suficientes para que se note.

Abrir un aviso hace **dos cosas a la vez**: manda la marca de leído y navega a
donde lleva el aviso (`a.href`). Y navegar cambia el `pathname`, **que dispara el
efecto que vuelve a pedir la lista**. Las dos peticiones salían juntas, así que
el GET solía llegar antes de que el POST hubiera guardado nada: la respuesta
traía el aviso todavía sin leer y **pisaba el `sinLeer` que se acababa de bajar**.

Dos piezas, y hacen falta las dos:

· `guardando` guarda la promesa de lo que está en vuelo y `cargar()` **la espera**
  antes de preguntar. Las marcas van encadenadas, no en paralelo.
· `lectura` es un **contador de peticiones**, para que de dos `cargar()` seguidos
  solo escriba en pantalla la última pedida y no la que conteste antes.

⚠️ **La recuperación de un fallo cuelga de la promesa CRUDA, no de la cadena.**
Si estuviera dentro, `cargar` se quedaría esperando a la misma promesa desde la
que se la llamó — un abrazo mortal de una sola línea.

## 5.21 Los símbolos técnicos no están en las fuentes de Android

*(2 y 3 de septiembre de 2026, dos veces en dos días)* El botón de salir salía
**con un cuadrito delante**. Era el carácter ⏻ (U+23FB): **no es un emoji, es un
símbolo técnico**, y casi ninguna fuente de Android lo trae, así que el Chrome
del celular dibujaba el cuadrito de «glifo que no tengo».

Y el botón rojo de cerrar sesión es el peor sitio de la pantalla para que a
alguien le quede la duda de qué hace.

**Volvió a pasar al día siguiente** con ⇱ (U+21F1), en «⇱ Mis aplicaciones» de
Academy. Por eso esto es una regla y no una anécdota:

> **Un SVG se ve igual en todos lados y hereda el color del botón.** Cualquier
> glifo fuera del bloque de emoji es una apuesta sobre las fuentes del teléfono
> de otra persona. En los botones que sacan a alguien de la aplicación, esa
> apuesta no se hace.

Y el criterio que hace que valga la pena: **es el mismo trazo en las cuatro
apps** (`IconoSalir`, y el de «Ir a DINAMYT»). La misma acción se dibuja
igual en todas partes, para que se reconozca por su forma antes que por su texto.

## 5.22 «Esta pantalla no es responsiva» eran cuatro píxeles

*(2 de septiembre de 2026)* Lo era. Lo que pasaba es que **la página era más
ancha que el visor**: a 360 px, el `<main>` medía **364,17**.

El culpable era el saludo. La tipografía `display` va en mayúsculas y con
`font-stretch: 118%`, así que un apellido suelto ocupaba 244 px y, con el avatar
(56) y el hueco (16), daba 316 — más el `px-6`, 364.

> **Con la página desbordada, Chrome de Android la deja moverse de lado y decide
> él si la encoge para que quepa — y esa decisión la toma cuando le parece.** De
> ahí el «toca recargar, o hacer una especie de zoom, para que se acomode». No
> era el diseño: era el navegador contestando a un desborde.

Se cierra por los cuatro lados, y **las cuatro cosas hacen falta**:

· `text-2xl` en el teléfono y `text-3xl` a partir de tableta.
· `overflowWrap: anywhere`, para que ninguna palabra suelta —un apellido, un
  correo largo— pueda medir más que su columna.
· `flex-wrap` en los botones: en `nowrap` se salían del borde en cuanto aparecía
  la campana del club al lado de «Mi perfil» y «Salir».
· `w-full` en el `<main>`, que le fija el ancho al de la pantalla en vez de
  dejar que crezca con lo que lleve dentro.

Y el detalle que parece un capricho y no lo es: **`flex: 1 1 14rem` en la columna
del nombre, y NO `flex-1`.** Con base 0 —lo que hace `flex-1`— y `overflowWrap:
anywhere`, el saludo se dejaba estrujar hasta una letra por línea antes de que la
fila se partiera. Con 14rem de base, **lo que cede primero es la fila**: los
botones bajan y el saludo se queda entero.

**Cómo se comprueba** (a 320, 360 y 375 px, con un nombre y un correo
deliberadamente absurdos): `scrollWidth === clientWidth`, sin desplazamiento
lateral. Es la única medida que no depende de mirar la pantalla y opinar.

---

# PARTE 6 · Lo que queda pendiente

Vive en **[HOJA-DE-RUTA.md](HOJA-DE-RUTA.md)**, en orden. Lo que se termina sale
de allí y, si deja una regla o una trampa, entra aquí en su parte. El ensayo que
antes vivía en esta parte es ahora §2.9.
