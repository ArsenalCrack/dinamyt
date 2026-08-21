CREATE TABLE "ecosystem"."org_join_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'PENDIENTE' NOT NULL,
	"note" varchar(300),
	"responded_at" timestamp,
	"responded_by_user_id" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "ecosystem"."organizations" ADD COLUMN "delegation" varchar(120);--> statement-breakpoint
ALTER TABLE "ecosystem"."organizations" ADD COLUMN "delegation_country" varchar(100);--> statement-breakpoint
ALTER TABLE "ecosystem"."organizations" ADD COLUMN "is_public" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "ecosystem"."organizations" ADD COLUMN "join_code" varchar(12);--> statement-breakpoint
ALTER TABLE "ecosystem"."org_join_requests" ADD CONSTRAINT "org_join_requests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "ecosystem"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecosystem"."org_join_requests" ADD CONSTRAINT "org_join_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "ecosystem"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecosystem"."org_join_requests" ADD CONSTRAINT "org_join_requests_responded_by_user_id_users_id_fk" FOREIGN KEY ("responded_by_user_id") REFERENCES "ecosystem"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ux_org_join_requests_pendiente" ON "ecosystem"."org_join_requests" USING btree ("org_id","user_id") WHERE "ecosystem"."org_join_requests"."status" = 'PENDIENTE';--> statement-breakpoint
ALTER TABLE "ecosystem"."organizations" ADD CONSTRAINT "organizations_join_code_unique" UNIQUE("join_code");