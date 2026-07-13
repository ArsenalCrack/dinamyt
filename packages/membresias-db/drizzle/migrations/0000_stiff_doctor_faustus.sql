CREATE SCHEMA "membresias";
--> statement-breakpoint
CREATE TYPE "membresias"."canal_notif" AS ENUM('push', 'email', 'inapp');--> statement-breakpoint
CREATE TYPE "membresias"."estado_membresia" AS ENUM('activo', 'inactivo', 'suspendido', 'retirado');--> statement-breakpoint
CREATE TYPE "membresias"."estado_notif" AS ENUM('PENDIENTE', 'ENVIADA', 'FALLIDA');--> statement-breakpoint
CREATE TYPE "membresias"."estado_pago" AS ENUM('PAGADO', 'PARCIAL', 'PENDIENTE');--> statement-breakpoint
CREATE TYPE "membresias"."metodo_checkin" AS ENUM('fingerprint', 'qr', 'pin', 'manual');--> statement-breakpoint
CREATE TYPE "membresias"."metodo_pago" AS ENUM('efectivo', 'transferencia', 'nequi', 'daviplata');--> statement-breakpoint
CREATE TYPE "membresias"."tipo_notif" AS ENUM('pre_venc', 'venc', 'mora', 'maestro');--> statement-breakpoint
CREATE TYPE "membresias"."tipo_plan" AS ENUM('mensual', 'semanal', 'clase', 'paquete', 'matricula');--> statement-breakpoint
CREATE TABLE "membresias"."memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"ecosystem_user_id" uuid NOT NULL,
	"payer_user_id" uuid,
	"status" "membresias"."estado_membresia" DEFAULT 'activo' NOT NULL,
	"status_reason" text,
	"matriculado" boolean DEFAULT false,
	"current_plan_id" uuid,
	"vence_el" date,
	"anchor_day" integer,
	"clases_restantes" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "membresias"."payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"membership_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"method" "membresias"."metodo_pago" NOT NULL,
	"status" "membresias"."estado_pago" DEFAULT 'PAGADO' NOT NULL,
	"paid_at" timestamp DEFAULT now(),
	"registered_by_user_id" uuid NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "membresias"."plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"type" "membresias"."tipo_plan" NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"duration_days" integer,
	"n_classes" integer,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "membresias"."attendances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"membership_id" uuid NOT NULL,
	"checked_in_at" timestamp DEFAULT now(),
	"checkin_date" date NOT NULL,
	"method" "membresias"."metodo_checkin" NOT NULL,
	"grupo" varchar(80),
	"device_id" uuid
);
--> statement-breakpoint
CREATE TABLE "membresias"."biometric_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"membership_id" uuid NOT NULL,
	"template" text NOT NULL,
	"format" varchar(40) NOT NULL,
	"consent_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "membresias"."club_schedule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"opens_at" varchar(5),
	"closes_at" varchar(5),
	"grupo" varchar(80),
	"is_active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "membresias"."devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"os" varchar(40),
	"has_reader" boolean DEFAULT false,
	"last_seen_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "membresias"."schedule_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"date" date NOT NULL,
	"is_closed" boolean NOT NULL,
	"note" varchar(200)
);
--> statement-breakpoint
CREATE TABLE "membresias"."audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"actor_user_id" uuid,
	"action" varchar(80) NOT NULL,
	"entity" varchar(80),
	"entity_id" uuid,
	"metadata" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "membresias"."notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"membership_id" uuid,
	"type" "membresias"."tipo_notif" NOT NULL,
	"channel" "membresias"."canal_notif" NOT NULL,
	"scheduled_for" timestamp,
	"sent_at" timestamp,
	"status" "membresias"."estado_notif" DEFAULT 'PENDIENTE' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "membresias"."push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "membresias"."memberships" ADD CONSTRAINT "memberships_current_plan_id_plans_id_fk" FOREIGN KEY ("current_plan_id") REFERENCES "membresias"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membresias"."payments" ADD CONSTRAINT "payments_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "membresias"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membresias"."payments" ADD CONSTRAINT "payments_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "membresias"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membresias"."attendances" ADD CONSTRAINT "attendances_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "membresias"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membresias"."attendances" ADD CONSTRAINT "attendances_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "membresias"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membresias"."biometric_templates" ADD CONSTRAINT "biometric_templates_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "membresias"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membresias"."notifications" ADD CONSTRAINT "notifications_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "membresias"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_membership_org_user" ON "membresias"."memberships" USING btree ("org_id","ecosystem_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_attendance_day" ON "membresias"."attendances" USING btree ("membership_id","checkin_date");