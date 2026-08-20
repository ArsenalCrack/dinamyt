# DINAMYT — Que la gente que ya existe tenga cuenta, paso a paso

> **Qué consigue esto.** Que todo el que hoy entra a Membresías o a Campeonatos
> abra `https://dinamyt.org`, escriba **su mismo correo y su misma contraseña**,
> y encuentre su cuenta ya creada, con su club y su rol. Sin registrarse otra
> vez, sin esperar a ningún correo y sin que nadie pierda nada.
>
> Es el bloque **B3** del plan maestro (§2.4 «Qué pasa con el club y los
> usuarios que YA existen» y §4 «Identidad única»).

**Antes de empezar, dos cosas que conviene tener claras:**

| | |
|---|---|
| ⏱ **Cuánto dura** | 40 minutos, casi todos de lectura del ensayo |
| 🔁 **Se puede repetir** | El guion es idempotente: correrlo dos veces no crea nada nuevo |
| ↩️ **Marcha atrás** | Sí, y está escrita al final. Nada se borra ni se desactiva |
| ⚠️ **Qué NO hace todavía** | Campeonatos **sigue con su login propio**. El SSO de Campeonatos es el bloque C (§4.2), y no está |

---

## Lo que hay que entender antes de tocar nada

**La cuenta no es la ficha.** La cuenta es la persona (correo, contraseña,
documento) y vive **una sola vez** en `ecosystem.users`. La ficha es lo que esa
persona es dentro de un producto (cinturón, pagos, asistencias · categoría,
inscripciones) y vive en cada app. Esto no mueve ninguna ficha: crea la cuenta
que faltaba y **la enlaza** con las fichas que ya existen.

**El enlace se guarda en dos columnas nuevas:**

```
ecosystem.users.id  ←── membresias.users.eco_sub
                    ←── campeonatos.usuarios.eco_sub

ecosystem.organizations.id  ←── membresias.orgs.eco_org_id
```

Ningún `id` de ninguna app cambia. Eso es deliberado: los de Membresías los
referencian ocho tablas y todas sus políticas de RLS.

**La contraseña se hereda.** Membresías hashea con `bcryptjs` a 10 rondas y
Campeonatos con el `bcrypt` de Python a 10 rondas. Es **el mismo algoritmo al
mismo costo** que verifica el ecosistema, así que el hash se copia tal cual y la
contraseña de siempre sigue sirviendo. En el primer login correcto, el
ecosistema la vuelve a hashear a su propio costo y la cuenta deja de depender
del hash importado.

> Esto **corrige** lo que decía §2.4 del plan («la contraseña vieja no se migra
> porque los hashes son de esquemas y costos distintos»). Con los tres archivos
> delante, los esquemas y los costos resultaron ser los mismos. Gracias a eso,
> **B3 ya no depende de B2**: la gente entra sin que el correo funcione.

**Lo que NO se hereda, a propósito:**

- **El superadmin.** Un superadmin del ecosistema manda sobre las tres apps y
  sobre todos los clubes. El guion los detecta, los imprime y no concede nada.
- **Los datos de una cuenta que ya existía.** Solo rellena huecos (teléfono,
  nacimiento, contacto de emergencia) cuando están en NULL.

---

# PASO 1 · El respaldo ⏱ 3 min

No es opcional. Esto escribe en los tres esquemas a la vez.

```bash
sudo -u postgres pg_dump -Fc dinamyt | sudo tee /var/backups/dinamyt-antes-de-identidad.dump > /dev/null
sudo ls -lh /var/backups/dinamyt-antes-de-identidad.dump
```

✅ El archivo pesa algo. Si pesa cero, no sigas.

> **Por qué `| sudo tee` y no `> /var/backups/...`.** El `>` lo ejecuta TU
> shell, no `sudo`: con la flecha, quien intenta escribir en `/var/backups`
> eres tú, y esa carpeta es de root — `Permission denied`. Con `tee` detrás de
> `sudo`, quien escribe es root, que sí puede. Es el mismo motivo por el que
> el respaldo diario del cron sí funciona: lo corre root.

---

# PASO 2 · Traer el código nuevo ⏱ 10 min

```bash
cd /srv/dinamyt && git pull
pnpm install --frozen-lockfile
pnpm --filter @dinamyt/shared        build
pnpm --filter @dinamyt/ecosystem-api build
```

> ⚠️ **Al reiniciar, las sesiones abiertas dejan de valer y hay que volver a
> entrar una vez.** Los tokens de sesión pasan a llevar emisor propio, que es lo
> que impide que un enlace de invitación —de siete días, y que viaja por
> WhatsApp— sirva como sesión. Hoy casi no hay sesiones abiertas: es el momento
> barato de pagarlo.

Y la migración que hace posible todo lo demás:

```bash
cd /srv/dinamyt/apps/ecosystem-api
pnpm db:migrate
```

✅ Tiene que aplicar `0004_identidad_importada`. Esa migración hace cuatro cosas:

| Cambio | Por qué |
|---|---|
| `users.document_id` pasa a ser opcional | Ni Membresías ni Campeonatos guardan documento. Exigirlo dejaba fuera a todo el mundo |
| `users.password_hash` pasa a ser opcional | Una cuenta invitada por el maestro existe antes de tener contraseña |
| `users.origen` y `users.password_origen` | De dónde salió la cuenta y de dónde su contraseña |
| `org_members.role_membresias` / `_campeonatos` / `_academy` | La misma persona es `student` en Membresías y `judge` en Campeonatos. Con un solo rol había que elegir cuál de las dos mentir |
| `organizations.slug` | Cruzar clubes por un nombre corto y estable |

⚠️ **La migración va ANTES de reiniciar, y no es opcional.** El código nuevo lee
columnas que esa migración crea (`org_members.role_membresias` y compañía): si
reinicias sin migrar, **todos los inicios de sesión fallan**. Mientras no
reinicies, el servicio sigue con el código viejo y la base migrada no le
molesta, así que este orden es el seguro.

## 2.1 Tres variables nuevas

```bash
sudo nano /srv/dinamyt/apps/ecosystem-api/.env
```

```bash
TRUST_PROXY_HOPS=2
PORTAL_URL=https://dinamyt.org
MAIL_DAILY_MAX=90
```

| Variable | Para qué |
|---|---|
| `TRUST_PROXY_HOPS` | Detrás de Caddy y Cloudflare hay **dos** saltos. Sin esto, la API ve siempre la IP del proxy y su limitador de intentos mete a todo el mundo en el mismo cubo: diez inicios de sesión por minuto **para la plataforma entera**. Membresías y Campeonatos ya la tenían; el ecosystem no la leía hasta esta versión |
| `PORTAL_URL` | La base del enlace de invitación. Si apunta mal, el enlace lleva a una página que no existe |
| `MAIL_DAILY_MAX` | Tope propio de correos al día (Anexo E de `VPS-PASO-A-PASO.md`) |

## 2.2 Reiniciar

```bash
sudo systemctl restart dinamyt-id
sudo journalctl -u dinamyt-id -n 30 --no-pager
```

✅ Arranca sin errores. Entra al portal y comprueba que puedes iniciar sesión.

✅ **La comprobación del proxy**: entra desde el celular con datos móviles y mira
que en el registro aparezca tu IP de verdad, no una de Cloudflare (`104.x`,
`172.6x`, `188.114.x`).

---

# PASO 3 · El ensayo en seco ⏱ 5 min

**Hace todo el trabajo de verdad y deshace la transacción al final.** Lo que
imprime es lo que va a pasar, no una estimación.

```bash
cd /srv/dinamyt/apps/ecosystem-api
sudo -u postgres RECONCILIACION_DATABASE_URL=postgresql:///dinamyt \
  node scripts/reconciliar-identidades.mjs --informe /root/ensayo-identidad.json
```

> **Se conecta como `postgres` y no con el usuario de una app.** Membresías y
> Campeonatos tienen RLS en modo FORCE: un rol normal vería solo una parte de
> las filas y el guion daría por reconciliado lo que nunca vio. El guion lo
> comprueba y se planta si no es superusuario.

Vas a ver algo así:

```
· ENSAYO EN SECO (no se escribió nada)   1.4 s

  CLUBES
    1  creados en el ecosistema
    1  enlazados con uno que ya existía
    2  de Campeonatos SIN cruzar ← míralos abajo y vuelve con --crear-clubes-campeonatos

  PERSONAS
   37  cuentas creadas
    1  enlazadas con una cuenta que ya existía
    2  creadas SIN contraseña utilizable
    3  fichas sin correo válido (se quedan sin cuenta: entran por QR/PIN)
    1  superadmins detectados (NO se concedieron)

  PERTENENCIA
   35  filas nuevas en org_members
    0  filas completadas con el rol de una app
    3  personas sin club al que enlazarlas
```

---

# PASO 4 · Leer el ensayo antes de aplicarlo ⏱ 10 min

Cuatro listas piden una decisión tuya. **Ninguna es un error**; son cosas que el
guion no puede decidir solo.

### 4.1 Clubes de Campeonatos que no cruzaron

En Campeonatos el club es **texto escrito a mano** dentro de
`usuarios.clubes`. El guion lo cruza por nombre normalizado (sin tildes, sin
dobles espacios, sin mayúsculas) contra los clubes que ya existen. Lo que no
case sale en la lista.

Mira los nombres. Si «DOJANG SUR» y «Dojang Sur Cali» son **el mismo club**,
arréglalo en Campeonatos antes de aplicar:

```sql
-- entra con: sudo -u postgres psql -d dinamyt
UPDATE campeonatos.usuarios
   SET clubes = '[{"nombre":"DOJANG SUR","ciudad":"Cali","pais":"Colombia"}]'
 WHERE email = 'elmaestro@ejemplo.com';
```

Si de verdad son clubes distintos que todavía no están en el ecosistema, se
crean en el paso 5 con `--crear-clubes-campeonatos`.

### 4.2 Fichas sin correo válido

Se quedan **sin cuenta**, y está bien: es la ficha pura del plan (§2.4). Entran
a clase por carnet QR o PIN, como hoy. Dale la lista al maestro por si alguna
tiene correo y estaba mal escrito.

### 4.3 Creadas sin contraseña utilizable

Su hash no es un bcrypt legible. La cuenta se crea igual; podrán entrar cuando
haya correo (B2) y pongan una. Suelen ser cuentas viejas o sembradas a mano.

### 4.4 Superadmins detectados

El guion los imprime y **no concede nada**. Cuando estés seguro:

```sql
UPDATE ecosystem.users SET is_super_admin = true WHERE email = 'tucorreo@dinamyt.org';
```

---

# PASO 5 · Aplicarlo de verdad ⏱ 2 min

```bash
cd /srv/dinamyt/apps/ecosystem-api
sudo -u postgres RECONCILIACION_DATABASE_URL=postgresql:///dinamyt \
  node scripts/reconciliar-identidades.mjs --aplicar \
  --informe /root/reconciliacion-$(date +%F).json
```

Añade `--crear-clubes-campeonatos` **solo si** ya revisaste la lista del paso
4.1 y quieres que esos clubes se creen.

✅ Tiene que decir `✔ APLICADO` y los números del ensayo. Si algo falla, **no se
escribe nada**: la transacción se deshace entera.

---

# PASO 6 · Comprobar ⏱ 5 min

```bash
sudo -u postgres psql -d dinamyt
```

```sql
-- 1. Cuántas cuentas hay y de dónde salieron
SELECT origen, count(*) FROM ecosystem.users GROUP BY origen ORDER BY 2 DESC;

-- 2. Nadie se quedó sin enlazar (las dos consultas deben dar 0,
--    salvo las fichas sin correo del paso 4.2)
SELECT count(*) FROM membresias.users  WHERE eco_sub IS NULL;
SELECT count(*) FROM campeonatos.usuarios WHERE eco_sub IS NULL AND eliminado_at IS NULL;

-- 3. Ningún correo duplicado
SELECT lower(email), count(*) FROM ecosystem.users GROUP BY 1 HAVING count(*) > 1;

-- 4. Los clubes tienen su espejo
SELECT name, eco_org_id IS NOT NULL AS enlazado FROM membresias.orgs;

-- 5. Los roles por app llegaron
SELECT role, role_membresias, role_campeonatos, count(*)
  FROM ecosystem.org_members GROUP BY 1,2,3 ORDER BY 4 DESC;
```

**Y la prueba que de verdad importa**, con tu propio usuario:

1. Abre `https://dinamyt.org` en una ventana de incógnito.
2. Entra con tu correo y **la contraseña que usas hoy en Membresías**.
3. Tiene que entrar y mostrar tu club.
4. Salta a Membresías desde el portal: tiene que reconocerte sin volver a pedir
   nada.

> Si alguien intenta **registrarse** con un correo ya importado, el portal ahora
> le dice *«Tu cuenta ya está creada en DINAMYT. Inicia sesión con este mismo
> correo y la contraseña que usas en Membresías»* en vez del antiguo «ya existe
> una cuenta con ese correo», que se leía como un error ajeno.

---

# PASO 7 · Desplegar Membresías con el espejo ⏱ 10 min

Membresías ya cruzaba por correo, así que el SSO funcionaba desde el paso 5.
Esto hace que reconozca a la persona **por su cuenta** y no solo por el correo
—que se puede cambiar desde el portal—.

```bash
cd /srv/membresias && git pull
pnpm install --frozen-lockfile
pnpm --filter @dinamyt/membresias-db  build
pnpm --filter @dinamyt/membresias-api build
pnpm --filter @dinamyt/membresias-web build
cd apps/membresias-api && pnpm db:migrate
sudo systemctl restart membresias-api membresias-web
```

✅ La migración `0015_espejo_ecosystem` aplica sin ruido aunque el guion ya
hubiera añadido las columnas: están escritas con `IF NOT EXISTS` justo por eso.

```bash
sudo journalctl -u membresias-api -n 30 --no-pager
```

✅ Arranca sin errores y el login propio de Membresías **sigue funcionando**
(es la marcha atrás del SSO, y se conserva a propósito).

---

# Marcha atrás

**Lo primero: nada se borró.** Las fichas, los pagos, las asistencias y los
campeonatos están intactos — esto solo añadió cuentas y enlaces.

**Deshacer la reconciliación** (solo si hace falta de verdad):

```sql
BEGIN;

-- 1. Quitar las pertenencias de las cuentas importadas
DELETE FROM ecosystem.org_members
 WHERE user_id IN (SELECT id FROM ecosystem.users WHERE origen LIKE 'importado-%');

-- 2. Quitar las cuentas importadas (las que nacieron en el portal NO se tocan)
DELETE FROM ecosystem.users WHERE origen LIKE 'importado-%';

-- 3. Soltar los enlaces
UPDATE membresias.users     SET eco_sub = NULL;
UPDATE campeonatos.usuarios SET eco_sub = NULL;
UPDATE membresias.orgs      SET eco_org_id = NULL;

-- Mira los números antes de confirmar
SELECT count(*) FROM ecosystem.users;
COMMIT;   -- o ROLLBACK si algo no cuadra
```

Los clubes creados en `ecosystem.organizations` se quedan; borrarlos solo tiene
sentido si nadie los usa ya (`SELECT * FROM ecosystem.org_members WHERE org_id = ...`).

**Si todo se torció**, el respaldo del paso 1:

```bash
sudo -u postgres dropdb dinamyt && sudo -u postgres createdb dinamyt
sudo -u postgres pg_restore -d dinamyt /var/backups/dinamyt-antes-de-identidad.dump
```

---

# Lo que queda después de esto

| Bloque | Qué falta | Dónde está descrito |
|---|---|---|
| **B2** | Correo (Resend + SPF/DKIM). Sin él no hay registro nuevo por correo ni «olvidé mi contraseña» — pero los importados **ya entran** | §5 del plan maestro |
| **B2 · deuda** | El día que haya correo, **pedirle verificación de verdad a los importados**: `SELECT email FROM ecosystem.users WHERE origen LIKE 'importado-%'`. Su correo se dio por bueno porque llevan meses usándolo para entrar a su app, no porque nadie lo comprobara; si el maestro escribió mal uno, esa dirección es de un desconocido que el día de mañana podría pedir «olvidé mi contraseña» | `users.origen` existe para esto |
| **C1–C7** | Campeonatos: verificador JWKS, guards, espejo `eco_sub` en el modelo, retirar su login, Socket.IO, frontend. **El repo `dinamyt-combat` ni siquiera está clonado en el PC de trabajo** | §4.2 del plan maestro |
| **M1–M4** | Membresías: que su botón «invitar» llame al ecosystem, código de club, bandeja de solicitudes | §4.3 del plan maestro |
| **§4.1** | Falta el **código de club** (camino C). Lo demás está: `POST /organizations/:id/invite` crea la cuenta y manda el enlace, `POST /auth/set-password` lo canjea, el mailer habla SMTP genérico y `GET /organizations/:id/members` ya existía | §4.1 del plan maestro |

> **El modo local de Campeonatos no se toca nunca.** El día del campeonato, sin
> internet, no hay ecosistema al que preguntar: la app tiene que arrancar y
> funcionar con `ECOSYSTEM_JWKS_URL` vacía. Con un campeonato el 9 de octubre,
> eso no es una preferencia: es la marcha atrás.

---

# Anexo · Ensayar en tu PC, sin servidor

El guion trae su propio banco de pruebas: levanta un PostgreSQL de verdad
compilado a WebAssembly, le aplica las migraciones reales, le siembra los tres
censos con los casos que duelen —quien está en las dos apps, quien no tiene
correo, el hash que no es bcrypt, el club escrito a mano que no cruza— y corre
la reconciliación **dos veces** para demostrar que la segunda no hace nada.

```bash
pnpm --filter @dinamyt/ecosystem-api reconciliar:ensayo
```

No necesita red ni base de datos. Si eso pasa entero, el guion está listo para
el ensayo en seco contra los datos de verdad.
