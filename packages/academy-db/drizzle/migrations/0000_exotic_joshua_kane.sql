CREATE SCHEMA IF NOT EXISTS "academy";
--> statement-breakpoint
CREATE TYPE "academy"."estado_intento" AS ENUM('EN_CURSO', 'ENVIADO', 'CALIFICADO');--> statement-breakpoint
CREATE TYPE "academy"."estado_solicitud" AS ENUM('PENDIENTE', 'APROBADA', 'RECHAZADA');--> statement-breakpoint
CREATE TYPE "academy"."rol_academy" AS ENUM('admin', 'teacher', 'student');--> statement-breakpoint
CREATE TYPE "academy"."tipo_contenido" AS ENUM('documento', 'video', 'imagen', 'texto');--> statement-breakpoint
CREATE TYPE "academy"."tipo_pregunta" AS ENUM('opcion_multiple', 'evidencia');--> statement-breakpoint
CREATE TABLE "academy"."grades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"martial_art_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"group_name" varchar(40),
	"order_index" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "academy"."martial_arts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"federation" varchar(160),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "martial_arts_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "academy"."teacher_martial_arts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_user_id" uuid NOT NULL,
	"martial_art_id" uuid NOT NULL,
	"assigned_by_user_id" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "academy"."academy_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ecosystem_user_id" uuid NOT NULL,
	"full_name" varchar(160),
	"email" varchar(160),
	"local_role" "academy"."rol_academy",
	"suspended" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "academy"."enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_user_id" uuid NOT NULL,
	"martial_art_id" uuid NOT NULL,
	"current_grade_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "academy"."grade_advancements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"from_grade_id" uuid,
	"to_grade_id" uuid NOT NULL,
	"from_grade_name" varchar(80),
	"to_grade_name" varchar(80) NOT NULL,
	"approved_by_user_id" uuid NOT NULL,
	"approved_by_name" varchar(160),
	"notes" text,
	"advanced_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "academy"."teacher_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"full_name" varchar(160),
	"martial_art_id" uuid,
	"message" text,
	"status" "academy"."estado_solicitud" DEFAULT 'PENDIENTE' NOT NULL,
	"resolved_by_user_id" uuid,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "academy"."content_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"viewed_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "academy"."contents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"martial_art_id" uuid NOT NULL,
	"grade_id" uuid NOT NULL,
	"title" varchar(160) NOT NULL,
	"description" text,
	"type" "academy"."tipo_contenido" NOT NULL,
	"url" text,
	"body" text,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "academy"."answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"selected_option_id" uuid,
	"evidence_url" text,
	"is_correct" boolean,
	"score" numeric(5, 2),
	"feedback" text,
	"graded_by_user_id" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "academy"."attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evaluation_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" "academy"."estado_intento" DEFAULT 'EN_CURSO' NOT NULL,
	"mc_score" numeric(5, 2),
	"evidence_score" numeric(5, 2),
	"final_score" numeric(5, 2),
	"grade_name_snapshot" varchar(80),
	"started_at" timestamp DEFAULT now(),
	"submitted_at" timestamp,
	"graded_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "academy"."evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"martial_art_id" uuid NOT NULL,
	"grade_id" uuid NOT NULL,
	"title" varchar(160) NOT NULL,
	"description" text,
	"max_attempts" integer DEFAULT 1 NOT NULL,
	"available_from" timestamp,
	"mc_weight" integer DEFAULT 50 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "academy"."question_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"text" text NOT NULL,
	"is_correct" boolean DEFAULT false NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "academy"."questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evaluation_id" uuid NOT NULL,
	"type" "academy"."tipo_pregunta" NOT NULL,
	"prompt" text NOT NULL,
	"points" integer DEFAULT 1 NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "academy"."grades" ADD CONSTRAINT "grades_martial_art_id_martial_arts_id_fk" FOREIGN KEY ("martial_art_id") REFERENCES "academy"."martial_arts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy"."teacher_martial_arts" ADD CONSTRAINT "teacher_martial_arts_martial_art_id_martial_arts_id_fk" FOREIGN KEY ("martial_art_id") REFERENCES "academy"."martial_arts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy"."enrollments" ADD CONSTRAINT "enrollments_martial_art_id_martial_arts_id_fk" FOREIGN KEY ("martial_art_id") REFERENCES "academy"."martial_arts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy"."enrollments" ADD CONSTRAINT "enrollments_current_grade_id_grades_id_fk" FOREIGN KEY ("current_grade_id") REFERENCES "academy"."grades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy"."grade_advancements" ADD CONSTRAINT "grade_advancements_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "academy"."enrollments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy"."teacher_requests" ADD CONSTRAINT "teacher_requests_martial_art_id_martial_arts_id_fk" FOREIGN KEY ("martial_art_id") REFERENCES "academy"."martial_arts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy"."content_views" ADD CONSTRAINT "content_views_content_id_contents_id_fk" FOREIGN KEY ("content_id") REFERENCES "academy"."contents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy"."contents" ADD CONSTRAINT "contents_martial_art_id_martial_arts_id_fk" FOREIGN KEY ("martial_art_id") REFERENCES "academy"."martial_arts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy"."contents" ADD CONSTRAINT "contents_grade_id_grades_id_fk" FOREIGN KEY ("grade_id") REFERENCES "academy"."grades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy"."answers" ADD CONSTRAINT "answers_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "academy"."attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy"."answers" ADD CONSTRAINT "answers_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "academy"."questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy"."answers" ADD CONSTRAINT "answers_selected_option_id_question_options_id_fk" FOREIGN KEY ("selected_option_id") REFERENCES "academy"."question_options"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy"."attempts" ADD CONSTRAINT "attempts_evaluation_id_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "academy"."evaluations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy"."evaluations" ADD CONSTRAINT "evaluations_martial_art_id_martial_arts_id_fk" FOREIGN KEY ("martial_art_id") REFERENCES "academy"."martial_arts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy"."evaluations" ADD CONSTRAINT "evaluations_grade_id_grades_id_fk" FOREIGN KEY ("grade_id") REFERENCES "academy"."grades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy"."question_options" ADD CONSTRAINT "question_options_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "academy"."questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy"."questions" ADD CONSTRAINT "questions_evaluation_id_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "academy"."evaluations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_grade_order" ON "academy"."grades" USING btree ("martial_art_id","order_index");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_grade_name" ON "academy"."grades" USING btree ("martial_art_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_teacher_art" ON "academy"."teacher_martial_arts" USING btree ("teacher_user_id","martial_art_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_academy_user" ON "academy"."academy_users" USING btree ("ecosystem_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_enrollment" ON "academy"."enrollments" USING btree ("student_user_id","martial_art_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_content_view" ON "academy"."content_views" USING btree ("content_id","student_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_answer" ON "academy"."answers" USING btree ("attempt_id","question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_attempt_n" ON "academy"."attempts" USING btree ("evaluation_id","student_user_id","attempt_number");