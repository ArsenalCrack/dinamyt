-- ── Quién salió del club, y con qué ─────────────────────────────────────────
--
-- ── El problema ──
--
-- Dar de baja a alguien BORRA su fila de `org_members`, y con ella todo lo que
-- decía: su rol general, sus tres roles por aplicación, desde cuándo pertenecía
-- y quién lo invitó. La persona desaparecía de la pantalla sin rastro y sin
-- fecha; la única constancia de que había existido era una línea en el registro
-- del servidor y un script suelto para rehacerla a mano. En un club de treinta
-- alumnos, un clic mal dado dejaba de ser reversible en el momento.
--
-- Y no era un caso raro: la baja está en la misma lista donde se cambian roles,
-- a un botón de distancia.
--
-- ── Por qué una tabla aparte y no un `removed_at` en `org_members` ──
--
-- Porque `org_members` es lo que decide QUIÉN ES MIEMBRO, y esa pregunta se
-- hace en casi cien sitios del servidor: los roles que van dentro del token,
-- quién manda en el club, quién puede ver qué. Marcar la fila en vez de
-- borrarla obligaría a añadir «y que no esté dada de baja» a todas y cada una
-- de esas consultas, y el día que se olvide UNA, alguien a quien echaron sigue
-- entrando por ahí. Sería un fallo silencioso y de seguridad, a cambio de una
-- comodidad.
--
-- Con una tabla aparte, la regla de siempre no se toca —fila en `org_members`
-- = es miembro— y lo que se gana es memoria: la baja se copia aquí antes de
-- borrar, y readmitir es volver a escribir la fila con lo que quedó guardado,
-- roles y antigüedad incluidos.
--
-- ── Cuándo desaparece de aquí ──
--
-- Al readmitir desde la bandeja. Y si la persona vuelve a entrar por otro
-- camino —una invitación, el código del club—, la baja deja de enseñarse
-- porque la consulta descarta a quien ya es miembro otra vez: así ninguno de
-- los cinco sitios que dan de alta tiene que acordarse de limpiar nada.
--
-- ── Sobre el `UNIQUE` ──
--
-- Una baja por persona y club. Dar de baja, readmitir y volver a dar de baja
-- sobrescribe la fila en vez de acumular tres: lo que interesa es la última,
-- que es la que explica por qué esa persona no está HOY.

CREATE TABLE IF NOT EXISTS "ecosystem"."org_member_bajas" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "role" varchar(50) NOT NULL,
  "role_membresias" varchar(50),
  "role_campeonatos" varchar(50),
  "role_academy" varchar(50),
  "membresias_activo" boolean,
  "joined_at" timestamp with time zone,
  "removed_at" timestamp with time zone NOT NULL,
  "removed_by_user_id" uuid
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ecosystem"."org_member_bajas"
    ADD CONSTRAINT "org_member_bajas_org_id_organizations_id_fk"
    FOREIGN KEY ("org_id") REFERENCES "ecosystem"."organizations"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ecosystem"."org_member_bajas"
    ADD CONSTRAINT "org_member_bajas_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "ecosystem"."users"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ecosystem"."org_member_bajas"
    ADD CONSTRAINT "org_member_bajas_removed_by_user_id_users_id_fk"
    FOREIGN KEY ("removed_by_user_id") REFERENCES "ecosystem"."users"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ux_org_member_bajas"
  ON "ecosystem"."org_member_bajas" USING btree ("org_id","user_id");
--> statement-breakpoint
-- La bandeja pregunta siempre lo mismo: «las bajas de este club, las últimas
-- primero».
CREATE INDEX IF NOT EXISTS "ix_org_member_bajas_org"
  ON "ecosystem"."org_member_bajas" USING btree ("org_id","removed_at");
