# DINAMYT Membresías

Control de mensualidades, pagos y asistencia para un club de artes marciales.

Producto **independiente**: identidad, base de datos y despliegue propios. No
necesita ningún otro servicio para funcionar.

- **Multi-club.** Un superadmin decide qué clubes existen y qué maestros entran.
- **El maestro manda en su club.** Da de alta a sus alumnos, les pone la
  contraseña y se la restablece si la olvidan.
- **Check-in con carnet QR.** Cada alumno imprime el suyo y lo lleva a clase; el
  maestro lo escanea con la cámara de su celular. PIN y lista manual de respaldo.
- **PWA instalable**, con modo claro/oscuro y español/inglés.

---

## Cómo está armado

```
apps/
  membresias-api/     Fastify · puerto 3004 · identidad, cobros y asistencia
  membresias-web/     Next 16 (PWA) · puerto 3006
packages/
  membresias-db/      Drizzle · schema `membresias` de PostgreSQL
```

---

## Quién es quién

| Rol | Qué puede hacer |
|---|---|
| **Superadmin** | Crea clubes, nombra maestros y les corta el acceso. Atraviesa todos los clubes. |
| **Maestro** (`owner`) | Su club: alumnos, planes, pagos, horario, kiosco, reportes. |
| **Auxiliar** (`staff`) | Día a día: registrar pagos y pasar lista. Sin tocar planes ni cuentas. |
| **Acudiente** (`guardian`) | El estado de los alumnos que él paga. |
| **Alumno** (`student`) | Su estado, su carnet QR y su historial. |

El superadmin no es un rol más de la lista: es un booleano aparte, porque no
pertenece a ningún club.

**No hay registro abierto ni recuperación de contraseña por correo.** Las
cuentas nacen de arriba hacia abajo y esta aplicación no envía un solo email.

---

## Correr en local

Requisitos: Node 22+, pnpm 11.

```bash
pnpm install
```

Copia los tres `.env.example` a `.env` y rellénalos. Para desarrollo sin
instalar PostgreSQL, usa la base embebida (PGlite):

```bash
cp packages/membresias-db/.env.example packages/membresias-db/.env
cp apps/membresias-api/.env.example apps/membresias-api/.env
cp apps/membresias-web/.env.example apps/membresias-web/.env.local
```

En los dos primeros, deja `MEMBRESIAS_PGLITE_DATA=./.localdb` y comenta
`MEMBRESIAS_DATABASE_URL`. En `apps/membresias-api/.env` pon además un
`JWT_SECRET` de 32+ caracteres y las credenciales del superadmin:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Prepara la base y arranca:

```bash
pnpm --filter @dinamyt/membresias-db db:local:setup
```

```bash
pnpm --filter @dinamyt/membresias-api dev
```

```bash
pnpm --filter @dinamyt/membresias-web dev
```

La web queda en http://localhost:3006 y la API en http://localhost:3004.

Entra con el `SUPERADMIN_EMAIL` que pusiste → crea un club → nómbrale un
maestro → entra como ese maestro → da de alta un alumno.

---

## Pruebas

```bash
pnpm test
```

Corren contra PostgreSQL en memoria (PGlite): sin Docker y sin base externa.
Cubren la jerarquía de roles, el aislamiento entre clubes, el corte de acceso,
el cálculo de vencimientos y las reglas del check-in.

---

## Despliegue

**Paso a paso completo en [DESPLIEGUE.md](DESPLIEGUE.md)** — Supabase (base de
datos) + Render (API) + Vercel (web), con la lista de variables y las trampas
que cuestan una tarde.

En corto: hay un `render.yaml` y un `vercel.json` listos; las migraciones se
aplican solas al arrancar la API, y lo único que hay que recordar es poner
`CORS_ORIGINS` en Render con el dominio de Vercel.

### Conectar con el ecosistema DINAMYT (opcional)

Si además existe el portal DINAMYT, define `ECOSYSTEM_JWKS_URL` y
`ECOSYSTEM_PORTAL_URL` en la API y `NEXT_PUBLIC_ECOSYSTEM_PORTAL_URL` en la web:
aparece el botón de SSO y los tokens del ecosistema se aceptan para usuarios que
ya existan aquí. Sin esas variables, nada de eso se activa y la app sigue
funcionando igual.
