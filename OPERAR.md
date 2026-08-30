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
| `ECOSYSTEM_JWKS_URL` | membresias-api | El SSO no existe: saltas desde el portal y te vuelve a pedir la contraseña. **Vacía a propósito solo en el modo local del campeonato** |
| `NEXT_PUBLIC_ECOSYSTEM_PORTAL_URL` | membresias-web | No aparece «entrar con DINAMYT» ni el camino de vuelta |
| `PORTAL_URL` | ecosystem-api | El enlace de invitación lleva a una página que no existe, y el pie de los correos apunta a ninguna parte |
| `SMTP_HOST` | ecosystem-api | No hay correo — **y eso es un estado válido**: ver §3 |
| `CRON_SECRET` | ecosystem-api | El aviso diario de suscripciones **no existe** (la ruta responde 404). El botón del panel sigue funcionando |
| `ECOSYSTEM_SYNC_SECRET` | ecosystem-api **y** membresias-api | **El mismo valor en las dos.** Sin él, la foto, el escudo, el cinturón y la contraseña que se guardan en el portal no llegan a Membresías: el carnet se sigue imprimiendo con lo que hubiera y la contraseña vieja sigue valiendo en el club |
| `MEMBRESIAS_SYNC_URL` | ecosystem-api | Lo mismo: el portal no sabe a quién avisar. Es el origen de membresias-api (`https://membresias-api.dinamyt.org`), sin barra final |

## 1.5 Lo que nunca se hace

- **Tocar nada entre el 1 y el 13 de octubre.** Campeonato el 9, 10 y 11.
- **Desplegar sin respaldo** si la migración toca datos.
- **Exigir correo para que alguien entre.** Quien no tiene correo usable entra
  con carnet QR o PIN, y su ficha vive sin cuenta.
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

> ⚠️ **No se sube la política durante el campeonato.** Del 1 al 13 de octubre
> todo está congelado (§6.2 del plan maestro), y un `reject` mal calibrado justo
> cuando salen las invitaciones y los códigos a competidores y maestros es el
> peor momento posible para averiguarlo. El orden: `quarantine` a mediados de
> septiembre, `reject` desde el 14 de octubre.

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
| La reconciliación | — | Nadie: viene de datos que ya existían |

**Ninguno de los dos mete a nadie sin su visto bueno.** La fila de `org_members`
nace cuando alguien dice que sí, y con ella la ficha de Membresías —que se crea
sola la primera vez que entre (`lib/aprovisionar.ts` allí)—.

El super-admin sí puede colocar a alguien directo (`POST /organizations/:id/invite`):
administra el ecosistema entero y a veces tiene que. El maestro no.

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

**Afiliar un club es cosa de dos**, igual que entrar a uno (§4.4): la federación
invita desde «Mi organización» —seleccionándola en «Estructura», y ahí mismo
«Invitar un club existente»— y el **maestro del club acepta**. Nadie se lleva un
club a su federación sin que su maestro diga que sí.

> ⚠️ **Una federación creada desde `/admin` no tiene miembros**, así que no
> aparece en «Mi organización» de nadie y no hay desde dónde afiliarle clubes.
> El orden es: crearla → **darle acceso a su administrador** (el «acceso rápido»
> del panel, con rol `admin`) → esa persona ya la ve y puede invitar clubes.

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

> **Ojo con el tope si alguna vez se piensa en correo para alumnos.** Resend
> gratis da **100 al día** para todo DINAMYT. Con quinientos alumnos, un aviso
> de vencimiento al mes se come el cupo en tres días — y con él los códigos de
> verificación de las cuentas nuevas, que son los que no pueden fallar.

### Qué hace falta para que los avisos del alumno funcionen

`[x]` **Las llaves VAPID.** *(comprobado el 29 ago 2026)* Están las tres en
      `membresias-api/.env` y la pública coincide con la de la web.

`[x]` **El reloj diario** (§2.7). *(comprobado el 29 ago 2026)*
      `dinamyt-avisos.timer` está `enabled` y dispara a las 08:00; en el journal
      salen sus dos líneas cada mañana.

### Y aun así no llega nada: la tercera pieza es la gente

`[ ]` **Nadie está suscrito.** El aviso diario dice
      `{"clubes":3,"creados":12,"pushEnviados":0}` — doce avisos creados, cero
      enviados, todos los días. No es configuración: es que **nadie ha instalado
      la PWA y aceptado las notificaciones**, así que no hay destinatarios.

```bash
sudo -u postgres psql -d dinamyt -P pager=off -c "select count(*) as suscripciones from membresias.push_subscriptions;"
```

      Si sale 0, es eso. Se cierra desde el celular, no desde el servidor:
      instalar Membresías («Añadir a pantalla de inicio»), entrar y activar los
      avisos. Al día siguiente `pushEnviados` deja de ser 0.

> ⚠️ **Dónde mirar, que cuesta una confusión.** `membresias-web` **no tiene
> `.env`**: sus variables viven en **`.env.production`**. Buscar en el archivo
> equivocado hace parecer que falta la clave pública cuando está puesta. Y
> `NEXT_PUBLIC_*` se hornea **en el build**: si algún día se cambia, hay que
> reconstruir la web, no basta con reiniciarla.

## 4.7 La persona se edita en el portal; la ficha, en su app

| Dato | Dónde vive | Quién lo edita |
|---|---|---|
| Nombre, correo, documento, teléfono, nacimiento, foto, género | `ecosystem.users` | La persona, en el portal |
| Cinturón, «entrena desde», tipo de sangre, contacto de emergencia | `ecosystem` | El maestro, en «Mi organización» |
| Sede, horarios, contacto, escudo del club | `ecosystem.organizations` | Los gestores del club |
| Plan, pagos, asistencia, kiosco | `membresias` | El club, en su app |

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

## 4.7-bis Nadie se queda sin quien mande, y nadie se echa a sí mismo

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
| `GET /mi-club` · `POST /mi-club` | sesión | Ver mi club · fundar el mío |
| `GET /mias` · `PATCH /:id` · `GET /:id/members` | gestor | Lo que administro |
| `POST /:id/invite` | super-admin | Alta directa, sin preguntar (§4.4) |
| `PATCH` y `DELETE /:id/members/:userId` | gestor | Cambiar rol · quitar. **409 si te lo haces a ti mismo, o si es el último que manda** (§4.7-bis) |
| `GET /clubes` · `POST /:id/invitar-club` · `GET /invitaciones-club/mias` | varios | Federación ↔ club |

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
  entonces muere al cerrar el navegador.
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

La regla vive en los **dos** lados: el portal no le enseña el botón
(`lib/roles.ts`) y el servidor rechaza el pase (`app/espejo.py`). Esconder el
botón no es la seguridad; es no mandar a nadie a una puerta que le van a cerrar.

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

---

# PARTE 6 · Lo que queda pendiente

## 6.1 Huecos conocidos

`[ ]` **Los planes que hay no son los de verdad: el cobro será POR USUARIO.**
      *(escrito el 29 ago 2026)* Los de la base son precios fijos al mes
      —`Plan Membresías` 60.000, `Academy` 50.000, los de Campeonatos «a
      cotizar»— y **la intención siempre fue tarifa por usuario**: un club de 15
      alumnos y uno de 300 no pagan lo mismo.

      **No se toca antes del campeonato**, y va con la portada y los planes de
      la Fase 2 porque es la misma conversación. Lo que hay que resolver
      —dónde vive el precio unitario y el mínimo facturable, **qué cuenta como
      usuario** (que es lo que decide la factura), y que `total_amount` deja de
      ser una constante, lo que cambia el «esperado al mes» del panel de
      recaudo— está escrito en **§10.1 del plan maestro**, que es su sitio.

      ⚠️ Mientras tanto: **no publiques esos precios**. `/planes` los enseña, y
      hoy solo lo abre quien tiene el enlace.

`[ ]` **Una federación creada desde `/admin` nace sin nadie que la gestione.**
      El panel la crea, pero no le pone ningún miembro, y todas las pantallas de
      federación cuelgan de `org_members`: no aparece en «Mi organización» de
      nadie, así que no hay desde dónde crearle clubes ni afiliárselos. Se sale
      dándole acceso a su administrador (§4.5), pero eso hay que saberlo.

      **La tarea:** que `/admin` enseñe la estructura —de quién cuelga cada
      club, y qué clubes tiene cada federación— y permita afiliar desde ahí,
      siempre por invitación: quien manda en el club sigue decidiendo. Lo
      contrario —afiliar a dedo desde el panel— convierte al super-admin en el
      único que entiende la estructura.

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
      mediados de septiembre, y a `reject` **después del 14 de octubre**, nunca
      durante el campeonato. Ver §3.5.

`[ ]` **Un alumno desactivado en Membresías choca contra un 403 sin
      explicación.** `isActive:false` corta el paso en `abrirSesion` —login y
      SSO—, pero el portal no lo sabe (`org_members` no tiene estado) y le sigue
      enseñando «Entrar a Membresías». Cerrarlo exige que el ecosistema lea el
      estado de Membresías, o que el botón cuente lo que pasó cuando falle.

`[ ]` **Al alumno no le llega ningún aviso automático todavía — pero ya no es
      culpa del servidor.** *(comprobado el 29 ago 2026)* Las llaves VAPID están
      puestas y coinciden, y el reloj diario lleva días disparando a las 08:00.
      Lo que falta es **que alguien se suscriba**: `pushEnviados` es 0 cada día
      porque nadie ha instalado la PWA ni aceptado los avisos. Se cierra desde
      un celular, no desde el VPS. Ver §4.6.

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

`[ ]` **Los `created_at` de toda la base van cinco horas desviados en el VPS.**
      Es el mismo mecanismo de §5.1-bis, pero en las columnas que solo se
      MUESTRAN: `DEFAULT now()` escribe hora de Bogotá y Drizzle la lee como
      UTC. No rompe ninguna decisión —lo único que comparaba una de estas
      fechas contra el reloj eran las sesiones, y eso ya está arreglado—, pero
      sí desplaza lo que se pinta. Se nota de verdad en un solo caso: quien se
      registró entre medianoche y las 5 de la mañana aparece con la fecha del
      día anterior en «Miembro desde».

      El arreglo bueno es pasar esas columnas a `timestamptz`, que elimina la
      clase de fallo entera en vez de taparla. Es una migración que toca ~15
      tablas, así que va sola y con respaldo delante, no de propina en otro
      cambio.

`[x]` ~~**Campeonatos no lee el `#token=`.**~~ Hecho el 30 de agosto de 2026:
      el salto desde el portal abre sesión sin segunda contraseña, y `dinamyt-combat`
      ya está clonado en `D:\Repositorios\dinamyt-combat`. Cómo funciona y qué
      decide quién entra: §4.13.

      **Falta desplegarlo**, y ese despliegue no es solo `git pull`: necesita
      `pip install -r requirements.txt` (la nueva `cryptography`, que PyJWT
      necesita para RS256) y `ECOSYSTEM_JWKS_URL` puesta en el servicio.

`[ ]` **Quedan dos `admin@dinamyt.com` en Campeonatos**, y ese dominio es de
      otra persona. *(revisado el 29 ago 2026)* **El del código ya no está**:
      `backend/app/config.py:64` dice `.org` desde el 19 de agosto —lo arregló
      el barrido de §1.5 del plan maestro, que eran ocho apariciones y no dos—.
      Lo que sobrevive es documentación que la gente copia y pega:
      `backend/.env.example:32` y `INICIAR-LOCAL.md:11`. Se edita en
      `dinamyt-combat`, no en el espejo.

`[x]` ~~**Campeonatos ejecuta DDL al arrancar**~~ — el bloqueo, cerrado el 29 de
      agosto de 2026 (`7a740cd` en `dinamyt-combat`, desplegado y espejado).
      Tiró el servicio una mañana entera; el relato y cómo se reconoce están en
      §5.1-ter. El `db.session.commit()` suelta el candado y el
      `SET LOCAL lock_timeout = '5s'` hace visible cualquier recaída.

`[ ]` **Cerrar la sesión en el `teardown_appcontext` de Flask.** Es lo que queda
      del hueco anterior. Sin ello, el DDL ya no se bloquea, pero una petición
      que deje su transacción abierta sigue reteniendo candados hasta que el
      `idle_in_transaction_session_timeout` la corte. Es higiene, no urgencia.

## 6.2 Después del campeonato (desde el 14 de octubre)

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

`[ ]` **«Volver a mi ecosistema»** y el selector de apps dentro de cada app.

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
