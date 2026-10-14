-- ═══════════════════════════════════════════════════════════════════════════
-- 0022 · Eliminar del club
-- ═══════════════════════════════════════════════════════════════════════════
--
-- La fila que se vacía al eliminar a alguien del club con historia. Qué se
-- borra y qué se queda: `apps/membresias-api/src/lib/eliminar-del-club.ts`.
--
-- `IF NOT EXISTS` para que repetirla no falle.

ALTER TABLE "membresias"."users"
  ADD COLUMN IF NOT EXISTS "eliminado_el" timestamp with time zone;
