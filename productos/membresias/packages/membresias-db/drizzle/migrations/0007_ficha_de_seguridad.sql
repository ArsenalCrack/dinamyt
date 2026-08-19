-- Antigüedad real y ficha de seguridad.
--
-- `trains_since`: desde cuándo entrena, que no es desde cuándo tiene cuenta. Un
-- club que estrena la app trae alumnos con años encima; sin esta columna, la
-- antigüedad de todos empezaba el día que el maestro los dio de alta. Se queda
-- en nulo para quien no la sepa, y entonces se cae de vuelta a `created_at`.
--
-- El resto son los datos que solo importan el día que importan: si a alguien le
-- pasa algo en el tatami, su tipo de sangre y a quién llamar están impresos en
-- su carnet en vez de haber que buscarlos.
ALTER TABLE "membresias"."users" ADD COLUMN "trains_since" date;--> statement-breakpoint
ALTER TABLE "membresias"."users" ADD COLUMN "blood_type" varchar(8);--> statement-breakpoint
ALTER TABLE "membresias"."users" ADD COLUMN "emergency_name" varchar(150);--> statement-breakpoint
ALTER TABLE "membresias"."users" ADD COLUMN "emergency_phone" varchar(40);
