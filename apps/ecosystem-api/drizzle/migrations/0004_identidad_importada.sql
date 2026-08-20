ALTER TABLE "ecosystem"."users" ALTER COLUMN "document_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ecosystem"."users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ecosystem"."org_members" ADD COLUMN "role_membresias" varchar(50);--> statement-breakpoint
ALTER TABLE "ecosystem"."org_members" ADD COLUMN "role_campeonatos" varchar(50);--> statement-breakpoint
ALTER TABLE "ecosystem"."org_members" ADD COLUMN "role_academy" varchar(50);--> statement-breakpoint
ALTER TABLE "ecosystem"."organizations" ADD COLUMN "slug" varchar(60);--> statement-breakpoint
ALTER TABLE "ecosystem"."users" ADD COLUMN "origen" varchar(30) DEFAULT 'registro' NOT NULL;--> statement-breakpoint
ALTER TABLE "ecosystem"."users" ADD COLUMN "password_origen" varchar(30);--> statement-breakpoint
ALTER TABLE "ecosystem"."organizations" ADD CONSTRAINT "organizations_slug_unique" UNIQUE("slug");