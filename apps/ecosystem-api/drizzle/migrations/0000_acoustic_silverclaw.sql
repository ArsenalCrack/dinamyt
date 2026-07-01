CREATE SCHEMA IF NOT EXISTS "ecosystem";
--> statement-breakpoint
CREATE TYPE "ecosystem"."org_type" AS ENUM('FEDERATION', 'LEAGUE', 'CLUB', 'ACADEMY');--> statement-breakpoint
CREATE TYPE "ecosystem"."payment_status" AS ENUM('PAID', 'PARTIAL', 'PENDING');--> statement-breakpoint
CREATE TYPE "ecosystem"."subscription_status" AS ENUM('ACTIVE', 'EXPIRED', 'SUSPENDED', 'PENDING_REVIEW');--> statement-breakpoint
CREATE TABLE "ecosystem"."audit_auth" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"event" varchar(50) NOT NULL,
	"ip_address" varchar(45),
	"user_agent" text,
	"metadata" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ecosystem"."org_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(50) DEFAULT 'member' NOT NULL,
	"joined_at" timestamp DEFAULT now(),
	"invited_by_user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "ecosystem"."organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"type" "ecosystem"."org_type" NOT NULL,
	"parent_id" uuid,
	"email" varchar(200),
	"phone" varchar(30),
	"city" varchar(100),
	"country" varchar(100) DEFAULT 'Colombia',
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ecosystem"."otp_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code" varchar(6) NOT NULL,
	"type" varchar(30) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ecosystem"."subscription_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"apps_included" text[] NOT NULL,
	"max_users" integer,
	"price_monthly" numeric(10, 2),
	"price_annual" numeric(10, 2),
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ecosystem"."subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" "ecosystem"."subscription_status" DEFAULT 'PENDING_REVIEW',
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp NOT NULL,
	"total_amount" numeric(10, 2),
	"paid_amount" numeric(10, 2) DEFAULT '0',
	"payment_status" "ecosystem"."payment_status" DEFAULT 'PENDING',
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ecosystem"."user_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" "ecosystem"."subscription_status" DEFAULT 'ACTIVE',
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ecosystem"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(200) NOT NULL,
	"document_id" varchar(30) NOT NULL,
	"full_name" varchar(200) NOT NULL,
	"phone" varchar(30),
	"birth_date" timestamp,
	"avatar_url" text,
	"password_hash" text NOT NULL,
	"is_email_verified" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"is_super_admin" boolean DEFAULT false,
	"data_consent_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_document_id_unique" UNIQUE("document_id")
);
--> statement-breakpoint
ALTER TABLE "ecosystem"."audit_auth" ADD CONSTRAINT "audit_auth_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "ecosystem"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecosystem"."org_members" ADD CONSTRAINT "org_members_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "ecosystem"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecosystem"."org_members" ADD CONSTRAINT "org_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "ecosystem"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecosystem"."org_members" ADD CONSTRAINT "org_members_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "ecosystem"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecosystem"."otp_codes" ADD CONSTRAINT "otp_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "ecosystem"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecosystem"."subscriptions" ADD CONSTRAINT "subscriptions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "ecosystem"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecosystem"."subscriptions" ADD CONSTRAINT "subscriptions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "ecosystem"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecosystem"."user_subscriptions" ADD CONSTRAINT "user_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "ecosystem"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecosystem"."user_subscriptions" ADD CONSTRAINT "user_subscriptions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "ecosystem"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;