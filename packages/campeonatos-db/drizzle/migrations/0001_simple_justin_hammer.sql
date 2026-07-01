ALTER TABLE "campeonatos"."campeonatos" ADD COLUMN "ubicacion" varchar(200);--> statement-breakpoint
ALTER TABLE "campeonatos"."campeonatos" ADD COLUMN "pais" varchar(100);--> statement-breakpoint
ALTER TABLE "campeonatos"."campeonatos" ADD COLUMN "ciudad" varchar(100);--> statement-breakpoint
ALTER TABLE "campeonatos"."campeonatos" ADD COLUMN "alcance" varchar(30);--> statement-breakpoint
ALTER TABLE "campeonatos"."campeonatos" ADD COLUMN "num_tatamis" integer DEFAULT 1;--> statement-breakpoint
ALTER TABLE "campeonatos"."campeonatos" ADD COLUMN "max_participantes" integer;--> statement-breakpoint
ALTER TABLE "campeonatos"."campeonatos" ADD COLUMN "es_publico" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "campeonatos"."campeonatos" ADD COLUMN "codigo" varchar(20);