-- ── Una persona, VARIOS papeles en Campeonatos ──────────────────────────────
--
-- F1 de `PLAN-CAMPEONATOS.md` (repositorio dinamyt-combat).
--
-- ── El problema ──
--
-- `role_campeonatos` guarda UN papel. Y una persona es a la vez maestro de su
-- club y juez en los campeonatos de la federación: con un solo hueco había que
-- elegir cuál de las dos cosas mentir. Campeonatos ya se rompió una vez por
-- esto — `usuarios.puede_juzgar` es el parche booleano que añadió para
-- «maestro que además juzga», porque el pase no sabía decirlo.
--
-- ── Qué guarda la columna nueva ──
--
-- `roles_campeonatos` es la LISTA. Sigue siendo una excepción, igual que
-- `role_campeonatos` (ver 0020): vacía quiere decir «nada especial en
-- Campeonatos» y el papel sale de traducir el rol general, que es lo que le
-- pasa a casi todo el mundo. Con algo dentro, manda sobre el general.
--
-- `role_campeonatos` NO se toca ni se retira: Campeonatos en producción lo lee
-- hoy, y el VPS despliega cada aplicación por separado (`OPERAR.md` §1.2). Si
-- el pase dejara de traerlo antes de que Campeonatos sepa leer la lista, nadie
-- entraría a Campeonatos entre un despliegue y el otro. Cuando la lista tiene
-- algo, el singular guarda el de mayor rango de ella; se retira en F9.
--
-- ── Por qué también en `org_member_bajas` ──
--
-- Por lo mismo que la 0018: readmitir a alguien tiene que devolverlo como
-- estaba. Sin la columna aquí, el maestro-juez que sale del club y vuelve
-- regresaría con un solo papel, y eso no se descubre hasta el día que le toca
-- puntuar.
--
-- ── El relleno ──
--
-- Quien ya tiene una excepción de un papel pasa a tener una lista de un papel.
-- Nadie gana ni pierde nada: el pase sale exactamente igual que antes.

ALTER TABLE "ecosystem"."org_members"
  ADD COLUMN IF NOT EXISTS "roles_campeonatos" text[] NOT NULL DEFAULT '{}';
--> statement-breakpoint

UPDATE "ecosystem"."org_members"
   SET "roles_campeonatos" = ARRAY["role_campeonatos"]
 WHERE "role_campeonatos" IS NOT NULL
   AND cardinality("roles_campeonatos") = 0;
--> statement-breakpoint

ALTER TABLE "ecosystem"."org_member_bajas"
  ADD COLUMN IF NOT EXISTS "roles_campeonatos" text[] NOT NULL DEFAULT '{}';
--> statement-breakpoint

UPDATE "ecosystem"."org_member_bajas"
   SET "roles_campeonatos" = ARRAY["role_campeonatos"]
 WHERE "role_campeonatos" IS NOT NULL
   AND cardinality("roles_campeonatos") = 0;
--> statement-breakpoint

COMMENT ON COLUMN "ecosystem"."org_members"."roles_campeonatos" IS
  'EXCEPCIÓN, en lista: TODOS los papeles de esta persona en Campeonatos dentro de este club, cuando no son lo que dice su rol general. Vacía = se traduce el general (common/roles-por-app.ts). Con algo, role_campeonatos guarda el de mayor rango de la lista, que es lo que sigue leyendo el pase viejo hasta F9.';
