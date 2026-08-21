# DINAMYT — Poner en marcha el puente de altas, paso a paso

> **Qué consigue esto.** Que un alumno pueda existir UNA vez: su maestro lo da
> de alta en el portal (o él entra con el código del club), y su ficha aparece
> sola en Membresías la primera vez que entre. Y que su foto y su cinturón —que
> hasta hoy se quedaban en Membresías— se vean también en el ecosistema.
>
> Es el bloque **M** del plan maestro (§4.3), y de paso cierra la mitad de B3
> que faltaba por correr en el servidor.

| | |
|---|---|
| ⏱ **Cuánto dura** | ~35 minutos, casi todos de espera de compilaciones |
| 🔁 **Se puede repetir** | Sí. Las migraciones y la reconciliación son idempotentes |
| ↩️ **Marcha atrás** | Sí, está al final. Nada se borra |
| ⚠️ **Qué NO hace** | Campeonatos sigue con su login propio (bloques C1–C7) |

---

## 🖥️ 💻 Antes de nada: qué paso se corre en qué máquina

**Se salta de una máquina a otra, y ese es el error fácil de cometer.** El PASO
1 empuja el código a GitHub, así que tiene que salir de donde ESTÁ el código —
tu PC—; los demás tocan el servidor. Si corres el PASO 1 dentro del SSH, la
respuesta es `cd: /d/Repositorios/…: No such file or directory` (no pasa nada:
el `cd` falla y el `&&` corta la cadena, así que no se ejecuta nada más).

| Paso | Dónde | Qué hace |
|---|---|---|
| **0** · Respaldo | 🖥️ **VPS** | Volcado de la base |
| **1** · Empujar | 💻 **Tu PC** | Sube los dos repos a GitHub |
| **2** · Ecosistema | 🖥️ **VPS** | `git pull`, compilar, migrar, reiniciar |
| **3** · Membresías | 🖥️ **VPS** | Igual, pero migra sola al arrancar |
| **4** · Reconciliación | 🖥️ **VPS** | Fotos, cinturones y enlaces |
| **5** · Comprobar | 🖥️ VPS + 🌐 navegador | Que quedó de verdad |

> Lo más cómodo es tener **dos terminales abiertas** a la vez: una con el SSH
> puesto y otra en tu PC. Así no hay que entrar y salir.

---

## Lo que cambia, en una tabla

| Dónde | Qué | Por qué importa |
|---|---|---|
| `ecosystem` · migración `0005` | Código de club, tabla de solicitudes, delegación y visibilidad pública del club | Quien se registra solo ya tiene forma de llegar a un club |
| `ecosystem` · migración `0006` | `users.gender` | Campeonatos separa las llaves con este dato y el ecosistema no lo tenía |
| `membresias` · migración `0016` | `password_hash` deja de ser obligatorio | Sin esto, la ficha que nace del SSO no se puede crear |
| Reconciliación | Copia también **foto** y **cinturón** | Era la causa de que la misma persona saliera con su cara en una app y con sus iniciales en la otra |

---

# 🖥️ PASO 0 · El respaldo ⏱ 3 min

> **En el VPS** (`ssh dinamyt@80.190.78.70`).

No es opcional: esto escribe en dos esquemas y borra una restricción `NOT NULL`.

```bash
sudo -v && sudo -u postgres pg_dump -Fc dinamyt > ~/respaldo-$(date +%F).dump && sudo mv ~/respaldo-$(date +%F).dump /var/backups/ && sudo ls -lh /var/backups/
```

✅ El archivo pesa algo. Si pesa cero, no sigas.

> Si se queda colgado, **no es lento: está haciendo fila detrás de un candado**.
> Ver `REGLAS-Y-COMANDOS.md` §3.1 — casi siempre es Campeonatos, y se resuelve
> parándolo un minuto.

---

# 💻 PASO 1 · Empujar desde tu PC ⏱ 5 min

> **En TU PC, no en el servidor.** Si acabas de hacer el respaldo, esta parte NO
> va en esa misma ventana: abre otra terminal (o escribe `exit` para salir del
> SSH). Ahí dentro `D:\Repositorios` no existe.

**El VPS clona de GitHub, no de tu disco.** Son dos repositorios y el orden no
importa, pero los dos tienen que estar arriba antes de tocar el servidor.

> Las rutas de abajo son de **Git Bash** (`/d/Repositorios/…`). En PowerShell se
> escriben `D:\Repositorios\…` y los comandos se encadenan igual con `&&`.

### 1.1 Membresías

```bash
cd /d/Repositorios/dinamyt-membresias && git add -A && git status --short
```

```bash
cd /d/Repositorios/dinamyt-membresias && git commit -m "feat(altas): la ficha que nace del ecosistema, y listas que se pueden recorrer" && git push
```

### 1.2 El monorepo

```bash
cd /d/Repositorios/dinamyt && git add -A && git status --short
```

```bash
cd /d/Repositorios/dinamyt && git commit -m "feat(altas): codigo de club, solicitudes, genero y suscripciones que se pueden cancelar" && git push
```

### 1.3 Poner al día el espejo (opcional, pero hazlo)

`productos/membresias` es un **espejo**. Si no se sincroniza, el monorepo
guarda una versión de Membresías anterior a estos cambios.

```powershell
cd D:\Repositorios\dinamyt; .\scripts\sync-apps.ps1 -Producto membresias
```

---

# 🖥️ PASO 2 · El ecosistema en el servidor ⏱ 12 min

> **De vuelta al VPS.** Si cerraste la sesión para el paso anterior, entra otra
> vez:

```bash
ssh dinamyt@80.190.78.70
```

## 2.1 Traer y compilar

```bash
cd /srv/dinamyt && git pull && pnpm install --frozen-lockfile && pnpm --filter @dinamyt/shared build && pnpm --filter @dinamyt/ecosystem-api build && pnpm --filter @dinamyt/ecosystem-portal build
```

## 2.2 Migrar — **ANTES de reiniciar**

```bash
cd /srv/dinamyt/apps/ecosystem-api && pnpm db:migrate
```

✅ Tiene que aplicar `0005_puente_de_altas` y `0006_genero_de_la_persona`.

> **Por qué este orden y no el otro.** El código nuevo lee columnas que crea la
> migración. Si reinicias antes de migrar, **todos los inicios de sesión
> fallan**. Al revés no pasa nada: mientras no reinicies, el servicio sigue con
> el código viejo y la base migrada no le molesta.

## 2.3 Reiniciar

```bash
sudo systemctl restart dinamyt-id dinamyt-portal && sudo systemctl status dinamyt-id --no-pager
```

---

# 🖥️ PASO 3 · Membresías en el servidor ⏱ 8 min

**Membresías es la excepción: aplica sus migraciones ella sola al arrancar**, y
si fallan no arranca. Aquí reiniciar ES migrar.

```bash
cd /srv/membresias && git pull && pnpm install --frozen-lockfile && pnpm --filter @dinamyt/membresias-db build && pnpm --filter @dinamyt/membresias-api build && pnpm --filter @dinamyt/membresias-web build
```

```bash
sudo systemctl restart membresias-api membresias-web && sudo journalctl -u membresias-api -n 20 --no-pager
```

✅ En el registro tiene que verse que aplicó `0016_ficha_sin_contrasena`. Si la
API **no arranca**, es que la migración falló: ese es el aviso, no un misterio.

> **Comprueba que el SSO sigue configurado.** Sin `ECOSYSTEM_JWKS_URL` en
> `membresias-api`, `/auth/sso` responde 404 y no nace ninguna ficha — el modo
> autónomo, que es correcto para el día del campeonato pero no para hoy:
> ```bash
> grep ECOSYSTEM_JWKS_URL /srv/membresias/apps/membresias-api/.env
> ```

---

# 🖥️ PASO 4 · La reconciliación ⏱ 5 min

Esto es lo que trae las fotos y los cinturones al ecosistema, y lo que enlaza a
quien ya existía en las dos apps.

## 4.1 El ensayo (no escribe nada)

```bash
cd /srv/dinamyt/apps/ecosystem-api && sudo -u postgres RECONCILIACION_DATABASE_URL=postgresql:///dinamyt node scripts/reconciliar-identidades.mjs --informe /tmp/ensayo.json
```

Hace **todo** el trabajo y deshace la transacción. Lee el resumen antes de
seguir:

```bash
python3 -c "import json;d=json.load(open('/tmp/ensayo.json'));p=d['personas'];print('cuentas nuevas:',len(p['creadas']));print('enlazadas:',len(p['enlazadas']));print('cinturones importados:',len(p['cinturonesImportados']));print('sin correo:',len(p['sinCorreo']));print('superadmins detectados:',[x['correo'] for x in p['superadminsDetectados']]);print('clubes de campeonatos sin cruzar:',[c['nombre'] for c in d['clubes']['campeonatosSinCruce']])"
```

⚠️ **Mira `clubes.campeonatosSinCruce` antes de aplicar.** Son clubes que solo
conoce Campeonatos y cuyo nombre no cuadró con ninguno existente. No se
inventan: si alguno es un club que YA existe escrito de otra forma, corrige el
nombre primero — o se creará duplicado.

## 4.2 Aplicar

```bash
cd /srv/dinamyt/apps/ecosystem-api && sudo -u postgres RECONCILIACION_DATABASE_URL=postgresql:///dinamyt node scripts/reconciliar-identidades.mjs --aplicar --informe /tmp/aplicado.json
```

> Para crear también los clubes que solo conoce Campeonatos, añade
> `--crear-clubes-campeonatos`. **Solo después de revisar la lista de arriba.**

---

# 🖥️🌐 PASO 5 · Comprobar que quedó ⏱ 5 min

No con la sensación de que funciona:

### 5.1 Las fotos y los cinturones llegaron

```bash
sudo -u postgres psql -d dinamyt -c "select (select count(*) from ecosystem.users where avatar_url is not null) as con_foto, (select count(*) from ecosystem.user_disciplines where current_grade is not null) as con_cinturon;"
```

### 5.2 El maestro tiene código de club

Entra a `https://dinamyt.org/mi-organizacion` con una cuenta de maestro. Tiene
que aparecer **«Entrada al club»** con el botón «Ver el código de mi club».

### 5.3 El camino completo, con dos navegadores

1. En una ventana normal: el maestro pulsa «Ver el código de mi club».
2. En una ventana de incógnito: registra una cuenta nueva en
   `https://dinamyt.org/registro`. Tiene que pedir **documento, teléfono,
   nacimiento y género** — y el calendario tiene que abrir en los AÑOS.
3. Con esa cuenta, en el dashboard: escribe el código y pulsa «Pedir entrar».
4. En la ventana del maestro: recarga `/mi-organizacion`. La solicitud está en
   **«Piden entrar (1)»**. Acéptala como alumno.
5. Con la cuenta nueva: **cierra sesión y vuelve a entrar** (el token se emite
   al iniciar sesión: sin esto no lleva el club todavía) y pulsa «Entrar a
   Membresías».

✅ Entra a Membresías **sin escribir ninguna contraseña** y sin que nadie lo
haya dado de alta ahí. Compruébalo:

```bash
sudo -u postgres psql -d dinamyt -c "select email, role, eco_sub is not null as enlazado, password_hash is null as sin_contrasena_propia from membresias.users order by created_at desc limit 5;"
```

La fila nueva sale con `enlazado = t` y `sin_contrasena_propia = t`. Eso es lo
correcto: su contraseña vive en el portal, una sola vez.

### 5.4 Las suscripciones ya se pueden manejar

En `/admin` del portal, sobre una suscripción: el desplegable de estado
(Activa · Por revisar · Suspendida · Vencida), «Editar» (plan, fechas, monto,
notas y abonos) y «Borrar».

> **Borrar una suscripción con abonos está prohibido a propósito**, y el
> servidor lo dice: no hay tabla de pagos aparte, el dinero vive en
> `paid_amount`, así que borrar la fila borraría el único registro de que
> entró. Para eso está *Suspendida*.

---

# Marcha atrás

**Nada de esto borra datos.** Las tres migraciones solo añaden columnas y una
tabla, salvo `0016`, que **quita** una restricción — deshacerla solo es posible
si ninguna ficha nació sin contraseña todavía.

### Volver el código atrás sin tocar la base

```bash
cd /srv/dinamyt && git log --oneline -5
```

```bash
cd /srv/dinamyt && git checkout EL_COMMIT_ANTERIOR && pnpm install --frozen-lockfile && pnpm --filter @dinamyt/ecosystem-api build && pnpm --filter @dinamyt/ecosystem-portal build && sudo systemctl restart dinamyt-id dinamyt-portal
```

Las columnas nuevas se quedan y no molestan: el código viejo no las lee.

### Cerrar la entrada por código sin desplegar nada

```bash
sudo -u postgres psql -d dinamyt -c "update ecosystem.organizations set join_code = null;"
```

Quien ya entró sigue dentro; nadie más puede pedirlo.

### Deshacer la reconciliación

No hace falta un guion: es idempotente y solo rellena huecos. Si hay que
volver del todo, se restaura el respaldo del PASO 0:

```bash
sudo -u postgres pg_restore -d dinamyt --clean --if-exists /var/backups/respaldo-FECHA.dump
```

---

# Lo que queda pendiente después de esto

`[ ]` **Campeonatos (C1–C7).** Sigue con login propio y `dinamyt-combat` ni
      siquiera está clonado en el PC. Es el bloque grande que falta.
`[ ]` **Las fotos, servidas por ruta.** Membresías nunca manda la imagen en un
      listado: devuelve la dirección de una ruta con ETag. El portal todavía no
      puede hacerlo porque autentica con Bearer en la cabecera y un `<img>` no
      manda cabeceras. Primero hay que darle al portal una cookie de sesión;
      hasta entonces, paginar es lo que evita el problema.
`[ ]` **El directorio público de clubes.** La casilla `is_public` ya existe y ya
      se puede marcar desde la ficha del club; falta la página que los liste.
`[ ]` **Correo (B2).** Sin él, la invitación del maestro devuelve el enlace para
      mandarlo por WhatsApp, que es un estado válido pero no el bueno.
