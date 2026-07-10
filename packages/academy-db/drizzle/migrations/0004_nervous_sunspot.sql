CREATE TABLE "academy"."question_bank" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_user_id" uuid NOT NULL,
	"martial_art_id" uuid NOT NULL,
	"type" "academy"."tipo_pregunta" NOT NULL,
	"prompt" text NOT NULL,
	"points" integer DEFAULT 1 NOT NULL,
	"opciones" jsonb,
	"criterios" jsonb,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "academy"."question_criteria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"label" varchar(160) NOT NULL,
	"max_points" integer DEFAULT 1 NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "academy"."answers" ADD COLUMN "criteria_scores" jsonb;--> statement-breakpoint
ALTER TABLE "academy"."question_bank" ADD CONSTRAINT "question_bank_martial_art_id_martial_arts_id_fk" FOREIGN KEY ("martial_art_id") REFERENCES "academy"."martial_arts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy"."question_criteria" ADD CONSTRAINT "question_criteria_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "academy"."questions"("id") ON DELETE no action ON UPDATE no action;