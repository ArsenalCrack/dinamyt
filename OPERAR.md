# DINAMYT — Operar el ecosistema

> Léelo antes de tocar código o el servidor. Casi todo lo que hay aquí está
> escrito porque **ya se rompió una vez**.
>
> Para montar el servidor desde cero: [MONTAR-VPS.md](MONTAR-VPS.md).
> Para saber qué es cada pieza y correrlo en tu PC: [README.md](README.md).
> Si se cae todo el día del campeonato: [CONTINGENCIA-CAMPEONATO.md](CONTINGENCIA-CAMPEONATO.md).

**Estado: en producción desde el 20 de agosto de 2026**, en un VPS propio, con
una sola base PostgreSQL y un esquema por app. Todo lo que hable de Vercel,
Render o Supabase es historia: está en el registro de git, no aquí.

> **Repasado el 3 de septiembre de 2026.** Se comprobó una por una que las
> **56 rutas de archivo**, las **12 variables de entorno**, las **13 columnas**
> y los **19 identificadores** que este documento nombra existan de verdad en
> los tres repositorios; y los cinco registros de DNS del correo, contra el DNS
> público. La única ruta que no existe es `packages/shared/estilos.css`, y es a
> propósito: es el archivo del pendiente de §6.2.
>
> **Lo que ese repaso NO puede ver es lo que más engaña**: el nombre sigue ahí y
> lo que hace ha cambiado. Las dos que se encontraron ese día fueron §4.11 —el
> reloj de inactividad dejó de ser de veinte minutos para todo el mundo— y §4.7,
> que no sabía que aceptar una solicitud escribía un rol por app a mano. **Al
> cambiar comportamiento, buscar qué sección lo cuenta.**

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
| `ECOSYSTEM_JWKS_URL` | membresias-api **y campeonatos-api** | El SSO no existe: saltas desde el portal y te vuelve a pedir la contraseña. Y ahora también: «Salir» ya no pasa por el portal, así que la sesión de DINAMYT queda viva (§5.12). **Vacía a propósito solo en el modo local del campeonato** |
| `NEXT_PUBLIC_ECOSYSTEM_PORTAL_URL` | membresias-web **y campeonatos-web** | No aparece «entrar con DINAMYT» ni el camino de vuelta. En Campeonatos el valor por defecto ya es `https://dinamyt.org`, así que solo estorba si el portal vive en otro dominio |
| `NEXT_PUBLIC_CAMPEONATOS_URL` | ecosystem-portal | `PORTAL/salir?redirect=…` **descarta el destino** —está en lista blanca (`lib/apps.ts`)— y quien sale de Campeonatos aterriza en el login del portal en vez del suyo. Sin ella vale `http://localhost:3003`, que en el VPS no es nadie |
| `PORTAL_URL` | ecosystem-api | El enlace de invitación lleva a una página que no existe, y el pie de los correos apunta a ninguna parte |
| `SMTP_HOST` | ecosystem-api | No hay correo — **y eso es un estado válido**: ver §3 |
| `CRON_SECRET` | ecosystem-api | El aviso diario de suscripciones **no existe** (la ruta responde 404). El botón del panel sigue funcionando |
| `ECOSYSTEM_SYNC_SECRET` | ecosystem-api **y** membresias-api | **El mismo valor en las dos.** Sin él, la foto, el escudo, el cinturón, la contraseña **y el rol** que se guardan en el portal no llegan a Membresías: el carnet se sigue imprimiendo con lo que hubiera, la contraseña vieja sigue valiendo, y cambiar a alguien a maestro no se nota allí (§4.7) |
| `MEMBRESIAS_SYNC_URL` | ecosystem-api | Lo mismo: el portal no sabe a quién avisar. Es el origen de membresias-api (`https://membresias-api.dinamyt.org`), sin barra final |

## 1.5 Lo que nunca se hace

- **Desplegar los días 9, 10 y 11 de octubre.** Son los tres del campeonato, con
  gente delante y una llave en marcha: ahí no se sube nada, y punto.

  > **La regla era de trece días (del 1 al 13) y se recortó a tres el 4 de
  > septiembre.** Congelar dos semanas para proteger un fin de semana salía
  > carísimo: paraba las mejoras que se están pidiendo hoy y amontonaba todo lo
  > aplazado en un solo despliegue del día 14 — que es la forma más segura de
  > estrenar un fallo justo después del evento, y con todo el mundo mirando.
  > Se trabaja normal; lo que se cuida es el fin de semana y la víspera:
  > **el día 8 solo entran arreglos**, nada de estrenos.
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

> **`db:migrar`, no `db:migrate`** — la misma trampa que en el ecosystem, y
> hasta ahora Academy **no tenía** el equivalente: MONTAR-VPS decía «compilar,
> migrar y crear los servicios» sin decir con qué, y lo único que había era
> `drizzle-kit`, que en un servidor con `--prod` no está. Una migración de
> Academy no tenía camino a producción.
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

> ⚠️ **`0019_plan_del_club` (3 sep 2026) no bloquea a nadie al aplicarse.**
> Añade `orgs.plan_bloqueado_desde` con valor `NULL` —«no consta»— para todos
> los clubes existentes, y `NULL` deja pasar. **El primer bloqueo real llega
> cuando el ecosistema lo diga**, o sea en el barrido de la mañana siguiente
> (§4.16). Ese orden importa: **despliega el ecosystem ANTES que Membresías** y
> el barrido encontrará la columna ya puesta; al revés, la primera pasada no
> aplica nada y hay que esperar un día.

## 2.4-bis Desplegar Campeonatos

```bash
cd /srv/campeonatos && git pull && backend/venv/bin/pip install -r backend/requirements.txt && cd frontend && npm ci && npm run build && sudo systemctl restart campeonatos-api campeonatos-web && systemctl is-active campeonatos-api campeonatos-web
```

> **El `pip install` no sobra**, aunque el despliegue de siempre fuera solo
> `git pull` + compilar la web: el pase del ecosistema es RS256 y PyJWT lo
> verifica con `cryptography`, que antes no estaba en el entorno. Sin ese paso,
> Campeonatos arranca y **rechaza todos los pases** con un error de librería que
> no menciona ninguna llave.

> ⚠️ **Antes del primer despliegue con SSO**, las dos variables de §1.4 tienen
> que estar puestas: `ECOSYSTEM_JWKS_URL` en `backend/.env` (apuntando al origen
> **local** del ecosistema, `http://127.0.0.1:3001/auth/jwks` — el porqué está
> en §5.13) y `NEXT_PUBLIC_ECOSYSTEM_PORTAL_URL` en
> `frontend/.env.production`, que se hornea al compilar (§1.3).

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

## 2.7 Encender el reloj de los avisos

**Los dos avisos —el de las suscripciones de los clubes y el de las
mensualidades de los alumnos— necesitan que alguien los dispare cada día.** El
reloj era el cron de Vercel, y Vercel ya no existe en este proyecto: al mudarse
al VPS se trajeron las apps y **el reloj se quedó allí**. No falla: sencillamente
no ocurre, que es la clase de avería más difícil de ver.

Se enciende una vez. Primero, el secreto del ecosistema (Membresías ya tiene el
suyo desde el montaje):

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

### Cómo salió · aplicada el 29 de agosto de 2026

Censo de partida: **ecosystem 48 · membresías 37 · campeonatos 12**.

| | |
|---|---|
| Cuentas creadas | **0** |
| Personas enlazadas con una cuenta que ya existía | **46** |
| Fichas sin correo válido (se quedan sin cuenta, entran por QR/PIN) | 0 |
| Clubes creados en el ecosistema | **8** (con `--crear-clubes-campeonatos`) |
| Clubes enlazados con uno existente | 5 |
| Filas nuevas en `org_members` | 9 |
| Personas sin club al que enlazarlas | 4 |

**La línea que importa es `0 cuentas creadas`.** De 49 fichas entre las dos apps,
las 46 con correo enlazaron con cuentas que **ya existían**: esto no fue una
migración, fue **poner las uniones que faltaban**. Es lo que cura el
«No existe una cuenta con ese correo» que veía en el portal quien sí entraba en
Membresías.

> **Y una deuda documentada se evaporó.** El plan avisaba de que a los importados
> se les marcaría `is_email_verified = true` sin comprobación real, y que habría
> que pedirles verificación de verdad cuando hubiera correo. **Con cero cuentas
> creadas no hay importados**, así que esa deuda nunca llegó a existir.

**Las 4 personas sin club, y por qué está bien:** dos son usuarios de Membresías
que sencillamente no pertenecen a ningún club. Las otras dos tienen en
Campeonatos un nombre de club que no cruza con ninguna organización — y no es
contradictorio con el `0 de Campeonatos SIN cruzar`: `Competidor.club` es **texto
libre**, mientras que los clubes salen de la lista de los maestros. Una variante
de escritura o un nombre viejo no encaja con nada. Se arreglan a mano.

### La limpieza de superadmins que vino después

El guion **detecta pero no concede** los superadmins de las apps, y es
deliberado: un guion que reparte permisos de administrador no debe existir. Hay
**tres banderas independientes**, una por app:

| App | Tabla | Columna |
|---|---|---|
| Ecosystem | `ecosystem.users` | `is_super_admin` |
| Membresías | `membresias.users` | `is_super_admin` |
| Campeonatos | `campeonatos.usuarios` | `es_superadmin` |

El 29 de agosto se retiraron dos que sobraban —la cuenta personal del dueño en
Membresías, y `admin-campeonatos@dinamyt.org` en Campeonatos, que es la clase de
admin por app que B3 viene a eliminar—, dejando solo `admin@dinamyt.org`.

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

**Terminado el 29 de agosto de 2026.** Comprobado en el DNS contra tres
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

### Lo que queda por decidir: subir la política

`p=none` significa «avísame, no bloquees». Los informes llegan al panel de
Cloudflare (**Email → DMARC Management**), no al correo. Con dos semanas de
informes limpios se sube a `quarantine`, y más tarde a `reject`.

> ⚠️ **No se sube la política durante el campeonato**, aunque lo demás sí se
> toque: del 8 al 12 de octubre no se cambia el DNS del correo. Un `reject` mal
> calibrado justo cuando salen las invitaciones y los códigos a competidores y
> maestros es el peor momento posible para averiguarlo, y el correo no tiene
> marcha atrás inmediata — la caché del DNS tarda. El orden: `quarantine` a
> mediados de septiembre, `reject` desde el 13 de octubre.

#### La fecha sale de una cuenta, no de «mediados»

`p=none` se publicó el **29 de agosto**. Dos semanas de informes es el **12 de
septiembre**, y ése es el primer día que tiene sentido mirar. Antes no hay datos
suficientes: subir la política con cinco días de informes es subirla a ciegas.

#### Antes de tocar nada: qué mirar en los informes

Lo que se busca en **Email → DMARC Management** no es «que no haya fallos», es
**que todo lo que falla sea de fuera**:

· **Los envíos propios pasan.** Resend firmando con `d=dinamyt.org`. Si aquí
  hay fallos, **no se sube nada**: `quarantine` mandaría a spam los códigos de
  verificación y los enlaces de contraseña, que es todo el correo que manda
  esto (§3.3).
· **El «Enviar como» de Gmail pasa.** Es el que se usa para contestar a
  `soporte@` (Anexo E.5), sale por el mismo SMTP y es el más fácil de olvidar
  porque no lo manda la aplicación: lo manda una persona.
· **Lo que falle sea remitente desconocido.** Eso es exactamente lo que la
  política viene a bloquear, y su presencia es el motivo para subirla.

#### El estado del DNS, comprobado el 3 de septiembre de 2026

Las cinco piezas siguen como se montaron. Se comprobó contra el DNS público, que
es lo único que cuenta:

| Nombre | Vive |
|---|---|
| `_dmarc.dinamyt.org` | `v=DMARC1; p=none; rua=mailto:…@dmarc-reports.cloudflare.net` |
| `dinamyt.org` TXT | `v=spf1 include:_spf.mx.cloudflare.net ~all` |
| `dinamyt.org` MX | `route1/2/3.mx.cloudflare.net` |
| `send.dinamyt.org` TXT | `v=spf1 include:amazonses.com ~all` |
| `send.dinamyt.org` MX | `feedback-smtp.sa-east-1.amazonses.com` |
| `resend._domainkey` | la clave pública, presente |

> **Lo que hay que entender antes de subir la política, y es la pieza que
> engaña:** el SPF de la raíz **no cubre lo que enviamos**. Autoriza al MX de
> Cloudflare, que es para RECIBIR. Lo que manda el correo es Resend desde
> `send.dinamyt.org`, un nombre distinto, así que **el SPF de la raíz no alinea
> nada** — y no hace falta que lo haga: DMARC pasa con SPF **o** con DKIM, y
> aquí quien alinea es el DKIM, que firma con `d=dinamyt.org`.
>
> Consecuencia práctica: **`resend._domainkey` es la única pieza que sostiene
> todo el correo saliente.** El día que se rote la clave en Resend y no se
> actualice ese TXT, con `p=none` no pasa nada visible; con `quarantine`, todos
> los enlaces de contraseña van a spam. **Comprobar ese registro es parte de
> subir la política, no un extra.**

#### El cambio, cuando toque

Un solo TXT, `_dmarc`, cambiando una palabra:

```
v=DMARC1; p=quarantine; rua=mailto:cdd94eda59444bbf83153adc4282b0c5@dmarc-reports.cloudflare.net
```

Y se comprueba en el DNS, **nunca mirando el panel** (§3.5, punto 2):

```powershell
(Resolve-DnsName -Name _dmarc.dinamyt.org -Type TXT).Strings
```

Se deja **una semana** antes de pensar en `reject`, y `reject` no antes del 14
de octubre. Si algo se rompe, volver a `p=none` es editar la misma palabra: la
vuelta atrás es inmediata y sin pérdida, que es lo que hace que este paso sea
barato de intentar.

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

*(30 de agosto de 2026.)* El maestro inscribe a su alumno **en su app**, con la
persona delante, y ese gesto no se le puede quitar: es como se llena un club.
Lo que sí cambió es qué nace de él.

**Antes:** `POST /users` de Membresías creaba una cuenta **suya** —correo,
contraseña puesta por el maestro— que no existía en DINAMYT. Dos identidades
para una persona, y una ficha con `eco_sub` vacío: **la que ninguno de los
cuatro avisos del espejo alcanza** (§4.7). No le llegaba la foto, ni el
cinturón, ni la contraseña, ni el rol. Y contradecía la regla que sostiene todo
esto — las cuentas nacen en el ecosistema.

**Ahora**, con el club federado, ese mismo botón hace dos cosas en orden:

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

> ⚠️ **Una federación creada desde `/admin` sigue naciendo sin nadie dentro**, y
> mientras no tenga miembros no aparece en «Mi organización» de nadie. Ya no es
> un silencio: al crearla queda seleccionada y el panel lo dice en un aviso.
> Pero **ya no bloquea nada**: el panel afilia clubes sin necesidad de que la
> federación tenga administrador. Ponérselo sigue siendo lo correcto — es quien
> después mira a su gente y responde por ella.
>
> Y el desplegable de rol de «+ Añadir» ya solo ofrece lo que ese tipo de
> organización acepta: una federación admite `admin` y `judge` y nada más. Antes
> ofrecía los seis de siempre y cuatro acababan en un 400 que no decía por qué —
> justo al intentar poner al administrador que hacía falta.

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

### Qué hace falta para que los avisos funcionen

`[x]` **Las llaves VAPID.** *(comprobado el 29 ago 2026)* Están las tres en
      `membresias-api/.env` y la pública coincide con la de la web.

`[x]` **El reloj diario** (§2.7). *(comprobado el 29 ago 2026)*
      `dinamyt-avisos.timer` está `enabled` y dispara a las 08:00; en el journal
      salen sus dos líneas cada mañana.

`[x]` **Gente suscrita.** *(3 de septiembre de 2026)* Era la que faltaba, y ya
      no falta: **los avisos llegan a un teléfono de verdad**. Ojo a que eran
      **dos** cosas y no una — hacía falta que alguien instalara la PWA, y
      hacía falta que el botón de activar funcionara, que hasta ese día no lo
      hacía desde un computador (§5.19).

### Y aun así no llega nada: la tercera pieza es la gente

`[x]` ~~**Nadie está suscrito.**~~ **Cerrado el 3 de septiembre de 2026.**
      Durante días el aviso diario dijo
      `{"clubes":3,"creados":12,"pushEnviados":0}` — doce avisos creados, cero
      enviados—, y **no era configuración**: no había destinatarios. Ya los hay,
      y llegan.

      Lo que sigue se queda escrito porque es **cómo se diagnostica la próxima
      vez**: un `pushEnviados` en 0 vuelve a significar lo mismo, y la consulta
      de abajo es la que lo distingue de un fallo de verdad.

      ⚠️ **Y ahora se sabe que el 0 tenía DOS causas, no una.** Además de que
      nadie se hubiera suscrito, **el botón de activar no funcionaba desde un
      computador** (§5.19): pedía el permiso después de esperar al service
      worker, y para entonces el gesto del clic había caducado. Así que antes de
      concluir «no hay destinatarios», comprueba que el botón hace algo.

```bash
sudo -u postgres psql -d dinamyt -P pager=off -c "select 'membresias' app, count(*) suscripciones from membresias.push_subscriptions union all select 'ecosystem', count(*) from ecosystem.push_subscriptions;"
```

      Si sale 0, es eso. Se cierra desde el celular, no desde el servidor:
      instalar Membresías («Añadir a pantalla de inicio»), entrar y activar los
      avisos. Al día siguiente `pushEnviados` deja de ser 0.

      **Desde 1 sep 2026 esto se pide solo.** La primera vez que alguien entra
      le sale una tarjeta —«¿Te avisamos?»— explicando qué avisos son, y solo si
      dice que sí se dispara el permiso del navegador. Antes el botón estaba
      escondido al final del panel de la campana, que se abre cuando ya hay algo
      que mirar: previsiblemente, casi nadie lo encontraba.

      Se pregunta **una sola vez por navegador** (`localStorage`,
      `dinamyt.avisos.preguntado`). En Membresías se le pregunta a todo el mundo
      —alumno y maestro reciben cosas distintas, ver la tabla de arriba— y la
      frase de la tarjeta cambia según quién sea, porque prometerle al maestro
      avisos «de tu mensualidad» sería falso. En el portal se le pregunta solo a
      quien **gestiona** un club: a un alumno no le llega ninguno de esos avisos.
      Quien dijo «ahora no» lo tiene en el interruptor al pie del panel de la
      campana.

      El orden importa y es deliberado: **la tarjeta va ANTES del cuadro del
      navegador**. El permiso del navegador se pide una sola vez en la vida —si
      se dice que no, Chrome no vuelve a preguntar y desde la app ya no hay nada
      que hacer—, así que gastarlo en un cuadro gris que aparece sin contexto es
      perder el canal para siempre por un toque de dos segundos.

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

> ⚠️ **Un tercer sitio escribía roles por app a escondidas, y se cerró el 3 de
> septiembre**: aceptar una solicitud de entrada ponía `role_membresias =
> 'student'` a mano, lo que convertía a todo recién llegado en una excepción
> —y le escribía `student` aunque entrara de entrenador—. El relato está en
> §4.15, y es la misma lección de §6.1: **el rol por app solo se escribe cuando
> alguien lo pide de verdad.**

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

### «Le puse maestro y solo se vio en Campeonatos»

*(Arreglado el 30 de agosto de 2026.)* Eran **dos fallos encadenados**, y el
primero no era «el rol local manda»: era que el rol **se tiraba a la basura**
por el camino.

#### 1 · `maestro` no existe en Membresías, y se perdía entero

El pase lleva un rol por app. Cuando su columna está vacía —lo normal, casi
nadie las pone a mano— se caía al rol general **solo si ese valor estaba en el
catálogo de esa app**. Y los catálogos no se llaman igual:

| App | Su catálogo |
|---|---|
| Campeonatos | `admin` · `maestro` · `coach` · `competitor` · `judge` |
| Membresías | `owner` · `staff` · `guardian` · `student` |
| Academy | `admin` · `teacher` · `student` |

`maestro` está en el de Campeonatos, así que allí pasaba tal cual. En el de
Membresías **no está**: el rol viajaba como `null`, la ficha nacía `student` y
nadie se enteraba de por qué. La comprobación no estaba mal —colar `member`
como rol de Membresías sería inventarse un permiso que la app no sabe leer—,
estaba **incompleta**: le faltaba decir qué es un maestro en cada sitio.

Ahora se **traduce** (`common/roles-por-app.ts`): el maestro del dojang es el
`owner` de su club en Membresías y `teacher` en Academy, el coach es `staff`,
el competidor es el alumno. Lo que no tiene equivalente —el `judge`, que es de
la federación y no es nada dentro de un club— sigue viajando como `null`: se
prefiere no decir nada a degradar al azar.

> ⚠️ **Campeonatos no gana roles con esto.** Solo se le añadió
> `student → competitor`, que no abre la consola (§4.13). Traducir
> `owner → maestro` habría sido razonable y habría metido en la consola, de un
> despliegue para otro, a gente que hoy no entra: una ampliación de permisos no
> se cuela de propina en el arreglo de otra cosa.

#### 2 · Y aun traducido, no llegaba a quien ya tenía ficha

Porque el rol del pase **solo se lee al CREAR** la fila local. Quien ya estaba
dentro de Membresías no se enteraba nunca — y allí no hay una pantalla evidente
donde corregirlo. Quien administra tenía el botón y no tenía el efecto.

Ahora el portal **avisa**: `POST /sync/rol`, por el mismo canal y con el mismo
secreto que la foto y la contraseña (`ECOSYSTEM_SYNC_SECRET`). Se dispara al
cambiar el rol desde `/admin` o desde «Mi organización».

| | |
|---|---|
| **Esto no rompe la regla de arriba** | Lo que no viaja sigue sin viajar: la PERTENENCIA. Sacar a alguien de un club en el portal sigue sin tocar sus pagos, su asistencia ni su historial |
| **Porque no es un silencio** | Alguien con permiso abrió el panel, eligió a una persona y le cambió el rol a propósito. Eso manda |
| **El club no se queda sin dueño** | Membresías rechaza el aviso que dejaría un club sin ningún `owner` activo, y dice por qué. Es la misma regla de §4.7-bis, y hace falta otra vez allí porque aquí se mira `org_members`, que es otra tabla |
| **La ficha sin cuenta del portal no se toca** | Busca por `eco_sub`. El alumno sin correo, que entra por carnet QR o PIN, sigue siendo asunto de su club |
| **Nunca rompe el guardado** | Se dispara sin esperarlo. Si Membresías está caída, el rol se cambia igual aquí y allá queda el viejo hasta el próximo cambio |

> **A quien ya le pasó:** vuelve a ponerle el rol en el panel. Ahora sí viaja.

**Campeonatos y Academy siguen sin este aviso**: allí el rol local sigue
mandando después de la primera vez, que es lo que impide degradar en silencio
al administrador de un campeonato en marcha. Se cambian en su propia consola.

#### 3 · Y aun avisando, no llegaba a la ficha sin enlazar

*(30 ago, esa misma tarde.)* **Los cuatro avisos del espejo buscan por
`eco_sub`.** Una ficha creada por su club y nunca enlazada con el ecosistema no
la encuentra ninguno — ni la foto, ni el escudo, ni la contraseña, ni el rol —
y como el aviso contestaba `200 {"encontrada": false}` y nadie miraba el
cuerpo, **el registro quedaba limpio**. Desde el portal se veía un cambio de rol
que había funcionado.

Dos arreglos, y el segundo importa más que el primero:

| | |
|---|---|
| `/sync/rol` busca **también por correo** | Y ata la ficha de paso (`eco_sub`), igual que hace `POST /auth/sso`. Solo sobre una ficha que todavía no tiene enlace, con el `isNull` en el `WHERE` para que dos avisos a la vez no se pisen. **A partir de ahí los otros tres avisos también empiezan a llegarle**: un cambio de rol repara el enlace para todo |
| Lo que no se aplica **se registra** | `espejo-membresias.ts` mira ahora el cuerpo de la respuesta: si no había ficha, o si Membresías se negó y dijo por qué, sale un `warn` en el log de `dinamyt-id`. Un aviso que no se aplica tiene que dejar rastro |

Y se quitó el veto al superadmin de Membresías: su `role` es lo que se imprime
en el carnet y se cambia como el de cualquiera. Lo que **nunca** viaja por aquí
es `is_super_admin`, que se concede a mano y mirando (§1.5).

#### Por qué no llegó: dónde mirar

```bash
sudo journalctl -u dinamyt-id -n 100 --no-pager | grep -i "sync/rol"
```

Y la verdad de la base — el enlace y el rol de esa persona a los dos lados:

```bash
sudo -u postgres psql -d dinamyt -P pager=off -c "select e.email, e.id as eco_id, om.role as rol_portal, om.role_membresias, m.id as ficha, m.eco_sub, m.role as rol_membresias, m.is_super_admin from ecosystem.users e left join ecosystem.org_members om on om.user_id = e.id left join membresias.users m on m.email = e.email where e.email ilike '%CORREO%';"
```

| Lo que se ve | Qué significa |
|---|---|
| `ficha` vacío | Esa persona no existe en Membresías. No hay nada que copiar |
| `eco_sub` vacío | **La ficha no estaba enlazada.** El siguiente cambio de rol la ata y la aplica |
| `rol_membresias` distinto de lo traducido | El aviso no llegó: mira el log de arriba |

#### 4 · Y la columna de app, que mandaba sobre todo lo anterior

*(30 ago, por la noche.)* Con los tres eslabones de arriba arreglados, el aviso
llegaba a Membresías y contestaba **«ya lo tenía»**. Y era verdad: le estaba
mandando `student`.

`org_members` guarda **cuatro** roles —el general y uno por app— y los de app
**mandan sobre el general** (§4.7, la tabla de arriba). La reconciliación del 29
de agosto los dejó escritos para las 46 personas que importó, con el rol que
cada quien tenía en su app. Con `role_membresias = 'student'` puesto, cambiar el
general a `maestro` no cambiaba **nada**:

- el pase seguía llevando `student`, porque la columna propia gana;
- el aviso mandaba `student`, y Membresías respondía «ya lo tenía»;
- y el panel enseñaba la insignia `Membresías · Alumno` **al lado** del rol
  nuevo, contradiciéndose sin que una sola línea lo explicara.

**Ahora cambiar el rol general vacía las tres columnas de app.** A partir de ahí
el rol de cada app sale del general traducido, que es lo que se pidió: quien
administra cambia el rol de alguien **en todas las apps** desde el portal.

> ⚠️ **Se lleva por delante un rol de app puesto a propósito** — el `judge` de
> quien es alumno en su club y juez en la federación. Es deliberado, y el panel
> lo dice antes de hacerlo (el diálogo nombra los que va a reemplazar). Para
> devolverle el suyo está `POST /organizations/:id/invite`, que sí los escribe
> uno por uno.

> **Se vacían en vez de escribirles el valor traducido.** Vaciarlas dice «esta
> persona no tiene nada especial en ninguna app», que es la verdad después de un
> cambio hecho a mano — y deja que la traducción siga siendo correcta el día que
> un catálogo cambie.

#### El resumen, para no volver a recorrerlo entero

Cuatro eslabones, y **cada uno tapaba al siguiente**:

| | Qué pasaba | Dónde |
|---|---|---|
| 1 | `maestro` no está en el catálogo de Membresías y el rol se caía a `null` | `common/roles-por-app.ts` |
| 2 | Aun traducido, solo se leía al CREAR la ficha | `POST /sync/rol` |
| 3 | El aviso no encontraba la ficha sin enlazar, y contestaba 200 | Búsqueda por correo + `warn` en el log |
| 4 | La columna `role_membresias` mandaba sobre el general | Se vacía al cambiar el rol |

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

> **Desde el 2 de septiembre de 2026, quitar a alguien ya no lo borra sin
> rastro**: la fila entera se copia a `org_member_bajas` antes de borrarla, y
> readmitir la devuelve con sus cuatro roles y su fecha de entrada. Las reglas
> de abajo **no cambian** —siguen decidiendo a quién se puede quitar—; lo que
> cambia es que equivocarse ya se puede deshacer. Cómo y por qué una tabla
> aparte: §4.15.

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

Hoy los tokens están espejados en el `globals.css` de cada web (tinta profunda +
oro de marca, Archivo + Instrument Sans + IBM Plex Mono). El desplegable propio
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

Hasta agosto de 2026 «cerrar sesión» no cerraba nada. El token era la sesión
entera —firmado, veinticuatro horas, sin registro en ninguna parte—, así que
salir solo borraba la copia del navegador: el original seguía abriendo puertas
hasta caducar solo. Quien entraba desde un computador prestado y se iba dejaba
su cuenta abierta ahí hasta el día siguiente, y **cambiar la contraseña tampoco
echaba a nadie**.

Ahora la sesión es una fila de `ecosystem.sessions` y el token lleva su id en
`jti`. Si la fila está revocada, el pase no abre — por perfecta que sea su firma.

**Tres relojes, y hacen falta los tres:**

| | Cuánto | Para qué |
|---|---|---|
| Inactividad | 20 min | El computador prestado que alguien dejó abierto |
| Tope absoluto | 12 h | Que quien toca la pantalla cada rato vuelva a escribir su contraseña alguna vez |
| Revocación | inmediata | Salir, salir de todos lados, cambiar o recuperar la contraseña |

⚠️ **Desde el 2 de septiembre de 2026 esos dos primeros dependen de la casilla**
«mantener la sesión iniciada» (`sessions.recordada`, §4.15). Una sesión recordada
**no tiene reloj de inactividad** y su tope es de 30 días. Lo que **no** cambia
—y es lo que sostiene todo lo demás— es la tercera fila: **la revocación sigue
siendo inmediata para todas**, recordadas incluidas.

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
  entonces muere al cerrar el navegador. **Durante meses eso fue lo ÚNICO que
  hacía la casilla**, y por eso no cumplía lo que dice: el reloj de inactividad
  lo aplica el servidor y la decisión no le llegaba. Desde el 2 de septiembre
  viaja con la sesión (§4.15).
- `VigilanteDeSesion` avisa un minuto antes del cierre por inactividad y renueva
  el pase **solo si ha habido actividad**. Esa condición no es un detalle: sin
  ella, una pestaña olvidada renovaría para siempre y el reloj de inactividad no
  serviría de nada.

**Al desplegar esto, todo el mundo vuelve a iniciar sesión una vez.** Los pases
de antes no llevan `jti` y el guard los rechaza diciéndolo con esas palabras.

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

**Funciona desde el 30 de agosto de 2026.** El botón del dashboard lleva el pase
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
administrar, inscribir y puntuar — no tiene una sola pantalla para él.

| Rol en el pase | Qué pasa |
|---|---|
| `admin` · `maestro` · `coach` · `judge` | Entra a la consola |
| `competitor` · `student` · vacío | **No entra**, y se le dice por qué con un enlace de vuelta al portal |

La regla vive en los **dos** lados: el portal no le ofrece la consola
(`lib/roles.ts`) y el servidor rechaza el pase (`app/espejo.py`). Ofrecer el
botón no es la seguridad; es no mandar a nadie a una puerta que le van a cerrar.

> **Pero al que no opera ya no se le esconde la tarjeta entera.** *(30 ago
> 2026)* Hasta ahora, quien tenía el plan sin un rol que operara no veía
> **nada** en «Tus aplicaciones»: ni el botón ni una explicación. Y eso se lee
> como «tengo Campeonatos pagado y el portal no me lo enseña», que es justo lo
> que pasó. Ahora la tarjeta sale igual y lo que cambia es el destino: quien
> opera salta a su consola con el pase; **quien no, va a las páginas públicas
> de Campeonatos** —los campeonatos abiertos y los resultados—, que no piden
> sesión y son lo que esa persona estaba buscando.

> **Y el pase de un alumno no crea ninguna fila** en `usuarios`. Sin esa regla,
> una federación con doscientos alumnos serían doscientas filas de gente que no
> va a entrar nunca, cada una ocupando un correo único en la consola.

### La fila local es un espejo, y su rol manda

`usuarios.eco_sub` guarda el `sub` de la cuenta del ecosistema. Al entrar: si ya
hay espejo se usa; si existe una fila con ese correo se **enlaza** (toda la
gente que ya operaba antes); si no existe, se crea — con una contraseña
aleatoria que nadie conoce, así que **por el formulario no se entra con ella**.

**El rol local manda sobre el del pase.** El pase solo decide el rol al crear la
fila. Es el mismo criterio de Academy, y evita que un cambio de rol en el portal
degrade en silencio al administrador de un campeonato en marcha.

### El login propio de Campeonatos NO se retira

Es **la marcha atrás del 9 de octubre**: sin internet no hay ecosistema al que
preguntar, y una app que solo sabe entrar por SSO no arranca ese día. Lo que sí
se retira —después del campeonato— es `POST /auth/register`, que es lo que de
verdad contradice «las cuentas nacen en el ecosistema». Membresías aplica este
mismo criterio, y tres apps con la misma regla es una regla que se recuerda.

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

Esa columna **ya existía en producción**: la creó el guion de reconciliación del
29 de agosto —como `uuid`, con índice único— y dejó **12 de los 22** usuarios de
Campeonatos ya enlazados. Declararla `String` a secas dejaba buscar (PostgreSQL
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

## 4.14 Academy está apagada en el portal

*(30 de agosto de 2026)* La app **sigue viva**: desplegada, respondiendo por
`academy.dinamyt.org`, con sus datos y su login propio. Lo que se retiró es el
botón «Entrar a Academy» del panel de aplicaciones del dashboard, porque el
producto todavía no se ofrece.

**El interruptor es uno solo**: `ACADEMY_EN_EL_PORTAL` en
`apps/ecosystem-portal/src/lib/apps.ts`. Para volver a encenderla: ponerlo en
`true` y **recompilar el portal** (§1.3 — reiniciar no basta; el comando es
§2.3). No hay nada más que tocar: los planes que incluyen `academy` siguen
dando su scope, el rol sigue viajando en el pase y el salto por `#token=` sigue
funcionando. El botón vuelve donde estaba, para quien tenga el scope.

> ⚠️ **Lo que a propósito NO apaga:** la lista blanca de `appsDelEcosistema()`,
> en ese mismo archivo, sigue incluyendo Academy. Es la que valida a dónde puede
> volver `/salir`; quitarla de ahí dejaría sin camino de vuelta a quien tenga hoy
> una sesión de Academy abierta. **Apagar un botón no puede romper una salida.**
## 4.15 Dos promesas que la aplicación no cumplía, y una tarde de teléfono

*(2 y 3 de septiembre de 2026)*

Seis despliegues en dos días, y conviene leerlos juntos porque **casi todo salió
del mismo sitio: alguien usando el portal desde un celular Android**. Ninguno se
habría encontrado leyendo código, y es la misma lección del ensayo de §6.0.

### «Mantener la sesión iniciada» no mantenía nada (migración `0017`)

La casilla del login existía desde el principio y decidía **una** cosa: si el
pase se guardaba en `localStorage` o en `sessionStorage` —o sea, si sobrevivía a
cerrar el navegador—. **El reloj de inactividad de veinte minutos lo aplica el
servidor** (§4.11), y al servidor no le llegaba la decisión: a los veinte minutos
parada cerraba la sesión de todo el mundo, **incluida la de quien acababa de
pedir por escrito lo contrario**.

Una casilla que promete algo y no lo cumple es peor que no tenerla: enseña que
las opciones de esta aplicación son de adorno.

`sessions.recordada` hace que la decisión viaje con la sesión y la aplique quien
la hace cumplir:

| | Inactividad | Tope absoluto |
|---|---|---|
| **Recordada** | ninguna | 30 días (`RECORDADA_DIAS`) |
| **Sin marcar** | 20 min | 12 h |

**El defecto de la columna es `false`**, así que toda sesión que ya existía se
comporta igual que ayer: nadie se queda dentro por sorpresa por culpa de la
migración. Y es **por sesión, no por cuenta** — la misma persona marca la casilla
en su celular y no la marca en el computador del club.

⚠️ **Lo que la recordada NO pierde son los otros dos relojes.** Caduca a los
treinta días y **se cierra en cuanto alguien la revoque**: salir, salir de todos
lados, cambiar la contraseña, o cerrarla desde «dispositivos conectados» — que es
la salida el día que se pierde el teléfono. Por eso `listar()` **deja de
esconderla**: una recordada lleva horas quieta por definición, y con el corte de
inactividad aplicado desaparecía de la lista justo la sesión que más falta hace
poder cerrar desde otro sitio.

> **Hacían falta los DOS relojes.** Con solo el del servidor arreglado, el
> vigilante del navegador seguía echando a la persona a los veinte minutos con el
> pase todavía válido, y desde fuera la casilla seguiría sin servir para nada.

### Quien salía del club desaparecía para siempre (migración `0018`)

Dar de baja **borraba** la fila de `org_members`, y con ella todo lo que decía:
el rol general, los tres roles por aplicación, desde cuándo pertenecía y quién la
invitó. Sin fecha y sin rastro: ni a quién le pasó, ni cuándo, ni quién lo hizo,
ni cómo deshacerlo. Y **el botón que lo provoca está en la misma fila que el que
cambia el rol**, así que no era un caso raro. Lo único que quedaba era un renglón
en el log y un script suelto para rehacer la fila a mano.

`org_member_bajas` guarda la fila **entera antes de borrarla**, y readmitir la
vuelve a escribir con lo que quedó: los cuatro roles y la fecha de entrada.
Readmitir «de miembro» a quien era maestro es un fallo que no se ve hasta el día
que intenta hacer su trabajo y no puede.

**Por qué una tabla aparte y no un `removed_at` en `org_members`** — esta es la
decisión que hay que entender antes de tocarlo:

`org_members` es lo que decide **quién es miembro**, y esa pregunta se hace en
casi cien sitios: los roles que van dentro del token, quién manda en el club,
quién ve qué. Marcar la fila en vez de borrarla obligaría a añadir «y que no esté
dada de baja» a **todas y cada una**, y el día que se olvide UNA, alguien a quien
echaron sigue entrando por ahí. **Un fallo silencioso y de seguridad a cambio de
una comodidad.** Con la tabla aparte, la regla de siempre no se toca —fila
presente = es miembro— y lo que se gana es memoria.

La bandeja **descarta por consulta** a quien ya volvió por otro camino
(invitación, código del club), así que ninguno de los cinco sitios que dan de
alta tiene que acordarse de limpiar nada.

En pantalla: «Ver N personas que salieron del club», plegada, con la fecha, el
rol que tenían y quién las dio de baja; «Volver a agregar», y una ✕ que solo
borra el recuerdo. Y el «¿seguro?» de quitar **deja de amenazar** con «habría que
invitarla otra vez», que era lo que hacía que nadie se atreviera a usar el botón.

### El `role_membresias = 'student'` que se escribía a mano

Esto es una **corrección al modelo de §4.7**, y merece leerse dos veces porque es
la misma clase de fallo que costó cuatro rondas encontrar.

Al aceptar una solicitud de entrada se escribía `role_membresias = 'student'`.
Esas columnas son **excepciones** —«en esta app esta persona es otra cosa»— y
**mandan sobre el rol general**. Las insignias de la lista solo pintan
excepciones: de ahí que el recién aceptado saliera marcado «Membresías · alumno»
y los demás no, y que la insignia se fuera al cambiarle el rol (porque cambiar el
rol **limpia** las columnas por app). Dos rarezas, una causa.

**Y era peor que cosmético:** aceptar a alguien como entrenador o maestro le
escribía `student` en Membresías igual. Ahora nace vacía y el rol sale de
traducir el general, como todo el mundo. Es la misma lección de la limpieza de
`role_*` de §6.1: **una excepción que nadie pidió es un rol que el portal ya no
manda.**

#### Y seguía pasando, por la puerta de al lado *(4 de septiembre de 2026)*

Se arregló el servidor y **el fallo siguió viéndose igual**, que es exactamente
la trampa que avisa la cabecera de este documento: el nombre sigue ahí y lo que
hace ha cambiado. `responderSolicitud` dejó de escribir la columna por su
cuenta… pero **el portal se la seguía mandando**, así que el servidor la
escribía obedeciendo. Y `invitarPersona` conservaba su propio valor por
defecto. Tres sitios, y solo se cerró uno.

· **`CodigoYSolicitudes.tsx`** llevaba una tabla con una segunda columna —«y
  con qué entra a Membresías»— que viajaba en las dos llamadas. Ya no existe.
· **`invitarPersona`** ponía `'student'` cuando el rol era alumno «para que no
  se quedara sin rol». Falso: vacía, `rolParaApp` traduce el general y da lo
  mismo. Lo prueba `roles-por-app.spec.ts`.
· **La migración `0020_rol_sin_excepciones`** limpia lo ya escrito. Vacía las
  tres columnas **solo cuando repiten la traducción** —una excepción de verdad,
  como el alumno que es `judge` en su federación, dice algo distinto y no se
  toca— en `org_members`, en las invitaciones sin aceptar (si no, la excepción
  vuelve a nacer al aceptarlas) y en las bajas, que es de donde se restaura.

> ⚠️ **Y de propina, un permiso que sobraba.** «Acudiente» se guardaba como
> `coach` y se corregía con `role_membresias = 'guardian'` — ése era el motivo
> real de mandar el rol de app. Pero **`coach` abre la consola de Campeonatos**
> (`ROLES_CONSOLA_CAMPEONATOS`), así que el acudiente de un menor podía entrar a
> la mesa de control de un torneo. Ahora entra como `guardian`, que es un rol
> general de verdad —los clubes lo aceptan desde el primer alta venida de
> Membresías— y no se traduce a nada allí. La migración convierte a los que ya
> estaban.

### Los topes de cada campo, en un solo sitio

Las reglas de longitud existían y rechazaban **después** de escribir: el aviso
llegaba al enviar, sobre un campo lleno, sin decir cuánto sobra. Y algunos ni
eso — la contraseña admitía mil caracteres **de los que bcrypt mira 72**, y las
notas médicas o la descripción del club iban a columnas `text`.

`LIM`, en `lib/validacion.ts`, tiene el tope de cada tipo de campo y se aplica en
las trece pantallas del portal, más el login de Academy y los formularios de
Campeonatos. **El tope del correo vive dentro de `PROPS_CORREO` y el de la
contraseña dentro de `CampoContrasena`**, no repartido por las pantallas: un
límite que hay que copiar es un límite que falta en tres.

> **La regla, y no es obvia: nunca más estricto que el servidor.** Cortar antes
> de lo que la API acepta deja a alguien sin poder escribir su propio apellido.

### Y el resto, que son trampas y viven en la Parte 5

· El `?redirect=` que **duraba para siempre** porque lo guardaba el navegador,
  no la aplicación → **§5.17**
· El aviso que llegó al teléfono con el icono roto: `badge` **no es una imagen,
  es una plantilla** → **§5.18**
· El permiso de avisos que **no se podía conceder desde un computador** →
  **§5.19**
· La campana cuyo número **volvía a subir** al leer un aviso → **§5.20**
· Los símbolos técnicos (⏻, ⇱) que **Android no trae en ninguna fuente** →
  **§5.21**
· Cuatro píxeles de desborde que parecían «esta pantalla no es responsiva» →
  **§5.22**

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
  fuera — que es el 403 mudo que ya costó una tarde en el portal (§6.1).
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

### 3 · El botón, y por qué el barrido diario no bastaba

*(4 de septiembre de 2026)*

Los dos disparadores de arriba dejaban un hueco que se nota **el mismo día**: un
club contrata, alguien activa su suscripción y no aparece en Membresías. Y no
había forma de preguntar por qué. El barrido solo se podía disparar por la ruta
del cron —que necesita el `CRON_SECRET` y se llama desde el servidor—, así que
con el maestro al teléfono la única respuesta era «mañana lo miramos».

En el panel del super-admin, arriba: **🔗 Membresías — quién la abre**, con
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

⚠️ El bloqueo por plan vencido **tampoco está en Campeonatos**, y es a
propósito: el 9 de octubre esa aplicación no puede depender de la red ni de una
columna que alguien puso mal. Queda apuntado en §6.1.

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

### Lo que se añadió el 4 de septiembre

*(Las cuatro salieron de mirar el panel con el trabajo del día delante.)*

· **Las cifras de clubes ahora REPARTEN el total, y antes se solapaban.** El
  panel decía *5 activos* y *2 en pausa por plan* sobre cinco clubes: los dos en
  pausa se contaban **también** como activos, así que las dos cifras juntas no
  cuadraban con nada — y un club en pausa no está operando, su gente no puede
  entrar. Ahora cada club cae en uno y solo uno: **Operando** (encendido y al
  día), **En pausa por plan** (encendido, cerrado por el ecosistema) y
  **Suspendido** (apagado a mano, que manda sobre lo demás porque es lo que el
  super-admin puede deshacer). Las etiquetas de la lista usan el mismo reparto:
  una sola por club, o seguir una cifra hasta el club acabaría otra vez en una
  tarjeta con dos insignias.

· **«Suscripciones personales» ya no se crean desde el portal.** Era una sección
  entera —lista, cuatro campos y un botón— para un caso que no ocurre: todo el
  mundo entra por su club. **Pero no se borró del todo**, y esa es la parte que
  importa: `user_subscriptions` sigue dando `app_scopes` al firmar el pase, así
  que una fila viva sin pantalla que la enseñe sería un permiso que nadie puede
  ver ni retirar. La tarjeta **aparece solo si queda alguna**, con su botón de
  borrar. Para dar acceso a alguien está «Accesos rápidos», que además le crea
  la membresía.

· **Y en el portal, las dos cifras que faltaban.** La cabecera del recaudo
  decía «N clubes · N cuentas» y del ecosistema en sí no contaba nada más.
  Ahora dice cuánta gente **entró este mes** y **cuántos clubes abren cada
  app** — contando la herencia, que es la única forma de que un club afiliado
  no desaparezca de la cuenta. Un plan que nadie abre y uno que abren treinta
  clubes se veían exactamente igual.

· **El dinero se escribe como se lee.** El panel PINTA «$ 35.000» en todas
  partes y se ESCRIBÍA en un `<input>` pelado donde `35000` se ve igual que
  `350000`. En la pantalla donde se registra el dinero de los clubes, un cero de
  más no lo nota nadie hasta que hay que devolverlo. `<CampoDinero>` —el mismo
  que Membresías tenía desde el principio— en los seis campos de importe:
  separa los miles mientras se teclea, pone el símbolo delante y **devuelve
  siempre el valor crudo**, así que ninguna pantalla tiene que acordarse de
  limpiarlo.

· **«Cuánto costó» ya viene puesto, y «cuánto entregó» sigue vacío.** El precio
  calculado vivía en el `placeholder`, y **un placeholder no es un valor**: se
  ve gris, parece una ayuda y se manda vacío. Quien no lo copiaba a mano
  registraba el pago sin precio. Ahora el campo nace con la cifra —y se
  recalcula al cambiar los meses, hasta que alguien lo toque, momento en el que
  deja de seguir al cálculo—. El de la entrega es el contrario y por eso se
  queda vacío: **el precio lo sabe el sistema y la entrega no**. Vacío = pagó
  todo; una cifra menor deja el abono con su deuda escrita.

· **La tarifa de cada plan se pliega.** Era una tarjeta por plan con dos campos,
  un botón y un párrafo de ejemplo: con siete planes, media pantalla para algo
  que se toca una vez al trimestre — y lo que empujaba hacia abajo era lo que se
  mira a diario. Ahora es una línea por plan, plegada, con el resumen a la vista
  («7 planes · 4 por persona · 3 de importe fijo») y el ejemplo de «un club de
  40 pagaría…» solo en el plan que se está editando.

### Y en el panel del portal, cinco cosas del mismo día

Todas del `/admin` del ecosistema, y ninguna es cosmética:

· **Las federaciones se recogen.** La lista era siempre entera: seis
  federaciones de diez clubes eran sesenta filas en una columna que además está
  pegada al desplazar. El estado guarda las **cerradas** y no las abiertas, para
  que «abierta» siga siendo el defecto y una federación nueva no tenga que
  añadirse a ninguna lista. Y **si el club seleccionado cuelga de una plegada,
  se enseña igual**: esconder lo que el panel de la derecha está mostrando deja
  la pantalla contradiciéndose a sí misma. El botón es aparte del nombre, porque
  el nombre ya hace algo — un control que hace dos cosas según dónde caiga el
  dedo acaba haciendo la que no era.

· **Rol, perfil y quitar caben en una línea.** Con `flex-wrap`, el desplegable
  de rol se quedaba la línea entera y **la ✕ caía sola debajo**, junto al nombre,
  donde parece que quita OTRA fila. Un botón destructivo desalineado de su fila
  es la peor casilla del panel para una duda. Ahora lo que cede es el ANCHO del
  desplegable —el rol también está escrito en la insignia de al lado— y los dos
  botones no encogen.

· **Ciudad y país dejan de ser texto libre** en «nueva organización» y en
  «crear club dentro». Era el último sitio del portal donde seguían sueltos, o
  sea **el que fabricaba el problema** que `PaisCiudad` vino a arreglar: la misma
  ciudad escrita de cuatro maneras y cada variante como un grupo distinto en los
  reportes. Y el nombre estrena `validarNombreOrganizacion`: se podía crear una
  organización llamada «   » que después no hay forma de encontrar en ninguna
  lista.

· **El buscador de accesos rápidos dice qué está haciendo.** Estaban el
  `debounce` y la lista, pero entre teclear y ver algo no pasaba nada visible, y
  sin coincidencias tampoco: **tres estados —aún no busco, estoy buscando, no
  encontré— se veían los tres igual**, como una caja de texto sola. Ahora los
  tres tienen su línea, los resultados llevan iniciales para separarse, y una
  respuesta lenta de «ju» ya no pisa a la de «juan».

· **Los dos correos del panel** eran los únicos del portal sin `PROPS_CORREO`:
  se escribían con mayúscula automática en Android y admitían texto sin fin. Y
  su botón ahora exige un correo **válido**, no solo «algo escrito» — un correo
  mal formado volvía con un 400 que dice «no se pudo invitar», que no dice qué
  arreglar.

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

> **Y la regla que la sustituye**, en cuanto se aplique `0012_fechas_con_zona`
> (escrita y ensayada; §6.1): **la columna lleva zona**. Sobre `timestamptz` lo
> guardado es un instante, así que `now()` y `new Date()` escriben lo mismo y
> deja de importar quién la rellene. Recordar un convenio en cada columna es
> justo lo que falló; el tipo no se olvida.
>
> Lo que **no** cambia: una fecha civil —un cumpleaños, el día en que vence una
> suscripción— no lleva zona ni la quiere. Esas se quedan como están.

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
apps** (`IconoSalir`, y el de «Ir a DINAMYT» de §6.2). La misma acción se dibuja
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

## 6.0 En qué orden se trabaja

*(escrito el 30 de agosto de 2026 · **reescrito el 4 de septiembre**)*

**Hasta hoy esta sección era un calendario de espera**: campeonato el 9, 10 y 11
de octubre, del 1 al 13 no se tocaba nada, y todo lo abierto quedaba aparcado
«para después del 14». Eso se cambió, y conviene saber por qué, porque la regla
que sustituye no es «ya da igual»:

· **Congelar dos semanas para proteger un fin de semana salía carísimo.** Paraba
  las mejoras que se están pidiendo hoy, y amontonaba lo aplazado en un solo
  despliegue del día 14 — la forma más segura de estrenar un fallo justo después
  del evento y con todo el mundo mirando.
· **Lo que de verdad protege el campeonato son tres días, no trece** (§1.5):
  los días 9, 10 y 11 no se sube nada, y el 8 solo entran arreglos. El resto del
  tiempo se trabaja normal.
· **Y lo que hace que eso sea seguro ya está montado**: cada cambio pasa por
  `pnpm turbo build test` y por los dos ensayos de §2.1 —uno de ellos aplica las
  migraciones reales sobre un PostgreSQL de verdad—, hay respaldo antes de tocar
  datos (§2.5) y Campeonatos arranca sin internet (§1.5). Ésa es la red, no el
  calendario.

**Lo que sí sigue teniendo fecha propia es el DMARC**, porque su fecha sale de
una cuenta y no de una preferencia: `p=none` se publicó el 29 de agosto y hacen
falta dos semanas de informes.

### El orden

| Cuándo | Qué | Por qué ahí |
|---|---|---|
| **Del 12 de sept. en adelante** | DMARC a `quarantine` (§3.5) | Dos semanas de informes desde el 29 de agosto. El DNS está comprobado y el cambio escrito palabra por palabra: es teclear, no investigar. `reject`, más tarde |
| **Cuando se pueda, y ya se puede** | **Las mejoras del panel y del producto** — §6.1 y §6.2 | Ya no esperan al 14 de octubre. Se toman de arriba abajo: primero lo que se usa a diario |
| **Última semana de septiembre** | Repetir el ensayo completo (abajo) y **anotar los números** | Es lo único que vigila que los despliegues de septiembre no hayan reabierto un eslabón. Con más despliegues por delante, ahora hace más falta, no menos |
| **8 de octubre** | Solo arreglos. Nada que se estrene | La víspera |
| **9, 10 y 11 de octubre** | Nada (§1.5) | Campeonato, con gente delante |
| ~~Después del 14 de oct.~~ | ~~**Cobro por usuario**~~ — **hecho el 3 de septiembre** (§4.18) | Se adelantó porque no toca identidad ni migra datos de nadie |

### Y una regla para trabajar así, que antes la ponía el calendario

Con la ventana cerrada, lo que separaba un cambio arriesgado de uno tranquilo
era la fecha. Ahora lo separa **lo que toca**:

| Si el cambio… | Entonces |
|---|---|
| Es de pantalla, texto o una ruta nueva | Se despliega el día que se hace |
| **Añade** columnas o limpia datos | Respaldo antes (§2.5) y `db:migrar` **antes** de reiniciar (§1.2) |
| Toca identidad, sesiones o roles | Además, los dos ensayos de §2.1 en verde **antes** de empujar |
| Cambia precios o lo que se le cobra a alguien | Se avisa a los clubes antes de que lo vean en su factura |

Lo del 4 de septiembre —§4.16, §4.17 y el `role_membresias` de §4.15— entra en
las dos primeras filas: pantalla, una ruta nueva y una migración que solo
**limpia** columnas.

### El ensayo — corrido el 3 de septiembre de 2026

El fallo del rol tenía **cuatro eslabones y cada uno tapaba al siguiente**
(§4.7). Ninguno de los cuatro se veía leyendo el código: se vieron recorriendo
el camino con una persona real y mirando el log. La única forma de encontrar la
próxima cadena así es recorrer el camino entero antes de que lo recorra un
maestro el 9 de octubre.

**Ya se recorrió**, y el guion de abajo **no se borra por eso**: es lo que se
vuelve a correr. Dos razones para repetirlo la última semana de septiembre, y
las dos pesan más ahora que se trabaja hasta la víspera:

· De aquí al campeonato entra código, y cada despliegue puede reabrir un
  eslabón. Los seis arreglos del 2 y el 3 de septiembre (§4.15) cambiaron el
  login, los roles por app y la campana — los tres sitios donde vivía la cadena.
· El paso 7 mide `fichas_sueltas`, y ese número solo dice algo **comparado con
  la vez anterior**. Un ensayo aislado no lo vigila; dos, sí.

> **Anota los números del cierre cada vez que lo corras** (paso 7). Los del
> último ensayo no quedaron escritos aquí, así que el próximo `resumen` vuelve a
> ser un punto de partida y no una comparación. Es la única parte del ensayo
> que se pierde si no se copia a mano.

### El guion, paso a paso

Cada paso tiene **lo que se hace en pantalla** y **lo que se comprueba en la
base**. Lo segundo no es opcional: los cuatro eslabones del fallo del rol se
veían todos igual desde la pantalla —«no pasa nada»— y distintos en la base.

`scripts/ensayo.sh` es lo que responde cada comprobación. **Solo lee**: ni un
`UPDATE`, ni un `INSERT`. Se puede correr en producción a media tarde.

```bash
cd /srv/dinamyt && bash scripts/ensayo.sh
```

Y una ventana aparte, abierta durante todo el ensayo — esto es la otra mitad:

```bash
sudo journalctl -u dinamyt-id -f
```

Un `WARN [EspejoMembresias]` es un aviso que no se aplicó. Hasta el 30 de agosto
ese silencio era el problema; ahora los dice todos (§4.7).

#### 0 · El punto de partida

```bash
cd /srv/dinamyt && bash scripts/ensayo.sh estado
```

Las seis apps `active`, **los dos hashes del secreto iguales** —si no, el espejo
entero está muerto y el ensayo no prueba nada— y `POST /sync/alta` contestando
**401** (un 404 es que falta `ECOSYSTEM_SYNC_SECRET`). Anota los números del
resumen: al final tienen que haber cambiado en lo que esperas y en nada más.

#### 1 · La estructura

En pantalla: crear una federación desde `/admin`, ponerle su administrador,
crearle un club dentro y **afiliarle otro que ya exista**.

```bash
bash scripts/ensayo.sh federacion 'NOMBRE DE LA FEDERACIÓN'
```

Los clubes colgando de ella, y **alguien con rol `admin`**. Sin eso la
federación existe y no le sale a nadie en «Mi organización» (§4.5).

#### 2 · La herencia

En pantalla: darle plan a la federación. Después, con el correo de alguien del
club **hijo** —no de la federación—:

```bash
bash scripts/ensayo.sh herencia alguien@delclub.com
```

Tiene que salir el plan de la federación como eslabón del club. Si sale aquí y
la persona no lo ve en el portal, es el pase viejo: que salga y entre (§4.5).

#### 3 · El alta desde Membresías

En pantalla: dar de alta a un alumno con un **correo nuevo**. Tiene que volver
el enlace de contraseña (§4.4).

```bash
bash scripts/ensayo.sh persona elnuevo@correo.com
```

Las tres cosas que importan: **cuenta en DINAMYT** con `tiene_contrasena = f`,
**`enlazada = t`** en Membresías, y `contrasena_propia = f`. Si `enlazada` sale
`f`, la ficha nació suelta y hay algo mal en el orden del alta.

#### 4 · Que entre

En pantalla: que esa persona abra el enlace, ponga su contraseña, entre al
portal y de ahí salte a Membresías. Después, cobrarle, marcarle asistencia e
imprimirle el carnet.

Repite `persona`: ahora `tiene_contrasena = t`.

#### 5 · El rol, que es donde estaba el fallo

En pantalla: cambiarle el rol a **auxiliar** desde el portal.

```bash
bash scripts/ensayo.sh rol elnuevo@correo.com
```

`esperado_membresias` y `en_membresias` **iguales**, y
`tiene_roles_de_app_escritos = f`. Si no cuadran:

```bash
bash scripts/ensayo.sh espejo
```

#### 6 · Campeonatos, ida y vuelta

En pantalla: entrar con un maestro, inscribir a alguien, y **salir**. Al volver
al portal no puede meterte dentro otra vez (§5.12). Y comprueba que a un alumno
el portal le ofrece las páginas públicas, no la consola (§4.13).

#### 7 · El cierre

```bash
bash scripts/ensayo.sh resumen && bash scripts/ensayo.sh sueltas
```

`fichas_sueltas` no puede haber subido: cada alta nueva nace enlazada. Si subió,
algún camino sigue creando fichas sin cuenta y eso es lo siguiente que hay que
mirar.

## 6.1 Huecos conocidos

`[x]` ~~**Los planes que hay no son los de verdad: el cobro será POR USUARIO.**~~
      **Hecho el 3 de septiembre de 2026** — se adelantó a la Fase 2 porque el
      modelo viejo ya estaba estorbando: el panel de recaudo sumaba importes
      fijos que no significaban nada. El mecanismo entero, las tres formas de
      contar que se compararon y por qué se eligió el prepago: **§4.18**.

      Lo que queda de esta conversación es lo que de verdad era de la Fase 2: la
      portada y los precios públicos. **`/planes` sigue enseñando los de
      relleno**, así que el aviso de abajo sigue en pie hasta que se pongan los
      de verdad en «Tarifa de cada plan».

      **Lo que decía esta nota el 29 de agosto**, y que se cumplió entero:
      los de la base eran precios fijos al mes —`Plan Membresías` 60.000,
      `Academy` 50.000, los de Campeonatos «a cotizar»— y la intención siempre
      fue tarifa por usuario. Las tres cosas que dejaba por resolver —dónde vive
      el precio unitario y el mínimo, **qué cuenta como usuario**, y que
      `total_amount` deja de ser una constante— están las tres contestadas en
      §4.18.

      ⚠️ **Mientras tanto: no publiques los precios de `/planes`.** Los que
      enseña siguen siendo los de relleno, y hoy solo lo abre quien tiene el
      enlace.

`[x]` ~~**Una federación creada desde `/admin` nace sin nadie que la
      gestione.**~~ Hecho el 30 de agosto de 2026. `/admin` enseña ahora la
      **estructura** —cada federación con sus clubes debajo, y al final los que
      no cuelgan de nadie, donde antes había una lista plana en la que un club
      afiliado y uno huérfano se veían igual— y, al seleccionar una federación,
      trae su propio bloque para **invitar clubes existentes** y para **crear
      clubes nuevos dentro**. Afiliar sigue siendo por invitación: el maestro
      del club acepta o rechaza. Cómo queda repartido: §4.5.

      Nacer vacía **sigue siendo posible** —hay motivo para preparar la
      estructura antes de que llegue su gente— pero ya no es un silencio: la
      organización recién creada queda seleccionada, el panel avisa de que
      todavía no la administra nadie, y el desplegable de «+ Añadir» ofrece solo
      los roles que ese tipo de organización acepta (una federación, `admin` y
      `judge`; antes ofrecía seis y cuatro acababan en un 400 mudo).

      **Y el mismo día se afinó**: desde `/admin` no se invita, se **afilia
      directo**. La invitación protege al maestro de que una federación se
      lleve su club sin preguntar; el super-admin no está en esa conversación
      —ya crea, desactiva y borra organizaciones desde ese panel—, así que
      pedirle que se mandara una invitación a sí mismo era ceremonia. Con su
      deshacer al lado (la ✕ de cada club afiliado), que es lo que hace que
      afiliar de un clic no sea una trampa. Las dos rutas y el reparto: §4.5.

`[x]` ~~**El usuario no tiene por dónde escribirte.**~~ Hecho el 29 de agosto de
      2026. `soporte@dinamyt.org` ya recibía (§3.5) pero no aparecía en ninguna
      pantalla; ahora está en el **pie del portal**, y el pie vive en el
      `layout`, así que sale en **todas** — login, registro, recuperar y
      poner-contraseña incluidas. Ese es el punto: quien no consigue entrar no
      tiene ningún menú donde buscar ayuda.

      Las dos direcciones se unificaron en `src/lib/contacto.ts`
      (`CORREO_SOPORTE` y `CORREO_ADMIN`), que es lo que impide que vuelvan a
      repartirse: `planes` tenía la suya en una constante local y `privacidad`
      la tenía escrita a mano. Siguen siendo **dos buzones distintos a
      propósito** — soporte para problemas de cuenta, admin para lo
      administrativo (planes, cotizaciones, habeas data)— y cada uno tiene su
      variable: `NEXT_PUBLIC_SUPPORT_CONTACT_EMAIL` y
      `NEXT_PUBLIC_ADMIN_CONTACT_EMAIL`. **En producción no hay que tocar
      nada**: los valores por defecto ya son los buenos.

      El pie del `layout` sustituyó al que tenía escrito la portada, que era el
      único que había: ahora hay uno solo, en `components/PieDePagina.tsx`. Y
      como cada página trae su `min-h-screen`, `globals.css` reparte la pantalla
      entre el `<main>` y el pie (`body > main { flex: 1 0 auto; min-height: 0 }`);
      sin eso, **todas** las vistas cortas habrían salido con tres líneas de
      scroll que no llevan a ninguna parte.

      ⚠️ Al ser `NEXT_PUBLIC_*`, cambiar cualquiera de las dos obliga a **volver
      a compilar** el portal (§1.3).

`[x]` ~~**Nadie recibe lo que se escribe a `soporte@dinamyt.org`, y el dominio
      no publica política DMARC.**~~ Hecho el 29 de agosto de 2026: Email
      Routing con `soporte@` y `admin@`, y `_dmarc` en `p=none` con los informes
      al panel de Cloudflare. Queda **subir la política a `quarantine`** a
      mediados de septiembre, y a `reject` **desde el 13 de octubre**, nunca
      durante el campeonato. Ver §3.5.

`[x]` ~~**Un alumno desactivado en Membresías choca contra un 403 sin
      explicación.**~~ Hecho el 31 de agosto de 2026, y por el camino que decía
      la nota: **Membresías avisa**, el portal lo apunta y deja de ofrecer lo
      que no va a poder abrir.

      · Migración `0013_acceso_por_app`: `org_members.membresias_activo`, que
        acepta NULL —«no consta», el valor de todo el mundo hasta que llegue el
        primer aviso— para no afirmar de golpe que mil personas tienen acceso a
        una app que la mayoría ni usa.
      · Membresías llama a `POST /sync/acceso` cuando el maestro enciende o
        apaga el acceso de alguien (`avisarAccesoAlEcosistema`). **Mismo
        secreto que el resto del espejo: no hay variable nueva que poner.**
      · El dashboard, con el acceso cortado, cambia la tarjeta por la
        explicación —«tu maestro lo retiró; sigues siendo del club y no se ha
        perdido nada tuyo»—, y la lista de gente del club marca a esa persona
        con una insignia roja «Membresías · sin acceso».

      **Y la baja al revés, que era la otra mitad y no estaba apuntada:** sacar
      a alguien del club en el portal no llegaba a Membresías, así que seguía
      en el listado y seguía entrando. `removeMember` llama ahora a
      `POST /sync/pertenencia` (`espejarBaja`), que allá le retira el acceso
      **sin borrar la ficha**: los pagos y la asistencia son la contabilidad del
      club y no se van con la persona. Ese lado tiene once pruebas de punta a
      punta (`baja-del-club.spec.ts`).

`[x]` ~~**Al alumno no le llega ningún aviso automático todavía.**~~ **Cerrado
      el 3 de septiembre de 2026: los avisos llegan.** Las llaves VAPID y el
      reloj de las 08:00 estaban desde el 29 de agosto; lo que faltaba era la
      tercera pieza, que alguien instalara la PWA y aceptara. `pushEnviados` ya
      no es 0.

      **Y la prueba de que llegan de verdad vino en forma de fallo**, que es la
      mejor: el aviso apareció en un teléfono con el icono roto —un círculo
      amarillo con una mancha dentro—, y eso solo se puede reportar habiéndolo
      recibido. Arreglado el mismo día (§4.15).

      ⚠️ **Faltaba además un botón que funcionara.** Hasta el 3 de septiembre
      **no se podía activar desde un computador**: `activarPush` pedía el
      permiso después de esperar al service worker, y para entonces el gesto del
      clic ya había caducado. En el celular colaba porque el service worker
      venía instalado de la visita anterior. O sea que «nadie se ha suscrito»
      era medio diagnóstico: parte era que a mucha gente el botón no le hacía
      nada. Ver §4.15.

      Lo que **no** cambia: al alumno no le llega correo, y es a propósito
      (§4.6). El push es su único canal automático hasta que exista WhatsApp.

`[ ]` **WhatsApp para los avisos del alumno.** Es el canal que la gente de
      verdad lee, y el que el maestro ya usa a mano. **No está construido.**
      Lo que costaría, para decidirlo con números en vez de con ganas:

      · **El dinero es lo de menos.** Meta cobra por mensaje entregado desde
        julio de 2025, y Colombia es de los mercados más baratos: una plantilla
        de *utilidad* cuesta entre **0,0008 y 0,003 USD**. Un aviso al mes a
        quinientos alumnos son **menos de dos dólares**. Ya no hay tramo
        gratuito mensual, pero sí una regla que aquí sale a favor: si la persona
        te escribió primero, tienes 24 h para responderle **gratis**.
      · **Lo caro es entrar.** Cuenta de Meta Business, **verificación de la
        empresa** (documentos, días de espera), un número de teléfono dedicado
        que no esté ya en WhatsApp normal, y **cada plantilla aprobada una por
        una** por Meta antes de poder mandarla.
      · **Lo que habría que escribir**: un `WhatsappService` gemelo del
        `MailerService` (mismo criterio: sin token configurado, la función no
        existe), guardar el `phone` en formato E.164, y un registro de envíos
        para no repetir.
      · ⛔ **Las librerías que automatizan WhatsApp Web** (`whatsapp-web.js`,
        Baileys) **no**. Violan los términos y el número acaba bloqueado — el
        del club, que es el que usan para todo.

`[x]` ~~**Los `created_at` van cinco horas desviados en el VPS.**~~
      **Aplicada.** Era el mismo mecanismo de §5.1-bis, pero en las columnas que
      solo se MUESTRAN: `DEFAULT now()` escribía hora de Bogotá y Drizzle la
      leía como UTC. No rompía ninguna decisión —lo único que comparaba una de
      estas fechas contra el reloj eran las sesiones, y eso ya estaba
      arreglado—, pero sí desplazaba lo que se pinta. Se notaba de verdad en un
      solo caso: quien se registró entre medianoche y las 5 de la mañana
      aparecía con la fecha del día anterior en «Miembro desde».

      **`0012_fechas_con_zona` está aplicada en producción**, y lo que sigue es
      la referencia de qué hizo — que hace falta el día que alguien añada una
      columna de instante nueva, o toque las seis que no convirtió.

      > **Cómo se sabe, sin entrar al VPS.** El diario de Drizzle la pone
      > **antes** de `0013`, y el migrador aplica en orden: si algo posterior
      > corrió, ella corrió. Y corrió `0016_avisos_al_celular` — el 3 de
      > septiembre llegó un aviso a un teléfono de verdad, con el icono mal, y
      > ese fallo (§4.15) es la prueba de que la cadena entera está desplegada.
      > La comprobación directa sigue siendo `pnpm db:diagnostico` (§2.6).

      Pasó a `timestamptz` las **35** columnas de
      instante del esquema `ecosystem`, repartidas en 16 tablas. Eso elimina la
      clase de fallo entera en vez de taparla: sobre `timestamptz` da igual si
      el valor lo pone `now()` o un `new Date()`, porque lo guardado es un
      instante y no una hora de pared. Los `DEFAULT` se quedan — con el tipo
      bueno vuelven a ser correctos.

      ⚠️ **Lo que a propósito NO convierte: seis columnas.** `birth_date` (en
      `users` y en `pending_registrations`) y los `starts_at` / `ends_at` de
      las dos tablas de suscripciones **no son instantes, son días**: se
      calculan como texto `'YYYY-MM-DD'` en `common/ciclo.ts` y se guardan a
      medianoche. Un cumpleaños no ocurre a una hora, y una suscripción que
      vence «el 31» no vence a las 19:00 del 30. Ponerles zona sería cometer el
      mismo error por el otro lado. Su tipo correcto es `date`, y eso es otra
      migración con su propio cambio de código.

      **Cada columna lleva su propio `USING`**, y esa es la parte que no se
      puede improvisar: convertir a secas interpretaría todo con la zona de la
      sesión, lo que acierta con lo que escribió la base y **estropea lo que
      escribió la aplicación**, que ya estaba bien. Hubo que auditar quién
      escribe cada una. Salieron tres grupos —siempre `now()` (Bogotá), siempre
      `new Date()` (UTC), y los cuatro `updated_at`, que son mixtos porque
      nacen con el default y se pisan desde la app—. Los mixtos se separan por
      la distancia a su `created_at`, y funciona porque los dos convenios están
      cinco horas apartados: dos segundos de umbral deja el corte lejísimos de
      los dos casos.

      **Las tres cosas que se hicieron antes de aplicarla**, y que hay que
      repetir el día que se convierta cualquier otra columna de instante —la
      lista es esta y no otra:

      1. Respaldo delante (`scripts/respaldar-produccion.ps1`) y comprobado
         (`scripts/verificar-respaldo.ps1`). Reescribe 16 tablas y **no hay
         vuelta atrás automática**: `timestamptz` → `timestamp` pierde la zona.
      2. `SHOW timezone;` en la base tiene que decir `America/Bogota`. Todo un
         grupo depende de eso. Si dijera otra cosa, se cambia el `AT TIME ZONE`
         del SQL **antes**, no después.
      3. El ensayo, que levanta PGlite en la zona de Bogotá, fabrica las dos
         clases de fila, aplica las conversiones y además comprueba que el SQL
         y el esquema de Drizzle dicen lo mismo columna por columna:

         ```bash
         cd apps/ecosystem-api && pnpm zonas:ensayo
         ```

      El despliegue fue el de §2.3 con su `db:migrar`; no hizo falta nada
      especial más allá del respaldo.

      **Lo que queda de este hueco es una migración distinta y pequeña**: las
      seis columnas de día a tipo `date`. No corre prisa —hoy son `timestamp`
      sin zona a medianoche, que es lo que se quiere leído como día— y va con su
      cambio de código en `common/ciclo.ts`. **Después del campeonato.**

      **Esto cubre `ecosystem` y solo `ecosystem`.** De los otros dos esquemas
      de la misma base:

      · **Membresías tenía el mismo fallo**, y ya está curado: migración
        `0017_fechas_con_zona` en **su** repositorio
        (`D:\Repositorios\dinamyt-membresias`), 24 columnas, hecha el 31 de
        agosto de 2026. Era exactamente lo que se veía en el kiosco: la hora
        del check-in salía cinco horas en el pasado.

        **Su SQL no escribe `America/Bogota` a mano y el de aquí sí**, y no es
        un descuido: Membresías se vende sola, así que su migración también
        corre en la base de un club que la instaló en Supabase o en Neon, donde
        `SHOW timezone` dice `UTC`. Usa `current_setting('TimeZone')`, que es
        con la zona que escribió `now()` sea cual sea, y así no hay nada que
        comprobar antes de correrla.

        Su ensayo, gemelo del de aquí:

        ```bash
        pnpm --filter @dinamyt/membresias-db zonas:ensayo
        ```
      · **Campeonatos no lo tiene.** Sus modelos usan
        `default=lambda: datetime.now(timezone.utc)`, que es un default de
        **Python**, no de la base — no hay un solo `server_default` en el
        backend—, así que escribe y lee UTC por los dos lados y cuadra.

`[x]` ~~**Campeonatos no lee el `#token=`.**~~ Hecho el 30 de agosto de 2026:
      el salto desde el portal abre sesión sin segunda contraseña, y `dinamyt-combat`
      ya está clonado en `D:\Repositorios\dinamyt-combat`. Cómo funciona y qué
      decide quién entra: §4.13.

      **Desplegado el 30 de agosto de 2026.** El comando, con el `pip install`
      que no sobra y las dos variables que hay que poner antes: **§2.4-bis**.

      Y con el salto llegó su reverso: salir de Campeonatos no cerraba la
      sesión de DINAMYT, así que volver al portal metía a la persona dentro
      otra vez. Arreglado el mismo día con el criterio de Membresías (§5.12), y
      de paso la vuelta atrás y el scroll del diálogo.

`[x]` ~~**Quedan dos `admin@dinamyt.com` en Campeonatos**, y ese dominio es de
      otra persona.~~ **Corregidos el 3 de septiembre de 2026** en
      `dinamyt-combat` — no en el espejo de `productos/`, que se pierde en la
      siguiente sincronización y es el error fácil de cometer porque el `grep`
      los encuentra en los dos sitios.

      El del código ya no estaba: lo arregló el barrido de §1.5 del plan
      maestro, que eran ocho apariciones y no dos. Lo que sobrevivía era
      documentación que la gente copia y pega, y **es exactamente por eso que
      importaba** — un `.env.example` se copia a `.env`, y `INICIAR-LOCAL.md` es
      la guía que alguien sigue el día del campeonato.

      **Y en esa segunda línea había un tercer error, peor que el dominio.**
      Decía:

      > *Usuario admin inicial: `admin@dinamyt.com` / `Dinamyt2026*`*

      Esa contraseña **no es el valor por defecto de nada** — aparecía en ese
      renglón y en ningún otro sitio del repositorio. `ADMIN_PASSWORD` no tiene
      defecto **a propósito**, para que ninguna contraseña viva en el código, y
      sin ella el seed no crea el admin. O sea que quien siguiera la guía al pie
      de la letra **no podía entrar**, y con un dato que además parecía una
      credencial de verdad. Ahora dice qué dos variables poner, que la
      contraseña no tiene defecto, y que van **antes del primer arranque**, que
      es cuando se crea el admin.

      > **La lección:** una guía de arranque que nombra una credencial concreta
      > o miente o la filtra. Las dos cosas son peores que decir dónde ponerla.

`[x]` ~~**Campeonatos ejecuta DDL al arrancar**~~ — el bloqueo, cerrado el 29 de
      agosto de 2026 (`7a740cd` en `dinamyt-combat`, desplegado y espejado).
      Tiró el servicio una mañana entera; el relato y cómo se reconoce están en
      §5.1-ter. El `db.session.commit()` suelta el candado y el
      `SET LOCAL lock_timeout = '5s'` hace visible cualquier recaída.

`[x]` ~~**Las rutas del espejo y sus pruebas de punta a punta.**~~ **Completas el 3 de septiembre de 2026.**
      *(31 ago 2026)* **Encontrado por qué colgaban, y no era el arnés: era la
      ruta.** `/sync/rol` se quedó fuera de la lista `SIN_CONTEXTO` de
      `plugins/rls.ts` cuando se escribió, así que la transacción que abre su
      `sinFiltroDeClub` caía DENTRO de la que abre el plugin de RLS. Contra
      PGlite —una sola conexión— eso se bloquea contra sí mismo y la petición no
      vuelve nunca; contra un PostgreSQL de verdad no se cuelga porque el pool
      le da otra conexión, así que **en producción funciona y solo abre una
      transacción de más**. Un fallo que no se ve donde importa y que deja el
      código sin poder probarse, que es la peor combinación de las dos.

      Arreglado: `/sync/rol` y `/sync/pertenencia` están ya en esa lista.

      **El inventario, ruta por ruta** *(al día el 3 de septiembre)*. Merece una
      tabla porque el espejo tiene cinco rutas en dos repositorios y «está
      probado» no significa lo mismo en cada una — la que emite y la que recibe
      son dos pruebas distintas:

      | Ruta | Quién la recibe | Cubierta por |
      |---|---|---|
      | `/sync/persona` | Membresías | `ecosistema.spec.ts` |
      | `/sync/pertenencia` | Membresías | `baja-del-club.spec.ts` (12) y `alta-del-club.spec.ts` (12) |
      | `/sync/acceso` | ecosystem | `modules/sync/acceso.spec.ts` (9) |
      | `/sync/contrasena` | Membresías | `contrasena-espejo.spec.ts` (las dos puntas) |
      | `/sync/rol` | Membresías | `cambiar-rol.spec.ts` (3, emite) **y `rol-del-portal.spec.ts` (17, recibe)** |
      | `/sync/alta` | ecosystem | **`modules/sync/alta.spec.ts` (15)** |
      | `/sync/plan` | Membresías | **`plan-vencido.spec.ts` (19)** — ver §4.16 |

      La traducción de roles sigue con sus once casos en `roles-por-app.spec.ts`,
      y que el club no se quede sin dueño tiene nueve en `ultimo-gestor.spec.ts`
      — por la puerta del portal, que es la que se usa a diario.

      **Las dos que faltaban, escritas el 3 de septiembre de 2026.** Las suites
      quedan en **242** (ecosystem) y **321** (Membresías), las dos en verde:

      · **`rol-del-portal.spec.ts`** — la punta de `/sync/rol` que RECIBE. Lo que
        ya había probaba que el portal manda el rol traducido; esto prueba qué
        hace Membresías con lo que llega. Las cuatro familias: la puerta (sin
        cabecera, con secreto equivocado, y sin secreto configurado → 404 y no
        401); a quién alcanza (por `eco_sub`, y **por correo sobre una ficha sin
        enlazar, a la que ata de paso** — que era el fallo que dejaba el botón
        del portal sin efecto); a quién no toca (la ficha con **otro** `eco_sub`,
        que es de otra persona; la del alumno de carnet QR, sin correo); y que
        el club no se queda sin dueño.
      · **`alta.spec.ts`** — `POST /sync/alta`, que era la única de las cinco
        rutas sin una sola prueba. Además de la puerta: que no crea la
        organización a ciegas, que **`owner` no viaja por esta puerta** —el
        mando de un club no se reparte de servidor a servidor—, y el invariante
        que sostiene `ensayo.sh sueltas`: **si la invitación falla, el error
        sale**. Una respuesta con forma de éxito y sin `ecoSub` es exactamente
        cómo nacería una ficha suelta.

      > **Y una que se encontró escribiéndolas, que vale para todo el
      > repositorio:** la prueba de «sin el secreto» pasaba por el motivo
      > contrario al que decía. El ayudante era
      > `function llamar(..., secreto = SECRETO)`, y **pasarle `undefined`
      > explícitamente activa el valor por defecto**: mandaba el secreto bueno y
      > recibía un 200 — una prueba en verde que no probaba nada.
      >
      > El centinela de «sin cabecera» tiene que ser **`null`**.
      > `baja-del-club.spec.ts` tenía el mismo ayudante y solo probaba el
      > secreto equivocado, así que nunca cayó en ello **pero tampoco cubría la
      > cabecera ausente**, que es otra rama: una falla la comparación, la otra
      > ni llega a compararse. Se le añadió el caso el mismo día — son **12**
      > pruebas ahora, no 11.

`[ ]` **El bloqueo por plan vencido solo llega a Membresías.** *(3 sep 2026)*
      `/sync/plan` y el barrido diario cierran el club que no está al día
      (§4.16), pero **solo allí**. En Campeonatos no hay nada equivalente, y en
      Academy tampoco.

      **En Campeonatos es a propósito, y hay que decidirlo con cuidado**: el 9
      de octubre esa aplicación no puede depender de la red, y un club cerrado
      por una columna mal puesta a mitad de un campeonato es peor que un club
      que operó un mes de más. Además ahí no hay tabla de clubes de la que
      colgar la marca (§4.16), así que el equivalente sería sobre `usuarios` y
      es otra conversación. **Después del campeonato.**

      Mientras tanto, lo que sí corta a un club vencido en Campeonatos es el
      pase: sin `app_scopes` no entra quien llegue desde el portal. Lo que
      sigue abierto es su **login propio**, igual que pasaba en Membresías.

`[ ]` **El cambio de rol solo viaja a Membresías.** *(30 ago 2026)* Campeonatos
      y Academy siguen leyendo el rol del pase **solo al crear** su fila local;
      después manda el suyo. Es lo que impide degradar en silencio al
      administrador de un campeonato en marcha (§4.7), y por eso no se cambió a
      la vez — pero significa que «cambiar el rol en todas las apps» hoy son
      dos de tres.

      Para cerrarlo hace falta el equivalente de `/sync/rol` en cada una: en
      Academy es la misma forma (Nest, mismo monorepo); en Campeonatos es Flask
      y **no puede depender de la red el 9 de octubre**, así que ahí conviene
      esperar a después del campeonato.

`[x]` ~~**Las fichas de Membresías que nacieron sin cuenta de DINAMYT.**~~
      **No queda ninguna** — `fichas_sueltas = 0` sobre 36, medido el 31 de
      agosto de 2026 con `ensayo.sh resumen`. La reconciliación enlazó las
      viejas, y el camino que las fabricaba —el `POST /users` que creaba una
      cuenta local por cada alumno— ya no existe: desde el 30 de agosto la
      cuenta nace en DINAMYT y la ficha nace enlazada (§4.4).

      **Se vigila con `ensayo.sh resumen`**, y es la comprobación que cierra el
      ensayo de §6.0: si ese número sube, algún camino volvió a crear fichas sin
      cuenta y eso es lo siguiente que hay que buscar.

      > Quedan **10 usuarios de Campeonatos sin `eco_sub`** (de 22; la
      > reconciliación enlazó 12). No hace falta hacer nada: se atan por correo
      > la primera vez que entren desde el portal (§4.13). El contador
      > `campeonatos_sueltos` los sigue.

`[x]` ~~**La reconciliación dejó los `role_*` escritos, y ahora estorban.**~~
      Limpiado el 31 de agosto de 2026. Importó el rol que cada quien tenía en
      su app a `org_members.role_membresias` y hermanas, y esas columnas
      **mandan sobre el rol general** (§4.7): eran **43 filas de 45**, o sea que
      para casi todo el mundo el rol del portal no decidía nada. Era el fallo
      que costó cuatro rondas encontrar, esperando en el resto de las filas.

      `scripts/limpiar-roles-de-app.sh` vació 34 de Membresías y 11 de
      Campeonatos. **Y el dato que hizo la decisión fácil: cero filas en «las
      que dicen algo distinto»** — no había ni un solo rol de app puesto a
      propósito, las 43 repetían el general traducido. Vaciar una de esas no
      cambia el pase (`rolParaApp` cae a la traducción); lo que cambia es que el
      portal vuelve a mandar. `con_rol_de_app_escrito` quedó en **0 de 45**.

      El guion sigue ahí y **se vuelve a correr sin miedo**: en seco por defecto,
      dentro de una transacción que se deshace, como la reconciliación (§2.8).
      Si algún día vuelve a salir un número, la segunda tabla es lo que hay que
      mirar antes del `--aplicar`.

`[x]` ~~**Cerrar la sesión en el `teardown_appcontext` de Flask.**~~ **Ya estaba
      hecho, y lo hace el framework.** *(comprobado el 3 de septiembre de 2026)*
      Era lo que quedaba del hueco anterior, y la nota daba por sentado que no
      existía porque **en `backend/` no hay ni un `teardown_appcontext`** — lo
      cual es cierto y no significa lo que parecía.

      **Lo registra `db.init_app(app)`**, en `app/__init__.py`. En
      Flask-SQLAlchemy —3.1.1 aquí— `init_app` hace, sin condición ni opción
      para desactivarlo:

      ```python
      app.teardown_appcontext(self._teardown_session)   # extension.py
      def _teardown_session(self, exc): self.session.remove()
      ```

      Está desde la versión 3.0. Así que **cada petición ya devuelve su conexión
      al pool al terminar**, y el escenario que preocupaba —una transacción
      abierta reteniendo candados hasta que la corte
      `idle_in_transaction_session_timeout`— no puede venir de ahí.

      **Y los dos caminos que corren FUERA de una petición tampoco lo abren**,
      que era la otra mitad de la pregunta y hay que mirarla aparte, porque
      `teardown_appcontext` solo salta cuando se suelta un contexto de app:

      · `respaldos.py` — su hilo usa `sqlite3` **crudo**, no la sesión de
        SQLAlchemy, y el `app_context()` que abre es momentáneo (leer la URL del
        engine al arrancar) y se cierra.
      · El cronómetro de `sockets/combate_ns.py` — `socketio.start_background_task`
        sin contexto de app, pero su `tick` **no toca la base**: estado en
        memoria y `socketio.emit`.

      > **La lección, que vale para el próximo pendiente escrito así:** «no
      > aparece en nuestro código» no es lo mismo que «no está». Una extensión
      > registra hooks en su `init_app`, y buscarlos con `grep` sobre `backend/`
      > da cero por diseño. **Escribir el `teardown` a mano habría sido código
      > redundante**, y de la peor clase: el que parece que arregla algo.

## 6.2 La cola de trabajo

*(Se llamaba «Después del campeonato (desde el 14 de octubre)» hasta el 4 de
septiembre de 2026. **Ya no espera a ninguna fecha**: se cambió la ventana de
trece días por tres —§1.5— y esta lista pasó a ser lo que se hace ahora, de
arriba abajo. Lo que la ordena es §6.0: primero lo que se usa a diario.)*

> Lo único que sigue teniendo su propia fecha es el DMARC (§3.5), porque sale de
> una cuenta y no de una preferencia. Todo lo de aquí abajo se puede empezar hoy.

`[ ]` **Las fotos, al disco.** Hoy viajan como data-URL dentro de la fila
      (`users.avatar_url`, tope ~66 KB). Estaba bien cuando el disco se borraba
      en cada despliegue; ahora hay disco propio y un Caddy que sirve archivos
      sin despertar a Node. Cuesta +33 % de peso (base64), mete todas las fotos
      en el volcado diario y obliga a recomprimir fuerte para el carnet.
      Se hace con el nombre = hash del contenido, para poder cachear «para
      siempre» sin servir la vieja. La columna ya acepta las tres formas
      (`data:`, `/media/…`, `https://`), así que la migración no rompe nada.

`[ ]` **Tokens de estilo en un solo archivo** (`packages/shared/estilos.css`) en
      vez de espejados en tres `globals.css`.

`[~]` **«Volver a mi ecosistema»** — **hecha el 2 de septiembre de 2026, y se
      adelantó a la fecha porque no cuesta nada y faltaba de verdad.** Desde el
      portal se entraba a cada app con un botón, pero de vuelta solo se llegaba
      cerrando sesión o por el enlace de un aviso de error: **salir de una app
      no puede ser la forma de llegar a la de al lado.**

      «Ir a DINAMYT» va al final del menú, pegado a «Salir» —ahí están las dos
      cosas que te sacan de esta app— y es el **mismo dibujo en Campeonatos,
      Membresías y Academy**, para que la puerta se reconozca por su forma antes
      que por su texto. Dos detalles que no son decorativos:

      · **Apunta al dashboard SIN `?redirect=`**, a propósito. Ese parámetro le
        dice al portal «cuando acabes, devuélvelo aquí», y es justo el que se
        quedaba pegado en el historial y metía en la app equivocada a quien
        quería el portal (§4.15).
      · **El icono es un SVG, no un glifo** como ⇱ o ⊞: esos no están en las
        fuentes de Android y salen como el cuadrito de «no lo tengo». Mismo
        motivo que el de salir.

      **Lo que sigue pendiente es la otra mitad:** el **selector de apps** dentro
      de cada app, para saltar de Membresías a Campeonatos sin pasar por el
      portal. Eso sí es de después del campeonato — necesita saber qué abre cada
      quien, que es la pregunta de §4.2, y no es una fila de menú — pero ya no
      espera a octubre: entra en esta misma cola.

`[x]` ~~**Cerrar sesión en una app cierra en el ecosistema.**~~ Hecho el 24 de
      agosto de 2026: `POST /auth/logout` cierra la fila de la sesión y a partir
      de ahí el pase no vale en ninguna app. Ver §4.11.

`[ ]` **Idioma y tema en el ecosystem, elegidos por la persona.** Hoy el idioma
      está clavado en el código (`'es-CO'` en cada `toLocaleDateString`, y los
      textos escritos a mano en español) y el tema es uno solo: los `globals.css`
      de las tres apps definen la paleta oscura y no hay claro ni preferencia
      del sistema.

      **La mitad del camino ya está hecha** por el trabajo de zona horaria del
      24 de agosto, y conviene aprovecharla en vez de empezar de cero:

      · `users.locale` **ya existe** y ya se llena solo: el navegador manda
        `X-Idioma` en cada login y renovación (ver §4.12). Hoy solo se guarda;
        falta leerlo.
      · `lib/fechas.ts` (las dos webs) ya toma el idioma de `navigator.language`
        en vez de tenerlo clavado. Lo que sigue clavado son los `'es-CO'`
        sueltos que quedan repartidos por las pantallas.
      · El patrón de preferencia protegida ya está resuelto y probado:
        `timezone_manual` distingue «lo detectamos» de «lo eligió». Idioma y
        tema necesitan exactamente lo mismo — copiar esa forma, no inventar otra.

      **Lo que falta de verdad:**

      · **Tema**: `users.theme` (`sistema` | `claro` | `oscuro`), tokens de color
        en `:root` con un bloque `@media (prefers-color-scheme: light)` y un
        `[data-theme]` que gane sobre él. Va **junto** con el pendiente de §6.2
        de unificar los tokens en `packages/shared/estilos.css`: hacerlo antes
        significaría escribir la paleta clara tres veces, en tres `globals.css`.
        Y hay que pintar el tema **antes del primer render** (un script pequeño
        en el `layout`), o la pantalla parpadea en oscuro antes de aclararse.
      · **Idioma**: `users.locale` como preferencia editable en el perfil, y
        sacar los textos a un diccionario. Es lo más caro de los dos —son todas
        las cadenas de cuatro aplicaciones—, así que conviene decidir primero
        **si hay a quién servírselo**: hoy todo el uso es Colombia. El orden
        barato es al revés del que parece: primero que las FECHAS y los NÚMEROS
        respeten `locale` (ya casi está), y solo después traducir los textos.

      Las dos preferencias van donde ya está «Tu hora», en el perfil del portal:
      es la pantalla de «cómo quiero ver DINAMYT» y ya existe.

> **El plan maestro** (el tablero de bloques B0…B5) vive dentro del espejo:
> `productos/campeonatos/PLAN-ECOSYSTEM-VPS.md`. **Se edita en `dinamyt-combat`**,
> nunca aquí.
