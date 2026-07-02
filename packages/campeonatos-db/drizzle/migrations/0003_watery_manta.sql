CREATE TYPE "campeonatos"."estado_invitacion" AS ENUM('PENDIENTE', 'ACEPTADA', 'RECHAZADA');--> statement-breakpoint
CREATE TABLE "campeonatos"."invitaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campeonato_id" uuid NOT NULL,
	"email" varchar(200) NOT NULL,
	"estado" "campeonatos"."estado_invitacion" DEFAULT 'PENDIENTE' NOT NULL,
	"invitado_por_user_id" uuid,
	"inscripcion_id" uuid,
	"modalidades" jsonb,
	"created_at" timestamp DEFAULT now(),
	"respondida_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "campeonatos"."invitaciones" ADD CONSTRAINT "invitaciones_campeonato_id_campeonatos_id_fk" FOREIGN KEY ("campeonato_id") REFERENCES "campeonatos"."campeonatos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campeonatos"."invitaciones" ADD CONSTRAINT "invitaciones_inscripcion_id_inscripciones_id_fk" FOREIGN KEY ("inscripcion_id") REFERENCES "campeonatos"."inscripciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_invitacion_campeonato_email" ON "campeonatos"."invitaciones" USING btree ("campeonato_id","email");