# DINAMYT — Hoja de ruta

> **Lo que queda por hacer, en orden, y nada más.** Los planes ya cumplidos se
> borraron el 26 de septiembre de 2026; las decisiones que siguen mandando están
> en `OPERAR.md` §1.6.
>
> **Cómo se lleva:** cuando algo se termina, **se borra de aquí**. Si deja una
> regla, una trampa o un comando que se vuelve a usar, eso pasa a `OPERAR.md`
> en su parte. Este archivo tiene que encoger, no crecer.
>
> Desplegar cualquier cosa: `OPERAR.md` Parte 2 (y el orden de §1.2). Montar
> algo nuevo en el servidor: `MONTAR-VPS.md`. Nunca se despliega durante un
> campeonato ni la víspera (§1.5).

---

## Dónde estamos

*(15 de octubre de 2026, comprobado por SSH y `curl`)*

| Pieza | Estado |
|---|---|
| Portal + identidad | En la VPS con `3d2befb` (15 oct): la política nueva, la línea de IA, la clave de cifrado puesta (las 6 notas médicas, cifradas) y `POST /sync/baja` |
| Campeonatos | En la VPS con `7c6ff7b` (15 oct): el plan entero, el candado de sede, **la publicación en vivo** y la línea de IA en el pie |
| Membresías | En la VPS con `4002076` (15 oct): eliminar a alguien del club y la línea de IA en el pie |
| Academy | **No está montada**: ni servicios, ni `.env`, ni Caddy, ni DNS. En código, entera: 28/28 pruebas (con el borrado de cuentas) |
| Fotos en disco | **Encendidas**: `MEDIA_PUBLIC_URL` y `MEDIA_DIR` puestos, 30 imágenes en `/srv/dinamyt-media`. Las sirve Node, no Caddy |
| Respaldos diarios | **Funcionan desde el 13 oct**: `dinamyt-respaldo.timer` a las 03:00. El primero pesa 718 KB (53 tablas con datos, `pg_restore` lo lee) y lleva 30 archivos de 30. La copia fuera del servidor es **automática desde el 15 oct**: una tarea de Windows en tu PC, los domingos, que guarda 8 (`OPERAR.md` §2.5) |
| Secretos de sync por app | **Puestos el 15 oct**: las dos parejas con la misma huella. Falta quitar el compartido (tarea 4) |
| DMARC | Sigue en `p=none` (tocaba subirlo desde el 12 sep) |
| Google | Propiedad verificada (etiqueta y TXT) |
| Cabeceras de seguridad | En el portal, Campeonatos y Membresías desde el 26 sep, con la CSP **en modo informe** (tarea 5) |
| Estilos compartidos | Al día en las cuatro webs (`repartir-estilos.ps1 -Comprobar`) |
| Política de privacidad | En línea desde el 15 oct. **Sin desplegar**: el servidor en Estados Unidos (Carlstadt), el Auto Backup de Contabo y el responsable completo (nombre, domicilio, dirección, correo y teléfono) |
| Borrar mi cuenta | **En `main`, sin desplegar** (15 oct, revisado con thermos): Configuración → «Borrar mi cuenta», 7 días de gracia, vencido el plazo ya no se cancela, borrado en las tres apps y en Academy (migración `0024` del ecosistema). `CAMPEONATOS_SYNC_URL` ya está en la VPS (`OPERAR.md` §4.15) |

---

## El orden

| # | Qué | De qué es | Tamaño |
|---|---|---|---|
| 0 | [**Cumplir lo que la política promete**](#0--cumplir-lo-que-la-política-promete), y revisar el código con thermos y anti-slop | Decisiones tuyas + código | Días, por fases |
| 1 | [Probar lo desplegado](#1--probar-lo-desplegado), candado y publicación en vivo incluidos | A mano | 2–3 h |
| 2 | [DMARC a `quarantine`](#2--dmarc-a-quarantine) | DNS | 15 min, y mirar informes antes |
| 3 | [Lo que queda de las fotos](#3--lo-que-queda-de-las-fotos) | Servidor | 20 min |
| 4 | [Un secreto de sincronización por app](#4--un-secreto-de-sincronización-por-app--falta-quitar-el-compartido) | **Tú**: quitar el compartido | 5 min, desde el 16 oct |
| 5 | [La CSP, de informe a estricta](#5--la-csp-de-informe-a-estricta) | **Tú**: mirar informes; yo, corregir | Desde el 3 oct |
| 6 | [**Encender Academy**](#6--encender-academy) | Pruebas + servidor | 1–2 días, y una semana de uso |
| 7 | [**Traducir lo que falta**](#7--traducir-lo-que-falta) | Código | Por pantallas |
| 8 | [Fase 2: precios, plan gratuito, multi-arte](#8--fase-2) | Negocio + código | Semanas |
| 9 | [Deuda pequeña](#9--deuda-pequeña) | Varios | Cuando toque |
| — | [En espera: WhatsApp y F9](#en-espera) | — | — |

**Por qué este orden.** El 0 va delante porque es lo único de la lista que
puede acabar en un reclamo ante la SIC: lo que la política promete tiene que
sostenerlo el código, y lo que falta ahí es tuyo (0.1). Del 1 al 3 cuestan minutos y cierran riesgos que ya
existen hoy. El 4 y el 5 son seguridad de lo que está en producción todos los
días. La arquitectura del evento ya está entera en código —el candado de sede y
la publicación en vivo, `OPERAR.md` §4.25—; lo que le falta es la prueba a mano
de la tarea 1. **Si aparece una fecha de campeonato, esa prueba, el ensayo
(`OPERAR.md` §2.9) y el simulacro (`INICIAR-LOCAL.md` §0) pasan delante de
todo.**

---

## 0 · Cumplir lo que la política promete

Sale de la auditoría del 13 de octubre de 2026 contra la Ley 1581 de 2012. La
política (`/privacidad`, la única de las cuatro apps: las demás la enlazan) ya
describe lo que el código hace. Lo que sigue es lo que el código todavía **no**
hace, o lo que solo tú puedes decidir.

### 0.1 · Lo que solo tú puedes poner

- **Una consulta con abogado**, con estas preguntas y con el **borrador de los
  Términos y condiciones y del acuerdo con cada club** (15 oct) para que lo
  corrija antes de publicarlo. Sin Términos, `/planes` vende algo sin
  condiciones escritas (antislop, auditoría 001, nº 6):
  1. El reparto responsable/encargado entre DINAMYT y cada club: el maestro da
     de alta alumnos que nunca aceptaron nada, y el alumno con carnet QR o PIN
     no tiene cuenta. ¿Hace falta un contrato de transmisión con cada club?
  2. Los datos salen a Estados Unidos. Está en la lista de la SIC (Circular
     Externa 005 de 2017), pero hay que poder demostrar las medidas: ¿bastan
     los contratos de encargo (DPA) de Contabo, Resend, Cloudflare y Google?
  3. Datos de salud y de menores: las notas médicas y el tipo de sangre son
     sensibles (autorización expresa y opcional), y muchos alumnos son menores
     (autorización del acudiente, que hoy el registro no exige, ver 0.2).
  4. Si aplica el Registro Nacional de Bases de Datos (a una persona natural,
     en principio no).
  5. Cuánto tiempo se conservan pagos y resultados.
  6. Si faltan términos y condiciones de uso, y qué exige cobrar planes (RUT,
     factura electrónica).

### 0.2 · Lo que la política dice y nada obliga

- **El contacto de emergencia y el tipo de sangre no van cifrados.** La
  política ya lo dice así. Cifrarlos es posible en el ecosistema; la copia de
  Membresías se imprime en el carnet.
- **Lo que no caduca nunca**: `otp_codes`, `org_notifications` y las
  invitaciones y solicitudes ya respondidas. (Las sesiones sí se borran, un mes
  después de caducar; en `audit_auth` no escribe nadie.) Fijar un plazo y purgar.
- **Las copias que no rotan**: los volcados manuales de `/var/backups/` y los
  de Supabase del 19 ago que siguen en `D:\dinamyt-migracion\respaldos\`.
  La copia semanal del PC sí rota (guarda 8) y el Auto Backup de Contabo
  también (10 días): las dos ya son verdad en la política.
- **«Los menores se registran con autorización de su acudiente»** es una
  costumbre (§1.5), no una regla: el registro valida la fecha (entre 3 y 100
  años) pero no distingue a quien tiene menos de 18.
- **Quien ya aceptó la política vieja no sabe que cambió.** Un cambio de fondo
  se comunica, y `data_consent_at` no guarda qué versión se aceptó.
- **Ningún asistente de IA recibe filas reales.** La política dice que la
  aplicación no envía datos a proveedores de IA; para que también sea verdad de
  la operación, al depurar se pegan conteos, nunca datos de personas.
- **El alumno sin cuenta** (carnet QR o PIN) nunca aceptó la política. Va en la
  consulta de 0.1.
- **Membresías sola, sin portal, no enlaza ninguna política.**
- **La casilla del registro** está escrita a mano en castellano (tarea 7).

### 0.3 · Antes de encender Academy (tarea 6)

- No tiene pie: ni privacidad, ni soporte, ni la línea de IA.
- **La política no la nombra.** «Qué pasa cuando pides borrar tu cuenta» dice
  DINAMYT, Membresías y Campeonatos: añadir Academy, y que lo que un maestro
  publicó (contenidos, evaluaciones, figuras, anuncios) se queda sin su
  nombre. El borrado ya está en código (`POST /sync/supresion`, OPERAR §4.15).
- **Las evidencias subidas y nunca entregadas** no tienen dueño en la base
  (`evidencias/<uuid>`), así que no se borran con la cuenta. Un barrido que
  borre las que ninguna respuesta nombra.
- Los videos se incrustan desde `www.youtube.com` y `drive.google.com`, que
  ponen sus cookies. Pasar a `youtube-nocookie.com` y nombrar a los dos en la
  política.
- **El microservicio de figuras analiza la postura con un modelo** (MediaPipe).
  Corre en nuestro servidor, pero es IA que mira imágenes de alumnos, muchos
  menores: hoy la política dice que la aplicación no usa IA, y deja de ser
  verdad el día que esto se encienda.

### 0.4 · Revisar el código que ya existe

- **thermos** (dos revisores: fallos y seguridad, y calidad) sobre cada rama
  antes de fusionarla. Se lanza con `/thermos`. El 15 oct revisó
  `feat/borrar-cuenta`: lo que quedó para después está en 0.5.
- **anti-slop en modo «after»**, una app cada vez. **El portal, hecho el 15
  oct** (`anti-slop/audit-001-2026-10-15.md`): las altas y medias corregidas;
  las **bajas 11 a 16 esperan que elijas números**. Siguen Membresías,
  Campeonatos y Academy. Se pide en el chat: «audita Membresías con antislop
  en modo after». Deja una lista numerada en `anti-slop/`, tú eliges los
  números y solo esos se tocan.
- **`/claude-api prompt-audit`** al cambiar de modelo. El 13 oct salió limpio.
  La skill `frontend-design` del repo va por detrás de la de `anthropics/skills`.

### 0.5 · Lo que thermos dejó para después (15 oct)

La revisión de `feat/borrar-cuenta` (dos revisores: fallos y calidad). Lo de
antes de fusionar se hizo; esto quedó:

- **El PC del evento vuelve a publicar.** Un competidor borrado arriba
  reaparece si el PC del evento lo sube otra vez (`sincronizacion.py` lo
  empareja por `uid` o por documento). Que el importador salte los `uid` de
  fichas borradas.
- **Un organizador de Campeonatos que borra su cuenta** deja su workspace (sus
  campeonatos, llaves y fichas) sin quien lo gestione, salvo el super admin: el
  workspace es su propio id, y la regla de «la única persona que administra»
  solo mira los roles del ecosistema. Decidir: impedirlo hasta que traspase, o
  dejarlo al super admin.
- **Un borrado atascado no avisa a nadie.** La persona ve «se está borrando»;
  el motivo solo sale en el registro y en la respuesta del cron. Avisar a
  soporte si se aplaza más de una vez: la ley da 15 días hábiles.
- **Borrar a un acudiente borra `user_guardians` con su `consent_at`**, que es
  la única constancia del consentimiento por el menor. Decidir si se conserva.
- **Las llaves ya generadas de un campeonato en preparación** siguen con el
  nombre y el club de quien se borró.
- **Campeonatos no recuerda las cuentas borradas.** Un pase emitido antes del
  barrido (dura 30 min) haría nacer otra vez el usuario al entrar.
- **`Confirmar.tsx` está copiado a mano en Membresías.** Generalizar
  `repartir-estilos.ps1` a una lista (origen, destinos) con `-Comprobar`.
- **Las pruebas del servicio usan una base simulada** que contesta en orden.
  Pasar el ensayo de `supresion:ensayo` a jest sobre PGlite y quitar la cola.
- Menores: las constantes `BORRAR`, `7` y `PERSONA ELIMINADA` están copiadas
  en el portal, la API y Academy (pueden ir a `@dinamyt/shared`); el aviso
  pregunta al cambiar de pantalla; `dondeEsElUnicoGestor` hace una consulta
  por club.

---

## 1 · Probar lo desplegado

Todo el plan de Campeonatos está en la VPS desde el 26 de septiembre —el
candado de sede incluido— y **nadie lo ha recorrido todavía con una persona
delante**. La publicación en vivo (1 oct) entra en cuanto se despliegue.

1. `PRUEBAS-PLAN-CAMPEONATOS.md` (en `dinamyt-combat`, espejado en
   `productos/campeonatos/`), de arriba abajo, **§12 (el candado) y §13 (la
   publicación en vivo) incluidas**: son las únicas piezas de la arquitectura
   del evento que solo se prueban con el PC del evento delante. Las dos
   comprobaciones del despliegue ya están marcadas; falta la del registro de
   arranque, que pide `sudo`:

   ```bash
   sudo journalctl -u campeonatos-api --since "today" | grep ecosistema
   ```

   Tiene que decir «pase RS256 y espejo: los dos ENCENDIDOS».
2. **En una tableta**, la pantalla del tatami (`/tatami/<id>`): desde el 15
   oct los `btn-sm` miden 44 px con pantalla táctil (antislop, auditoría 001,
   nº 4). Que nada se descuadre ni tape los `combat-btn`, que no cambiaron.
3. El ensayo de punta a punta, `OPERAR.md` §2.9, **y anotar la fila** en su
   tabla. Con la bajada «para el evento» (`-ParaElEvento`) y con
   `CAMPEONATOS_ONLINE_URL` en el `.env` del PC: el marcador de
   `campeonatos.dinamyt.org/resultados` tiene que moverse con el evento y
   enseñar su hora.

**Hecho cuando:** todas las casillas marcadas, cada fallo apuntado aquí como
tarea, y una fila nueva en la tabla de §2.9.

---

## 2 · DMARC a `quarantine`

`p=none` se publicó el 29 de agosto; con dos semanas de informes ya se puede
subir. Es un TXT y la vuelta atrás es inmediata.

1. En Cloudflare, **Email → DMARC Management**, lo que se busca no es «que no
   haya fallos», es **que todo lo que falla sea de fuera**:
   - los envíos propios pasan (Resend, firmando con `d=dinamyt.org`). Si aquí
     hay fallos, **no se sube nada**: `quarantine` mandaría a spam los códigos
     de verificación y los enlaces de contraseña;
   - el «Enviar como» de Gmail para `soporte@` pasa (MONTAR-VPS Anexo E.5);
   - lo que falla es remitente desconocido: eso es lo que la política bloquea.
2. Que `resend._domainkey` siga publicado: es la única pieza que alinea el
   correo saliente (`OPERAR.md` §3.5).
3. Cambiar el TXT `_dmarc` a:

   ```
   v=DMARC1; p=quarantine; rua=mailto:cdd94eda59444bbf83153adc4282b0c5@dmarc-reports.cloudflare.net
   ```

4. Comprobarlo en el DNS, no en el panel:

   ```powershell
   (Resolve-DnsName -Name _dmarc.dinamyt.org -Type TXT).Strings
   ```

5. **Una semana después**, lo mismo con `p=reject`. Nunca durante un campeonato
   ni la víspera: un `reject` mal calibrado cuando salen las invitaciones es el
   peor momento para averiguarlo, y la caché del DNS tarda.

**Hecho cuando:** `p=reject` publicado y una semana sin correo perdido. Entonces
se actualiza `OPERAR.md` §3.1 y §3.5 y esto se borra.

---

## 3 · Lo que queda de las fotos

Cuando haya un rato:

- Que no quede nada incrustado. En seco, que solo cuenta:
  `cd /srv/dinamyt && pnpm --filter @dinamyt/ecosystem-api fotos:al-disco`. Si
  lista filas: respaldo (`OPERAR.md` §2.5) y el mismo comando con `--aplicar`.
- El atajo de Caddy, para que una foto no despierte a Node (hoy la respuesta
  lleva `x-powered-by: Express`). En el bloque de `id.dinamyt.org` del
  Caddyfile, delante del `reverse_proxy`:

  ```caddyfile
  	handle /media/* {
  		root * /srv/dinamyt-media
  		file_server
  		header Cache-Control "public, max-age=31536000, immutable"
  		header X-Content-Type-Options "nosniff"
  		header Content-Security-Policy "default-src 'none'; sandbox"
  	}
  ```

  y `sudo systemctl reload caddy`. Comprobación:
  `curl -sI https://id.dinamyt.org/media/<un-archivo>.jpg` ya no dice
  `x-powered-by`.

---

## 4 · Un secreto de sincronización por app — falta quitar el compartido

Los secretos propios están puestos desde el 15 oct de 2026: las dos parejas con
la misma huella y los tres servicios reiniciados justo después. Mientras el
`ECOSYSTEM_SYNC_SECRET` compartido siga en el `.env` del ecosistema, se acepta
con un `WARN [SecretoSync]`. Queda un paso:

1. Un día después, si
   `sudo journalctl -u dinamyt-id --since "1 day ago" | grep SecretoSync` no
   saca nada, **borra** `ECOSYSTEM_SYNC_SECRET` del `.env` del ecosistema
   —solo de ese: en Membresías y Campeonatos es ya su secreto propio— y
   `sudo systemctl restart dinamyt-id`.

Las parejas, sin `sudo` y sin enseñar ningún valor (cada una tiene que dar la
misma huella):

```bash
h(){ sed -n "s/^$2=//p" "$1" | tr -d '\r"' | tail -1 | sha256sum | cut -c1-8; }; E=/srv/dinamyt/apps/ecosystem-api/.env
echo "$(h $E SYNC_SECRET_MEMBRESIAS) $(h /srv/membresias/apps/membresias-api/.env ECOSYSTEM_SYNC_SECRET)  ·  $(h $E SYNC_SECRET_CAMPEONATOS) $(h /srv/campeonatos/backend/.env ECOSYSTEM_SYNC_SECRET)"
```

(`ensayo.sh estado` dice «SIN PONER» si se corre sin `sudo`: no puede leer los
`.env`.) El PC del evento sigue sin llevar ninguno (D8).

---

## 5 · La CSP, de informe a estricta

**Desplegado el 26 sep 2026, 13:03** (`OPERAR.md` §4.24): el portal,
Campeonatos y Membresías mandan las cabeceras de seguridad y la CSP en **modo
informe**, que no bloquea nada y escribe en el registro lo que bloquearía.

Lo que queda, **desde el 3 de octubre** (una semana después):

1. Mirar los informes de cada web:

   ```bash
   for s in dinamyt-portal membresias-web campeonatos-web; do echo "== $s"; sudo journalctl -u $s --since "7 days ago" | grep '\[CSP\]' | sort | uniq -c | sort -rn | head; done
   ```

2. Lo que salga es un origen que falta en su `next.config.ts` (se añade) o algo
   que no debería estar ahí (se investiga).
3. Con la semana limpia: `CSP_ESTRICTA=1` en el `.env.production` de esa web y
   recompilarla.

**Después, aparte:** sacar el pase del portal del alcance de JavaScript
(cookie `httpOnly`, como ya hacen Membresías y Campeonatos con la suya), y los
nonces si compensan.

---

## 6 · Encender Academy

**Lo que hay hoy:** código completo contra los RF-ACA-01…28 del documento de
requisitos (`DINAMYT_Academy_DocumentoPrincipal_v2.docx`): artes marciales y
programas, contenidos por grado con bloqueo de lo superior, evaluaciones de
opción múltiple y de evidencia con nota ponderada, avance de grado con historial
inmutable, certificados, tablero del maestro, notas, calendario, avisos,
administración y reportes. **28/28 pruebas en verde** contra PGlite (15 oct). El
login va contra el ecosistema; Academy no tiene contraseñas propias.

**Lo que no hay:** ni un solo byte en la VPS (`OPERAR.md` §4.14), el botón del
portal apagado (`ACADEMY_EN_EL_PORTAL = false`), y el microservicio de figuras
sin receta de despliegue.

### A · Recorrerla en local, antes de tocar el servidor

1. Con las APIs apagadas: `pnpm --filter @dinamyt/academy-db db:local:setup`.
2. Levantar `ecosystem-api`, `ecosystem-portal`, `academy-api`, `academy-web` y,
   si se va a probar figuras, `academy-figuras` (están en
   `.claude/launch.json`).
3. Con `profesor@dinamyt.com` y `estudiante@dinamyt.com` (`Demo1234!`),
   recorrer el ciclo completo y **apuntar aquí cada cosa que falle o falte**:
   - admin: asignarle Hapkido al maestro (**Admin → Artes marciales →
     Maestros**; sin eso no puede publicar), suspender y restaurar a alguien,
     aprobar una solicitud de maestro, mirar los reportes;
   - maestro: un contenido por grado de cada tipo (PDF, imagen, YouTube, texto),
     una evaluación con preguntas de opción múltiple y una de evidencia, con
     fecha de vencimiento; calificar la evidencia; aprobar un avance de grado;
     subir una figura de referencia;
   - alumno: que solo vea su grado y los anteriores, que el contenido quede
     marcado como visto, responder, entregar tarde dentro de la gracia de 5
     min, ver su progreso, sus notas, su historial y su certificado; grabar una
     figura y recibir las correcciones con marcas de tiempo;
   - el salto desde el portal por `#token=` y la vuelta con «Ir a DINAMYT».

### B · Montarla en la VPS

El orden, y los detalles, en MONTAR-VPS **Anexo B**: `.env` de `academy-db`,
`academy-api` y `academy-web` → compilar y migrar (`OPERAR.md` §2.3-bis) →
unidades `systemd` `academy-api` (`:3007`) y `academy-web` (`:3008`) → bloque de
Caddy → **y solo entonces** el registro `A academy` en Cloudflare, en naranja. Y:

- que exista el rol `dinamyt_acad` con su esquema (se crearon en la Fase 4 del
  montaje): `sudo -u postgres psql -d dinamyt -c '\du dinamyt_acad'`;
- `free -h` antes y después: son dos servicios Node más sobre los seis que ya
  hay en 8 GB;
- `ACADEMY_SYNC_URL` y `SYNC_SECRET_ACADEMY` en el ecosistema, y ese valor
  como `ECOSYSTEM_SYNC_SECRET` en academy-api (Anexo B): sin eso, borrar una
  cuenta no llega a Academy. Comprobación:
  `curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:3007/sync/supresion`
  da 401, no 404;
- `curl -s https://academy.dinamyt.org/api/health` al final;
- que `/srv/uploads/academy` salga en el `archivos-….tar.gz` de la mañana
  siguiente (el respaldo ya empaqueta `/srv/uploads` entero).

### C · Configurarla

- Qué organizaciones abren Academy: el «Plan Academy» de la base es de relleno
  (tarea 8).
- Un administrador de Academy (su `local_role` manda sobre el del pase).
- Los maestros con su arte asignada.
- Los videos del programa oficial por cinturón (`D:\hapkido\Programa Cambio de
  Cinturones - Alfa y Omega`), subidos como referencias de figuras.

### D · Encender el botón

`ACADEMY_EN_EL_PORTAL = true` en `apps/ecosystem-portal/src/lib/apps.ts` y
recompilar el portal (§2.3). **Solo cuando A, B y C estén hechos.**

### Los huecos conocidos, para cerrar antes o después de abrir

| Hueco | Qué hacer |
|---|---|
| **Casi nada está traducido**: 16 de sus 17 pantallas no usan `useI18n` | Tarea 7. Conviene hacerlo **antes** de abrir |
| No pregunta la preferencia de tema e idioma al ecosistema (las otras tres sí) | Copiar el `GET /users/me/apariencia` del portal en `AplicarApariencia` (`OPERAR.md` §4.21) |
| Un cambio de rol en el portal no le llega después de la primera entrada | Decidir: como Campeonatos (D9, `roles_del_portal`) o dejar que mande el rol local |
| El portal no enseña `GET /users/:id/academy-summary` (RF-ACA-04: cinturón, evaluaciones, último avance) | Decidir dónde (el perfil del alumno) y **con qué credencial**: el requisito pide un token de servicio y hoy la ruta acepta el pase del usuario |
| El microservicio de figuras no tiene receta de despliegue | Unidad `systemd` con el `venv` de Python, el modelo `pose_landmarker_lite.task` y `uvicorn` en `:3009`; medir su RAM (MediaPipe) antes de decidir si vive en esta VPS. Sin él, Academy funciona entera salvo las figuras |
| Los archivos van a disco (`ACADEMY_UPLOADS_DIR`), no a Supabase Storage como decía RF-ACA-11 | Está bien así en la VPS: el respaldo diario ya empaqueta `/srv/uploads` |
| El trabajo sin conexión de la PWA (service worker) | Después de abrir |
| El plan vencido | **No hace falta nada**: sin login propio, toda entrada pasa por un pase que ya no trae `academy` |

**Hecho cuando:** `academy.dinamyt.org` sirve, un maestro y sus alumnos de verdad
la usan una semana, el botón está encendido y `OPERAR.md` §4.14 se reescribe.

---

## 7 · Traducir lo que falta

**Lo que ya existe:** las cuatro webs tienen diccionario español/inglés
(`lib/i18n.tsx`), la cookie compartida `.dinamyt.org` que cruza la elección
entre ellas, y la preferencia en la cuenta (`users.locale` con
`locale_manual`), elegida en el perfil del portal.

**Lo que falta, medido el 26 sep 2026** (aproximado: líneas con texto en español
fuera del diccionario; incluye algún comentario y la lista de ciudades de
`geo.ts`, así que es un techo):

| Web | Diccionario | Dónde sigue el texto escrito a mano |
|---|---|---|
| **Academy** | 368 líneas | **Casi todo**: 16 de 17 pantallas sin `useI18n` — `maestro` (~70), `admin`, `tablero`, `progreso`, `figuras`, `evaluaciones`, `NavBar`, `login` |
| **Portal** | 1.076 | `/admin` (~230), `mi-organizacion` (~110), `dashboard` (~80), `FilaSuscripcion`, `CodigoYSolicitudes`, `PanelRecaudo`, la portada |
| **Membresías** | 1.601 | `alumnos/[id]` (~70), `mi` (~60), `admin`, la portada, `calendario`, **`lib/carnet.ts`** (el carnet impreso) |
| **Campeonatos** | 3.153 | Casi terminada: `tatami/[id]` (~45), `login` (~35), `admin`, `maestro`, `mi-panel` |

**Y lo que no ha empezado nadie, porque no son pantallas:**

- **Los mensajes de error de las tres APIs** salen en español y la web los
  enseña tal cual. Recomendación: que la API devuelva `{ codigo, mensaje }` y la
  web traduzca el código (con el mensaje como respaldo). El navegador ya manda
  `X-Idioma` en cada petición al ecosistema, por si se prefiere traducir en el
  servidor.
- **Los correos** (`mailer.service.ts`): solo español. `users.locale` ya existe:
  plantilla por idioma.
- **Los avisos push** (Membresías y portal): solo español.
- **Los impresos**: los PDF y Excel de Campeonatos y el carnet de Membresías.
- **Fechas y números**: quedan `'es-CO'` escritos a mano por las pantallas.

**El orden:**

1. Fechas y números según `locale` — lo más barato, y lo que más se nota.
2. **Academy**, antes de abrirla (tarea 6): ahora cuesta menos que con gente
   usándola.
3. Lo que falta del portal; `/admin` al final, que solo lo ve el super-admin.
4. Membresías y Campeonatos (en SUS repositorios, `OPERAR.md` §1.1), carnet
   incluido.
5. Los errores de las APIs por código.
6. Correos y push por `users.locale`.

**Para no retroceder:** convertir la medición en un guion (`scripts/`) que cuente
texto suelto por web y falle si sube, y correrlo con `pnpm turbo build test`.

**Hecho cuando:** con «English» elegido no queda texto en español en ninguna
pantalla, correo, aviso ni impreso de las cuatro webs.

---

## 8 · Fase 2

### 8.1 Los precios de verdad en `/planes`, y la portada

El **mecanismo** ya existe (`OPERAR.md` §4.18): cobro por persona,
`price_per_user` y `min_users` en «Tarifa de cada plan» de `/admin`. Lo que
falta es **la decisión de negocio** —cuánto por persona en cada plan, y el
mínimo facturable— y ponerla. Hasta entonces `/planes` enseña los de relleno y
**no se publica**.

Después, en el mismo orden: la portada con qué es cada producto, para quién y
con capturas reales; y en Google Search Console, enviar el sitemap y pedir la
indexación (`OPERAR.md` §3.6). Lo que Google guarde el primer día es lo que
enseñará semanas.

### 8.2 El plan gratuito

Que quien entre vea las pantallas y entienda a qué escala llega el producto, sin
operar un club entero gratis.

- **Decidir: límite permanente o un mes de prueba.** Recomendación: **límite
  permanente**. Un club de 20 que funciona gratis se convierte en cliente al
  llegar a 25; un mes que caduca deja a un club a medias con sus datos dentro.
- Límites propuestos: Membresías **20 alumnos activos**; Campeonatos **50
  competidores** por campeonato y 1 activo; Academy por definir.
- Dónde: una columna `subscription_plans.limites` (jsonb, p. ej.
  `{"membresias":{"alumnos":20}}`) y una función `assertLimite(recurso)` en cada
  API, en los sitios de alta. **Ninguna de las dos existe todavía.** El
  frontend avisa; la API impide.
- Al llegar al tope: qué falta, cuánto cuesta el siguiente plan, y un botón. No
  un error.

### 8.3 Varias artes marciales en Membresías — lo fácil

Hoy los 11 cinturones de hapkido GHA son una constante duplicada en
`lib/cinturones.ts` (API y web de Membresías).

- Al crear el club, el maestro escribe su arte (texto libre) y **ordena sus
  grados** (nombre, orden, color), con plantillas de partida —hapkido GHA,
  taekwondo, karate— o en blanco.
- Un club puede no usar cinturones: la lista vacía quita el campo de la ficha y
  del carnet.
- `lib/cinturones.ts` pasa a una consulta por club, cacheada. Hacen falta
  `orgs.arte_marcial` y una tabla de grados por club: **no existen todavía**.

### 8.4 Varias artes marciales en Campeonatos — lo difícil

Todo gira alrededor de un reglamento que hoy está repartido por el código:
`engine/combate_engine.py` (782 líneas), `sockets/combate_ns.py` (1.821),
`engine/secciones_engine.py` (236) y `engine/figuras_engine.py` (573).

- Un **paquete de reglamento** declara, en datos siempre que se pueda:
  categorías, formato del combate, puntuación, faltas y sanciones, fin
  anticipado, desempate, tipo de llaves e impresos.
- **`hapkido-gha` es el primero, extraído sin cambiar ni un comportamiento.** La
  prueba de que salió bien: un campeonato viejo, recalculado con el paquete, da
  exactamente los mismos resultados. Antes, el motor cubierto de pruebas.
- El campeonato elige arte y reglamento al crearse (columnas
  `arte_marcial` y `reglamento`, que no existen todavía) y no cambia después:
  los combates puntuados dejarían de cuadrar.
- Después, `taekwondo-wt` y `karate-wkf` contra sus reglamentos publicados.

Es **el trabajo más grande de todos**, más que la identidad.

---

## 9 · Deuda pequeña

| Qué | Por qué | Dónde |
|---|---|---|
| **El PIN deja marcar asistencia a quien tiene el acceso cortado** | `POST /checkin` con PIN busca la membresía y no mira `users.is_active`; el carnet QR sí (`ensureMembership`). Visto el 14 oct | `membresias-api/src/routes/checkin.ts`, la rama `type === 'pin'` |
| **Ensayar una restauración completa** del respaldo en una base de usar y tirar | MONTAR-VPS fase 5 ya no tiene receta probada: un respaldo que nunca se ha restaurado es una esperanza | MONTAR-VPS §5 y §10.1 |
| Las seis columnas de **día** a tipo `date` | `birth_date` (×2) y los `starts_at`/`ends_at` de las suscripciones siguen como `timestamp` a medianoche. No corre prisa; va con su cambio en `common/ciclo.ts` | `OPERAR.md` §5.1-bis |
| El **selector de apps** dentro de cada app | Hoy se salta de una app a otra pasando por el portal. Necesita saber qué abre cada quien (§4.2) | Las cuatro webs |
| Las **cuentas viejas de Campeonatos con contraseña propia** | Siguen entrando por el login local aunque su club deje de pagar (D10). Y los dos extras de entonces: avisar al arrancar cuántas cuentas conservan contraseña usable, y en internet dejar el formulario de contraseña debajo de un enlace discreto («entrar sin DINAMYT») | `dinamyt-combat` |
| El **QR del juez dura 72 h** | Una foto del QR vale ese papel en ese tatami todo el fin de semana. Se puede acotar a la duración real del campeonato | `dinamyt-combat` |
| Los **jueces tienen «acceso total» en RLS** (`rls.contexto_de_usuario`) | La API ya filtra por workspace; falta la red de debajo | `dinamyt-combat` |
| **La franja «Sucediendo ahora» de la portada no ha salido nunca en producción** | Cuatro causas a la vez (vistas el 1 oct): pide a `NEXT_PUBLIC_CAMPEONATOS_API_URL`, que no está en el `.env.production` del portal, así que llama a `http://localhost:3002` desde el navegador de cada visitante; filtra `estado === 'EN_CURSO'` y la API dice `en_curso`; enlaza a `/pantalla/:id`, que no existe; y `campeonatos-api` no le da CORS a `https://dinamyt.org`. Y aunque se arreglaran las cuatro, durante un evento el campeonato de internet está cedido y no pasa a `en_curso` allí. **Mejor rehacerla sobre la publicación en vivo** (`en_vivo` de `/api/resultados/campeonatos`) y que enlace a `/resultados`; si no, quitarla | `apps/ecosystem-portal/src/app/page.tsx` |
| **El nombre en la red del pabellón** | Entrada DNS estática en el router (`campeonato.dinamyt` → la IP del PC, con punto para que no se lea como búsqueda) y servir en el puerto 80. La IP en un papel sigue siendo la garantía | `INICIAR-LOCAL.md` §1 |

---

## En espera

### WhatsApp para los avisos del alumno

**No se hace ahora, pero se queda escrito para decidirlo con números.** Es el
canal que la gente de verdad lee, y el que el maestro ya usa a mano; hoy el push
es el único canal automático del alumno (al alumno no le llega correo, y es a
propósito: `OPERAR.md` §4.6).

- **El dinero es lo de menos.** Meta cobra por mensaje entregado; en Colombia
  una plantilla de *utilidad* cuesta entre **0,0008 y 0,003 USD**. Un aviso al
  mes a quinientos alumnos, **menos de dos dólares**. Si la persona escribió
  primero, hay 24 h para responderle gratis.
- **Lo caro es entrar**: cuenta de Meta Business, **verificación de la empresa**
  (documentos, días de espera), un número dedicado que no esté ya en WhatsApp, y
  **cada plantilla aprobada una por una** por Meta.
- **Lo que habría que escribir**: un `WhatsappService` gemelo del
  `MailerService` (sin token configurado, la función no existe), guardar el
  `phone` en formato E.164, y un registro de envíos para no repetir.
- ⛔ **Las librerías que automatizan WhatsApp Web** (`whatsapp-web.js`, Baileys)
  **no**: violan los términos y el número acaba bloqueado — el del club, que es
  el que usan para todo.

### F9 de Campeonatos: retirar los andamios

**Su condición no es una fecha: es un campeonato real encima de F1–F8.** Entonces:

- quitar `role_campeonatos` (singular) del pase;
- quitar la columna `puede_juzgar` y la doble regla de `es_dueno_campeonato`;
- dejar `campeonatos.org_id` en `NOT NULL`, si el relleno está completo (el modo
  local deja campeonatos sin organización a propósito: mirarlo antes).

---

## Anexo · Los planes cerrados, por si hace falta leerlos

Se borraron el 26 sep 2026 para hacer sitio. El código los cita («F3 de
PLAN-CAMPEONATOS», «D9»); lo que sigue mandando está resumido en `OPERAR.md`
§1.6. Para leer el original:

| Documento | Repositorio | Comando |
|---|---|---|
| `PLAN-CAMPEONATOS.md` (F0–F9, D1–D10, el diario) | `dinamyt-combat` | `git show 9e1d4e1:PLAN-CAMPEONATOS.md` |
| `PLAN-ECOSYSTEM-VPS.md` (el plan maestro B0–B4, decisiones 1–12) | `dinamyt-combat` | `git show 9e1d4e1:PLAN-ECOSYSTEM-VPS.md` |
| `B3-RIESGOS.md` (los riesgos de la identidad única) | `dinamyt-combat` | `git show 9e1d4e1:B3-RIESGOS.md` |
| `CONTINGENCIA-CAMPEONATO.md` (el diseño del candado y de la publicación en vivo, Anexo 2) | `dinamyt` | `git show 1277b99:CONTINGENCIA-CAMPEONATO.md` |
| `OPERAR.md` antes de la poda (Parte 6 con todo el historial) | `dinamyt` | `git show 1277b99:OPERAR.md` |
