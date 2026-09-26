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

*(26 de septiembre de 2026, comprobado por SSH, `curl` y el DNS público)*

| Pieza | Estado |
|---|---|
| Portal + identidad | En la VPS con `1277b99` (desplegado el 26 sep, 09:57) |
| Campeonatos | En la VPS con `9e1d4e1` (26 sep, 09:55). **El plan entero está en producción**: F1–F8, D8–D10 y la revisión de seguridad. Las rutas nuevas dan 401, `NRestarts = 0` |
| Membresías | En la VPS con `3488b31` (24 sep) |
| Academy | **No está montada**: ni servicios, ni `.env`, ni Caddy, ni DNS. En código, entera: 24/24 pruebas |
| Fotos en disco | **Encendidas**: `MEDIA_PUBLIC_URL` y `MEDIA_DIR` puestos, 30 imágenes en `/srv/dinamyt-media`. Las sirve Node, no Caddy, y **el respaldo diario no las incluye** |
| DMARC | Sigue en `p=none` (tocaba subirlo desde el 12 sep) |
| Google | Propiedad verificada (etiqueta y TXT) |
| Cabeceras de seguridad | **Ninguna** en las cinco webs: ni CSP, ni HSTS, ni `X-Frame-Options` |
| Estilos compartidos | Al día en las cuatro webs (`repartir-estilos.ps1 -Comprobar`) |

---

## El orden

| # | Qué | De qué es | Tamaño |
|---|---|---|---|
| 1 | [Probar lo desplegado](#1--probar-lo-desplegado) | A mano | 1–2 h |
| 2 | [DMARC a `quarantine`](#2--dmarc-a-quarantine) | DNS | 15 min, y mirar informes antes |
| 3 | [**Los respaldos diarios estaban vacíos**](#3--los-respaldos-diarios-estaban-vacíos--y-las-fotos-no-entraban) | **Tú**: instalar el temporizador | 20 min — **ya** |
| 4 | [Rotar o cerrar los proyectos de Supabase](#4--rotar-o-cerrar-los-proyectos-de-supabase) | Cuentas | 15 min |
| 5 | [Un secreto de sincronización por app](#5--un-secreto-de-sincronización-por-app--falta-ponerlo-en-la-vps) | **Tú**: poner los valores | 20 min |
| 6 | [La CSP, de informe a estricta](#6--la-csp-de-informe-a-estricta) | **Tú**: mirar informes; yo, corregir | Una semana después |
| 7 | [**El candado de sede**](#7--el-candado-de-sede-decisión-8) (decisión 8) | Código | El grande |
| 8 | [**Publicar en vivo durante el evento**](#8--publicar-en-vivo-durante-el-evento-decisión-9) (decisión 9) | **Una decisión** + código | Después del 7 |
| 9 | [**Encender Academy**](#9--encender-academy) | Pruebas + servidor | 1–2 días, y una semana de uso |
| 10 | [**Traducir lo que falta**](#10--traducir-lo-que-falta) | Código | Por pantallas |
| 11 | [Fase 2: precios, plan gratuito, multi-arte](#11--fase-2) | Negocio + código | Semanas |
| 12 | [Deuda pequeña](#12--deuda-pequeña) | Varios | Cuando toque |
| — | [En espera: WhatsApp y F9](#en-espera) | — | — |

**Por qué este orden.** Del 1 al 4 cuestan minutos y cierran riesgos que ya
existen hoy. El 5 y el 6 son seguridad de lo que está en producción todos los
días. El 7 y el 8 son **lo más importante que queda de la arquitectura del
evento**, pero solo muerden cuando hay un campeonato, y hoy no hay ninguno con
fecha. **Si aparece una fecha, el 7 y el 8 pasan delante de todo**, con el
ensayo (`OPERAR.md` §2.9) y el simulacro (`INICIAR-LOCAL.md` §0) detrás.

---

## 1 · Probar lo desplegado

Todo el plan de Campeonatos está en la VPS desde el 26 de septiembre y **nadie
lo ha recorrido todavía con una persona delante**.

1. `PRUEBAS-PLAN-CAMPEONATOS.md` (en `dinamyt-combat`, espejado en
   `productos/campeonatos/`), de arriba abajo. Las dos comprobaciones del
   despliegue ya están marcadas; falta la del registro de arranque, que pide
   `sudo`:

   ```bash
   sudo journalctl -u campeonatos-api --since "today" | grep ecosistema
   ```

   Tiene que decir «pase RS256 y espejo: los dos ENCENDIDOS».
2. El ensayo de punta a punta, `OPERAR.md` §2.9, **y anotar la fila** en su
   tabla.

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

## 3 · Los respaldos diarios estaban vacíos — y las fotos no entraban

⚠️ **Lo más urgente de la lista.** Comprobado el 26 sep 2026: **todos los
volcados diarios de `/var/backups/dinamyt/` pesan 0 bytes.** La línea del
crontab de `dinamyt` usa `sudo -u postgres`, `sudo` pide contraseña, en el cron
nadie la teclea, y el `2>/dev/null` se tragaba el error. Los únicos respaldos
buenos son los manuales (`/var/backups/respaldo-2026-09-26.dump`, de las 09:53).
Y aunque el volcado funcionara, no incluía las fotos, que viven en disco desde
§4.20.

**El código ya está**: `scripts/respaldo-diario.sh` corre como root desde un
temporizador de systemd, comprueba que `pg_restore` sabe leer el volcado,
empaqueta `/srv/dinamyt-media` y `/srv/uploads`, guarda 14 días y **falla en voz
alta**. Lo que falta es tuyo, en la VPS, después del `git pull` del ecosistema:

1. Quita la línea vieja: `crontab -e` (como `dinamyt`) y borra las dos líneas
   que empiezan por `0 3` y `30 3`.
2. Instala el temporizador: los cuatro bloques de **MONTAR-VPS §10.1**, tal cual.
3. Comprueba que el último `.dump` de `ls -lh /var/backups/dinamyt/` pesa
   cientos de KB y que hay un `archivos-….tar.gz`.
4. Bájate una copia a tu PC (la semanal de siempre):

   ```powershell
   scp dinamyt@80.190.78.70:/var/backups/dinamyt/*-$(Get-Date -Format yyyy-MM-dd).* D:\dinamyt-migracion\respaldos\
   ```

**Y lo que queda de las fotos**, cuando haya un rato:

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

## 4 · Rotar o cerrar los proyectos de Supabase

Las contraseñas de los tres proyectos viejos (Membresías, Campeonatos y el del
ecosistema) **viajaron por chat en agosto**, y una contraseña que viajó se
cambia. Hoy ninguno tiene datos que la VPS no tenga.

- Si ya no se usan: **pausarlos o borrarlos** desde el panel de Supabase, que
  es mejor que rotarlos. (Membresías independiente puede instalarse en Supabase
  para otro club: eso son proyectos **nuevos**, no estos.)
- Si alguno se sigue usando: rotar su contraseña.
- Comprobar que no quedó un `.env.migracion` en ninguna parte.

*(El `.env.bak-2026-08-30` de `/srv/campeonatos/backend/` ya no existe: comprobado
el 26 sep.)*

---

## 5 · Un secreto de sincronización por app — falta ponerlo en la VPS

**El código ya está** (26 sep 2026, `common/secreto-sync.ts`): el ecosistema
sabe quién llama por el secreto que trae, el de Membresías no abre las rutas de
Campeonatos ni al revés, y `/sync/alta` solo pide altas de la app que firma.
Mientras el `ECOSYSTEM_SYNC_SECRET` compartido siga en el `.env` del
ecosistema, **todo sigue funcionando como hoy** y el registro dice
`WARN [SecretoSync]`. Lo que falta es tuyo, en la VPS, **después** de desplegar
el ecosistema:

1. Genera dos valores distintos (en tu PC o en el servidor):

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```

2. **Membresías**, las dos puntas seguidas (entre un reinicio y el otro el
   espejo de ida falla unos segundos):
   - en `/srv/dinamyt/apps/ecosystem-api/.env`, añade
     `SYNC_SECRET_MEMBRESIAS=<valor 1>`;
   - en `/srv/membresias/apps/membresias-api/.env`, cambia
     `ECOSYSTEM_SYNC_SECRET=<valor 1>`;
   - `sudo systemctl restart dinamyt-id membresias-api`.
3. **Campeonatos** (el ecosistema no le llama, así que no hay hueco):
   - en el `.env` del ecosistema, añade `SYNC_SECRET_CAMPEONATOS=<valor 2>` y
     `sudo systemctl restart dinamyt-id`;
   - en `/srv/campeonatos/backend/.env`, cambia `ECOSYSTEM_SYNC_SECRET=<valor 2>`
     y `sudo systemctl restart campeonatos-api`.
4. Comprueba: `bash /srv/dinamyt/scripts/ensayo.sh estado` enseña las dos
   parejas de huellas **iguales**, y
   `cd /srv/dinamyt/apps/ecosystem-api && pnpm espejo:diagnostico` dice
   `EL CANAL ESTÁ ABIERTO`.
5. Un día después, si `sudo journalctl -u dinamyt-id --since "1 day ago" | grep SecretoSync`
   no sale nada, **borra** `ECOSYSTEM_SYNC_SECRET` del `.env` del ecosistema y
   `sudo systemctl restart dinamyt-id`.

El PC del evento sigue sin llevar ninguno (D8).

---

## 6 · La CSP, de informe a estricta

**Hecho el 26 sep 2026** (`OPERAR.md` §4.24): las cuatro webs mandan las
cabeceras de seguridad y la CSP en **modo informe**, que no bloquea nada y
escribe en el registro lo que bloquearía. Se despliega con el resto.

Lo que queda, **una semana después de desplegar**:

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

## 7 · El candado de sede (decisión 8)

**Hoy nada impide que alguien toque llaves, inscripciones o tatamis en internet
mientras el campeonato corre en el PC del evento**, y el paquete de vuelta solo
trae resultados. Son dos escritores, y lo que diverge no avisa: se descubre al
subir. **Es lo más importante que queda de la arquitectura del evento.**

La idea es la de siempre: no resolver conflictos, **hacerlos imposibles**. Un
escritor a la vez, y el dueño se traspasa explícitamente.

**El diseño:**

- `campeonatos.sede`: `nube` (el valor por defecto, y el de hoy) o `local`, con
  `sede_desde` y `sede_por`. Por `schema_compat.py`, sin migraciones, como todo
  en Campeonatos.
- **Pasar a local es un gesto, y va junto con bajarse el paquete**: al exportar
  el campeonato para el evento se elige «para el evento (cierra la nube)» o
  «copia de prueba (no cierra nada)», que es la que usa el simulacro.
- **Con `sede = local`, la VPS pone ese campeonato en solo lectura**: un guard
  en cada ruta que escribe sobre él —inscripciones, competidores, llaves,
  tatamis, asignaciones, invitaciones— contesta **423** con la frase «Este
  campeonato se está operando en el PC del evento desde …». La consulta
  pública sigue abierta.
- **Devolverlo a la nube también es un gesto**: el admin dueño, en la VPS,
  cuando la subida final de resultados (F8) llegó bien y no queda ninguna llave
  activa. Nunca automático.
- **Un minicampeonato sin PC a mano corre en la nube** sin tocar nada: por eso
  el candado se pone y se quita, y no se amputa la consola de la VPS.

**Dónde:** `models/campeonato.py`, `schema_compat.py`, un
`exigir_sede_nube(camp)` junto a las guardas de `api/scoping.py`, la exportación
del paquete, y en el frontend una franja fija en el campeonato («Operándose en
el PC del evento desde el sábado 08:10 · Devolver a la nube»). Documentarlo en
`INICIAR-LOCAL.md` §2.1.

**Pruebas:** cada ruta que escribe, contra SQLite **y contra PostgreSQL**
(`tests/test_rls_postgres.py`); la exportación que cierra y la que no; y una
sección nueva en `PRUEBAS-PLAN-CAMPEONATOS.md`.

**Después, opcional:** que el PC del evento se baje el paquete solo cada pocos
minutos mientras haya red, con la franja «Al día · última copia hace 3 min».
Saca la memoria del camino crítico (el único fallo sin marcha atrás es olvidarse
de bajarlo, `INICIAR-LOCAL.md` §0), y con el candado puesto es seguro: la VPS
ya no cambia.

**Hecho cuando:** con `sede = local` ninguna ruta escribe en la VPS, está
probado en las dos bases y en el simulacro, y la decisión 8 de `OPERAR.md` §1.6
deja de decir «sin hacer».

---

## 8 · Publicar en vivo durante el evento (decisión 9)

Hoy los resultados suben **al final** (F8), cuando vuelve la red y el admin
entra; el público no ve nada mientras tanto. La decisión 9 era que el PC del
evento **publique hacia arriba cada pocos minutos**. No es sincronización: el
local sigue siendo el único que escribe y la VPS solo recibe. El modo de fallo
es «el público ve resultados de hace veinte minutos», nunca «se para el
campeonato».

**Las cinco reglas que lo hacen seguro:**

1. **Solo hacia arriba.** Durante el evento el local no descarga nada.
2. **Instantánea completa, nunca incrementos**: mandarla dos veces da igual.
3. **Nunca en el camino de una petición**: tarea de fondo con timeout corto.
   Bajo eventlet, una llamada que bloquea en el sitio equivocado congela el
   bucle de sockets (`OPERAR.md` §5.13).
4. **La VPS en solo lectura para ese campeonato**: necesita el 7.
5. **El público ve la hora del dato**: «Resultados a las 11:42», no «en vivo».

Y dos detalles: la VPS **descarta lo que llegue más viejo** que lo que ya tiene
(`exportado_at`; con red mala la de las 11:40 puede llegar después de la de las
11:45), y el local **guarda el hash de lo último enviado** para no mandar lo
mismo por un hotspot de celular.

**Casi todo está construido:** `_construir_resultados(camp_id)`,
`ResultadoPublicado` con `export_uuid` y `exportado_at`,
`importar_resultados()`, el cartero de F8 (mismo destino, mismo sobre) y el
patrón «cada N minutos» de `RESPALDO_MINUTOS`.

### ⚠️ Lo que hay que decidir antes: con qué credencial

F8 sube con **la sesión del propio admin**, en el momento en que vuelve la red:
en el PC no se guarda ninguna llave. Publicar durante horas no puede depender de
que alguien tenga una sesión abierta en ese PC. Las opciones:

| | Qué | En contra |
|---|---|---|
| **A** | El admin deja su sesión abierta en el PC todo el evento | Frágil (el pase dura 30 min), y es una sesión completa guardada en el PC |
| **B** ✅ | **Una credencial por campeonato, que emite la VPS al pasar la sede a local** (el 7): solo sirve para publicar la instantánea de ESE campeonato, caduca al devolver la sede (o a los pocos días) y se revoca desde la VPS | Es una excepción a «nada guardado en el PC» — acotada: lo peor que permite es publicar resultados falsos de un evento un fin de semana, que la siguiente instantánea buena pisa |
| **C** | No publicar en vivo: todo sube al final, como hoy | El público no ve nada durante el evento |

**Recomendación: B**, porque encaja con el candado: el mismo gesto que cierra la
nube entrega la llave, y el que la reabre la retira.

**Hecho cuando:** está decidido, construido, y en el simulacro el marcador de
`campeonatos.dinamyt.org/resultados` se mueve con el evento y enseña su hora.

---

## 9 · Encender Academy

**Lo que hay hoy:** código completo contra los RF-ACA-01…28 del documento de
requisitos (`DINAMYT_Academy_DocumentoPrincipal_v2.docx`): artes marciales y
programas, contenidos por grado con bloqueo de lo superior, evaluaciones de
opción múltiple y de evidencia con nota ponderada, avance de grado con historial
inmutable, certificados, tablero del maestro, notas, calendario, avisos,
administración y reportes. **24/24 pruebas en verde** contra PGlite (26 sep). El
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
- `curl -s https://academy.dinamyt.org/api/health` al final;
- `/srv/uploads/academy` en el respaldo (tarea 3).

### C · Configurarla

- Qué organizaciones abren Academy: el «Plan Academy» de la base es de relleno
  (tarea 11).
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
| **Casi nada está traducido**: 16 de sus 17 pantallas no usan `useI18n` | Tarea 10. Conviene hacerlo **antes** de abrir |
| No pregunta la preferencia de tema e idioma al ecosistema (las otras tres sí) | Copiar el `GET /users/me/apariencia` del portal en `AplicarApariencia` (`OPERAR.md` §4.21) |
| Un cambio de rol en el portal no le llega después de la primera entrada | Decidir: como Campeonatos (D9, `roles_del_portal`) o dejar que mande el rol local |
| El portal no enseña `GET /users/:id/academy-summary` (RF-ACA-04: cinturón, evaluaciones, último avance) | Decidir dónde (el perfil del alumno) y **con qué credencial**: el requisito pide un token de servicio y hoy la ruta acepta el pase del usuario |
| El microservicio de figuras no tiene receta de despliegue | Unidad `systemd` con el `venv` de Python, el modelo `pose_landmarker_lite.task` y `uvicorn` en `:3009`; medir su RAM (MediaPipe) antes de decidir si vive en esta VPS. Sin él, Academy funciona entera salvo las figuras |
| Los archivos van a disco (`ACADEMY_UPLOADS_DIR`), no a Supabase Storage como decía RF-ACA-11 | Está bien así en la VPS; lo que falta es respaldarlos (tarea 3) |
| El trabajo sin conexión de la PWA (service worker) | Después de abrir |
| El plan vencido | **No hace falta nada**: sin login propio, toda entrada pasa por un pase que ya no trae `academy` |

**Hecho cuando:** `academy.dinamyt.org` sirve, un maestro y sus alumnos de verdad
la usan una semana, el botón está encendido y `OPERAR.md` §4.14 se reescribe.

---

## 10 · Traducir lo que falta

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
2. **Academy**, antes de abrirla (tarea 9): ahora cuesta menos que con gente
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

## 11 · Fase 2

### 11.1 Los precios de verdad en `/planes`, y la portada

El **mecanismo** ya existe (`OPERAR.md` §4.18): cobro por persona,
`price_per_user` y `min_users` en «Tarifa de cada plan» de `/admin`. Lo que
falta es **la decisión de negocio** —cuánto por persona en cada plan, y el
mínimo facturable— y ponerla. Hasta entonces `/planes` enseña los de relleno y
**no se publica**.

Después, en el mismo orden: la portada con qué es cada producto, para quién y
con capturas reales; y en Google Search Console, enviar el sitemap y pedir la
indexación (`OPERAR.md` §3.6). Lo que Google guarde el primer día es lo que
enseñará semanas.

### 11.2 El plan gratuito

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

### 11.3 Varias artes marciales en Membresías — lo fácil

Hoy los 11 cinturones de hapkido GHA son una constante duplicada en
`lib/cinturones.ts` (API y web de Membresías).

- Al crear el club, el maestro escribe su arte (texto libre) y **ordena sus
  grados** (nombre, orden, color), con plantillas de partida —hapkido GHA,
  taekwondo, karate— o en blanco.
- Un club puede no usar cinturones: la lista vacía quita el campo de la ficha y
  del carnet.
- `lib/cinturones.ts` pasa a una consulta por club, cacheada. Hacen falta
  `orgs.arte_marcial` y una tabla de grados por club: **no existen todavía**.

### 11.4 Varias artes marciales en Campeonatos — lo difícil

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

## 12 · Deuda pequeña

| Qué | Por qué | Dónde |
|---|---|---|
| **Ensayar una restauración completa** del respaldo en una base de usar y tirar | MONTAR-VPS fase 5 ya no tiene receta probada: un respaldo que nunca se ha restaurado es una esperanza | MONTAR-VPS §5 y §10.1 |
| Las seis columnas de **día** a tipo `date` | `birth_date` (×2) y los `starts_at`/`ends_at` de las suscripciones siguen como `timestamp` a medianoche. No corre prisa; va con su cambio en `common/ciclo.ts` | `OPERAR.md` §5.1-bis |
| El **selector de apps** dentro de cada app | Hoy se salta de una app a otra pasando por el portal. Necesita saber qué abre cada quien (§4.2) | Las cuatro webs |
| Las **cuentas viejas de Campeonatos con contraseña propia** | Siguen entrando por el login local aunque su club deje de pagar (D10). Y los dos extras de entonces: avisar al arrancar cuántas cuentas conservan contraseña usable, y en internet dejar el formulario de contraseña debajo de un enlace discreto («entrar sin DINAMYT») | `dinamyt-combat` |
| El **QR del juez dura 72 h** | Una foto del QR vale ese papel en ese tatami todo el fin de semana. Se puede acotar a la duración real del campeonato | `dinamyt-combat` |
| Los **jueces tienen «acceso total» en RLS** (`rls.contexto_de_usuario`) | La API ya filtra por workspace; falta la red de debajo | `dinamyt-combat` |
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
