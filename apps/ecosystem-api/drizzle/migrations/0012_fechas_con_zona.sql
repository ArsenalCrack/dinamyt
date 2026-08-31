-- ── Las fechas del ecosistema pasan a llevar zona ─────────────────────────────
--
-- Es el arreglo de fondo de §5.1-bis: en vez de recordar en cada columna quién
-- la escribe, se cambia el tipo para que la pregunta deje de existir.
--
-- ── El fallo que se cierra ──
--
-- Una columna `timestamp` **sin zona** guarda una hora de pared desnuda, sin
-- decir de dónde. Y aquí la escriben dos manos con convenios distintos:
--
--   · `DEFAULT now()` la escribe **PostgreSQL**, con la hora de pared de la
--     base. En el VPS eso es `America/Bogota`, porque PostgreSQL sigue al
--     sistema y ahí se corrió `timedatectl set-timezone America/Bogota`.
--   · Un `new Date()` la escribe **Drizzle**, que serializa en **UTC**.
--
-- Y al LEER, Drizzle da por hecho que lo guardado es UTC siempre
-- (`mapFromDriverValue` le pega un `+0000`). O sea: lo que escribió la base sale
-- cinco horas en el pasado, y lo que escribió la aplicación sale bien.
--
-- En local no se ve, y por eso llegó a producción: PGlite arranca en `GMT` y
-- los dos convenios coinciden por casualidad.
--
-- Con `timestamptz` el valor guardado es un **instante**, no una hora de pared:
-- `now()` y `new Date()` producen el mismo punto en el tiempo y la zona de la
-- base deja de participar. Es la diferencia entre tapar el fallo y quitarle el
-- sitio donde vivía.
--
-- ── Lo que se nota hoy, antes de esto ──
--
-- Nada que decida: lo único que comparaba una de estas fechas contra el reloj
-- eran las sesiones, y eso se arregló aparte (migración 0011). Lo que se
-- desplaza es lo que se PINTA — y de forma visible en un caso: quien se
-- registró entre medianoche y las cinco de la mañana aparece con la fecha del
-- día anterior en «Miembro desde».
--
-- ══════════════════════════════════════════════════════════════════════════
-- LO IMPORTANTE: no todas las columnas se convierten igual
-- ══════════════════════════════════════════════════════════════════════════
--
-- `ALTER COLUMN ... TYPE timestamptz` a secas interpreta lo guardado con la
-- zona de la SESIÓN. Eso acierta con lo que escribió la base y estropea lo que
-- escribió la aplicación — le sumaría cinco horas a fechas que ya estaban bien.
-- Por eso cada columna lleva su propio `USING`, y por eso hubo que auditar
-- quién escribe cada una antes de escribir una sola línea de esto.
--
-- Salieron cuatro grupos:
--
--   A · **Siempre `DEFAULT now()`** → lo guardado es hora de Bogotá.
--       `USING col AT TIME ZONE 'America/Bogota'`
--
--   B · **Siempre `new Date()`** → lo guardado ya es UTC.
--       `USING col AT TIME ZONE 'UTC'`
--       La regla que las delata sin leer código: `NOT NULL` y sin `DEFAULT`
--       obliga a que el valor lo dé alguien, y ese alguien es la aplicación.
--
--   C · **Mixtas.** Los cuatro `updated_at` nacen con `DEFAULT now()` (Bogotá)
--       y se pisan con `new Date()` (UTC) en cada actualización. La misma fila
--       puede llevar un convenio en `created_at` y el otro en `updated_at`.
--       Se distinguen por la distancia entre las dos columnas, y funciona
--       porque los dos convenios están **cinco horas** separados: si la fila
--       nunca se actualizó, `updated_at` es idéntico a `created_at`; en cuanto
--       la tocó la aplicación, la diferencia no baja de cinco horas. Dos
--       segundos de umbral dejan el corte lejísimos de los dos casos.
--
--   D · **Fechas civiles: NO SE TOCAN.** `birth_date`, y los `starts_at` /
--       `ends_at` de las suscripciones, no son instantes: son días. Se calculan
--       como texto 'YYYY-MM-DD' y se guardan a medianoche UTC (ver
--       `common/ciclo.ts`). Convertirlas a `timestamptz` sería cometer el error
--       de nuevo por el otro lado: un cumpleaños no ocurre a una hora, y una
--       suscripción que vence «el 31» no vence a las 19:00 del 30. Su tipo
--       correcto es `date`, y eso es otra migración con su propio cambio de
--       código — no de propina en esta.
--
--       Son seis: `users.birth_date`, `pending_registrations.birth_date`,
--       `subscriptions.starts_at`, `subscriptions.ends_at`,
--       `user_subscriptions.starts_at`, `user_subscriptions.ends_at`.
--
-- ── Los DEFAULT se quedan ──
--
-- La 0011 quitó `DEFAULT now()` de `sessions` porque con `timestamp` sin zona
-- ese default era el fallo. Aquí es al revés: sobre `timestamptz`, `now()`
-- guarda el instante correcto, así que el default vuelve a ser lo que siempre
-- quiso ser. No se quita ninguno, y después de esto da igual qué mano escriba
-- cada columna. Eso es exactamente lo que se compró con la migración.
--
-- ── Antes de correr esto en el VPS ──
--
--   1. Respaldo delante (`scripts/respaldar-produccion.ps1`), y comprobado
--      (`scripts/verificar-respaldo.ps1`). Esto reescribe 16 tablas.
--   2. `SHOW timezone;` en la base tiene que decir `America/Bogota`. Todo el
--      grupo A depende de eso. Si dijera otra cosa, el `AT TIME ZONE` de abajo
--      lleva la zona equivocada y hay que cambiarlo ANTES, no después.
--   3. El ensayo, que hace las dos comprobaciones y además prueba la conversión
--      contra filas escritas por las dos manos:
--
--          cd apps/ecosystem-api && pnpm zonas:ensayo
--
-- No hay vuelta atrás automática: `timestamptz` → `timestamp` pierde la zona.
-- La vuelta atrás es el respaldo del punto 1.

-- Una reescritura de tabla toma ACCESS EXCLUSIVE. Son tablas pequeñas y va en
-- segundos, pero si algo tiene la tabla cogida se prefiere fallar rápido y
-- volver a intentarlo a dejar la API esperando en cola (§5.1-ter).
SET LOCAL lock_timeout = '10s';--> statement-breakpoint

-- ── A + C ─────────────────────────────────────────────────────────────────
ALTER TABLE "ecosystem"."organizations"
  ALTER COLUMN "created_at" TYPE timestamptz
    USING "created_at" AT TIME ZONE 'America/Bogota',
  ALTER COLUMN "updated_at" TYPE timestamptz
    USING CASE
      WHEN "updated_at" - "created_at" < interval '2 seconds'
        THEN "updated_at" AT TIME ZONE 'America/Bogota'
      ELSE "updated_at" AT TIME ZONE 'UTC'
    END;--> statement-breakpoint

ALTER TABLE "ecosystem"."users"
  ALTER COLUMN "created_at" TYPE timestamptz
    USING "created_at" AT TIME ZONE 'America/Bogota',
  ALTER COLUMN "updated_at" TYPE timestamptz
    USING CASE
      WHEN "updated_at" - "created_at" < interval '2 seconds'
        THEN "updated_at" AT TIME ZONE 'America/Bogota'
      ELSE "updated_at" AT TIME ZONE 'UTC'
    END,
  -- Las dos las escribe siempre la aplicación. `locked_until` además se COMPARA
  -- contra `Date.now()` en `abrirSesion`: hoy funciona porque ida y vuelta son
  -- UTC, y a partir de aquí funciona porque el tipo lo garantiza.
  ALTER COLUMN "data_consent_at" TYPE timestamptz
    USING "data_consent_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "locked_until" TYPE timestamptz
    USING "locked_until" AT TIME ZONE 'UTC';--> statement-breakpoint

-- ── B ─────────────────────────────────────────────────────────────────────
-- `sessions` no tiene una sola columna que escriba la base: la 0011 les quitó
-- el default justamente para eso. Todas son UTC.
ALTER TABLE "ecosystem"."sessions"
  ALTER COLUMN "created_at" TYPE timestamptz
    USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "last_seen_at" TYPE timestamptz
    USING "last_seen_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "expires_at" TYPE timestamptz
    USING "expires_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "revoked_at" TYPE timestamptz
    USING "revoked_at" AT TIME ZONE 'UTC';--> statement-breakpoint

ALTER TABLE "ecosystem"."otp_codes"
  ALTER COLUMN "created_at" TYPE timestamptz
    USING "created_at" AT TIME ZONE 'America/Bogota',
  ALTER COLUMN "expires_at" TYPE timestamptz
    USING "expires_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "used_at" TYPE timestamptz
    USING "used_at" AT TIME ZONE 'UTC';--> statement-breakpoint

ALTER TABLE "ecosystem"."org_members"
  ALTER COLUMN "joined_at" TYPE timestamptz
    USING "joined_at" AT TIME ZONE 'America/Bogota';--> statement-breakpoint

-- `consent_at` está entera a NULL hoy (nada la escribe todavía). Se convierte
-- igual: el día que alguien la rellene, que se encuentre el tipo bueno puesto.
ALTER TABLE "ecosystem"."user_guardians"
  ALTER COLUMN "created_at" TYPE timestamptz
    USING "created_at" AT TIME ZONE 'America/Bogota',
  ALTER COLUMN "consent_at" TYPE timestamptz
    USING "consent_at" AT TIME ZONE 'UTC';--> statement-breakpoint

ALTER TABLE "ecosystem"."user_disciplines"
  ALTER COLUMN "created_at" TYPE timestamptz
    USING "created_at" AT TIME ZONE 'America/Bogota',
  ALTER COLUMN "updated_at" TYPE timestamptz
    USING CASE
      WHEN "updated_at" - "created_at" < interval '2 seconds'
        THEN "updated_at" AT TIME ZONE 'America/Bogota'
      ELSE "updated_at" AT TIME ZONE 'UTC'
    END;--> statement-breakpoint

ALTER TABLE "ecosystem"."subscription_plans"
  ALTER COLUMN "created_at" TYPE timestamptz
    USING "created_at" AT TIME ZONE 'America/Bogota';--> statement-breakpoint

-- `starts_at` y `ends_at` NO están aquí: son días, no instantes (grupo D).
ALTER TABLE "ecosystem"."subscriptions"
  ALTER COLUMN "created_at" TYPE timestamptz
    USING "created_at" AT TIME ZONE 'America/Bogota',
  ALTER COLUMN "updated_at" TYPE timestamptz
    USING CASE
      WHEN "updated_at" - "created_at" < interval '2 seconds'
        THEN "updated_at" AT TIME ZONE 'America/Bogota'
      ELSE "updated_at" AT TIME ZONE 'UTC'
    END,
  -- Se compara contra `Date.now()` para decidir si toca reenviar el aviso, así
  -- que es de las que más agradecen dejar de depender de un convenio.
  ALTER COLUMN "last_reminder_at" TYPE timestamptz
    USING "last_reminder_at" AT TIME ZONE 'UTC';--> statement-breakpoint

ALTER TABLE "ecosystem"."user_subscriptions"
  ALTER COLUMN "created_at" TYPE timestamptz
    USING "created_at" AT TIME ZONE 'America/Bogota';--> statement-breakpoint

ALTER TABLE "ecosystem"."subscription_payments"
  ALTER COLUMN "paid_at" TYPE timestamptz
    USING "paid_at" AT TIME ZONE 'America/Bogota',
  ALTER COLUMN "created_at" TYPE timestamptz
    USING "created_at" AT TIME ZONE 'America/Bogota';--> statement-breakpoint

ALTER TABLE "ecosystem"."org_club_invitations"
  ALTER COLUMN "created_at" TYPE timestamptz
    USING "created_at" AT TIME ZONE 'America/Bogota',
  ALTER COLUMN "responded_at" TYPE timestamptz
    USING "responded_at" AT TIME ZONE 'UTC';--> statement-breakpoint

ALTER TABLE "ecosystem"."org_join_requests"
  ALTER COLUMN "created_at" TYPE timestamptz
    USING "created_at" AT TIME ZONE 'America/Bogota',
  ALTER COLUMN "responded_at" TYPE timestamptz
    USING "responded_at" AT TIME ZONE 'UTC';--> statement-breakpoint

ALTER TABLE "ecosystem"."org_invitations"
  ALTER COLUMN "created_at" TYPE timestamptz
    USING "created_at" AT TIME ZONE 'America/Bogota',
  ALTER COLUMN "responded_at" TYPE timestamptz
    USING "responded_at" AT TIME ZONE 'UTC';--> statement-breakpoint

ALTER TABLE "ecosystem"."audit_auth"
  ALTER COLUMN "created_at" TYPE timestamptz
    USING "created_at" AT TIME ZONE 'America/Bogota';--> statement-breakpoint

-- `pending_registrations.created_at` también es mixta, pero su pareja no es
-- `updated_at` —esta tabla no tiene—: es `last_sent_at`, que la escribe SIEMPRE
-- la aplicación. En el alta normal, `created_at` sale de `now()` (Bogotá) y
-- `last_sent_at` de `new Date()` (UTC), así que se separan cinco horas; cuando
-- alguien vuelve a registrarse con el mismo correo, el `onConflictDoUpdate`
-- pone las dos con `new Date()` en la misma sentencia y quedan a milisegundos.
--
-- Da igual acertar o no, en el fondo: estas filas viven veinte minutos y se
-- borran al verificar. Se hace bien porque es igual de barato que hacerlo mal.
ALTER TABLE "ecosystem"."pending_registrations"
  ALTER COLUMN "created_at" TYPE timestamptz
    USING CASE
      WHEN abs(extract(epoch FROM "last_sent_at" - "created_at")) < 2
        THEN "created_at" AT TIME ZONE 'UTC'
      ELSE "created_at" AT TIME ZONE 'America/Bogota'
    END,
  ALTER COLUMN "expires_at" TYPE timestamptz
    USING "expires_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "last_sent_at" TYPE timestamptz
    USING "last_sent_at" AT TIME ZONE 'UTC';
