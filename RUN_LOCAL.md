# DINAMYT — Correr todo en local (del portal a Campeonatos, desde el frontend)

> Guía práctica para levantar el ecosistema completo en tu máquina y **verlo
> funcionar desde el navegador**: iniciar sesión en el portal → entrar a
> Campeonatos → crear un campeonato → inscribir → generar secciones/llaves →
> puntuar un combate en vivo. Última actualización: 2026-06-30.

---

## 0. Requisitos (una sola vez)

- **Node 18+** y **pnpm 11+**. Verifica en **PowerShell** (no en Git Bash —
  ahí puede que `node` no esté en el PATH):
  ```powershell
  node -v   # v24.x
  pnpm -v   # 11.5.x
  ```
- **Claves RS256** del ecosystem (ya generadas en `apps/ecosystem-api/keys/`).
  Si faltaran:
  ```powershell
  openssl genpkey -algorithm RSA -out apps/ecosystem-api/keys/private.pem -pkeyopt rsa_keygen_bits:2048
  openssl rsa -in apps/ecosystem-api/keys/private.pem -pubout -out apps/ecosystem-api/keys/public.pem
  ```
- **Base de datos: NADA que instalar en local.** Se usa **PGlite** (PostgreSQL
  embebido en WASM) persistido en la carpeta `.localdb/` del repo. No hace falta
  Docker, ni Supabase, ni el PostgreSQL del sistema. (Para producción se cambia a
  Postgres/Supabase real; ver §8.)

```powershell
pnpm install
pnpm build     # turbo: 8/8
```

---

## 1. Variables de entorno (.env)

Ya existen todos los `.env` y están configurados para **modo local (PGlite)**.
Las líneas clave (ya puestas):

| Archivo | Variable | Valor |
| --- | --- | --- |
| `apps/ecosystem-api/.env` | `PGLITE_DATA` | `D:/Repositorios/dinamyt/.localdb/ecosystem` |
| `apps/ecosystem-api/.env` | `CORS_ORIGINS` | `http://localhost:3000,http://localhost:3003` |
| `apps/ecosystem-api/.env` | `ADMIN_EMAIL` / `ADMIN_PASSWORD` | `admin@dinamyt.com` / `CambiaEstaClaveFuerte123!` |
| `apps/campeonatos-api/.env` | `CAMPEONATOS_PGLITE_DATA` | `D:/Repositorios/dinamyt/.localdb/campeonatos` |
| `apps/campeonatos-api/.env` | `CORS_ORIGINS` | `http://localhost:3000,http://localhost:3003` |
| `packages/campeonatos-db/.env` | `CAMPEONATOS_PGLITE_DATA` | `D:/Repositorios/dinamyt/.localdb/campeonatos` |

Cuando `PGLITE_DATA` / `CAMPEONATOS_PGLITE_DATA` están definidas, los clientes de
BD usan PGlite embebido y **ignoran** `DATABASE_URL` / `CAMPEONATOS_DATABASE_URL`.
Para volver a Postgres real, **comenta** esas dos líneas (§8).

Los `.env` de `ecosystem-portal`, `campeonatos-web` y `campeonatos-combat` solo
tienen URLs de localhost y ya están listos.

> ⚠️ **Nunca** subas `.env` ni `keys/` ni `.localdb/` a git (ya están en `.gitignore`).
> Los secretos que hoy están en `apps/ecosystem-api/.env` (contraseña de Gmail y
> keys de Supabase) conviene **rotarlos**.

---

## 2. Crear la base local (una vez, o cuando cambie el schema)

```powershell
# Ecosystem: migraciones + super-admin + planes (idempotente)
pnpm --filter @dinamyt/ecosystem-api db:local:setup

# Campeonatos: migraciones
pnpm --filter @dinamyt/campeonatos-db db:local:setup
```

> ⚠️ **PGlite es monoproceso**: ejecuta estos setups con las APIs **apagadas**.
> Si un segundo proceso abre la misma carpeta `.localdb/*`, el data-dir se
> corrompe y todo muere con `RuntimeError: Aborted()` en `_pg_initdb`. Remedio:
> parar todo, borrar la carpeta afectada y re-ejecutar el setup (los datos
> locales son de prueba y regenerables).

Esto crea/rellena las carpetas `.localdb/ecosystem` y `.localdb/campeonatos`.
El setup del ecosystem crea el super-admin (`ADMIN_EMAIL`/`ADMIN_PASSWORD`), los
planes Academy / Campeonatos / Completo y **usuarios demo por rol** (con org +
suscripción activa) para probar los accesos:

| Usuario | Contraseña | Rol | Qué ve |
| --- | --- | --- | --- |
| `admin@dinamyt.com` | `CambiaEstaClaveFuerte123!` | super-admin | Todo (todas las apps, panel `/admin` del portal) |
| `orgadmin@dinamyt.com` | `Demo1234!` | admin (org) | Administra el Club Demo (miembros, clubes hijos) |
| `coach@dinamyt.com` | `Demo1234!` | coach | Listar + **Inscribir** (no crear ni secciones) |
| `juez@dinamyt.com` | `Demo1234!` | judge | Va directo al **panel de combate** |
| `maestro@dinamyt.com` | `Demo1234!` | maestro | Revisión de inscripciones de su club |
| `competidor@dinamyt.com` | `Demo1234!` | competitor | Perfil, invitaciones y su historial |
| `owner@dinamyt.com` | `Demo1234!` | owner (Membresías) | Panel del club en :3006 (roster, pagos, kiosco) |
| `alumno1@dinamyt.com` | `Demo1234!` | student | Portal del alumno en Membresías |
| `alumno2@dinamyt.com` | `Demo1234!` | student | Portal del alumno en Membresías |
| `juezesquina@dinamyt.com` | `Demo1234!` | judge | Juez de esquina de prueba (se asigna a tatamis) |

> **Datos de prueba de un campeonato** (secciones por modalidad + competidores
> + jueces asignados): con la **API de campeonatos apagada** (PGlite es
> monoproceso) corre `node scripts/sembrar-prueba.mjs` desde
> `packages/campeonatos-db`. Usa el campeonato más reciente de la base local,
> crea una sección por cada modalidad, inscribe 6 competidores (aprobados) y
> asigna `juezesquina@`/`juez@` al Tatami 1.

Para empezar de cero, borra `.localdb/` y vuelve a correr los dos setups.

> **Nota de acceso:** el **super-admin entra a Campeonatos sin suscripción**
> (el guard de la API lo deja pasar por ser super-admin). Un usuario **normal**
> necesita una suscripción con el scope `campeonatos`. Como aún no hay UI de
> compra, se asigna a mano (ver §6).

---

## 3. Levantar las apps

Abre **5 terminales** (o usa `pnpm dev` en la raíz para arrancarlas todas con
Turbo). Individualmente:

```powershell
pnpm --filter @dinamyt/ecosystem-api start:dev     # :3001  Identidad (NestJS)
pnpm --filter @dinamyt/ecosystem-portal dev        # :3000  Portal (Next)
pnpm --filter @dinamyt/campeonatos-api dev         # :3002  API Campeonatos (Fastify)
pnpm --filter @dinamyt/campeonatos-web dev         # :3003  Web Campeonatos (Next)
pnpm --filter @dinamyt/membresias-api dev          # :3004  API Membresías (Fastify)
pnpm --filter @dinamyt/campeonatos-combat dev      # :3005  Combate en vivo (WebSocket)
pnpm --filter @dinamyt/membresias-web dev          # :3006  Web Membresías (Next PWA)
pnpm --filter @dinamyt/membresias-agent dev        # :7070  Agente del lector (mock)
```

| App | URL |
| --- | --- |
| Portal del ecosistema | http://localhost:3000 |
| Web de Campeonatos (admin + pantalla) | http://localhost:3003 |
| API ecosystem / JWKS | http://localhost:3001/auth/jwks |
| API campeonatos / health | http://localhost:3002/health |

---

## 4. Recorrido end-to-end desde el navegador

1. **Portal** → http://localhost:3000 → inicia sesión con el super-admin. En el
   dashboard verás los accesos a las apps según tu plan.
2. **Campeonatos (admin)** → http://localhost:3003/admin/login → inicia sesión
   con la misma cuenta (hoy cada app tiene su propio login; ver §7).
3. **Crear campeonato** → en `/admin`, formulario «Nuevo campeonato»: nombre,
   costo base y modalidades (marca al menos `combate`).
4. **Inscribir competidores** → botón «Inscribir» del campeonato. Prueba las
   restricciones R1-R5 (edad/cinturón/género): si no cumplen, el backend
   explica el motivo. Inscribe **al menos 2** competidores compatibles en
   `combate` para poder armar una llave.
5. **Secciones y llaves** → botón «Secciones» del campeonato (o
   `/admin/[id]/secciones`):
   - **1 · Generar secciones** (crea las categorías del campeonato).
   - **2 · Asignar inscripciones** (empareja cada inscrito con su sección por
     cinturón/peso/edad/género).
   - En una sección de **combate** con ≥ 2 inscritos → **Generar llave**.
6. **Combate en vivo (juez de mesa)** → botón «Juez de mesa» (`/admin/combate`):
   - Escribe un ID (ej. `demo`) → **Conectar**.
   - **Cronómetro**: Iniciar / Pausar / Reiniciar y selector de ronda (R1-R3/Oro).
   - **Puntúa** por réferi (J1-J4), aplica **KyongGo/GamJeum**, usa **↶ Deshacer**.
   - **Declarar ganador** (o descalificación automática a 6 KyongGo / 3 GamJeum).
   - Si abriste el panel con `?seccion=<uuid>` y hay ganador → **Guardar
     resultado** persiste el combate en el campeonato.
7. **Pantalla pública** → http://localhost:3003/pantalla (campeonatos `EN_CURSO`).

> **Atajo para probar solo el combate (sin BD ni login):** levanta únicamente
> `campeonatos-combat` (:3005) y `campeonatos-web` (:3003) y entra directo a
> http://localhost:3003/admin/combate. El motor de combate es 100% offline
> (estado en memoria por WebSocket), ideal para demostrarlo en segundos.

---

## 5. Verificar que todo está sano

```powershell
pnpm build     # turbo 8/8
pnpm test      # core + db + api + combat verdes
```

---

## 6. Dar acceso a Campeonatos a un usuario normal (temporal, manual)

Mientras no exista la UI de compra de planes, asigna una suscripción con el
scope `campeonatos` directamente en la base (schema `ecosystem`). Opciones:
`user_subscriptions` (personal) o `subscriptions` + `org_members` (por
organización). Ejemplo personal:

```sql
insert into ecosystem.user_subscriptions (user_id, plan_id, status, ends_at)
select u.id, p.id, 'ACTIVE', now() + interval '1 year'
from ecosystem.users u, ecosystem.subscription_plans p
where u.email = 'competidor@ejemplo.com' and p.name = 'Plan Campeonatos';
```

El token se recalcula en el **próximo login** (el `app_scopes` se arma desde las
suscripciones activas).

> En **modo local (PGlite)** no hay `psql`; para la demo basta el **super-admin**
> (entra a todo por el bypass del guard), así que normalmente no necesitas este
> paso. Aplica sobre todo en Postgres real (§8).

---

## 7. Notas y limitaciones conocidas

- **Login por app (no SSO todavía):** hoy el portal (3000) y Campeonatos (3003)
  tienen cada uno su propio formulario de login y guardan el token en su
  `localStorage`. **Decisión de arquitectura:** migrar a **SSO por redirección**
  (login único en el portal; las apps redirigen y reciben el token). Ver
  `HANDOFF.md` §5. Mientras tanto, inicia sesión en cada app por separado.
- **CORS:** ambas APIs permiten `http://localhost:3003` además del portal. Si
  cambias de puertos, actualiza `CORS_ORIGINS` en los `.env` de las APIs.
- **Config de categorías:** «Generar secciones» usa hoy la config por defecto
  (`{ genero: 'mixto' }`) → una sección por modalidad. Definir rangos de
  cinturón/edad/peso desde la UI es un pendiente (el motor `generarSecciones` ya
  lo soporta).
- **Persistencia de combate:** requiere abrir `/admin/combate?seccion=<uuid>`.
  El enlace automático desde el bracket (elegir la pelea desde la llave) es el
  siguiente paso.
- **PGlite es de un solo proceso:** no corras `db:local:setup` mientras la API
  correspondiente está levantada (ambas abrirían la misma carpeta). Detén la API,
  corre el setup, y vuelve a levantarla.

---

## 8. Pasar a producción (cuando toque desplegar)

El modo local (PGlite) y el de producción (Postgres real / Supabase) conviven en
el mismo código: la única diferencia son las variables de entorno.

1. **Base de datos real** (Supabase, Neon o Postgres administrado). En los `.env`
   de producción:
   - **Comenta / elimina** `PGLITE_DATA` y `CAMPEONATOS_PGLITE_DATA`.
   - Define `DATABASE_URL` (ecosystem) y `CAMPEONATOS_DATABASE_URL` (campeonatos)
     con el connection string real. Pueden ser el mismo servidor (schemas
     `ecosystem` y `campeonatos` distintos) o dos bases separadas.
2. **Migraciones** contra la base real (usa drizzle-kit, que va por URL):
   ```powershell
   pnpm --filter @dinamyt/ecosystem-api db:migrate
   pnpm --filter @dinamyt/ecosystem-api db:seed
   pnpm --filter @dinamyt/campeonatos-db db:migrate
   ```
3. **Secretos**: genera un par RS256 nuevo para producción (no reutilices el de
   dev), configura `MAIL_USER`/`MAIL_PASS` y **rota** cualquier credencial que
   haya estado en un `.env` de desarrollo.
4. **CORS**: pon en `CORS_ORIGINS` los dominios reales del portal y de campeonatos
   (p. ej. `https://portal.dinamyt.com,https://campeonatos.dinamyt.com`).
5. **Hosting sugerido** (del HANDOFF): webs Next en Vercel; APIs (NestJS/Fastify)
   en Render/Railway/Fly; BD en Supabase/Neon. El WebSocket de combate necesita un
   host que permita conexiones persistentes.
6. **`@electric-sql/pglite`** queda como `devDependency` (solo dev); en producción
   no se instala ni se carga (los `require` viven dentro de la rama local).

> Cuando llegues a este punto, avísame y te doy el detalle por plataforma
> (variables exactas, build commands y checklist de despliegue).
