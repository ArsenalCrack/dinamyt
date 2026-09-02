-- ── Los correos, en minúsculas ───────────────────────────────────────────────
--
-- ── Qué se rompía ──
--
-- El alta guardaba el correo en minúsculas (`validarCorreo`), pero el login lo
-- buscaba tal y como venía tecleado. Y en un celular el teclado pone la primera
-- letra en mayúscula sin preguntar: la persona se registraba como
-- `juan@gmail.com`, volvía al día siguiente, el teclado escribía `Juan@…` y la
-- app le contestaba **«no existe una cuenta con ese correo. Revísalo o
-- regístrate»** — que además de falso la manda a registrarse otra vez con el
-- correo que ya tiene.
--
-- Ningún proveedor de correo del mundo real distingue mayúsculas en el buzón.
-- La app tampoco debe. Eso ya está arreglado en el código (`normalizarCorreo`,
-- en `common/validacion.ts`, usado en los dos lados: al buscar y al escribir).
--
-- ── Por qué hace falta además esta migración ──
--
-- Porque el código nuevo busca en minúsculas, y una fila que quedó guardada
-- como `Juan@Gmail.com` —de un alta anterior a `validarCorreo`, de una
-- importación, de una invitación escrita a mano— **dejaría de encontrarse
-- justo ahora**. Arreglar la búsqueda sin arreglar los datos cambia un fallo
-- por otro peor: hasta hoy esa persona entraba escribiéndolo con sus
-- mayúsculas; a partir de hoy no entraría de ninguna manera.
--
-- ── Por qué el `NOT EXISTS` ──
--
-- `users.email` y `pending_registrations.email` son ÚNICOS. Si conviven
-- `Juan@x.com` y `juan@x.com` —dos cuentas de la misma persona, creadas por
-- caminos distintos—, bajar la primera a minúsculas choca contra la segunda y
-- tumba la migración entera, dejando la base a medias.
--
-- Así que se baja solo lo que no colisiona, y el par duplicado se queda como
-- está: seguirá entrando por el camino de siempre —su fila en minúsculas— y lo
-- que hay que hacer con él es fusionar las dos cuentas a mano, que es una
-- decisión de negocio (¿cuál tiene el club bueno? ¿cuál el historial?) y no
-- algo que pueda decidir un UPDATE a ciegas. `scripts/diagnostico-bd.mjs` los
-- lista.
--
-- Es idempotente: correrla dos veces no cambia nada la segunda vez.

UPDATE "ecosystem"."users" AS u
SET "email" = lower(u."email")
WHERE u."email" <> lower(u."email")
  AND NOT EXISTS (
    SELECT 1 FROM "ecosystem"."users" AS o
    WHERE o."id" <> u."id" AND o."email" = lower(u."email")
  );
--> statement-breakpoint
UPDATE "ecosystem"."pending_registrations" AS p
SET "email" = lower(p."email")
WHERE p."email" <> lower(p."email")
  AND NOT EXISTS (
    SELECT 1 FROM "ecosystem"."pending_registrations" AS o
    WHERE o."id" <> p."id" AND o."email" = lower(p."email")
  );
--> statement-breakpoint
-- Las invitaciones no tienen índice único global: el suyo es (org_id, email) y
-- solo sobre las PENDIENTES. Se respeta ese mismo alcance al comprobar.
UPDATE "ecosystem"."org_invitations" AS i
SET "email" = lower(i."email")
WHERE i."email" <> lower(i."email")
  AND NOT EXISTS (
    SELECT 1 FROM "ecosystem"."org_invitations" AS o
    WHERE o."id" <> i."id"
      AND o."org_id" = i."org_id"
      AND o."email" = lower(i."email")
      AND o."status" = 'PENDIENTE'
      AND i."status" = 'PENDIENTE'
  );
