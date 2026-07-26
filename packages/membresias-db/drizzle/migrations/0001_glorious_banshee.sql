ALTER TABLE "membresias"."memberships" ADD COLUMN "checkin_pin" varchar(12);--> statement-breakpoint
ALTER TABLE "membresias"."memberships" ADD COLUMN "mora_checkins" integer DEFAULT 0;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_membership_pin" ON "membresias"."memberships" USING btree ("org_id","checkin_pin");