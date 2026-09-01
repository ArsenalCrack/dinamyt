-- ── Las fechas de Membresías pasan a llevar zona ─────────────────────────────
--
-- ── El fallo que se cierra ──
--
-- La hora que el maestro ve al pasar lista salía **cinco horas en el pasado**.
-- Se marcaba a las siete de la tarde y la lista del día decía «14:07».
--
-- La causa: una columna `timestamp` **sin zona** guarda una hora de pared
-- desnuda, sin decir de dónde. Y aquí la escriben dos manos con convenios
-- distintos:
--
--   · `DEFAULT now()` la escribe **PostgreSQL**, con la hora de pared de la
--     base. En el VPS eso es `America/Bogota` (el servicio arranca con
--     `TZ=America/Bogota`, y no por capricho: `todayStr()` decide con la hora
--     local qué día es hoy para el check-in y para el vencimiento).
--   · Un `new Date()` la escribe **Drizzle**, que serializa en **UTC**.
--
-- Y al LEER, Drizzle da por hecho que lo guardado es UTC siempre
-- (`mapFromDriverValue` le pega un `+0000`). O sea: lo que escribió la base
-- sale cinco horas atrás, y lo que escribió la aplicación sale bien.
--
-- En local no se ve, y por eso llegó a producción: PGlite arranca en `GMT` y
-- los dos convenios coinciden por casualidad.
--
-- Con `timestamptz` el valor guardado es un **instante**, no una hora de
-- pared: `now()` y `new Date()` producen el mismo punto en el tiempo y la zona
-- de la base deja de participar. Es la diferencia entre tapar el fallo y
-- quitarle el sitio donde vivía.
--
-- Es la misma cura que se le dio al ecosistema en su `0012_fechas_con_zona`
-- (ver OPERAR.md §5.1-bis), que dejó esta apuntada como pendiente.
--
-- ══════════════════════════════════════════════════════════════════════════
-- POR QUÉ AQUÍ NO SE ESCRIBE 'America/Bogota' Y EN EL ECOSISTEMA SÍ
-- ══════════════════════════════════════════════════════════════════════════
--
-- Porque **Membresías se vende sola**. La migración del ecosistema corre en un
-- sitio conocido —el VPS de DINAMYT, con `SHOW timezone` = `America/Bogota`— y
-- ahí escribir la zona a mano es lo más explícito. Ésta corre también en la
-- base de un club que la instaló por su cuenta: en Supabase, en Neon o en un
-- Postgres propio, donde `SHOW timezone` casi siempre dice `UTC`. Clavar
-- Bogotá ahí no arreglaría nada: le sumaría cinco horas a filas que estaban
-- bien.
--
-- `current_setting('TimeZone')` es exactamente la zona con la que escribió
-- `now()`, sea cual sea. No hay que comprobar nada antes de correr esto y no
-- hay una versión del SQL por despliegue.
--
-- (Ojo: `ALTER COLUMN … TYPE timestamptz` a secas ya hace eso mismo. Se
-- escribe el `AT TIME ZONE` igualmente para que al leer la migración no haya
-- que saberlo — y para que las tres clases de columna se distingan a simple
-- vista.)
--
-- ══════════════════════════════════════════════════════════════════════════
-- NO TODAS LAS COLUMNAS SE CONVIERTEN IGUAL
-- ══════════════════════════════════════════════════════════════════════════
--
--   A · **Siempre `DEFAULT now()`** → lo guardado es hora de la base.
--       `USING col AT TIME ZONE current_setting('TimeZone')`
--
--   B · **Siempre `new Date()`** desde la aplicación → ya es UTC.
--       `USING col AT TIME ZONE 'UTC'`
--
--   C · **Mixtas.** Los `updated_at` nacen con `DEFAULT now()` y se pisan con
--       `new Date()` en cada actualización. La misma fila puede llevar un
--       convenio en `created_at` y el otro en `updated_at`. Se distinguen por
--       la distancia entre las dos columnas: si la fila nunca se actualizó,
--       `updated_at` es idéntico a `created_at`; en cuanto la tocó la
--       aplicación, la diferencia es el desfase de la zona entera (cinco horas
--       en Bogotá). Dos segundos de umbral dejan el corte lejísimos de los dos
--       casos. En una base que ya corra en UTC las dos ramas dan lo mismo, así
--       que el CASE no puede estropear nada.
--
--   D · **Fechas civiles: NO SE TOCAN.** `vence_el`, `birth_date`,
--       `trains_since`, `carnet_emitido_el`, `checkin_date`, `date` de las
--       excepciones, `semana` de las notas y `periodo_desde` / `periodo_hasta`
--       de los pagos ya son `date`, que es su tipo correcto. Aquí no hay nada
--       que arreglar y meterlas sería cometer el error por el otro lado.
--
-- ── El caso raro que se documenta en vez de adivinarse ──
--
-- `attendances.checked_in_at` es del grupo A **salvo** en las marcas que llegan
-- de la cola sin conexión del kiosco, donde la escribe la aplicación con el
-- `marcadoEn` que mandó el navegador (ver `routes/checkin.ts`). No hay forma
-- fiable de distinguir unas de otras a posteriori —`checkin_date` no las
-- separa—, así que se convierten todas como grupo A, que es lo que son casi
-- todas. Las de la cola quedan desplazadas el ancho de la zona; ya lo estaban
-- antes de esto, y a partir de aquí ninguna nueva lo estará.
--
-- ── Antes de correr esto en el VPS ──
--
--   1. Respaldo delante (`scripts/respaldar-produccion.ps1` del monorepo), y
--      comprobado. Esto reescribe 11 tablas.
--   2. El ensayo, que levanta PGlite en la zona de Bogotá, fabrica las dos
--      clases de fila, aplica estas mismas conversiones y comprueba que el SQL
--      y el esquema de Drizzle dicen lo mismo columna por columna:
--
--          pnpm --filter @dinamyt/membresias-db zonas:ensayo
--
-- No hay vuelta atrás automática: `timestamptz` → `timestamp` pierde la zona.
-- La vuelta atrás es el respaldo del punto 1.

-- Una reescritura de tabla toma ACCESS EXCLUSIVE. Son tablas pequeñas y va en
-- segundos, pero si algo tiene la tabla cogida se prefiere fallar rápido y
-- volver a intentarlo a dejar la API esperando en cola (mismo criterio que la
-- 0012 del ecosistema).
SET LOCAL lock_timeout = '10s';--> statement-breakpoint

-- ── identidad ─────────────────────────────────────────────────────────────
ALTER TABLE "membresias"."orgs"
  ALTER COLUMN "created_at" TYPE timestamptz
    USING "created_at" AT TIME ZONE current_setting('TimeZone'),
  ALTER COLUMN "updated_at" TYPE timestamptz
    USING CASE
      WHEN "updated_at" - "created_at" < interval '2 seconds'
        THEN "updated_at" AT TIME ZONE current_setting('TimeZone')
      ELSE "updated_at" AT TIME ZONE 'UTC'
    END;--> statement-breakpoint

ALTER TABLE "membresias"."users"
  ALTER COLUMN "created_at" TYPE timestamptz
    USING "created_at" AT TIME ZONE current_setting('TimeZone'),
  ALTER COLUMN "updated_at" TYPE timestamptz
    USING CASE
      WHEN "updated_at" - "created_at" < interval '2 seconds'
        THEN "updated_at" AT TIME ZONE current_setting('TimeZone')
      ELSE "updated_at" AT TIME ZONE 'UTC'
    END;--> statement-breakpoint

-- ── planes y cobro ────────────────────────────────────────────────────────
ALTER TABLE "membresias"."plans"
  ALTER COLUMN "created_at" TYPE timestamptz
    USING "created_at" AT TIME ZONE current_setting('TimeZone'),
  ALTER COLUMN "updated_at" TYPE timestamptz
    USING CASE
      WHEN "updated_at" - "created_at" < interval '2 seconds'
        THEN "updated_at" AT TIME ZONE current_setting('TimeZone')
      ELSE "updated_at" AT TIME ZONE 'UTC'
    END;--> statement-breakpoint

ALTER TABLE "membresias"."memberships"
  ALTER COLUMN "created_at" TYPE timestamptz
    USING "created_at" AT TIME ZONE current_setting('TimeZone'),
  ALTER COLUMN "updated_at" TYPE timestamptz
    USING CASE
      WHEN "updated_at" - "created_at" < interval '2 seconds'
        THEN "updated_at" AT TIME ZONE current_setting('TimeZone')
      ELSE "updated_at" AT TIME ZONE 'UTC'
    END;--> statement-breakpoint

-- Un pago no se edita: `paid_at` y `created_at` los pone la base y ya está.
ALTER TABLE "membresias"."payments"
  ALTER COLUMN "paid_at" TYPE timestamptz
    USING "paid_at" AT TIME ZONE current_setting('TimeZone'),
  ALTER COLUMN "created_at" TYPE timestamptz
    USING "created_at" AT TIME ZONE current_setting('TimeZone');--> statement-breakpoint

-- ── clases, calendario y asistencia ───────────────────────────────────────
ALTER TABLE "membresias"."club_groups"
  ALTER COLUMN "created_at" TYPE timestamptz
    USING "created_at" AT TIME ZONE current_setting('TimeZone'),
  ALTER COLUMN "updated_at" TYPE timestamptz
    USING CASE
      WHEN "updated_at" - "created_at" < interval '2 seconds'
        THEN "updated_at" AT TIME ZONE current_setting('TimeZone')
      ELSE "updated_at" AT TIME ZONE 'UTC'
    END;--> statement-breakpoint

ALTER TABLE "membresias"."class_notes"
  ALTER COLUMN "created_at" TYPE timestamptz
    USING "created_at" AT TIME ZONE current_setting('TimeZone'),
  ALTER COLUMN "updated_at" TYPE timestamptz
    USING CASE
      WHEN "updated_at" - "created_at" < interval '2 seconds'
        THEN "updated_at" AT TIME ZONE current_setting('TimeZone')
      ELSE "updated_at" AT TIME ZONE 'UTC'
    END;--> statement-breakpoint

-- `last_seen_at` la escribe la aplicación; `created_at`, la base.
ALTER TABLE "membresias"."devices"
  ALTER COLUMN "created_at" TYPE timestamptz
    USING "created_at" AT TIME ZONE current_setting('TimeZone'),
  ALTER COLUMN "last_seen_at" TYPE timestamptz
    USING "last_seen_at" AT TIME ZONE 'UTC';--> statement-breakpoint

-- **La columna por la que se hace todo esto.** Ver el caso raro de arriba.
ALTER TABLE "membresias"."attendances"
  ALTER COLUMN "checked_in_at" TYPE timestamptz
    USING "checked_in_at" AT TIME ZONE current_setting('TimeZone');--> statement-breakpoint

-- ── avisos ────────────────────────────────────────────────────────────────
ALTER TABLE "membresias"."push_subscriptions"
  ALTER COLUMN "created_at" TYPE timestamptz
    USING "created_at" AT TIME ZONE current_setting('TimeZone');--> statement-breakpoint

-- `scheduled_for`, `sent_at` y `read_at` las escribe SIEMPRE la aplicación
-- (ver `routes/notifications.ts`): ninguna tiene default y ninguna se escribe
-- desde SQL. `scheduled_for` además es la medianoche UTC del día del aviso, y
-- de ella se lee el día con un `slice(0, 10)` en la campana — convertirla como
-- hora local la correría un día.
ALTER TABLE "membresias"."notifications"
  ALTER COLUMN "created_at" TYPE timestamptz
    USING "created_at" AT TIME ZONE current_setting('TimeZone'),
  ALTER COLUMN "scheduled_for" TYPE timestamptz
    USING "scheduled_for" AT TIME ZONE 'UTC',
  ALTER COLUMN "sent_at" TYPE timestamptz
    USING "sent_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "read_at" TYPE timestamptz
    USING "read_at" AT TIME ZONE 'UTC';--> statement-breakpoint

ALTER TABLE "membresias"."audit"
  ALTER COLUMN "created_at" TYPE timestamptz
    USING "created_at" AT TIME ZONE current_setting('TimeZone');--> statement-breakpoint

-- ── ajustes ───────────────────────────────────────────────────────────────
-- Mixta como los `updated_at`, pero sin pareja con la que compararse: nace con
-- `DEFAULT now()` y la pisa la aplicación al cambiar el modo mantenimiento.
-- Son dos filas como mucho y no las mira nadie contra el reloj; se convierte
-- como grupo A y se deja dicho.
ALTER TABLE "membresias"."app_settings"
  ALTER COLUMN "updated_at" TYPE timestamptz
    USING "updated_at" AT TIME ZONE current_setting('TimeZone');
