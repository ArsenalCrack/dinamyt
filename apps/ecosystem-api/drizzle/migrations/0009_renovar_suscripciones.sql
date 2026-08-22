CREATE TABLE "ecosystem"."subscription_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid,
	"user_subscription_id" uuid,
	"amount" numeric(10, 2) NOT NULL,
	"method" varchar(20) DEFAULT 'efectivo' NOT NULL,
	"paid_at" timestamp DEFAULT now(),
	"periodos" integer DEFAULT 1 NOT NULL,
	"periodo_desde" date,
	"periodo_hasta" date,
	"registered_by_user_id" uuid,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "ecosystem"."subscriptions" ADD COLUMN "renewal_months" integer DEFAULT 1;--> statement-breakpoint
ALTER TABLE "ecosystem"."subscriptions" ADD COLUMN "anchor_day" integer;--> statement-breakpoint
ALTER TABLE "ecosystem"."subscriptions" ADD COLUMN "last_reminder_at" timestamp;--> statement-breakpoint
ALTER TABLE "ecosystem"."subscriptions" ADD COLUMN "last_reminder_kind" varchar(20);--> statement-breakpoint
ALTER TABLE "ecosystem"."user_subscriptions" ADD COLUMN "renewal_months" integer DEFAULT 1;--> statement-breakpoint
ALTER TABLE "ecosystem"."user_subscriptions" ADD COLUMN "anchor_day" integer;--> statement-breakpoint
ALTER TABLE "ecosystem"."subscription_payments" ADD CONSTRAINT "subscription_payments_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "ecosystem"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecosystem"."subscription_payments" ADD CONSTRAINT "subscription_payments_user_subscription_id_user_subscriptions_id_fk" FOREIGN KEY ("user_subscription_id") REFERENCES "ecosystem"."user_subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecosystem"."subscription_payments" ADD CONSTRAINT "subscription_payments_registered_by_user_id_users_id_fk" FOREIGN KEY ("registered_by_user_id") REFERENCES "ecosystem"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_subscription_payments_sub" ON "ecosystem"."subscription_payments" USING btree ("subscription_id","paid_at");--> statement-breakpoint
CREATE INDEX "ix_subscription_payments_user" ON "ecosystem"."subscription_payments" USING btree ("user_subscription_id","paid_at");--> statement-breakpoint
-- Un pago pertenece a UNA suscripción: o la de una organización, o la personal.
-- Sin esta regla, una fila con las dos claves —o con ninguna— entra sin
-- protestar y el historial de un club acaba enseñando el pago de otro.
ALTER TABLE "ecosystem"."subscription_payments"
  ADD CONSTRAINT "ck_subscription_payments_una_sola"
  CHECK (("subscription_id" IS NOT NULL) <> ("user_subscription_id" IS NOT NULL));
--> statement-breakpoint
-- El día ancla de lo que ya existe, sacado de su vencimiento actual: un club
-- que hoy vence el 5 tiene que seguir venciendo el 5 después de renovar. Sin
-- esto, la primera renovación le movería el ciclo al día en que se pagó.
UPDATE "ecosystem"."subscriptions"
  SET "anchor_day" = EXTRACT(DAY FROM "ends_at")::int
  WHERE "anchor_day" IS NULL;
--> statement-breakpoint
UPDATE "ecosystem"."user_subscriptions"
  SET "anchor_day" = EXTRACT(DAY FROM "ends_at")::int
  WHERE "anchor_day" IS NULL;
