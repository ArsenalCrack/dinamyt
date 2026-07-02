CREATE TYPE "campeonatos"."rol_tatami" AS ENUM('arbitro', 'j1', 'j2', 'j3', 'j4', 'j5', 'j6', 'j7');--> statement-breakpoint
CREATE TABLE "campeonatos"."jueces_tatami" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tatami_id" uuid NOT NULL,
	"rol_tatami" "campeonatos"."rol_tatami" NOT NULL,
	"nombre_display" varchar(150) NOT NULL,
	"user_email" varchar(200),
	"asignado_por_user_id" uuid,
	"asignado_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "campeonatos"."jueces_tatami" ADD CONSTRAINT "jueces_tatami_tatami_id_tatamis_id_fk" FOREIGN KEY ("tatami_id") REFERENCES "campeonatos"."tatamis"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_juez_tatami_rol" ON "campeonatos"."jueces_tatami" USING btree ("tatami_id","rol_tatami");