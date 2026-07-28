-- Cinturón del alumno y avisos con acuse de lectura.
--
-- Dos columnas nuevas, ninguna obligatoria: las filas que ya existen quedan
-- válidas tal cual (cinturón sin asignar y avisos sin leer).
--
-- `belt` es texto y no un enum a propósito: el catálogo de grados vive en la
-- aplicación (`apps/membresias-api/src/lib/cinturones.ts`), así que añadir uno
-- nuevo no obliga a migrar un tipo de PostgreSQL en cada base desplegada.
--
-- `read_at` es lo que convierte la campana en algo útil: el contador pasa a ser
-- «sin leer» en vez de «de hoy», que hacía desaparecer del número los avisos
-- que nadie había abierto.
ALTER TABLE "membresias"."users" ADD COLUMN "belt" varchar(40);--> statement-breakpoint
ALTER TABLE "membresias"."notifications" ADD COLUMN "read_at" timestamp;
