-- ── El reloj de la sesión lo pone la aplicación, no la base ────────────────
--
-- `created_at` y `last_seen_at` de `sessions` nacieron con `DEFAULT now()`, y
-- eso rompía el inicio de sesión en el VPS.
--
-- Las dos columnas son `timestamp` **sin zona**. Postgres escribe `now()` como
-- la hora de pared de LA BASE; Drizzle lee las columnas sin zona dando por
-- hecho que lo guardado es UTC. Mientras las dos coincidan no se nota nada —en
-- local PGlite corre en GMT y cuadra—, pero el VPS tiene PostgreSQL siguiendo
-- al sistema, que está en `America/Bogota`. Cinco horas de diferencia.
--
-- El efecto: una sesión recién creada se leía con `last_seen_at` cinco horas en
-- el pasado, el guard la daba por muerta por inactividad, y a quien acababa de
-- escribir su contraseña se le echaba con «tu sesión se cerró sola tras 20
-- minutos sin actividad». Recién entrado, sin haber estado inactivo un segundo.
--
-- Ahora las escribe siempre JavaScript (`SessionsService.abrir`), así que ida y
-- vuelta usan el mismo convenio y la zona de la base deja de importar. Se quita
-- el DEFAULT para que la base no pueda volver a rellenarlas por su cuenta: en
-- el esquema de Drizzle tampoco están, y sin default el tipo obliga a dar el
-- valor. Las dos mitades tienen que decir lo mismo o `drizzle-kit` intentará
-- «arreglar» la diferencia en la siguiente migración generada.

ALTER TABLE "ecosystem"."sessions" ALTER COLUMN "created_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "ecosystem"."sessions" ALTER COLUMN "last_seen_at" DROP DEFAULT;--> statement-breakpoint

-- Las sesiones que ya se abrieron con el reloj torcido.
--
-- No se intenta corregirlas: no hay forma de saber cuáles se escribieron con
-- qué desfase, y una fecha inventada es peor que ninguna. Se cierran, que es lo
-- que el guard iba a hacer con ellas de todos modos en cuanto alguien las
-- usara — solo que ahora queda escrito POR QUÉ, y su dueño lee «vuelve a
-- entrar» en vez de una acusación de llevar veinte minutos quieto.
UPDATE "ecosystem"."sessions"
  SET "revoked_at" = now(), "revoked_reason" = 'reloj-torcido'
  WHERE "revoked_at" IS NULL;
