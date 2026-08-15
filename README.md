# DINAMYT Membresías

Control de mensualidades, pagos y asistencia para un club de artes marciales.

Producto **independiente**: identidad, base de datos y despliegue propios. No
necesita ningún otro servicio para funcionar.

- **Multi-club.** Un superadmin decide qué clubes existen y qué maestros entran.
- **El maestro manda en su club.** Da de alta a sus alumnos, los edita, les pone
  el cinturón y el plan, y les restablece la contraseña si la olvidan.
- **Check-in con carnet QR.** Cada alumno imprime el suyo y lo lleva a clase; el
  maestro lo escanea con la cámara de su celular. PIN y lista manual de respaldo.
- **Acceso rápido con QR.** Para el alumno que no se acuerda de su correo: el
  maestro genera un código de diez minutos y él entra escaneándolo.
- **Clases separadas.** El club que parte a sus alumnos —los niños a las cuatro,
  los adultos a las seis— le da a cada clase su horario, su descripción y su
  nota de la semana. El alumno de una no ve la información de la otra. El club
  que no las usa sigue con un solo horario, como siempre.
- **Estadísticas del club.** Recaudo de seis meses, estado de las mensualidades,
  asistencia, planes y cinturones en una sola pantalla.
- **Cumpleaños.** El panel avisa al maestro el día que alguien cumple años. La
  fecha la pone él, o el propio alumno una vez: corregirla ya es cosa del
  maestro.
- **Avisos que salen solos.** Un cron diario recorre los clubes y avisa de lo que
  está por vencer, por la campana y por push. Ver [DESPLIEGUE.md](DESPLIEGUE.md).
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
Qué haría falta para que sí los enviara —y por qué el aviso diario de clase no
puede ir por ahí— está estudiado en [CORREO.md](CORREO.md).

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

En corto: hay un `render.yaml` listo para el Blueprint de Render; en Vercel el
*Root Directory* va en `apps/membresias-web`. Las migraciones se aplican solas
al arrancar la API, y lo único que queda por recordar es poner `CORS_ORIGINS`
en Render con el dominio de Vercel.

### Conectar con el ecosistema DINAMYT (opcional)

Si además existe el portal DINAMYT, define `ECOSYSTEM_JWKS_URL` y
`ECOSYSTEM_PORTAL_URL` en la API y `NEXT_PUBLIC_ECOSYSTEM_PORTAL_URL` en la web:
aparece el botón de SSO y los tokens del ecosistema se aceptan para usuarios que
ya existan aquí. Sin esas variables, nada de eso se activa y la app sigue
funcionando igual.
