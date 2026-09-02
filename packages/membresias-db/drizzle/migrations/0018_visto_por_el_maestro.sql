-- La campana del club también se vacía al leerla.
--
-- ── Qué se rompía ──
--
-- El maestro abría su campana, veía «Juan Pérez · venció el 1 de agosto», lo
-- leía… y ahí seguía. Y al día siguiente, y al otro. Su campana era lo único de
-- la aplicación que no respondía a haberla mirado.
--
-- No era un descuido: era que la fila tiene DOS lectores y una sola marca.
-- `read_at` es del alumno —dice si abrió su recado— y dejar que el maestro la
-- escribiera le borraba el aviso a alguien que no lo había visto. Así que no se
-- escribía, y el maestro se quedaba sin manera de descartar nada.
--
-- ── Por qué una columna y no una fila por gestor ──
--
-- Porque la campana del club es una lista de TRABAJO compartida —«a éstos hay
-- que cobrarles»—, no la bandeja personal de nadie. En un club con maestro y
-- auxiliar, que lo que uno da por visto desaparezca para los dos es lo que se
-- quiere en una bandeja de equipo; lo caro sería que cada uno tuviera que
-- descartar la misma tarea. Y lo que se pierde es poco: el aviso vuelve mañana
-- si el alumno sigue debiendo, y entretanto la deuda está en la lista de
-- alumnos, que es de donde se cobra.
--
-- (La campana del portal sí lleva una fila por persona, y allí es lo correcto:
-- sus avisos son noticias del club —quién entró, quién se fue—, no tareas
-- compartidas. Ver `ecosystem.org_notifications`.)
--
-- ── El índice ──
--
-- La consulta del maestro pasó a ser «de cada alumno y tipo, el más reciente
-- que no haya dado por visto» (`DISTINCT ON`). Sin índice eso recorre todas las
-- notificaciones del club, que crecen una por alumno moroso y por día. El
-- parcial —solo las que quedan por ver— es pequeño y es justo el que se lee.
ALTER TABLE "membresias"."notifications"
  ADD COLUMN IF NOT EXISTS "staff_read_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_notifications_pendientes_del_club"
  ON "membresias"."notifications" ("membership_id", "type", "scheduled_for" DESC)
  WHERE "staff_read_at" IS NULL;
