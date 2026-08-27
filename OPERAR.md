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
| **Campeonatos** | `dinamyt-combat` (sin clonar todavía) | **NUNCA** en `productos/campeonatos` |

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

El segundo levanta un PostgreSQL de verdad (en WebAssembly), le aplica las
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

---

# PARTE 3 · El correo

## 3.1 Sin `SMTP_HOST`, la función de correo NO EXISTE

No se rompe: no existe. Es el mismo criterio que el SSO y `CRON_SECRET`, y es lo
que permitió que el ecosistema estuviera en producción sin proveedor contratado.
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

`[ ]` **Las llaves VAPID.** Sin `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` en
      `membresias-api` —y la pública también en `membresias-web`— `enviarPush`
      devuelve `false` y no sale nada. Se generan con
      `pnpm --filter @dinamyt/membresias-api gen:vapid`.

`[ ]` **El reloj diario** (§2.7). Sin él, los avisos solo existen cuando el
      maestro pulsa «Generar avisos» en su panel.

Mientras las dos cosas no estén, lo único que ocurre es el botón del maestro, y
lo único que genera es el aviso in-app. Es un estado válido —nada se rompe— pero
conviene saber que es el que hay.

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
| `POST /logout` | sesión | Cierra ESTA sesión de verdad, en el servidor |
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

---

# PARTE 6 · Lo que queda pendiente

## 6.1 Huecos conocidos

`[ ]` **Un alumno desactivado en Membresías choca contra un 403 sin
      explicación.** `isActive:false` corta el paso en `abrirSesion` —login y
      SSO—, pero el portal no lo sabe (`org_members` no tiene estado) y le sigue
      enseñando «Entrar a Membresías». Cerrarlo exige que el ecosistema lea el
      estado de Membresías, o que el botón cuente lo que pasó cuando falle.

`[ ]` **Al alumno no le llega ningún aviso automático todavía**: faltan las
      llaves VAPID y el reloj diario. Ver §4.6 — están los dos comandos.

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

`[ ]` **Campeonatos no lee el `#token=`.** Su `/login` existe, pero el salto
      desde el portal aterriza en su formulario en vez de iniciar sesión. Se
      edita en `dinamyt-combat`, que todavía no está clonado.

`[ ]` **`backend/app/config.py:64` de Campeonatos** trae `admin@dinamyt.com`
      por defecto, y ese dominio es de otra persona. Debe ser `.org`.

`[ ]` **Campeonatos ejecuta DDL al arrancar** (§5.1). Dos costuras lo cierran:
      un `SET lock_timeout = '5s'` antes del DDL, y cerrar la sesión en el
      `teardown_appcontext` de Flask.

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
