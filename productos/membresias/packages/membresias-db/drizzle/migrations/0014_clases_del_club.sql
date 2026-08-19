-- Las clases del club: horario propio, descripción y nota de la semana.
--
-- ── Qué problema resuelve ──
--
-- Hasta aquí el horario era una lista de días de la semana y nada más. El
-- alumno abría su panel y leía «martes y jueves»; el maestro que parte a sus
-- alumnos en dos clases el MISMO día —niños a las cuatro, adultos a las seis—
-- no tenía dónde decirlo, así que las dos mitades del club compartían una
-- información que no le servía a ninguna.
--
-- Un club tiene ahora CERO O MÁS clases. Cero es lo de siempre: una sola clase,
-- y el panel del alumno se ve exactamente igual que antes de esta migración.
-- Eso es lo que no puede romperse, porque es el caso de casi todos los clubes.
--
-- ── Las dos columnas `grupo` que se van ──
--
-- `club_schedule.grupo` y `attendances.grupo` existen desde la primera
-- migración y NADA en la aplicación las ha escrito nunca: la web manda solo
-- `{weekday}` en `PUT /schedule`, y ni el kiosco ni la pantalla de asistencia
-- mandan `grupo` en el check-in. Eran el hueco reservado para esta función, y
-- un `varchar` suelto no puede ser lo que decida quién ve qué: dos filas que
-- dicen «Adultos» y «adultos» serían dos clases distintas, y no habría dónde
-- colgarle a esa clase su horario ni su descripción. Se van, y en su sitio
-- queda una referencia de verdad.

-- ── Las clases ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "membresias"."club_groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "name" varchar(80) NOT NULL,
  -- Quién entrena aquí y qué se hace: «Adultos, cinturón azul en adelante».
  -- Largo como la nota del calendario porque es lo mismo, una explicación.
  "descripcion" varchar(500),
  -- En qué orden se enseñan. Sin esto la lista sale por como salga, y el
  -- maestro que tiene «Infantil» y «Adultos» los ve alternarse entre recargas.
  "orden" integer DEFAULT 0 NOT NULL,
  -- Las clases no se borran, se apagan: sus asistencias son historia del club.
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
-- Dos clases con el mismo nombre en el mismo club no las distingue ni el
-- maestro que las creó.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_club_group_nombre"
  ON "membresias"."club_groups" ("org_id", "name");
--> statement-breakpoint

-- ── El horario pasa a ser de la clase, no del club ───────────────────────────
-- Nulo = el club sin dividir. Con clases, cada fila dice de cuál es, y dos
-- filas pueden compartir el martes con horas distintas — que es justamente lo
-- que antes no se podía escribir.
ALTER TABLE "membresias"."club_schedule"
  ADD COLUMN "group_id" uuid REFERENCES "membresias"."club_groups"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "membresias"."club_schedule" DROP COLUMN IF EXISTS "grupo";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_club_schedule_grupo"
  ON "membresias"."club_schedule" ("org_id", "group_id");
--> statement-breakpoint

-- ── En qué clase está el alumno ──────────────────────────────────────────────
-- Una sola, y por eso el muro tiene sentido: «el de una clase no ve la otra»
-- no se puede sostener si se puede estar en las dos. Nulo = sin clase asignada,
-- que es lo que son todos hasta que el maestro los reparta.
ALTER TABLE "membresias"."memberships"
  ADD COLUMN "group_id" uuid REFERENCES "membresias"."club_groups"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_memberships_grupo"
  ON "membresias"."memberships" ("org_id", "group_id");
--> statement-breakpoint

-- ── La asistencia queda dicha por clase ──────────────────────────────────────
-- La sella el check-in desde la membresía, no la manda el navegador: quien
-- marca no elige a qué clase asistió.
ALTER TABLE "membresias"."attendances"
  ADD COLUMN "group_id" uuid REFERENCES "membresias"."club_groups"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "membresias"."attendances" DROP COLUMN IF EXISTS "grupo";
--> statement-breakpoint

-- ── Qué se trabaja esta semana ───────────────────────────────────────────────
-- `semana` es siempre el LUNES de esa semana, normalizado por la API: es lo que
-- convierte «la semana del 14» en una clave con la que se puede hacer un índice.
CREATE TABLE IF NOT EXISTS "membresias"."class_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  -- Nulo = la nota del club entero, para el que no divide sus clases.
  "group_id" uuid REFERENCES "membresias"."club_groups"("id") ON DELETE CASCADE,
  "semana" date NOT NULL,
  "nota" varchar(500) NOT NULL,
  "created_by_id" uuid,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
-- Dos índices parciales y no uno con tres columnas: PostgreSQL considera que
-- dos NULL son DISTINTOS en un índice único, así que un único índice sobre
-- (org_id, group_id, semana) dejaría meter cuantas notas se quisiera para la
-- misma semana del club sin dividir — que es precisamente el caso que hay que
-- proteger, porque entonces `group_id` es nulo siempre.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_class_note_grupo"
  ON "membresias"."class_notes" ("org_id", "group_id", "semana")
  WHERE "group_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_class_note_club"
  ON "membresias"."class_notes" ("org_id", "semana")
  WHERE "group_id" IS NULL;
--> statement-breakpoint

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- No es opcional ni «ya lo filtra la API»: `verificarRls()` recorre TODAS las
-- tablas del esquema al arrancar, y una tabla nueva sin política deja a la API
-- reportando el esquema entero como desprotegido. Las políticas son las mismas
-- de 0003, por `org_id`.
ALTER TABLE membresias.club_groups ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE membresias.club_groups FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS club_groups_por_club ON membresias.club_groups;
--> statement-breakpoint
CREATE POLICY club_groups_por_club ON membresias.club_groups
  USING (membresias.acceso_total() OR org_id = membresias.org_actual())
  WITH CHECK (membresias.acceso_total() OR org_id = membresias.org_actual());
--> statement-breakpoint
ALTER TABLE membresias.class_notes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE membresias.class_notes FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS class_notes_por_club ON membresias.class_notes;
--> statement-breakpoint
CREATE POLICY class_notes_por_club ON membresias.class_notes
  USING (membresias.acceso_total() OR org_id = membresias.org_actual())
  WITH CHECK (membresias.acceso_total() OR org_id = membresias.org_actual());
