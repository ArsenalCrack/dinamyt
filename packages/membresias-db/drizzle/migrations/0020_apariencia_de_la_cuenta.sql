-- ═══════════════════════════════════════════════════════════════════════════
-- 0020 · El tema y el idioma, guardados EN LA CUENTA de Membresías
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── La avería que escribe esta migración ─────────────────────────────────────
--
-- Se reportó así: «el modo y el idioma no viajan de Membresías al ecosistema, y
-- esa información no queda guardada por cuentas».
--
-- Las dos mitades son la misma cosa. `PATCH /me/apariencia` (routes/users.ts)
-- **no guardaba nada aquí**: leía el `eco_sub` de la fila y REENVIABA al portal,
-- nada más. Y `avisarAparienciaAlEcosistema` se rinde en silencio dos veces —
-- si no hay `ECOSYSTEM_SYNC_SECRET`/`ECOSYSTEM_JWKS_URL`, y si `eco_sub` viene
-- vacío:
--
--     if (!altaEnElEcosistema()) return;
--     if (!datos.ecoSub) return;   // ← «el alumno de carnet QR»
--
-- Así que para cualquiera sin `eco_sub`, la elección **no se guardaba en ningún
-- sitio**: vivía en la cookie del navegador y se perdía al cambiar de
-- dispositivo. Y con `eco_sub`, si el puente estaba apagado, tampoco.
--
-- ── Por qué la columna va aquí y no «basta con arreglar el puente» ───────────
--
-- Porque hay gente que **no tiene cuenta del portal y no va a tenerla**: el
-- alumno que entra con el carnet QR, y cualquier club que use Membresías por su
-- cuenta sin ecosistema ninguno (§1.5 de OPERAR.md, y es lo que la mantiene
-- vendible sola). Para todos ellos, «tu cuenta» ES esta fila. Sin estas dos
-- columnas, su preferencia no tiene dónde vivir — y eso no lo arregla ningún
-- secreto compartido.
--
-- ── Quién manda cuando hay las dos ───────────────────────────────────────────
--
-- El ecosistema, cuando hay `eco_sub`: es la verdad compartida por las cuatro
-- webs y es la que hace que elegir en el portal se vea aquí. Esto es la copia
-- local, y sirve para dos cosas que la de allá no puede: contestar cuando el
-- portal no responde, y ser la única verdad de quien no está en el portal.
--
-- Es exactamente el mismo reparto que ya usa la cookie compartida
-- (`dinamyt_tema`): la cuenta es de la persona, la copia es de aquí.
--
-- ── NULL es «no consta», y no se rellena ─────────────────────────────────────
--
-- Ninguna fila existente cambia de aspecto al aplicar esto: `NULL` se lee como
-- «lo que diga el ecosistema, o el navegador». La columna se llena la primera
-- vez que alguien toca el botón. No hay backfill que hacer.

ALTER TABLE "membresias"."users"
  ADD COLUMN IF NOT EXISTS "theme" varchar(16);
--> statement-breakpoint

ALTER TABLE "membresias"."users"
  ADD COLUMN IF NOT EXISTS "locale" varchar(10);
--> statement-breakpoint

COMMENT ON COLUMN "membresias"."users"."theme" IS
  'Cómo quiere ver esta persona: sistema | claro | oscuro. Copia local de '
  'users.theme del ecosistema cuando hay eco_sub, y ÚNICA verdad cuando no '
  '(alumno de carnet QR, o instalación sin ecosistema). NULL = no consta.';
--> statement-breakpoint

COMMENT ON COLUMN "membresias"."users"."locale" IS
  'El idioma de su interfaz: es-CO, en-US… Mismo reparto que theme. '
  'NULL = no consta, y manda la detección del navegador.';
