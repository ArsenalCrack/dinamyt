CREATE TABLE "ecosystem"."user_disciplines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"discipline" varchar(80) NOT NULL,
	"current_grade" varchar(50),
	"since" date,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ecosystem"."user_guardians" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"minor_user_id" uuid NOT NULL,
	"guardian_user_id" uuid NOT NULL,
	"relationship" varchar(50),
	"consent_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "ecosystem"."users" ADD COLUMN "emergency_contact_name" varchar(200);--> statement-breakpoint
ALTER TABLE "ecosystem"."users" ADD COLUMN "emergency_contact_phone" varchar(30);--> statement-breakpoint
ALTER TABLE "ecosystem"."users" ADD COLUMN "emergency_contact_relationship" varchar(50);--> statement-breakpoint
ALTER TABLE "ecosystem"."users" ADD COLUMN "medical_notes" text;--> statement-breakpoint
ALTER TABLE "ecosystem"."user_disciplines" ADD CONSTRAINT "user_disciplines_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "ecosystem"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecosystem"."user_guardians" ADD CONSTRAINT "user_guardians_minor_user_id_users_id_fk" FOREIGN KEY ("minor_user_id") REFERENCES "ecosystem"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecosystem"."user_guardians" ADD CONSTRAINT "user_guardians_guardian_user_id_users_id_fk" FOREIGN KEY ("guardian_user_id") REFERENCES "ecosystem"."users"("id") ON DELETE no action ON UPDATE no action;