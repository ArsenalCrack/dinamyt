CREATE TYPE "academy"."estado_figura" AS ENUM('PROCESANDO', 'COMPLETADO', 'ERROR');--> statement-breakpoint
CREATE TYPE "academy"."tipo_evaluacion" AS ENUM('cuestionario', 'tarea', 'actividad');--> statement-breakpoint
CREATE TABLE "academy"."announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"martial_art_id" uuid NOT NULL,
	"grade_id" uuid,
	"title" varchar(160) NOT NULL,
	"body" text,
	"created_by_user_id" uuid NOT NULL,
	"created_by_name" varchar(160),
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "academy"."notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(40) NOT NULL,
	"title" varchar(160) NOT NULL,
	"body" text,
	"link" varchar(240),
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "academy"."figure_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference_figure_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"video_path" varchar(300) NOT NULL,
	"status" "academy"."estado_figura" DEFAULT 'PROCESANDO' NOT NULL,
	"score" numeric(5, 2),
	"result_json" jsonb,
	"report_img_path" varchar(300),
	"annotated_video_path" varchar(300),
	"error_msg" text,
	"grade_name_snapshot" varchar(80),
	"created_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "academy"."reference_figures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"martial_art_id" uuid NOT NULL,
	"grade_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text,
	"video_path" varchar(300) NOT NULL,
	"angles_path" varchar(300),
	"detection_rate" numeric(5, 1),
	"uploaded_by_user_id" uuid NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "academy"."evaluations" ADD COLUMN "kind" "academy"."tipo_evaluacion" DEFAULT 'cuestionario' NOT NULL;--> statement-breakpoint
ALTER TABLE "academy"."evaluations" ADD COLUMN "due_at" timestamp;--> statement-breakpoint
ALTER TABLE "academy"."announcements" ADD CONSTRAINT "announcements_martial_art_id_martial_arts_id_fk" FOREIGN KEY ("martial_art_id") REFERENCES "academy"."martial_arts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy"."announcements" ADD CONSTRAINT "announcements_grade_id_grades_id_fk" FOREIGN KEY ("grade_id") REFERENCES "academy"."grades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy"."figure_attempts" ADD CONSTRAINT "figure_attempts_reference_figure_id_reference_figures_id_fk" FOREIGN KEY ("reference_figure_id") REFERENCES "academy"."reference_figures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy"."reference_figures" ADD CONSTRAINT "reference_figures_martial_art_id_martial_arts_id_fk" FOREIGN KEY ("martial_art_id") REFERENCES "academy"."martial_arts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy"."reference_figures" ADD CONSTRAINT "reference_figures_grade_id_grades_id_fk" FOREIGN KEY ("grade_id") REFERENCES "academy"."grades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_notif_user" ON "academy"."notifications" USING btree ("user_id","read_at");