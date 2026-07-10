CREATE TABLE "academy"."activity_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(40) NOT NULL,
	"detail" text,
	"martial_art_id" uuid,
	"ref_id" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "ix_activity_user" ON "academy"."activity_log" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ix_activity_type" ON "academy"."activity_log" USING btree ("type","created_at");