-- Los nombres pasan a estar SIEMPRE en mayúsculas, también los ya guardados.
--
-- De aquí en adelante lo normaliza la API al escribir (`mayusculas` en
-- `lib/validacion.ts`), pero eso solo arregla lo que se guarde a partir de
-- ahora: los clubes que ya están en producción tienen dentro «Juan pérez»,
-- «JUAN PEREZ» y «Juan Pérez» según quién los tecleó y qué día. En una lista de
-- alumnos se nota, y en el carnet impreso —que es un documento— se nota más.
--
-- `upper()` de PostgreSQL respeta las tildes con la intercalación UTF-8 de
-- Supabase: «josé» queda «JOSÉ» y no «JOSE». Los acentos NO se quitan a
-- propósito: son parte del nombre de la persona.
--
-- Es una conversión que pierde información —de «JUAN PÉREZ» ya no se vuelve a
-- «Juan Pérez»—, y se hace a sabiendas.
--
-- ── Por qué el `set_config` de arriba ──
-- `users` tiene RLS con FORCE (ver 0003_rls_por_club.sql), así que las
-- políticas se aplican TAMBIÉN al dueño de las tablas, que es el rol con el que
-- corre esto. Fuera de una petición no hay `app.org_id` fijado, de modo que
-- `org_id = org_actual()` es NULL para todas las filas y el UPDATE se saldría
-- con cero filas tocadas y sin error: la migración quedaría marcada como
-- aplicada sin haber hecho nada. `acceso_total` es la misma puerta que usa el
-- cron para cruzar clubes (ver `lib/db-contexto.ts`).
--
-- El tercer argumento en `true` es lo que lo hace LOCAL a la transacción: el
-- migrador de drizzle envuelve todas las sentencias en una sola (ver
-- `PgDialect.migrate`), así que al terminar se deshace solo y no queda una
-- conexión del pool con acceso a todos los clubes.
SELECT set_config('app.acceso_total', 'on', true);--> statement-breakpoint
UPDATE "membresias"."users"
  SET "full_name" = upper("full_name")
  WHERE "full_name" <> upper("full_name");--> statement-breakpoint
UPDATE "membresias"."users"
  SET "emergency_name" = upper("emergency_name")
  WHERE "emergency_name" IS NOT NULL
    AND "emergency_name" <> upper("emergency_name");--> statement-breakpoint
SELECT set_config('app.acceso_total', 'off', true);
