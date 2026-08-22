# DINAMYT — Montar el VPS, paso a paso

> Guía para alguien que **nunca ha administrado un servidor**. Cada paso dice qué
> escribir, qué tiene que salir en pantalla, y qué hacer si sale otra cosa.
>
> Es la ejecución del bloque **B1** de
> `productos/campeonatos/PLAN-ECOSYSTEM-VPS.md` (§3, §6, §7). Ese archivo es el
> plan; este es el manual de manos.
>
> **Fecha tope de B1: 29 de agosto.** El campeonato es el 9, 10 y 11 de octubre.

---

## Los datos de tu servidor

| Dato | Valor |
|---|---|
| IP | `80.190.78.70` |
| Usuario inicial | `root` |
| Contraseña inicial | La del correo de Contabo |
| Latencia desde tu PC | **85 ms** — comprobada, correcta (está en EE. UU.) |

---

## Antes de empezar: qué es cada pieza

No hace falta entenderlo a fondo, pero saber para qué sirve cada cosa evita pegar
comandos a ciegas.

| Pieza | Para qué sirve |
|---|---|
| **SSH** | La forma de escribir comandos en un computador que está lejos. Una ventana negra en tu PC conectada al servidor. |
| **`sudo`** | «hazlo como administrador». Va delante de lo que toca el sistema. |
| **`ufw`** | El cortafuegos. Decide qué puertos ve internet. |
| **PostgreSQL** | La base de datos. Donde viven alumnos, pagos y campeonatos. |
| **Caddy** | El portero. Recibe todo el tráfico de internet, saca los certificados HTTPS **solo**, y reparte a cada app. |
| **systemd** | El que mantiene las apps encendidas y las vuelve a levantar si se caen. |
| **Node / Python** | Los motores que ejecutan tu código. |

**El mapa final**, cuando todo esté montado:

```
                    internet
                        |
                    Caddy (80/443)  <- saca los HTTPS solo
                        |
   +----------+---------+----------+--------------+
   |          |         |          |              |
dinamyt.org  id.    campeonatos.  club.       academy.
 :3000      :3001   :3003 y :5000 :3006       :3008 y :3007
 portal   identidad  Next + Flask  Membresias   Academy
                        |
              PostgreSQL :5432   (una base, cuatro esquemas)
```

Los puertos `3000`, `3001`, `3003`, `3004`, `3006`, `3007`, `3008`, `5000` y
`5432` **nunca** se abren a internet. Solo hablan con Caddy, por dentro.

---

## Cómo leer esta guía

- Los bloques de comandos se pegan en la ventana del **servidor** (SSH), salvo
  cuando diga **«en tu PC»**.
- Se pega **un bloque a la vez** y se mira el resultado antes de seguir.
- ⚠️ marca los pasos donde equivocarse cuesta caro.
- ✅ es lo que tiene que salir para poder continuar.

**Tiempo total: entre 4 y 6 horas.** Se puede partir en dos días: fases 0–5 un
día, 6–10 el otro.

---

## Hoja de claves — créala AHORA, antes de empezar

Vas a generar 10 contraseñas y secretos. **Si los pierdes, hay que volver a
empezar.** Abre un archivo en tu PC llamado `D:\dinamyt-migracion\claves-vps.txt`
(esa carpeta ya existe y está fuera del repositorio) o, mejor, un gestor de
contraseñas.

⚠️ **Ese archivo no se sube nunca a GitHub, ni se pega en un chat.**

Plantilla; la vas rellenando según avances:

```text
VPS
  IP                  80.190.78.70
  Usuario Linux       dinamyt
  Contrasena Linux    ................  (fase 1.1)

POSTGRESQL (fase 4)
  dinamyt_eco         ................
  dinamyt_memb        ................
  dinamyt_camp        ................
  dinamyt_acad        ................

SECRETOS DE APLICACION (fase 6)
  JWT_SECRET_KEY      ................  (campeonatos)
  JWT_SECRET          ................  (membresias)
  CRON_SECRET         ................  (membresias)

CUENTAS DE ADMINISTRADOR (fase 6)
  admin@dinamyt.org / ................  (campeonatos)
  admin@dinamyt.org / ................  (membresias)
  admin@dinamyt.org / ................  (ecosystem)
```

---
---

# FASE 0 · Entrar por primera vez ⏱ 15 min

## 0.1 Abrir la ventana de conexión

**En tu PC**, abre **PowerShell** (botón de Windows → escribe `powershell` →
Enter) y escribe:

```powershell
ssh root@80.190.78.70
```

La primera vez sale un aviso de que no conoce ese servidor y pregunta
`Are you sure you want to continue connecting?`. Escribe `yes` y Enter. Es
normal: le estás diciendo a tu PC que se fía de ese servidor.

Después pide la contraseña de `root` (la del correo de Contabo). **Al escribirla
no aparece nada, ni asteriscos.** Es así a propósito. Escríbela y Enter.

✅ Cuando entres verás algo como:

```text
root@vmi123456:~#
```

Ese `#` al final significa que ya estás **dentro del servidor**. Todo lo que
escribas a partir de aquí pasa allá, no en tu PC.

> **Si dice `Permission denied`**: la contraseña está mal. En el panel de
> Contabo, botón **Manage**, se puede reiniciar la contraseña de root.

## 0.2 Comprobar que el sistema es el correcto

```bash
cat /etc/os-release | head -3
```

✅ Tiene que decir `Ubuntu 24.04.x LTS (Noble Numbat)`.

⚠️ **Si dice otra versión** (22.04, 25.x, 26.04, Debian, CentOS): párate aquí. Ve
al panel de Contabo → botón **Re install** → elige **Ubuntu 24.04 LTS** →
confirma. Borra todo, pero ahora mismo el servidor está vacío, así que no se
pierde nada. Tarda unos 15 minutos y llega un correo con la contraseña nueva.
Después vuelve al paso 0.1.

**Por qué 24.04 y no la más nueva:** Campeonatos necesita **Python 3.11**. Con
3.12 o superior, `eventlet` se rompe bajo `gunicorn` y *todas* las consultas
responden error 500. En 24.04 el repositorio `deadsnakes` da Python 3.11 sin
pelea; en versiones más nuevas todavía no.

## 0.3 Poner el sistema al día

```bash
apt update && apt upgrade -y
```

Tarda 2–5 minutos y escupe muchísimo texto. Es normal.

> Si aparece una pantalla morada preguntando por servicios a reiniciar: Tab hasta
> `<Ok>` y Enter. Si pregunta por un archivo de configuración, deja la opción por
> defecto (*keep the local version*).

---
---

# FASE 1 · Blindar el servidor ⏱ 40 min

⚠️ **Esta fase va primero, sin excepción.** Una IP pública recibe intentos de
entrada automáticos a los cinco minutos de existir. Ahora mismo tu servidor solo
está protegido por una contraseña.

## 1.1 Crear tu usuario

Trabajar como `root` es como usar el computador con permisos totales todo el
tiempo: un error de dedo borra el sistema. Se crea un usuario normal.

```bash
adduser dinamyt
```

Pide una contraseña nueva (**anótala en la hoja de claves**), la repite, y luego
pregunta nombre, teléfono, etc. → deja todo vacío dándole Enter, y al final `Y` +
Enter.

```bash
usermod -aG sudo dinamyt
```

✅ Sin respuesta = bien. Ya puede usar `sudo`.

## 1.2 Crear tu llave de entrada (en tu PC)

Una llave SSH son dos archivos: uno privado que se queda en tu PC y uno público
que se copia al servidor. Es mucho más seguro que una contraseña, y además ya no
la tendrás que escribir más.

⚠️ **Abre una SEGUNDA ventana de PowerShell y deja abierta la del servidor.** Si
te quedas fuera, esa ventana abierta es tu única salvación.

**En tu PC** (segunda ventana):

```powershell
ssh-keygen -t ed25519 -C "dinamyt-vps"
```

Pregunta tres cosas:

1. *dónde guardarla* → Enter (acepta la ruta por defecto)
2. *passphrase* → Enter (vacía), o una frase si prefieres
3. *repetir* → igual

> Si dice `already exists` ya tienes una llave. No la sobreescribas: escribe `n`
> y sigue.

Ahora se copia la parte pública al servidor. **En Windows no existe
`ssh-copy-id`**, así que se hace así (una sola línea, cópiala entera):

```powershell
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh dinamyt@80.190.78.70 "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

Pide la contraseña de `dinamyt` (la de la fase 1.1). Es la última vez.

## 1.3 Comprobar que la llave funciona

⚠️ **Este paso no se salta.** Si la llave no funciona y ya apagaste las
contraseñas, quedas fuera del servidor para siempre.

**En tu PC**, misma segunda ventana:

```powershell
ssh dinamyt@80.190.78.70
```

✅ Tiene que entrar **sin pedir contraseña** y mostrar `dinamyt@vmi123456:~$`.
Fíjate que ahora termina en `$` y no en `#`: eres usuario normal, no root.

> **Si pide contraseña**, la llave no llegó. Repite el paso 1.2 revisando que la
> línea se copiara completa. **No sigas** hasta que entre sin contraseña.

A partir de aquí trabajas **en esta segunda ventana**, como `dinamyt`.

## 1.4 Apagar la entrada por contraseña

```bash
sudo tee /etc/ssh/sshd_config.d/00-dinamyt.conf > /dev/null <<'EOF'
PasswordAuthentication no
PermitRootLogin no
KbdInteractiveAuthentication no
EOF
```

> **Por qué un archivo aparte y no editar el grande:** las imágenes de Contabo
> traen un `50-cloud-init.conf` que vuelve a encender las contraseñas. Ubuntu lee
> esa carpeta en orden y **gana el primero**, por eso el nombre empieza en `00`.

Comprobar que no hay errores **antes** de reiniciar:

```bash
sudo sshd -t && echo "CONFIGURACION OK"
```

✅ Tiene que salir `CONFIGURACION OK`. Si sale otra cosa, **no reinicies**:
revisa el archivo.

```bash
sudo systemctl restart ssh
```

Prueba definitiva — **en tu PC, una tercera ventana**:

```powershell
ssh dinamyt@80.190.78.70
```

✅ Entra sin contraseña.

```powershell
ssh root@80.190.78.70
```

✅ Tiene que decir `Permission denied (publickey)`. Eso es lo correcto: root ya
no entra desde internet.

## 1.5 Cortafuegos

Solo tres puertas: SSH, web sin cifrar y web cifrada.

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw --force enable
sudo ufw status
```

✅ Lista `22/tcp ALLOW` y `80,443/tcp ALLOW`, y nada más.

⚠️ **Nunca abras 3000, 3001, 3003, 3004, 3006, 3007, 3008, 5000 ni 5432.** Un
puerto de aplicación abierto es gente entrando sin HTTPS y sin el portero que
arregla las IPs del limitador de intentos.

## 1.6 Bloquear a los que insisten

```bash
sudo apt install -y fail2ban python3-systemd
sudo tee /etc/fail2ban/jail.local > /dev/null <<'EOF'
[sshd]
enabled = true
backend = systemd
maxretry = 5
bantime = 1h
EOF
sudo systemctl restart fail2ban
sleep 3
sudo fail2ban-client status sshd
```

> El `backend = systemd` hace falta en Ubuntu 24.04: no trae el archivo de
> registro que fail2ban busca por defecto, y sin esta línea la protección queda
> apagada sin avisar.
>
> ⚠️ **`python3-systemd` va en la misma línea a propósito.** Ubuntu no lo
> instala junto con fail2ban, y sin él el modo `systemd` no puede arrancar: el
> servicio muere y `fail2ban-client` responde
> `Failed to access socket path: /var/run/fail2ban/fail2ban.sock`.

> Durante la instalación salen varios `SyntaxWarning: invalid escape sequence`.
> Son ruido del propio paquete de Ubuntu (código de sus pruebas internas) y no
> afectan a nada. Ignóralos.

✅ Responde con `Status for the jail: sshd`.

Si dice lo del socket, el arreglo es el paquete que falta:

```bash
sudo apt install -y python3-systemd && sudo systemctl restart fail2ban && sleep 3 && sudo fail2ban-client status sshd
```

## 1.7 Parches automáticos, hora y memoria de reserva

```bash
sudo apt install -y unattended-upgrades
sudo systemctl enable --now unattended-upgrades
sudo timedatectl set-timezone America/Bogota
date
```

✅ `date` muestra la hora de Colombia.

**Memoria de reserva (swap).** Tienes 8 GB, pero compilar las webs puede pedir
2 GB de golpe. El swap es un colchón en disco por si acaso:

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

✅ La línea `Swap:` muestra `4,0Gi`.

## 1.8 Reiniciar una vez

Durante las instalaciones aparece un aviso de **`Pending kernel upgrade!`**: se
descargó un núcleo nuevo del sistema, pero el servidor sigue corriendo el viejo.

Este es el mejor momento para reiniciar: no hay nada montado todavía, y de paso
compruebas que el servidor vuelve solo y que tu llave SSH sigue funcionando —
mucho mejor descubrir un problema ahora que con las apps encima.

```bash
sudo reboot
```

La conexión se corta sola (verás `Connection to 80.190.78.70 closed`). Es normal.
Espera **un minuto** y vuelve a entrar **desde tu PC**:

```powershell
ssh dinamyt@80.190.78.70
```

✅ Entra sin contraseña. Comprueba que las protecciones siguen puestas:

```bash
sudo ufw status && systemctl is-active fail2ban && free -h | grep Swap
```

✅ El cortafuegos activo, `active`, y el swap en `4,0Gi`.

---
---

# FASE 2 · Instalar los programas base ⏱ 30 min

## 2.1 Herramientas generales

```bash
sudo apt install -y git curl ca-certificates build-essential unzip
```

## 2.2 Caddy — el portero con HTTPS automático

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
caddy version
```

✅ Muestra `v2.x.x`.

## 2.3 Node 22 y pnpm

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo corepack enable
sudo corepack prepare pnpm@11.5.0 --activate
node --version && pnpm --version
```

✅ `v22.x.x` y `11.5.0`.

## 2.4 Python 3.11 — para Campeonatos

⚠️ **La 3.11, no la 3.12 que trae el sistema.**

```bash
sudo add-apt-repository -y ppa:deadsnakes/ppa
sudo apt update
sudo apt install -y python3.11 python3.11-venv python3.11-dev libpq-dev
python3.11 --version
```

✅ `Python 3.11.x`.

> Si `deadsnakes` no tuviera la 3.11 para esta versión de Ubuntu, párate y
> avísame: la salida es meter Campeonatos en un contenedor `python:3.11-slim`, y
> cambian las fases 6 y 7.

## 2.5 PostgreSQL 17 — la base de datos

⚠️ **La 17, no la 16 que trae Ubuntu.** Tus respaldos se hicieron con la 17, y un
respaldo solo lo lee su misma versión **o una posterior, nunca una anterior**.
Con la 16 no se pueden restaurar.

```bash
sudo install -d /usr/share/postgresql-common/pgdg
sudo curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc --fail https://www.postgresql.org/media/keys/ACCC4CF8.asc
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt noble-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list
sudo apt update
sudo apt install -y postgresql-17
psql --version
```

✅ `psql (PostgreSQL) 17.x`.

```bash
systemctl is-active postgresql
```

✅ `active`.

---
---

# FASE 3 · Dominio y DNS ⏱ 15 min + espera

Sin dominio no hay HTTPS: los certificados se emiten a nombres, no a IPs.

## 3.1 Comprar `dinamyt.org`

En **cloudflare.com** → crear cuenta (gratis) → **Domain Registration** →
**Register Domain** → buscar `dinamyt.org` → comprar (~US$10/año).

> `dinamyt.com` está tomado y en reventa por otra persona. `.org` es la decisión
> ya tomada en el plan (§11.2).

## 3.2 Apuntar los nombres a tu servidor

En Cloudflare → tu dominio → **DNS** → **Add record**. Crea **seis** registros,
todos iguales salvo el nombre:

| Type | Name | IPv4 address | Proxy status |
|---|---|---|---|
| A | `@` | `80.190.78.70` | **DNS only (gris)** |
| A | `www` | `80.190.78.70` | **DNS only (gris)** |
| A | `id` | `80.190.78.70` | **DNS only (gris)** |
| A | `campeonatos` | `80.190.78.70` | **DNS only (gris)** |
| A | `club` | `80.190.78.70` | **DNS only (gris)** |
| A | `academy` | `80.190.78.70` | **DNS only (gris)** |

⚠️ **La nubecita tiene que estar GRIS, no naranja.** En naranja, Cloudflare se
mete en medio y Caddy no puede validar el certificado.

> **Cloudflare te avisará en cada registro:** *«This record exposes the IP
> address used in the A record... Enable the proxy status to protect your origin
> server»*. **Ignóralo, es a propósito.** Con el proxy activado: (1) Let's
> Encrypt no puede validar el certificado y el HTTPS no se emite; (2) el plan
> gratuito corta las peticiones a los ~100 s y un reporte PDF grande moriría a
> mitad; (3) el marcador en vivo gana un salto de latencia.
>
> Lo que protege el servidor ya está puesto en la fase 1: cortafuegos con solo
> 22/80/443, fail2ban y root sin acceso. La IP visible es una dirección conocida,
> no una puerta abierta.
>
> Pasar a naranja es una decisión de **después del campeonato**, y exige poner
> SSL/TLS en **Full (strict)** a la vez o rompe.

## 3.3 Comprobar que ya resuelve

⚠️ **Este comando va en tu PC, no en el servidor.** La idea es comprobar que
internet ya sabe encontrarte, así que la pregunta tiene que salir desde fuera.
Para saber dónde estás, mira el texto antes del cursor: `PS C:\Users\...>` es tu
PC; `dinamyt@vmi...:~$` es el servidor. Si estás en el servidor, abre una ventana
nueva de PowerShell.

```powershell
nslookup campeonatos.dinamyt.org
```

✅ Responde `Address: 80.190.78.70`.

- Si responde `104.21.x.x` o `172.67.x.x`, esas son de Cloudflare: ese registro
  se quedó en **naranja**. Ponlo en gris.
- Si dice `Non-existent domain`, aún no ha propagado. Espera 10 minutos.

Los seis de una vez, preguntando directo al DNS de Cloudflare (así te saltas la
memoria de tu PC, que a veces guarda respuestas viejas):

```powershell
"dinamyt.org","www.dinamyt.org","id.dinamyt.org","campeonatos.dinamyt.org","club.dinamyt.org","academy.dinamyt.org" | ForEach-Object { "$_ -> " + (((Resolve-DnsName $_ -Type A -Server 1.1.1.1 -ErrorAction SilentlyContinue).IPAddress) -join ", ") }
```

✅ Las seis líneas terminan en `-> 80.190.78.70`.

Puedes seguir con las fases 4, 5 y 6 mientras propaga; el dominio solo hace falta
en la fase 8.

---
---

# FASE 4 · Crear la base de datos ⏱ 20 min

Va **una sola base** llamada `dinamyt`, con **cuatro esquemas** (como cuatro
carpetas dentro) y **un usuario por app**.

## 4.1 Generar las cuatro contraseñas

```bash
for r in eco memb camp acad; do echo "dinamyt_$r  $(openssl rand -hex 20)"; done
```

⚠️ **Cópialas a la hoja de claves ahora mismo.** No se vuelven a mostrar.

## 4.2 Crear base, usuarios y esquemas

Sustituye `CLAVE_ECO`, `CLAVE_MEMB`, `CLAVE_CAMP` y `CLAVE_ACAD` por las cuatro
que acabas de generar, y **luego** pega el bloque entero:

```bash
sudo -u postgres createdb dinamyt
sudo -u postgres psql -d dinamyt <<'SQL'
CREATE ROLE dinamyt_eco  LOGIN PASSWORD 'CLAVE_ECO';
CREATE ROLE dinamyt_memb LOGIN PASSWORD 'CLAVE_MEMB';
CREATE ROLE dinamyt_camp LOGIN PASSWORD 'CLAVE_CAMP';
CREATE ROLE dinamyt_acad LOGIN PASSWORD 'CLAVE_ACAD';

CREATE SCHEMA ecosystem   AUTHORIZATION dinamyt_eco;
CREATE SCHEMA membresias  AUTHORIZATION dinamyt_memb;
CREATE SCHEMA campeonatos AUTHORIZATION dinamyt_camp;
CREATE SCHEMA academy     AUTHORIZATION dinamyt_acad;

-- El diario de migraciones que trae el respaldo de Membresias viene en un
-- esquema propio llamado `drizzle`. Hay que crearlo AQUI, como postgres: los
-- usuarios de app no pueden crear esquemas (a proposito), asi que si no existe
-- de antemano el restore pierde el diario entero. En la fase 5.2 se mueve a
-- `membresias` y este esquema se borra.
CREATE SCHEMA drizzle     AUTHORIZATION dinamyt_memb;

ALTER ROLE dinamyt_eco  SET search_path = ecosystem, public;
ALTER ROLE dinamyt_memb SET search_path = membresias, public;
ALTER ROLE dinamyt_camp SET search_path = campeonatos, public;
ALTER ROLE dinamyt_acad SET search_path = academy, public;

REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO dinamyt_eco, dinamyt_memb, dinamyt_camp, dinamyt_acad;

-- Permiso para crear esquemas DENTRO de esta base. Hace falta aunque los cuatro
-- esquemas ya existan: Drizzle ejecuta `CREATE SCHEMA IF NOT EXISTS <esquema>`
-- antes de cada migracion, y PostgreSQL comprueba el permiso ANTES de comprobar
-- si el esquema existe. Sin esto, `db:migrate` del ecosystem falla sin decir por
-- que, y `membresias-api` muere al arrancar con un error que no menciona
-- permisos. No afecta a la seguridad: siguen sin ser superusuarios y sin poder
-- saltarse el aislamiento por club.
GRANT CREATE ON DATABASE dinamyt TO dinamyt_eco, dinamyt_memb, dinamyt_camp, dinamyt_acad;
SQL
```

## 4.3 Comprobación obligatoria de seguridad

```bash
sudo -u postgres psql -d dinamyt -c "SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname LIKE 'dinamyt_%';"
```

✅ Las cuatro filas tienen que dar `f` y `f`.

⚠️ **No es higiene, es requisito.** El aislamiento por club de Membresías y
Campeonatos (RLS) se lo salta cualquier usuario con `superuser` o `bypassrls`, y
se apaga en silencio: un club vería los datos de otro sin que nada falle.

## 4.4 Probar que se puede entrar con un usuario de app

```bash
PGPASSWORD='CLAVE_CAMP' psql -h 127.0.0.1 -U dinamyt_camp -d dinamyt -c "SHOW search_path;"
```

✅ Responde `campeonatos, public`. Si dice `authentication failed`, la contraseña
del paso 4.2 no coincide con la que estás usando aquí.

---
---

# FASE 5 · Traer los datos viejos ⏱ 30 min

Tus respaldos del 19 de agosto están en `D:\dinamyt-migracion\respaldos`:

| Archivo | Tamaño | Qué trae |
|---|---|---|
| `membresias_2026-08-19_1136.dump` | 363 KB | Club, alumnos, pagos, asistencias |
| `campeonatos_2026-08-19_1136.dump` | 65 KB | Campeonatos, competidores, llaves |
| `eco_acad_*.dump` | **0 KB** | **Vacío** — ver abajo |

> **El respaldo del ecosistema está vacío, y no es un error tuyo.** El proyecto de
> Supabase del ecosistema ya no responde (§1.3.1 del plan). Ecosystem y Academy
> **arrancan de cero** en el VPS: se crean las tablas y se siembra el
> administrador. No se pierde nada de Campeonatos ni de Membresías, que son los
> que tienen los datos reales.

## 5.1 Subir los archivos (en tu PC)

```powershell
scp D:\dinamyt-migracion\respaldos\membresias_2026-08-19_1136.dump dinamyt@80.190.78.70:/home/dinamyt/memb.dump
```

```powershell
scp D:\dinamyt-migracion\respaldos\campeonatos_2026-08-19_1136.dump dinamyt@80.190.78.70:/tmp/camp_public.dump
```

✅ Muestra una barra de progreso hasta `100%`.

⚠️ **El de Campeonatos va a `/tmp`, no a tu carpeta personal, y no es un
capricho.** Su restauración la hace el usuario `postgres`, y en Ubuntu 24.04
`/home/dinamyt` tiene permisos `750`: nadie más entra. Desde `~` el `pg_restore`
de postgres no puede abrir el archivo, la base temporal queda **vacía**, y el
resto de la cadena sigue trabajando sobre la nada — sacando un archivo final de
1 KB sin una sola tabla y sin un error que lo delate.

Dale permiso de lectura a todos, por si acaso:

```bash
chmod 644 /tmp/camp_public.dump
```

## 5.2 Restaurar Membresías

```bash
PGPASSWORD='CLAVE_MEMB' pg_restore -h 127.0.0.1 -U dinamyt_memb -d dinamyt --no-owner ~/memb.dump
```

> **Van a salir dos errores, y son esperados:**
>
> ```text
> ERROR: permission denied for database dinamyt
> Command was: CREATE SCHEMA drizzle;
> Command was: CREATE SCHEMA membresias;
> ```
>
> El respaldo trae dentro la orden de crear sus esquemas, pero los usuarios de
> app **no pueden crear esquemas a propósito** (fase 4). Como los dos ya existen,
> las tablas entran igual. Al final dirá `errors ignored on restore: 2`.
>
> ⚠️ **Lo que NO puede aparecer es `schema "drizzle" does not exist`.** Si sale
> eso, es que te saltaste el `CREATE SCHEMA drizzle` de la fase 4.2. El arreglo,
> sin repetir todo el restore:
>
> ```bash
> sudo -u postgres psql -d dinamyt -c "CREATE SCHEMA IF NOT EXISTS drizzle AUTHORIZATION dinamyt_memb;"
> PGPASSWORD='CLAVE_MEMB' pg_restore -h 127.0.0.1 -U dinamyt_memb -d dinamyt --no-owner -n drizzle ~/memb.dump
> ```

Comprueba que los datos entraron:

```bash
sudo -u postgres psql -d dinamyt -c "SELECT (SELECT count(*) FROM membresias.orgs) AS clubes, (SELECT count(*) FROM membresias.users) AS personas, (SELECT count(*) FROM membresias.payments) AS pagos, (SELECT count(*) FROM membresias.attendances) AS asistencias;"
```

✅ Números que reconozcas, no ceros.

Y que llegó el **diario de migraciones**:

```bash
sudo -u postgres psql -d dinamyt -c "SELECT count(*) FROM drizzle.__drizzle_migrations;"
```

✅ **15**.

Ese diario tiene que vivir dentro del esquema de la app, o Membresías arrancará
creyendo que nunca aplicó ninguna migración e intentará crear tablas que ya
existen:

```bash
sudo -u postgres psql -d dinamyt -c 'ALTER TABLE drizzle.__drizzle_migrations SET SCHEMA membresias;' -c 'DROP SCHEMA drizzle;'
```

✅ `ALTER TABLE` y `DROP SCHEMA`. Confírmalo:

```bash
sudo -u postgres psql -d dinamyt -c "SELECT count(*) FROM membresias.__drizzle_migrations;"
```

✅ **15**, ahora dentro de `membresias`.

## 5.3 Restaurar Campeonatos (tiene un rodeo)

Sus tablas viven en `public` y aquí tienen que quedar en `campeonatos`. Se
restaura en una base temporal, se renombra la carpeta, y se vuelve a sacar:

⚠️ **Este bloque NO se pega entero.** Van uno a uno, mirando el resultado: si uno
falla, los siguientes se ejecutan igual sobre el vacío que dejó, y el fallo no
aparece hasta el final — o peor, no aparece.

```bash
sudo -u postgres createdb tmp_camp
```

```bash
sudo -u postgres pg_restore -d tmp_camp --no-owner /tmp/camp_public.dump
```

⚠️ **Comprobación obligatoria antes de seguir.** Es donde se rompe la cadena:

```bash
sudo -u postgres psql -d tmp_camp -c "SELECT count(*) AS tablas FROM pg_tables WHERE schemaname='public';"
```

✅ **14**. Si da 0, para: postgres no pudo leer el archivo. Revisa que esté en
`/tmp` y con `chmod 644`.

```bash
sudo -u postgres psql -d tmp_camp -c 'ALTER SCHEMA public RENAME TO campeonatos;'
```

```bash
sudo -u postgres pg_dump -Fc --no-owner --no-privileges -n campeonatos tmp_camp -f /tmp/camp.dump
```

⚠️ **Segunda comprobación**, para no restaurar un archivo vacío:

```bash
ls -lh /tmp/camp.dump && pg_restore --list /tmp/camp.dump | grep -c "TABLE DATA"
```

✅ Decenas de KB y **14**. Si sale `1.3K` y `0`, el paso anterior trabajó sobre
una base vacía.

```bash
PGPASSWORD='CLAVE_CAMP' pg_restore -h 127.0.0.1 -U dinamyt_camp -d dinamyt --no-owner /tmp/camp.dump
```

```bash
sudo -u postgres dropdb tmp_camp && sudo rm -f /tmp/camp.dump /tmp/camp_public.dump
```

> El `sudo` del `rm` hace falta: `/tmp/camp.dump` lo creó `postgres` y `/tmp`
> tiene el bit pegajoso, así que solo su dueño puede borrarlo.

> Aquí también saldrá **un** error `permission denied ... CREATE SCHEMA
> campeonatos;`, por el mismo motivo que en Membresías, y **no hay que hacer
> nada**: el esquema ya existe desde la fase 4 y las tablas entran igual. Al
> final: `errors ignored on restore: 1`.

## 5.4 Verificación obligatoria

```bash
sudo -u postgres psql -d dinamyt -c "SELECT schemaname, relname, n_live_tup FROM pg_stat_user_tables WHERE schemaname IN ('ecosystem','membresias','campeonatos','academy') ORDER BY schemaname, relname;"
```

✅ Tienen que aparecer las tablas de `membresias` y `campeonatos` **con números
mayores que cero** en alumnos, pagos, competidores y campeonatos.

⚠️ **No sirve «mirar si arranca».** Compara a ojo contra lo que recuerdas: número
de alumnos activos, pagos del último mes, competidores del último campeonato. Si
algo sale en cero y no debería, para y avísame antes de seguir.

---
---

# FASE 6 · El código y las variables ⏱ 60–90 min

## 6.1 Preparar la carpeta

```bash
sudo mkdir -p /srv /srv/uploads/academy
sudo chown -R dinamyt:dinamyt /srv
```

## 6.2 Traer los tres repositorios

Los tres repositorios son privados, así que primero hay que darle al servidor una
credencial. ⚠️ **La contraseña de tu cuenta de GitHub no sirve**: desde 2021 no
se acepta para operaciones de Git (`Password authentication is not supported`).

Lo mejor es una llave SSH del servidor: **no caduca**, y un token que expire en
octubre rompería los despliegues en la semana del campeonato.

```bash
ssh-keygen -t ed25519 -C "vps-dinamyt"
```

(Enter en las tres preguntas.) Muéstrala y cópiala entera:

```bash
cat ~/.ssh/id_ed25519.pub
```

En **github.com** → foto de perfil → **Settings** → **SSH and GPG keys** → **New
SSH key**. Título `VPS DINAMYT`, tipo *Authentication Key*, y pega la línea.
Comprueba:

```bash
ssh -T git@github.com
```

✅ `Hi ArsenalCrack! You've successfully authenticated, but GitHub does not
provide shell access.` — ese «does not provide shell access» es lo normal, no un
error.

Ahora sí, con direcciones `git@` en vez de `https://`:

```bash
git clone git@github.com:ArsenalCrack/dinamyt.git /srv/dinamyt
```

```bash
git clone git@github.com:ArsenalCrack/dinamyt-combat.git /srv/campeonatos
```

```bash
git clone git@github.com:ArsenalCrack/dinamyt-membresias.git /srv/membresias
```

> Si alguno dice `already exists and is not an empty directory`, borra lo que
> quedó de un intento fallido (`rm -rf /srv/membresias`) y repite.
>
> **Alternativa con token:** GitHub → Settings → Developer settings → Personal
> access tokens → *Fine-grained* → acceso a los tres repos, permiso *Contents:
> Read-only*. Luego `git config --global credential.helper store` y clona por
> `https://` usando el token como contraseña. Apunta su fecha de caducidad.

⚠️ **Antes de clonar, asegúrate de haber hecho `git push` de los tres repos desde
tu PC.** El servidor clona lo que hay en GitHub: si tienes commits solo en local,
está desplegando código viejo. (`dinamyt` y `dinamyt-membresias` estaban al día
el 19 de agosto; **`dinamyt-combat` está sin verificar**.)

## 6.3 Generar los secretos de aplicación

```bash
echo "JWT_SECRET_KEY (campeonatos) = $(openssl rand -hex 32)"
echo "JWT_SECRET     (membresias)  = $(openssl rand -base64 48 | tr -d '\n/+=')"
echo "CRON_SECRET    (membresias)  = $(openssl rand -base64 32 | tr -d '\n/+=')"
```

Y las llaves RS256 con las que el ecosistema firma los tokens:

```bash
mkdir -p /srv/dinamyt/apps/ecosystem-api/keys
openssl genpkey -algorithm RSA -out /srv/dinamyt/apps/ecosystem-api/keys/private.pem -pkeyopt rsa_keygen_bits:2048
openssl rsa -in /srv/dinamyt/apps/ecosystem-api/keys/private.pem -pubout -out /srv/dinamyt/apps/ecosystem-api/keys/public.pem
chmod 600 /srv/dinamyt/apps/ecosystem-api/keys/private.pem
```

⚠️ Estas llaves son **nuevas y del servidor**. No copies las de tu PC, y no las
subas nunca a git.

## 6.4 Las variables — Campeonatos

Se escriben **dos** archivos. Se abre el editor `nano`, se pega el contenido, se
guarda con `Ctrl+O` → Enter, y se sale con `Ctrl+X`.

```bash
nano /srv/campeonatos/backend/.env
```

```bash
FLASK_ENV=production
PORT=5000
DATABASE_URL=postgresql://dinamyt_camp:CLAVE_CAMP@127.0.0.1:5432/dinamyt
JWT_SECRET_KEY=EL_QUE_GENERASTE_EN_6.3
FRONTEND_URL=https://campeonatos.dinamyt.org
ADMIN_EMAIL=admin@dinamyt.org
ADMIN_PASSWORD=UNA_CLAVE_FUERTE_DE_12_O_MAS
ADMIN_NOMBRE=Administrador DINAMYT
TRUST_PROXY_HOPS=1
COOKIE_SAMESITE=Lax
COOKIE_SECURE=true
BCRYPT_ROUNDS=10
TZ=America/Bogota
```

⚠️ `FRONTEND_URL` va **exacta y sin barra final**. Con una barra de más, el CORS
rechaza a tu propia web y no entra nadie.

```bash
nano /srv/campeonatos/frontend/.env.production
```

```bash
NEXT_PUBLIC_API_MODE=proxy
NEXT_PUBLIC_SOCKET_URL=https://campeonatos.dinamyt.org
```

⚠️ **Este archivo tiene que existir ANTES de compilar.** Las variables
`NEXT_PUBLIC_*` se hornean dentro del build: si las cambias después, hay que
volver a compilar o no surten efecto.

- `NEXT_PUBLIC_API_MODE=proxy` hace que el navegador use rutas relativas `/api`,
  que es lo que mantiene la cookie de sesión como de primera parte.
- `NEXT_PUBLIC_SOCKET_URL` es **obligatoria**: sin ella el marcador en vivo busca
  el puerto 5000 del mismo host, que no está abierto a internet, y los jueces ven
  «sin conexión».

## 6.5 Compilar Campeonatos

```bash
cd /srv/campeonatos/backend
python3.11 -m venv venv
venv/bin/pip install --upgrade pip
venv/bin/pip install -r requirements.txt
```

✅ Al final: `Successfully installed ...` con una lista larga.

```bash
cd /srv/campeonatos/frontend
npm ci
npm run build
```

Tarda 2–4 minutos. ✅ Termina con un cuadro de rutas y `Compiled successfully`.

## 6.6 Las variables — Membresías

```bash
nano /srv/membresias/packages/membresias-db/.env
```

```bash
MEMBRESIAS_DATABASE_URL=postgresql://dinamyt_memb:CLAVE_MEMB@127.0.0.1:5432/dinamyt
```

```bash
nano /srv/membresias/apps/membresias-api/.env
```

```bash
PORT=3004
MEMBRESIAS_DATABASE_URL=postgresql://dinamyt_memb:CLAVE_MEMB@127.0.0.1:5432/dinamyt
JWT_SECRET=EL_QUE_GENERASTE_EN_6.3
JWT_EXPIRES_IN=86400
BCRYPT_ROUNDS=10
SUPERADMIN_EMAIL=admin@dinamyt.org
SUPERADMIN_PASSWORD=UNA_CLAVE_FUERTE
SUPERADMIN_NOMBRE=Super administrador
CORS_ORIGINS=https://club.dinamyt.org
MEMBRESIAS_WEB_URL=https://club.dinamyt.org
ECOSYSTEM_JWKS_URL=https://id.dinamyt.org/auth/jwks
TRUST_PROXY_HOPS=1
COOKIE_SAMESITE=lax
COOKIE_SECURE=true
CRON_SECRET=EL_QUE_GENERASTE_EN_6.3
```

```bash
nano /srv/membresias/apps/membresias-web/.env.production
```

```bash
MEMBRESIAS_API_ORIGIN=http://127.0.0.1:3004
NEXT_PUBLIC_ECOSYSTEM_PORTAL_URL=https://dinamyt.org
CRON_SECRET=EL_MISMO_DE_LA_API
```

⚠️ `MEMBRESIAS_API_ORIGIN` y `NEXT_PUBLIC_ECOSYSTEM_PORTAL_URL` se leen **al
compilar**, no al arrancar: si las cambias, hay que volver a compilar la web.

> **Estas dos variables son el SSO entero, y sin ellas parece que no funciona.**
>
> `ECOSYSTEM_JWKS_URL` (en la API) es la que le dice a Membresías que existe un
> emisor de identidad al que creerle. **Sin ella, Membresías es autónoma a
> propósito**: rechaza el token del ecosistema y enseña su propio formulario —
> exactamente lo que hay que ver el día del campeonato, sin internet, y
> exactamente lo que NO se quiere el resto del año. El síntoma es que saltas
> desde el portal y te vuelve a pedir la contraseña.
>
> `NEXT_PUBLIC_ECOSYSTEM_PORTAL_URL` (en la web) es la que dibuja el botón
> «entrar con DINAMYT» y el camino de vuelta al portal.

## 6.7 Compilar Membresías

```bash
cd /srv/membresias
pnpm install --frozen-lockfile
pnpm --filter @dinamyt/membresias-db  build
pnpm --filter @dinamyt/membresias-api build
pnpm --filter @dinamyt/membresias-web build
```

Las migraciones de la base las aplica la API sola al arrancar (fase 7).

## 6.8 Las variables — Ecosystem (portal e identidad)

```bash
nano /srv/dinamyt/apps/ecosystem-api/.env
```

```bash
DATABASE_URL=postgresql://dinamyt_eco:CLAVE_ECO@127.0.0.1:5432/dinamyt
DB_SCHEMA=ecosystem
JWT_PRIVATE_KEY_PATH=./keys/private.pem
JWT_PUBLIC_KEY_PATH=./keys/public.pem
JWT_EXPIRES_IN=86400
PORT=3001
NODE_ENV=production
TRUST_PROXY_HOPS=1
CORS_ORIGINS=https://dinamyt.org,https://www.dinamyt.org,https://campeonatos.dinamyt.org,https://club.dinamyt.org,https://academy.dinamyt.org
PORTAL_URL=https://dinamyt.org
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASS=
MAIL_FROM=DINAMYT <no-reply@dinamyt.org>
MAIL_REPLY_TO=soporte@dinamyt.org
MAIL_DAILY_MAX=90
ADMIN_EMAIL=admin@dinamyt.org
ADMIN_PASSWORD=UNA_CLAVE_FUERTE
ADMIN_NAME=Super Administrador DINAMYT
ADMIN_DOCUMENT=1000000000
```

> **`SMTP_HOST` vacía es un estado válido, no una configuración a medias.** Sin
> ella la función de correo no existe: la API arranca igual, el registro con
> código y el «olvidé mi contraseña» no funcionan, y **la invitación del maestro
> devuelve el enlace** para que lo mande por WhatsApp. El día que se contrate
> Resend (bloque B2), esto se llena y no se toca ni una línea de código:
>
> ```bash
> SMTP_HOST=smtp.resend.com
> SMTP_PASS=re_xxxxxxxxxxxxxxxx      # la API key
> ```
>
> `MAIL_DAILY_MAX` es un tope propio, por debajo del del proveedor: si Resend
> rechaza el correo 101, el fallo es silencioso y nadie se entera hasta que
> alguien reclama. Contado aquí, el envío 91 no sale y queda escrito en el
> registro.
>
> `PORTAL_URL` es la base del enlace de invitación. Si apunta al sitio
> equivocado, el enlace lleva a una página que no existe.

```bash
nano /srv/dinamyt/apps/ecosystem-portal/.env.production
```

```bash
NEXT_PUBLIC_ECOSYSTEM_API_URL=https://id.dinamyt.org
NEXT_PUBLIC_CAMPEONATOS_URL=https://campeonatos.dinamyt.org
NEXT_PUBLIC_MEMBRESIAS_URL=https://club.dinamyt.org
NEXT_PUBLIC_ACADEMY_URL=https://academy.dinamyt.org
```

## 6.9 Compilar el ecosystem y crear sus tablas

```bash
cd /srv/dinamyt
pnpm install --frozen-lockfile
pnpm --filter @dinamyt/shared          build
pnpm --filter @dinamyt/ecosystem-api   build
pnpm --filter @dinamyt/ecosystem-portal build
```

Crear las tablas y sembrar el administrador (la base del ecosistema está vacía):

```bash
cd /srv/dinamyt/apps/ecosystem-api
pnpm db:migrate
pnpm db:seed
```

✅ `db:migrate` no debe dar error, y `db:seed` tiene que decir que creó el
administrador.

---
---

# FASE 7 · Encender las apps ⏱ 30 min

`systemd` es el que mantiene cada app viva. Se crea un archivo por servicio.

## 7.1 Los cuatro archivos

```bash
sudo tee /etc/systemd/system/dinamyt-id.service > /dev/null <<'EOF'
[Unit]
Description=DINAMYT Ecosystem API (identidad)
After=network.target postgresql.service

[Service]
User=dinamyt
WorkingDirectory=/srv/dinamyt/apps/ecosystem-api
ExecStart=/usr/bin/node dist/main.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
```

```bash
sudo tee /etc/systemd/system/dinamyt-portal.service > /dev/null <<'EOF'
[Unit]
Description=DINAMYT Portal (Next)
After=network.target

[Service]
User=dinamyt
WorkingDirectory=/srv/dinamyt/apps/ecosystem-portal
ExecStart=/srv/dinamyt/apps/ecosystem-portal/node_modules/.bin/next start -H 127.0.0.1 -p 3000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
```

```bash
sudo tee /etc/systemd/system/campeonatos-api.service > /dev/null <<'EOF'
[Unit]
Description=DINAMYT Campeonatos - API Flask + Socket.IO
After=network.target postgresql.service

[Service]
User=dinamyt
WorkingDirectory=/srv/campeonatos/backend
ExecStart=/srv/campeonatos/backend/venv/bin/gunicorn -k eventlet -w 1 -b 127.0.0.1:5000 wsgi:app
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
```

⚠️ **El `-w 1` no es negociable.** El estado en vivo de los tatamis, los rooms de
Socket.IO y el limitador viven en la memoria del proceso: con dos, dos jueces del
mismo tatami caen en procesos distintos y ven marcadores distintos.

```bash
sudo tee /etc/systemd/system/campeonatos-web.service > /dev/null <<'EOF'
[Unit]
Description=DINAMYT Campeonatos - Web Next
After=network.target

[Service]
User=dinamyt
WorkingDirectory=/srv/campeonatos/frontend
ExecStart=/srv/campeonatos/frontend/node_modules/.bin/next start -H 127.0.0.1 -p 3003
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
```

```bash
sudo tee /etc/systemd/system/membresias-api.service > /dev/null <<'EOF'
[Unit]
Description=DINAMYT Membresias - API Fastify
After=network.target postgresql.service

[Service]
User=dinamyt
WorkingDirectory=/srv/membresias/apps/membresias-api
ExecStart=/usr/bin/node dist/main.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
```

```bash
sudo tee /etc/systemd/system/membresias-web.service > /dev/null <<'EOF'
[Unit]
Description=DINAMYT Membresias - Web Next (PWA)
After=network.target

[Service]
User=dinamyt
WorkingDirectory=/srv/membresias/apps/membresias-web
ExecStart=/srv/membresias/apps/membresias-web/node_modules/.bin/next start -H 127.0.0.1 -p 3006
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
```

> Se llama a `next` directo y no a `npm start` a propósito: el script `start` de
> Campeonatos levanta en `0.0.0.0` (visible desde fuera) y aquí queremos que
> escuche solo por dentro.

## 7.2 Arrancarlas

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now dinamyt-id dinamyt-portal campeonatos-api campeonatos-web membresias-api membresias-web
```

Y comprueba el estado de las seis de un vistazo:

```bash
for s in dinamyt-id dinamyt-portal campeonatos-api campeonatos-web membresias-api membresias-web; do printf '%-20s %s\n' "$s" "$(systemctl is-active $s)"; done
```

✅ Las seis tienen que decir `active`.

> Los mensajes `Created symlink ...` del comando anterior solo confirman que
> arrancarán solas al reiniciar el servidor — **no** que estén funcionando ahora.
> Por eso hace falta esta segunda comprobación.

## 7.3 Probar cada una por dentro

```bash
curl -sI 127.0.0.1:3000 | head -1
curl -s  127.0.0.1:3001/auth/jwks | head -c 120; echo
curl -sI 127.0.0.1:3003 | head -1
curl -s  127.0.0.1:3004/health; echo
curl -sI 127.0.0.1:3006 | head -1
curl -s  127.0.0.1:5000/api/campeonatos/publico | head -c 120; echo
```

✅ Las de `-I` responden `HTTP/1.1 200 OK`; las otras devuelven texto JSON.

**Si alguna falla**, mira su registro — ahí sale el error de verdad:

```bash
sudo journalctl -u campeonatos-api -n 50 --no-pager
```

(cambia el nombre por el servicio que falle)

---
---

# FASE 8 · Abrir al mundo con HTTPS ⏱ 15 min

⚠️ Antes de esta fase, el DNS de la fase 3 tiene que estar resolviendo.

```bash
sudo tee /etc/caddy/Caddyfile > /dev/null <<'EOF'
dinamyt.org, www.dinamyt.org {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3000
}

id.dinamyt.org {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3001
}

campeonatos.dinamyt.org {
	encode zstd gzip

	handle /api/* {
		reverse_proxy 127.0.0.1:5000
	}

	handle /socket.io/* {
		reverse_proxy 127.0.0.1:5000
	}

	handle {
		reverse_proxy 127.0.0.1:3003
	}
}

club.dinamyt.org {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3006
}
EOF
```

⚠️ **Caddy no admite bloques en una sola línea.** `handle /api/* { reverse_proxy
... }` da `Unexpected next token after '{' on same line`. Las llaves se abren al
final de la línea y el contenido va debajo. (El Caddyfile de §7.2 del plan trae
la forma corta: no funciona.)

⚠️ **Comprueba la primera línea**, porque al copiar desde un chat o un navegador
`www.dinamyt.org` se convierte a veces en un enlace:

```bash
head -1 /etc/caddy/Caddyfile
```

✅ Exactamente `dinamyt.org, www.dinamyt.org {`. Si trae corchetes o `https://`:

```bash
sudo sed -i '1s|.*|dinamyt.org, www.dinamyt.org {|' /etc/caddy/Caddyfile
```

Ahora valida, y solo recarga si la validación pasa:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
```

✅ `Valid configuration`.

```bash
sudo systemctl reload caddy
```

> Si el `reload` falla, es que la configuración no era válida. Caddy se niega a
> cargarla y sigue con la anterior — prefiere eso a quedarse sin nada.

> **Por qué Campeonatos parte las rutas y Membresías no.** En Campeonatos el
> `/api` va directo al Flask — y el marcador en vivo **necesita** ese camino, o
> se degrada a long-polling y los jueces se quedan colgados. En Membresías la web
> ya reenvía `/api` por dentro. Copiar el bloque de una a la otra rompe la API
> con error 404.

Los certificados se emiten solos en unos segundos. Míralo:

```bash
sudo journalctl -u caddy -n 30 --no-pager | grep -i "certificate obtained"
```

✅ Aparece una línea por cada dominio.

**Ahora abre el navegador** y entra a `https://campeonatos.dinamyt.org`. ✅ Tiene
que cargar con el candado cerrado.

---
---

# FASE 9 · Verificar de verdad ⏱ 30 min

No basta con que cargue. Marca cada casilla:

- [ ] `https://dinamyt.org` carga el portal, con candado
- [ ] `https://campeonatos.dinamyt.org` carga y **entras con tu usuario de siempre**
- [ ] En Campeonatos, **recargar la página no cierra la sesión**
- [ ] Los campeonatos, competidores y llaves de antes **están todos ahí**
- [ ] Abre un tatami en el celular y la pantalla pública en el PC: el marcador se
      refleja al instante
- [ ] En la consola del navegador (F12 → Network → WS), Socket.IO aparece como
      `websocket`, **no** `polling`
- [ ] Puntúa un combate completo, con faltas y desempate: igual que antes
- [ ] Exporta un reporte en PDF y otro en Excel
- [ ] `https://club.dinamyt.org` carga, entra el maestro, y **están los alumnos y
      los pagos**
- [ ] Check-in con QR y carnet impreso
- [ ] Ninguna de estas responde (tiene que dar error de conexión, desde tu PC):
      `http://80.190.78.70:3000`, `:5000`, `:5432`

⚠️ **Si algo de la lista falla, no sigas montando.** Arréglalo o avísame: es
mucho más barato ahora que en octubre.

---
---

# FASE 10 · Que no se pierda nada ⏱ 20 min

## 10.1 Respaldo diario automático

```bash
sudo mkdir -p /var/backups/dinamyt && sudo chown dinamyt:dinamyt /var/backups/dinamyt
crontab -e
```

(La primera vez pregunta qué editor: elige `1` para `nano`.) Pega al final:

```text
0 3 * * * sudo -u postgres pg_dump -Fc dinamyt > /var/backups/dinamyt/dinamyt-$(date +\%F).dump 2>/dev/null
30 3 * * * find /var/backups/dinamyt -name '*.dump' -mtime +14 -delete
```

Guarda con `Ctrl+O` → Enter → `Ctrl+X`.

⚠️ **Un respaldo que solo vive en el mismo servidor no es un respaldo.** Una vez
por semana, bájatelo a tu PC:

```powershell
scp dinamyt@80.190.78.70:/var/backups/dinamyt/*.dump D:\dinamyt-migracion\respaldos\
```

## 10.2 Que te avisen si se cae

Crea una cuenta gratis en **uptimerobot.com** y añade un monitor HTTP(s) para
`https://campeonatos.dinamyt.org` y otro para `https://club.dinamyt.org`, con
aviso a tu correo. Así te enteras tú antes que un juez.

## 10.3 Snapshot antes del campeonato

⚠️ **El 8 de octubre**, en el panel de Contabo → **Snapshots** → crear uno. Es la
marcha atrás si algo pasa durante el campeonato.

---
---

# Anexo A · Comandos que vas a necesitar siempre

| Para qué | Comando |
|---|---|
| Entrar al servidor | `ssh dinamyt@80.190.78.70` (en tu PC) |
| Ver si una app está viva | `sudo systemctl status campeonatos-api` |
| Ver por qué falló | `sudo journalctl -u campeonatos-api -n 50 --no-pager` |
| Reiniciar una app | `sudo systemctl restart campeonatos-api` |
| Ver el registro en vivo | `sudo journalctl -u campeonatos-api -f` (salir: `Ctrl+C`) |
| Cuánta memoria queda | `free -h` |
| Cuánto disco queda | `df -h /` |
| Entrar a la base | `sudo -u postgres psql -d dinamyt` (salir: `\q`) |

**Desplegar un cambio nuevo** (después de hacer `git push` desde tu PC):

```bash
cd /srv/campeonatos && git pull
cd frontend && npm ci && npm run build
sudo systemctl restart campeonatos-web campeonatos-api
```

⚠️ Si tocaste cualquier variable `NEXT_PUBLIC_*` o `MEMBRESIAS_API_ORIGIN`, hay
que **volver a compilar**, no basta con reiniciar: viven dentro del build.

---

# Anexo B · Academy (opcional, después de que lo demás funcione)

Academy no es necesario para devolver el servicio ni para el campeonato. Móntalo
cuando las cuatro apps del núcleo estén verificadas.

```bash
nano /srv/dinamyt/packages/academy-db/.env
```

```bash
ACADEMY_DATABASE_URL=postgresql://dinamyt_acad:CLAVE_ACAD@127.0.0.1:5432/dinamyt
```

```bash
nano /srv/dinamyt/apps/academy-api/.env
```

```bash
PORT=3007
ECOSYSTEM_JWKS_URL=https://id.dinamyt.org/auth/jwks
ECOSYSTEM_API_URL=https://id.dinamyt.org
ECOSYSTEM_PORTAL_URL=https://dinamyt.org
ACADEMY_WEB_URL=https://academy.dinamyt.org
CORS_ORIGINS=https://dinamyt.org,https://academy.dinamyt.org
ACADEMY_DATABASE_URL=postgresql://dinamyt_acad:CLAVE_ACAD@127.0.0.1:5432/dinamyt
ACADEMY_UPLOADS_DIR=/srv/uploads/academy
FIGURAS_SERVICE_URL=http://127.0.0.1:3009
```

```bash
nano /srv/dinamyt/apps/academy-web/.env.production
```

```bash
NEXT_PUBLIC_API_URL=https://academy.dinamyt.org/api
NEXT_PUBLIC_ECOSYSTEM_API_URL=https://id.dinamyt.org
NEXT_PUBLIC_ECOSYSTEM_PORTAL_URL=https://dinamyt.org
```

> **Ojo, esto corrige un hueco del plan.** El Caddyfile de §7.2 no daba dirección
> pública a la API de Academy, y su web habla con ella **directo desde el
> navegador** (no tiene proxy interno como las otras dos). La solución es
> `handle_path`, que quita el `/api` antes de reenviar:

```caddyfile
academy.dinamyt.org {
	encode zstd gzip

	handle_path /api/* {
		reverse_proxy 127.0.0.1:3007
	}

	handle {
		reverse_proxy 127.0.0.1:3008
	}
}
```

Compilar, migrar y crear los servicios `academy-api` (`:3007`) y `academy-web`
(`:3008`) igual que en la fase 7.

> El microservicio de figuras (`academy-figuras`, Python `:3009`) **no** se
> despliega en B1: la evaluación de figuras quedará sin funcionar hasta que se
> monte.

---

# Anexo C · Lo que queda pendiente después de esto

✅ **B1 está hecho** (20 de agosto): el VPS responde en `dinamyt.org`,
`id.dinamyt.org`, `club.dinamyt.org` y `campeonatos.dinamyt.org`, con HTTPS y
las cuatro apps en systemd.

| Bloque | Qué falta | Tope |
|---|---|---|
| **B2** | Correo con Resend: verificar dominio, plantillas, prueba con SPF y DKIM en verde. Hasta entonces no hay registro por correo ni recuperación de contraseña. **Ya no bloquea a B3**: los usuarios importados entran con su contraseña de siempre. | 5 sep |
| **B3** | Identidad única. **La mitad está hecha** (20 ago): migración `0004`, guion de reconciliación con su ensayo, roles por app en el token y espejo en Membresías → ver **`IDENTIDAD-PASO-A-PASO.md`**. Falta correrlo en el VPS y falta Campeonatos (bloques C1–C7). | 19 sep |
| 🔒 | **Del 1 al 13 de octubre no se toca nada.** Snapshot el día 8. | — |

**Dos arreglos de código pendientes**, los dos en el repo `dinamyt-combat`:

`[ ]` `backend/app/config.py:64` trae `admin@dinamyt.com` como valor por
defecto, y ese dominio es de otra persona. Cámbialo a `admin@dinamyt.org`.

`[ ]` **Campeonatos ejecuta DDL al arrancar** (`ALTER TABLE … ENABLE ROW LEVEL
SECURITY`, en `app/rls.py`) y eso necesita un candado exclusivo. Si hay una
transacción olvidada —y las hay: SQLAlchemy deja la sesión abierta cuando una
petición no cierra—, ese `ALTER` se queda en cola **y bloquea a todo el que
llegue detrás, aunque solo quiera leer**. Pasó el 20 de agosto: tumbó el
respaldo previo a la reconciliación sin un solo error en ningún registro.

> **No es teórico: se bloquea contra sí mismo.** Una de sus sesiones deja la
> transacción abierta y otra pide el candado del arranque; matar la sesión no
> sirve porque la app la regenera. Lo que lo suelta es `systemctl stop
> campeonatos-api`.
>
> Dos costuras que lo cierran: un `SET lock_timeout = '5s'` antes del DDL de
> arranque (mejor que la app se queje a que cuelgue la base), y cerrar la
> sesión en el `teardown_appcontext` de Flask. Mientras tanto, el parche del
> lado de la base ya está puesto:
> `ALTER DATABASE dinamyt SET idle_in_transaction_session_timeout = '5min'`.

---

## Anexo C.1 · El portal, para después del campeonato

Nada de esto es necesario para devolver el servicio ni para el campeonato del
9 de octubre. Va aquí escrito para que no se pierda, y se hace **desde el 14 de
octubre** (§10 del plan maestro, Fase 2).

### C.1.1 El portal por dentro: más completo y con más información

Hoy `ecosystem-portal` es poco más que la puerta de entrada: login, salto a las
apps y el panel del super-admin. Le falta ser la **cara** de DINAMYT.

`[ ]` **Portada pública** — qué es DINAMYT, qué hace cada una de las tres apps,
      capturas, y a quién sirve (club, federación, competidor). Hoy quien llega
      sin cuenta ve un formulario de login y nada más.
`[ ]` **Planes y precios** — qué incluye cada plan y el botón de contacto. Es la
      pieza que §10.1 y §10.2 del plan maestro dan por hecha.
`[ ]` **«Mi cuenta» de verdad** — perfil completo, foto, disciplinas y grado,
      acudientes y menores (§2.2), y **pedir el documento** a quien llegó por la
      reconciliación y no lo tiene.
`[ ]` **«Mi club»** — ficha del club con logo, horarios, dirección y redes, que
      ya existe en `organizations` y nadie enseña.
`[ ]` **Pie de página con el copyright** — `© 2026 DINAMYT. Todos los derechos
      reservados.` más los enlaces a **términos de servicio**, **política de
      privacidad** y **tratamiento de datos personales**. Esto último no es
      cosmética: la app pide documento, fecha de nacimiento, teléfono, tipo de
      sangre y contacto de emergencia de menores de edad. En Colombia eso es la
      Ley 1581 de 2012, y `users.data_consent_at` ya guarda el consentimiento
      sin que haya una página que explique a qué se consintió.
`[ ]` **Contacto y soporte** — `soporte@dinamyt.org`, que sale del Email Routing
      del bloque B2.

### C.1.2 Que Google encuentre DINAMYT

Hoy el portal es una app de Next.js sin una sola señal para un buscador: sin
título propio por página, sin descripción, sin mapa del sitio y sin nada que le
diga a Google qué es esto. Buscar «dinamyt» no lo encuentra.

`[ ]` **`robots.txt`** — permitir la portada y las páginas públicas, y **negar**
      `/admin`, `/perfil` y cualquier ruta con sesión. Que un panel de
      administración salga en Google es un problema, no una victoria.
`[ ]` **`sitemap.xml`** — generado por Next (`app/sitemap.ts`), con la portada,
      planes, cada app y las páginas legales.
`[ ]` **Metadatos por página** (`export const metadata`): título, descripción,
      `canonical`, y `lang="es-CO"` en el `<html>`.
`[ ]` **Open Graph y Twitter Card** — imagen, título y descripción, para que el
      enlace se vea bien cuando alguien lo pegue en WhatsApp (que es por donde
      va a viajar de verdad).
`[ ]` **Datos estructurados** (JSON-LD `Organization` y `SoftwareApplication`)
      con el nombre, el logo y la URL.
`[ ]` **Google Search Console** — verificar el dominio por registro DNS TXT
      (no por archivo: el DNS ya está en Cloudflare y no depende del despliegue)
      y **enviar el sitemap a mano** el primer día. Sin eso, la indexación puede
      tardar semanas.
`[ ]` **Favicon, `apple-touch-icon` y `manifest.webmanifest`** con el logo.
`[ ]` **Comprobar que la portada se sirve en HTML** y no solo tras ejecutar
      JavaScript: si es un componente de cliente, Google ve una página vacía.

> **Los subdominios de las apps no se indexan.** `club.`, `campeonatos.` e
> `id.` son herramientas con sesión, no páginas para buscar: `robots.txt`
> propio con `Disallow: /` en cada uno. Lo que tiene que salir en Google es
> `dinamyt.org` y nada más.

---

## Anexo C.2 · Las fotos, ahora que hay disco propio

**Cómo están hoy.** La foto de cada persona y el escudo del club viajan DENTRO
de la fila, como data-URL en `users.avatar_url` y `orgs.logo_url`, con un tope
de 90 000 caracteres (~66 KB). La API nunca devuelve el data-URL en los
listados: devuelve la dirección de una ruta que sirve la imagen en binario, con
`ETag` y caché de un año.

**Y estaba bien.** En Render el disco se borra en cada despliegue y en Vercel es
de solo lectura: meter la imagen en la base era la única opción que no obligaba
a contratar un bucket, y quien lo escribió dejó resueltos los dos problemas que
eso trae (el tamaño y que no viaje en los listados).

**Lo que cambió el 20 de agosto:** ahora hay un disco que no se borra, y un
Caddy delante que sabe servir archivos sin despertar a Node.

### Lo que cuesta dejarlo como está

| | |
|---|---|
| **+33 % de peso** | Base64 es así. Una foto de 60 KB ocupa 80 KB en la fila |
| **El respaldo carga con todo** | El volcado diario que sube a la nube lleva dentro todas las fotos de todos los clubes, todas las noches, hayan cambiado o no |
| **Cada foto es una consulta** | Servirla despierta a Node y a PostgreSQL. Un archivo en disco lo sirve Caddy solo, y con Cloudflare delante (Anexo D) ni siquiera llega al servidor |
| **El carnet se ve regular** | 66 KB obliga a recomprimir fuerte. Con archivos en disco, el tope lo pone el sentido común y no la fila |

### Cómo se hace bien

1. **El binario al disco, la clave a la base.** La columna deja de guardar la
   imagen y guarda `/media/fotos/a3f9…c1.webp`.
2. **El nombre es el hash del contenido.** Misma foto = mismo archivo; foto
   nueva = nombre nuevo. Eso permite cachear «para siempre»
   (`Cache-Control: public, max-age=31536000, immutable`) sin miedo a servir la
   vieja, que es el problema clásico de las fotos de perfil.
3. **Caddy la sirve** desde `/srv/media` con `file_server`. Node no se entera.
4. **Dos tamaños**: la original y una miniatura para el roster y el carnet
   (`sharp` en Node hace las dos al subirla).
5. **El disco pasa a ser estado**: entra en el respaldo diario junto al volcado
   (`rclone` ya sube a R2; se le añade la carpeta).
6. **La migración no rompe nada**: la columna acepta las tres formas
   (`data:`, `/media/…`, `https://`) y ya hay una función que las distingue
   (`esImagenIncrustada`). Un guion recorre las filas, escribe el archivo y
   reescribe la columna. Idempotente, y con la app en marcha.

### Cuándo

**Después del campeonato.** Toca las dos apps y no arregla nada que hoy duela:
con un club y fotos de 25 KB, esto es higiene, no urgencia. Adelántalo solo si
el volcado diario empieza a pesar de verdad (digamos, más de 200 MB) o si
quieres fotos decentes en el carnet impreso.

---

## Anexo C.3 · Una sola fuente de verdad para los datos de la persona

**La regla, en una frase:**

> **La persona se edita en el portal. La ficha se edita en su app.**

Hoy el mismo dato se puede tocar en tres sitios y gana el último que escribió.
Con la reconciliación hecha, eso deja de ser un detalle: si el nombre está en
`ecosystem.users` y también en `membresias.users`, el carnet y la planilla del
campeonato acaban diciendo cosas distintas de la misma persona.

### El reparto

| Dato | Dónde vive | Quién lo edita |
|---|---|---|
| Nombre, correo, documento, teléfono, nacimiento, foto | `ecosystem.users` | **La persona**, en el portal |
| Tipo de sangre, contacto de emergencia | `ecosystem.users` | La persona |
| Acudiente ↔ menor | `ecosystem.user_guardians` | La persona (el maestro lo propone) |
| **Grado / cinturón** | `ecosystem.user_disciplines` | **El maestro.** Un grado es una certificación del club, no algo que uno se pone |
| Plan, pagos, asistencias, carnet | `membresias` | El maestro |
| Categoría, peso, inscripciones, resultados | `campeonatos` | El maestro y el admin |

### Cómo se implementa

`[ ]` En Membresías y Campeonatos, los datos de persona se ven **en solo
      lectura**, con un botón **«Editar en dinamyt.org»** que lleva al portal y
      vuelve a donde estabas.
`[ ]` Sus endpoints de escritura **dejan de aceptar** esos campos. Que la
      pantalla no los muestre no basta: la API es la puerta que hay que cerrar.
`[ ]` El ecosystem expone `GET /users/:sub/perfil` y
      `GET /organizations/:id/members` (§4.1 #8 del plan maestro).
`[ ]` Cada app guarda un **espejo de solo lectura** (nombre y foto, lo que se
      pinta en cada pantalla), refrescado en el login y con caducidad corta.
      **El espejo no es opcional**: sin él, Campeonatos en modo local —el día
      del evento, sin internet— no sabría ni cómo se llama la gente.

### Las dos excepciones, que son de verdad

1. **La ficha sin cuenta.** El alumno sin correo no tiene persona en el
   ecosistema: ahí el maestro sigue editándolo todo en Membresías, como hoy. El
   día que esa ficha se enlace a una cuenta, sus datos de persona pasan a solo
   lectura y lo que había se sube al ecosistema **solo donde el hueco esté
   vacío**.

2. **Corregir a quien todavía no ha entrado.** El maestro escribe «Jhon» y era
   «John». Si la persona nunca ha iniciado sesión en el portal, no hay a quién
   pedirle que lo arregle. Para eso: `[ ]` añadir `users.last_login_at`, y
   permitir al gestor del club editar los datos de persona de sus miembros
   **mientras esa columna esté en NULL**. En cuanto la persona entra una vez,
   sus datos son suyos.

> **Por qué el grado es del ecosistema y no de Membresías.** Porque el
> competidor que se inscribe a un campeonato lleva su cinturón, y hoy ese dato
> se escribe a mano por segunda vez en Campeonatos. Con el grado en la persona,
> la inscripción se rellena sola y deja de haber dos verdades sobre la misma
> franja.

---
---

# Anexo D · Encender el proxy de Cloudflare (la nube naranja)

Hoy los registros están en **DNS only** (nube gris): Cloudflare solo dice dónde
está el servidor y el tráfico va directo a él. Con el proxy encendido, Cloudflare
se pone **en medio**: esconde la IP del servidor, absorbe los ataques de volumen,
sirve las imágenes desde su borde y filtra basura antes de que llegue a tus 8 GB
de RAM.

**Sí, vale la pena encenderlo. Pero antes hay tres cosas, o pierdes más de lo
que ganas.**

## D.1 Lo que hay que hacer ANTES de tocar la nube

### 1 · Que las apps sigan sabiendo quién llama

Con Cloudflare en medio, la IP que ve tu servidor es la de Cloudflare, no la de
la persona. Y todos los límites de intentos están hechos por IP. Si no se
arregla, **todo el mundo cae en el mismo cubo**: los diez inicios de sesión por
minuto dejan de ser diez por persona y pasan a ser diez para la plataforma
entera — y `fail2ban` acabaría baneando a Cloudflare, es decir, a todos.

Las tres apps ya saben contar saltos. Hoy hay uno (Caddy); con Cloudflare hay
dos:

```bash
sudo sed -i 's/^TRUST_PROXY_HOPS=.*/TRUST_PROXY_HOPS=2/' /srv/dinamyt/apps/ecosystem-api/.env
sudo sed -i 's/^TRUST_PROXY_HOPS=.*/TRUST_PROXY_HOPS=2/' /srv/membresias/apps/membresias-api/.env
sudo sed -i 's/^TRUST_PROXY_HOPS=.*/TRUST_PROXY_HOPS=2/' /srv/campeonatos/backend/.env
sudo systemctl restart dinamyt-id membresias-api campeonatos-api
```

> Si `TRUST_PROXY_HOPS` no aparece en el `.env` del ecosystem, es que tienes el
> código de antes del 20 de agosto: haz `git pull`, vuelve a compilar y añade la
> línea a mano (`TRUST_PROXY_HOPS=2`).

### 2 · SSL/TLS en **Full (strict)**

En Cloudflare → **SSL/TLS** → **Overview** → **Full (strict)**.

⚠️ **Nunca «Flexible».** Ese modo hace que Cloudflare hable HTTP con tu
servidor: el candado del navegador dice «seguro» y el último tramo viaja en
claro. Caddy ya tiene un certificado válido de Let's Encrypt, así que
Full (strict) funciona tal cual, sin tocar nada en el servidor.

### 3 · Dejar el puerto 80 abierto

Es por donde Caddy renueva el certificado. Cloudflare deja pasar
`/.well-known/acme-challenge/` sin redirigirlo, justo para esto. Si cierras el
80 «porque todo va por HTTPS», el certificado deja de renovarse y te enteras
noventa días después.

## D.2 Encenderla, registro por registro

| Registro | Nube | Por qué |
|---|---|---|
| `dinamyt.org` (A) | 🟠 **naranja** | La portada es lo que más se beneficia del borde |
| `www` | 🟠 naranja | |
| `id` | 🟠 naranja | |
| `club` | 🟠 naranja | |
| `campeonatos` | 🟠 naranja, **pero lee D.3 antes** | |
| `MX`, `TXT`, `_dmarc` | ⚪ gris (no se pueden proxiar) | El correo no pasa por el proxy |

> **Un subdominio proxiado sin nada detrás da error 525.** Si `academy` está en
> naranja pero Academy todavía no está montada, Caddy no tiene certificado para
> ese nombre y Cloudflare no puede completar el TLS con el origen: error 525 a
> la vista de todos, y de paso le cuentas al mundo que ese subdominio existe.
> **Bórralo del DNS hasta que Academy esté en marcha** (Anexo B) y vuelve a
> crearlo entonces.

> **Un registro gris que apunte a tu IP tira todo el beneficio a la basura.**
> Si dejas un `A` tipo `vps.dinamyt.org` o `ssh.dinamyt.org` apuntando al
> servidor, cualquiera lo consulta y ya sabe la IP real: puede saltarse
> Cloudflare por completo. Bórralos. Para entrar por SSH usa la IP directamente,
> que es lo que ya haces.

## D.3 Campeonatos tiene dos particularidades

| Qué | Cómo se porta detrás del proxy |
|---|---|
| **Socket.IO** (combate en vivo) | Funciona: Cloudflare admite WebSockets en el plan gratis, y el *ping* cada 25 s mantiene la conexión por debajo del corte por inactividad |
| **Exportar PDF/Excel/ZIP** | ⚠️ **Cloudflare corta a los 100 segundos** (error 524). Si una exportación grande tarda más, deja de funcionar |
| **Subir fotos** | Sin problema: el tope del plan gratis son 100 MB y las fotos pesan decenas de KB |

**Antes de ponerlo naranja, cronometra la exportación más pesada que tengas.**
Si pasa de un minuto y medio, deja `campeonatos` en gris hasta después del
evento.

## D.4 Lo que NO hay que encender

| Opción | Por qué no |
|---|---|
| **Bot Fight Mode** y los *challenges* automáticos | Meten un desafío de JavaScript que rompe WebSockets y cualquier cliente que no sea un navegador |
| **Rocket Loader** | Reordena la carga de JavaScript y rompe Next.js |
| **Reglas de caché sobre `/api/*`** | Una regla mal puesta puede servirle a una persona la respuesta de otra. Si creas alguna, excluye `/api/*` y `id.dinamyt.org` entero |

## D.5 Comprobar que quedó bien

```bash
curl -sI https://dinamyt.org | grep -iE "server|cf-ray"
```

✅ Responde `server: cloudflare` y una línea `cf-ray`.

```bash
sudo journalctl -u dinamyt-id -n 50 --no-pager | grep -i "ip"
```

✅ **La comprobación que de verdad importa**: entra al portal desde el celular
con datos móviles y mira que en el registro aparezca **tu IP de celular**, no
una de Cloudflare (`104.x`, `172.6x`, `188.114.x`). Si ves las de Cloudflare,
el paso D.1.1 no quedó: apaga la nube naranja hasta arreglarlo.

Y a mano: iniciar sesión, subir una foto, abrir un combate y ver que puntúa en
vivo.

## D.6 Más adelante, con calma: cerrar la puerta de atrás

Con el proxy encendido, quien averigüe la IP puede saltárselo. Se cierra
dejando que solo Cloudflare hable con los puertos 80 y 443 (`ufw allow from
<rangos de Cloudflare>`). **No lo hagas el mismo día**: si mañana apagas la nube
naranja, el sitio se queda mudo y cuesta ver por qué. Y **nunca** entre el 1 y
el 13 de octubre.

---
---

# Anexo E · El correo (bloque B2), paso a paso

**Por qué no ves ningún registro de correo: porque no existe todavía.** Un
dominio recién comprado no recibe ni envía correo hasta que se lo montas, y son
**dos cosas distintas** que se contratan por separado:

| | Qué hace | Con qué | Registros que aparecen |
|---|---|---|---|
| **Recibir** | Que `soporte@dinamyt.org` te llegue al Gmail | **Cloudflare Email Routing** (gratis) | 3 `MX` + 1 `TXT` de SPF |
| **Enviar** | Que DINAMYT mande códigos e invitaciones | **Resend** (gratis: 3.000/mes, 100/día) | 1 `MX` + 1 `TXT` sobre `send`, + 1 `TXT` de DKIM |
| **Proteger** | Que nadie mande correo fingiendo ser tú | Un `TXT` a mano | `_dmarc` |

> **Los registros de correo NUNCA van en naranja.** Cloudflare solo proxia
> `A`, `AAAA` y `CNAME`; los `MX` y los `TXT` salen siempre grises. No es un
> olvido tuyo: es que el correo no pasa por el proxy.

## E.1 · Recibir: Cloudflare Email Routing ⏱ 10 min

1. En el panel de Cloudflare, con `dinamyt.org` seleccionado: menú **Email** →
   **Email Routing** → **Get started**.
2. **Destination address**: tu Gmail. Cloudflare te manda un correo de
   verificación — ábrelo y confirma, o nada de esto funciona.
3. **Custom addresses**: crea las dos que ya están escritas en la configuración
   del servidor:

   | Dirección | Va a |
   |---|---|
   | `soporte@dinamyt.org` | tu Gmail |
   | `admin@dinamyt.org` | tu Gmail |

4. Cloudflare te ofrece **añadir los registros solo**. Acepta: pone tres `MX`
   y un `TXT` con `v=spf1 include:_spf.mx.cloudflare.net ~all`.

✅ Mándate un correo desde tu propio Gmail a `soporte@dinamyt.org`. Si te
llega de vuelta, esta mitad está hecha.

> **Ojo con responder.** Email Routing **solo recibe**. Si contestas desde tu
> Gmail, el remitente será tu Gmail personal, no `soporte@dinamyt.org`. Para
> responder con la dirección del dominio hay que configurar «Enviar como» en
> Gmail usando el SMTP de Resend — pero eso puede esperar.

## E.2 · Enviar: Resend ⏱ 20 min + espera de DNS

> **Antes de nada, la migración `0007_registro_pendiente`.** El registro cambió:
> la cuenta ya no nace al pulsar «Crear cuenta», nace cuando la persona teclea
> el código. Sin la tabla `ecosystem.pending_registrations`, `/auth/register` y
> `/auth/verify-email` responden 500. Ver
> [CORREO-PASO-A-PASO.md](CORREO-PASO-A-PASO.md), §0.

1. Crea la cuenta en **resend.com** (el plan gratis basta: 3.000 al mes, **100
   al día**, un dominio).
2. **Domains** → **Add Domain** → `dinamyt.org`. Elige la región más cercana.
3. Resend te muestra **los registros que hay que crear**. Cópialos **tal cual**
   en Cloudflare (**DNS only**, gris), sin cambiar ni un carácter:
   - un `MX` y un `TXT` de SPF sobre el subdominio de envío (`send`),
   - un `TXT` de **DKIM** (`resend._domainkey`).
4. Vuelve a Resend y pulsa **Verify**. Puede tardar unos minutos.

> **Por qué el SPF de Resend va en `send.dinamyt.org` y no en la raíz:** porque
> **solo puede haber UN registro SPF por nombre**. En la raíz ya está el de
> Email Routing; meter otro ahí rompe los dos y el correo empieza a caer en spam
> sin que nada dé error. Si algún proveedor te pide SPF en la raíz, no añadas un
> segundo: se **fusionan** en una sola línea con los dos `include:`.

5. **API keys** → **Create API Key** (permiso de envío). Cópiala: solo se ve una
   vez.
6. En el servidor:

```bash
sudo nano /srv/dinamyt/apps/ecosystem-api/.env
```

```bash
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASS=re_xxxxxxxxxxxxxxxxxxxx
MAIL_FROM=DINAMYT <no-reply@dinamyt.org>
MAIL_REPLY_TO=soporte@dinamyt.org
MAIL_DAILY_MAX=90
```

```bash
sudo systemctl restart dinamyt-id
# `--since` y no `-n 20`: al arrancar, Nest imprime una línea por cada una de
# las 62 rutas DESPUÉS del mensaje del correo. Con la cola corta no se ve.
sudo journalctl -u dinamyt-id --since "5 min ago" --no-pager | grep -iE "correo|smtp"
```

✅ Tiene que decir `Correo por SMTP: smtp.resend.com:587`. Si dice «SMTP_HOST
sin configurar», el `.env` no se guardó o el servicio no se reinició.

## E.3 · Proteger: DMARC ⏱ 2 min

En Cloudflare → **DNS** → **Add record**:

| Campo | Valor |
|---|---|
| Type | `TXT` |
| Name | `_dmarc` |
| Content | `v=DMARC1; p=none; rua=mailto:soporte@dinamyt.org` |

**Empieza en `p=none`.** Significa «avísame, no bloquees»: durante dos semanas
recibes informes de quién manda correo en tu nombre. Cuando los informes estén
limpios, se sube a `quarantine` y luego a `reject`. Ponerlo en `reject` el
primer día es la forma más rápida de que tus propios correos dejen de llegar.

## E.4 · La prueba de que quedó bien ⏱ 5 min

1. En el portal, **«¿Olvidaste tu contraseña?»** con tu propio correo. Tiene que
   llegar el código.
2. Mira la cabecera del correo recibido (en Gmail: **⋮** → *Mostrar original*).
   ✅ **SPF: PASS**, **DKIM: PASS**, **DMARC: PASS**.
3. Invita a alguien desde el panel del club. Ahora el enlace **ya no se
   devuelve** en la respuesta: va por correo, que es como tiene que ser.

> Con 100 alumnos salen unos **12–13 correos al día** contra un tope de 100. El
> aviso de «hay clase hoy» por correo serían 100 diarios —el tope exacto, todos
> los días—: por eso ese aviso va por push y por la campana, **nunca** por
> correo.

---
---
