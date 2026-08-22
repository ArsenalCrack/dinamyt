CREATE TABLE "ecosystem"."org_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"email" varchar(200) NOT NULL,
	"user_id" uuid,
	"role" varchar(50) DEFAULT 'member' NOT NULL,
	"role_membresias" varchar(50),
	"role_campeonatos" varchar(50),
	"role_academy" varchar(50),
	"status" varchar(20) DEFAULT 'PENDIENTE' NOT NULL,
	"note" varchar(300),
	"invited_by_user_id" uuid,
	"responded_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "ecosystem"."org_invitations" ADD CONSTRAINT "org_invitations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "ecosystem"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecosystem"."org_invitations" ADD CONSTRAINT "org_invitations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "ecosystem"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecosystem"."org_invitations" ADD CONSTRAINT "org_invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "ecosystem"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ux_org_invitations_pendiente" ON "ecosystem"."org_invitations" USING btree ("org_id","email") WHERE "ecosystem"."org_invitations"."status" = 'PENDIENTE';