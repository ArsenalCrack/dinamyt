-- ── Borrar la cuenta, con siete días para arrepentirse ──────────────────────
--
-- La política de privacidad promete que cada quien puede suprimir sus datos.
-- Hasta aquí no había con qué: ni botón, ni guion, y una solicitud por correo
-- era SQL a mano sobre veinte tablas.
--
-- `borrar_el`  · cuándo se va a borrar. Se pone al pedirlo (ahora + 7 días) y
--                se vacía al cancelarlo. Mientras tenga fecha, la cuenta sigue
--                entera: es el plazo para arrepentirse, o para que el dueño de
--                verdad la recupere si fue otro quien lo pidió con su clave.
-- `borrada_el` · cuándo se borró. La fila se queda, vaciada, porque de ella
--                cuelgan pagos y suscripciones que no se van con la persona.
--
-- Qué se borra y qué se queda: `src/modules/supresion/borrar-de-la-base.ts`.

ALTER TABLE "ecosystem"."users"
  ADD COLUMN IF NOT EXISTS "borrar_el" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "ecosystem"."users"
  ADD COLUMN IF NOT EXISTS "borrada_el" timestamp with time zone;
--> statement-breakpoint
-- El barrido diario solo mira las que tienen fecha: casi ninguna.
CREATE INDEX IF NOT EXISTS "ix_users_borrar_el"
  ON "ecosystem"."users" ("borrar_el")
  WHERE "borrar_el" IS NOT NULL;
