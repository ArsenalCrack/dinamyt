-- Un rol por app que dice lo MISMO que el general no es una excepción: es ruido.
--
-- ── Lo que se veía ──
--
-- Alguien se registraba, tecleaba el código de su club, el maestro lo aceptaba
-- como alumno… y en la lista de gente salía marcado «Membresías · Alumno»
-- mientras que los demás alumnos no llevaban nada. Cambiarle el rol a alumno
-- —al mismo que ya tenía— hacía desaparecer la insignia. Dos comportamientos
-- raros con una sola causa.
--
-- ── Qué son estas tres columnas ──
--
-- `role_membresias`, `role_campeonatos` y `role_academy` son EXCEPCIONES:
-- dicen «en esta app, esta persona es otra cosa de lo que dice su rol general»,
-- y MANDAN sobre él (`common/roles-por-app.ts`). Cuando están vacías, el rol de
-- cada app sale de traducir el general, que es lo que le pasa a todo el mundo.
--
-- El portal las escribía en las dos puertas de entrada —aceptar una solicitud
-- del código del club, y mandar una invitación—, poniéndole a cada alumno un
-- `role_membresias = 'student'` que no añadía nada: `student` ya está en el
-- catálogo de Membresías, así que traducido da exactamente lo mismo. Lo único
-- que hacía era dejar una excepción escrita, que es lo que la insignia pinta.
--
-- Y no era cosmético: mientras esa columna esté puesta, cambiarle el rol
-- general a esa persona no cambia lo que hace en la app.
--
-- ── Esto limpia lo ya escrito ──
--
-- El código deja de escribirlas, pero las filas de quien entró antes siguen
-- ahí. Se vacían **solo si repiten la traducción**: una excepción de verdad
-- —el alumno de su club que es `judge` en la federación— dice algo distinto y
-- no se toca. La traducción es la misma tabla de `roles-por-app.ts`, escrita
-- aquí a mano porque una migración no puede importar TypeScript.
--
-- Se aplica a las tres tablas que las guardan: la pertenencia, las
-- invitaciones que todavía no se han aceptado —si no, la excepción vuelve a
-- nacer al aceptarlas— y las bajas, que son de donde se restaura a alguien.

-- ── 1 · El acudiente que entraba como «coach» ────────────────────────────────
--
-- El portal ofrecía «Acudiente» y guardaba el general `coach`, corrigiéndolo
-- con `role_membresias = 'guardian'`. Aparte de ser la razón por la que había
-- que mandar el rol de app, tenía un efecto que nadie pidió: `coach` **abre la
-- consola de Campeonatos**, así que el acudiente de un menor podía entrar a la
-- mesa de control de un torneo. `guardian` es un rol general de verdad y no se
-- traduce a nada allí.
--
-- Va ANTES de la limpieza general: después de esto, `guardian`/`guardian` sí
-- repite la traducción y se vacía en el paso 2.
UPDATE "ecosystem"."org_members"
   SET "role" = 'guardian'
 WHERE "role" = 'coach' AND "role_membresias" = 'guardian';
--> statement-breakpoint

UPDATE "ecosystem"."org_invitations"
   SET "role" = 'guardian'
 WHERE "role" = 'coach' AND "role_membresias" = 'guardian';
--> statement-breakpoint

-- ── 2 · Las excepciones que no lo eran ───────────────────────────────────────
UPDATE "ecosystem"."org_members"
   SET "role_membresias" = NULL
 WHERE "role_membresias" IS NOT NULL
   AND "role_membresias" = CASE "role"
     WHEN 'owner' THEN 'owner'
     WHEN 'staff' THEN 'staff'
     WHEN 'guardian' THEN 'guardian'
     WHEN 'student' THEN 'student'
     WHEN 'admin' THEN 'owner'
     WHEN 'maestro' THEN 'owner'
     WHEN 'coach' THEN 'staff'
     WHEN 'competitor' THEN 'student'
     WHEN 'member' THEN 'student'
   END;
--> statement-breakpoint

UPDATE "ecosystem"."org_members"
   SET "role_campeonatos" = NULL
 WHERE "role_campeonatos" IS NOT NULL
   AND "role_campeonatos" = CASE "role"
     WHEN 'admin' THEN 'admin'
     WHEN 'maestro' THEN 'maestro'
     WHEN 'coach' THEN 'coach'
     WHEN 'competitor' THEN 'competitor'
     WHEN 'judge' THEN 'judge'
     WHEN 'student' THEN 'competitor'
   END;
--> statement-breakpoint

UPDATE "ecosystem"."org_members"
   SET "role_academy" = NULL
 WHERE "role_academy" IS NOT NULL
   AND "role_academy" = CASE "role"
     WHEN 'admin' THEN 'admin'
     WHEN 'teacher' THEN 'teacher'
     WHEN 'student' THEN 'student'
     WHEN 'owner' THEN 'admin'
     WHEN 'maestro' THEN 'teacher'
     WHEN 'coach' THEN 'teacher'
     WHEN 'competitor' THEN 'student'
   END;
--> statement-breakpoint

-- ── 3 · Lo mismo en las invitaciones pendientes y en las bajas ───────────────
UPDATE "ecosystem"."org_invitations"
   SET "role_membresias" = NULL
 WHERE "role_membresias" IS NOT NULL
   AND "role_membresias" = CASE "role"
     WHEN 'owner' THEN 'owner'
     WHEN 'staff' THEN 'staff'
     WHEN 'guardian' THEN 'guardian'
     WHEN 'student' THEN 'student'
     WHEN 'admin' THEN 'owner'
     WHEN 'maestro' THEN 'owner'
     WHEN 'coach' THEN 'staff'
     WHEN 'competitor' THEN 'student'
     WHEN 'member' THEN 'student'
   END;
--> statement-breakpoint

UPDATE "ecosystem"."org_member_bajas"
   SET "role_membresias" = NULL
 WHERE "role_membresias" IS NOT NULL
   AND "role_membresias" = CASE "role"
     WHEN 'owner' THEN 'owner'
     WHEN 'staff' THEN 'staff'
     WHEN 'guardian' THEN 'guardian'
     WHEN 'student' THEN 'student'
     WHEN 'admin' THEN 'owner'
     WHEN 'maestro' THEN 'owner'
     WHEN 'coach' THEN 'staff'
     WHEN 'competitor' THEN 'student'
     WHEN 'member' THEN 'student'
   END;
--> statement-breakpoint

COMMENT ON COLUMN "ecosystem"."org_members"."role_membresias" IS
  'EXCEPCIÓN: qué es esta persona en Membresías cuando NO es lo que dice su rol general. Vacío = se traduce el general (common/roles-por-app.ts). No se escribe al dar de alta a nadie: repetir la traducción marca a la persona con una insignia que no significa nada y bloquea los cambios de rol posteriores.';
