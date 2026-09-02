-- ── Los avisos del club, al celular ─────────────────────────────────────────
--
-- ── Qué problema resuelve ──
--
-- `org_notifications` (migración 0014) es una campana, y una campana solo suena
-- si estás dentro de la casa. Quien lleva un club abre el portal cuando se
-- acuerda; mientras tanto, la persona que tecleó el código del club sigue
-- esperando a que alguien mire. El aviso existía, pero llegaba cuando alguien
-- iba a buscarlo — que es exactamente el problema que la campana venía a
-- arreglar, un piso más abajo.
--
-- Esta tabla guarda el permiso que dio UN NAVEGADOR para que se le escriba.
-- Es la gemela de `membresias.push_subscriptions`, y a propósito: las dos apps
-- envían con las MISMAS llaves VAPID, porque VAPID identifica a quien envía
-- —DINAMYT— y no a la aplicación que envía. En el servidor son las variables
-- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` que ya están puestas para Membresías;
-- en el portal, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, la misma pública. Sin ellas no
-- se envía nada y no pasa nada más: los avisos siguen en la campana.
--
-- ── Por qué una fila por navegador ──
--
-- Porque el permiso lo da el navegador, no la cuenta. La misma maestra tiene el
-- portal instalado en el celular y abierto en el portátil del club, y quiere el
-- aviso en los dos. Cada uno trae su `endpoint` —la dirección que le da su
-- propio fabricante— y sus dos llaves de cifrado.
--
-- ── Por qué `endpoint` es único ──
--
-- El mismo navegador se vuelve a suscribir cada vez que se reinstala la app o
-- se reactiva el permiso, y muchas veces con el mismo `endpoint`. Sin el
-- `UNIQUE` se acumularían filas que mandan el MISMO aviso dos y tres veces al
-- mismo teléfono; con él, volver a suscribirse actualiza la fila que ya estaba
-- (`ON CONFLICT`, en `push.service.ts`).

CREATE TABLE IF NOT EXISTS "ecosystem"."push_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "endpoint" text NOT NULL,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "user_agent" varchar(300),
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ecosystem"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "ecosystem"."users"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- Enviar pregunta siempre lo mismo: «los navegadores de estas personas».
CREATE INDEX IF NOT EXISTS "ix_push_subscriptions_persona"
  ON "ecosystem"."push_subscriptions" USING btree ("user_id");
