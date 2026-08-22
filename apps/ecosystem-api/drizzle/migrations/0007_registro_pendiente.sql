CREATE TABLE "ecosystem"."pending_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(200) NOT NULL,
	"document_id" varchar(30),
	"full_name" varchar(200) NOT NULL,
	"phone" varchar(30),
	"birth_date" timestamp,
	"gender" varchar(20),
	"password_hash" text NOT NULL,
	"code" varchar(6) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"sends" integer DEFAULT 1 NOT NULL,
	"last_sent_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "pending_registrations_email_unique" UNIQUE("email"),
	CONSTRAINT "pending_registrations_document_id_unique" UNIQUE("document_id")
);
