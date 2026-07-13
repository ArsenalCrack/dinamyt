ALTER TABLE "ecosystem"."organizations" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "ecosystem"."organizations" ADD COLUMN "social_links" jsonb;--> statement-breakpoint
ALTER TABLE "ecosystem"."users" ADD COLUMN "blood_type" varchar(5);