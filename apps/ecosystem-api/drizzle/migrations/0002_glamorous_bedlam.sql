CREATE TABLE "ecosystem"."org_club_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"club_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'PENDIENTE' NOT NULL,
	"invited_by_user_id" uuid,
	"responded_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "ecosystem"."organizations" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "ecosystem"."organizations" ADD COLUMN "address" varchar(200);--> statement-breakpoint
ALTER TABLE "ecosystem"."organizations" ADD COLUMN "schedule" text;--> statement-breakpoint
ALTER TABLE "ecosystem"."users" ADD COLUMN "failed_login_attempts" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "ecosystem"."users" ADD COLUMN "locked_until" timestamp;--> statement-breakpoint
ALTER TABLE "ecosystem"."org_club_invitations" ADD CONSTRAINT "org_club_invitations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "ecosystem"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecosystem"."org_club_invitations" ADD CONSTRAINT "org_club_invitations_club_id_organizations_id_fk" FOREIGN KEY ("club_id") REFERENCES "ecosystem"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecosystem"."org_club_invitations" ADD CONSTRAINT "org_club_invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "ecosystem"."users"("id") ON DELETE no action ON UPDATE no action;