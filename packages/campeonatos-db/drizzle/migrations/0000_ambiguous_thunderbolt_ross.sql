CREATE SCHEMA "campeonatos";
--> statement-breakpoint
CREATE TYPE "campeonatos"."estado_campeonato" AS ENUM('BORRADOR', 'LISTO', 'EN_CURSO', 'FINALIZADO');--> statement-breakpoint
CREATE TYPE "campeonatos"."estado_inscripcion" AS ENUM('PENDIENTE', 'APROBADA', 'RECHAZADA');--> statement-breakpoint
CREATE TYPE "campeonatos"."estado_pago" AS ENUM('PAGADO', 'PARCIAL', 'PENDIENTE');--> statement-breakpoint
CREATE TYPE "campeonatos"."estado_seccion" AS ENUM('EN_ESPERA', 'EN_CURSO', 'FINALIZADA');--> statement-breakpoint
CREATE TYPE "campeonatos"."estado_tatami" AS ENUM('LIBRE', 'OCUPADO');--> statement-breakpoint
CREATE TYPE "campeonatos"."ganador_combate" AS ENUM('hong', 'chung', 'empate');--> statement-breakpoint
CREATE TYPE "campeonatos"."genero" AS ENUM('MASCULINO', 'FEMENINO');--> statement-breakpoint
CREATE TYPE "campeonatos"."genero_seccion" AS ENUM('MASCULINO', 'FEMENINO', 'MIXTO');--> statement-breakpoint
CREATE TYPE "campeonatos"."grupo_cinturon" AS ENUM('BLANCO', 'PRINCIPIANTE', 'INTERMEDIO', 'AVANZADO', 'NEGRO');--> statement-breakpoint
CREATE TYPE "campeonatos"."modalidad" AS ENUM('figura_manos_libres', 'figura_armas', 'defensa_personal', 'salto_altura', 'salto_longitud', 'combate');--> statement-breakpoint
CREATE TABLE "campeonatos"."campeonatos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"nombre" varchar(200) NOT NULL,
	"descripcion" text,
	"fecha_inicio" date,
	"fecha_fin" date,
	"estado" "campeonatos"."estado_campeonato" DEFAULT 'BORRADOR' NOT NULL,
	"costo_base" numeric(10, 2) DEFAULT '0',
	"created_by_user_id" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "campeonatos"."modalidades_campeonato" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campeonato_id" uuid NOT NULL,
	"modalidad" "campeonatos"."modalidad" NOT NULL,
	"costo_extra" numeric(10, 2) DEFAULT '0',
	"activa" boolean DEFAULT true,
	"categorias" jsonb
);
--> statement-breakpoint
CREATE TABLE "campeonatos"."tatamis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campeonato_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"estado" "campeonatos"."estado_tatami" DEFAULT 'LIBRE' NOT NULL,
	"activo" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "campeonatos"."competidores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ecosystem_user_id" uuid,
	"documento" varchar(30) NOT NULL,
	"nombre_completo" varchar(200) NOT NULL,
	"fecha_nacimiento" date,
	"correo" varchar(200),
	"celular" varchar(30),
	"genero" "campeonatos"."genero",
	"peso_actual" numeric(5, 2),
	"cinturon" varchar(50),
	"grupo_cinturon" "campeonatos"."grupo_cinturon",
	"academia_club" varchar(200),
	"categoria_especial" boolean DEFAULT false,
	"categoria_especial_justificacion" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "campeonatos"."inscripcion_modalidades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inscripcion_id" uuid NOT NULL,
	"modalidad" "campeonatos"."modalidad" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campeonatos"."inscripciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campeonato_id" uuid NOT NULL,
	"competidor_id" uuid NOT NULL,
	"peso_inscripcion" numeric(5, 2),
	"grupo_cinturon_inscripcion" "campeonatos"."grupo_cinturon",
	"cinturon_inscripcion" varchar(50),
	"estado" "campeonatos"."estado_inscripcion" DEFAULT 'PENDIENTE' NOT NULL,
	"monto_total" numeric(10, 2) DEFAULT '0',
	"monto_abonado" numeric(10, 2) DEFAULT '0',
	"estado_pago" "campeonatos"."estado_pago" DEFAULT 'PENDIENTE' NOT NULL,
	"observaciones_pago" text,
	"representante_legal_nombre" varchar(200),
	"representante_legal_acepta" boolean DEFAULT false,
	"inscrito_por_user_id" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "campeonatos"."cola_tatami" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tatami_id" uuid NOT NULL,
	"seccion_id" uuid NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"estado" "campeonatos"."estado_seccion" DEFAULT 'EN_ESPERA' NOT NULL,
	"inicio" timestamp,
	"fin" timestamp
);
--> statement-breakpoint
CREATE TABLE "campeonatos"."seccion_inscripciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seccion_id" uuid NOT NULL,
	"inscripcion_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campeonatos"."secciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campeonato_id" uuid NOT NULL,
	"modalidad" "campeonatos"."modalidad" NOT NULL,
	"genero" "campeonatos"."genero_seccion",
	"cinturon" varchar(100),
	"cinturon_grupos" jsonb,
	"rango_edad" varchar(30),
	"rango_peso" varchar(30),
	"clave" varchar(300),
	"nombre" varchar(200) NOT NULL,
	"estado" "campeonatos"."estado_seccion" DEFAULT 'EN_ESPERA' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "campeonatos"."combates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seccion_id" uuid,
	"competidor_hong_id" uuid,
	"competidor_chung_id" uuid,
	"marcador_hong" numeric(6, 2) DEFAULT '0',
	"marcador_chung" numeric(6, 2) DEFAULT '0',
	"esq_hong" numeric(6, 2) DEFAULT '0',
	"esq_chung" numeric(6, 2) DEFAULT '0',
	"central_hong" numeric(6, 2) DEFAULT '0',
	"central_chung" numeric(6, 2) DEFAULT '0',
	"kyong_hong" integer DEFAULT 0,
	"kyong_chung" integer DEFAULT 0,
	"faltas_hong" integer DEFAULT 0,
	"faltas_chung" integer DEFAULT 0,
	"num_jueces" integer DEFAULT 4,
	"duracion_segundos" integer DEFAULT 120,
	"ronda" varchar(30),
	"ganador" "campeonatos"."ganador_combate",
	"detalle" jsonb,
	"inicio" timestamp,
	"fin" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "campeonatos"."eventos_combate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"combate_id" uuid NOT NULL,
	"ev_id" varchar(100),
	"accion" varchar(50) NOT NULL,
	"datos" jsonb,
	"secuencia" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "campeonatos"."llaves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seccion_id" uuid NOT NULL,
	"estructura" jsonb NOT NULL,
	"estado" "campeonatos"."estado_seccion" DEFAULT 'EN_ESPERA' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "campeonatos"."resultados_figura" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seccion_id" uuid NOT NULL,
	"inscripcion_id" uuid NOT NULL,
	"j1" numeric(6, 2),
	"j2" numeric(6, 2),
	"j3" numeric(6, 2),
	"j4" numeric(6, 2),
	"total" numeric(7, 2),
	"posicion" integer,
	"distancia_alcanzada" numeric(6, 2),
	"detalle" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "campeonatos"."auditoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campeonato_id" uuid,
	"entidad" varchar(50) NOT NULL,
	"entidad_id" varchar(64),
	"accion" varchar(50) NOT NULL,
	"user_id" uuid,
	"datos" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "campeonatos"."movimientos_categoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inscripcion_id" uuid NOT NULL,
	"seccion_origen_id" uuid,
	"seccion_destino_id" uuid,
	"motivo" text NOT NULL,
	"movido_por_user_id" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "campeonatos"."modalidades_campeonato" ADD CONSTRAINT "modalidades_campeonato_campeonato_id_campeonatos_id_fk" FOREIGN KEY ("campeonato_id") REFERENCES "campeonatos"."campeonatos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campeonatos"."tatamis" ADD CONSTRAINT "tatamis_campeonato_id_campeonatos_id_fk" FOREIGN KEY ("campeonato_id") REFERENCES "campeonatos"."campeonatos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campeonatos"."inscripcion_modalidades" ADD CONSTRAINT "inscripcion_modalidades_inscripcion_id_inscripciones_id_fk" FOREIGN KEY ("inscripcion_id") REFERENCES "campeonatos"."inscripciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campeonatos"."inscripciones" ADD CONSTRAINT "inscripciones_campeonato_id_campeonatos_id_fk" FOREIGN KEY ("campeonato_id") REFERENCES "campeonatos"."campeonatos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campeonatos"."inscripciones" ADD CONSTRAINT "inscripciones_competidor_id_competidores_id_fk" FOREIGN KEY ("competidor_id") REFERENCES "campeonatos"."competidores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campeonatos"."cola_tatami" ADD CONSTRAINT "cola_tatami_tatami_id_tatamis_id_fk" FOREIGN KEY ("tatami_id") REFERENCES "campeonatos"."tatamis"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campeonatos"."cola_tatami" ADD CONSTRAINT "cola_tatami_seccion_id_secciones_id_fk" FOREIGN KEY ("seccion_id") REFERENCES "campeonatos"."secciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campeonatos"."seccion_inscripciones" ADD CONSTRAINT "seccion_inscripciones_seccion_id_secciones_id_fk" FOREIGN KEY ("seccion_id") REFERENCES "campeonatos"."secciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campeonatos"."seccion_inscripciones" ADD CONSTRAINT "seccion_inscripciones_inscripcion_id_inscripciones_id_fk" FOREIGN KEY ("inscripcion_id") REFERENCES "campeonatos"."inscripciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campeonatos"."secciones" ADD CONSTRAINT "secciones_campeonato_id_campeonatos_id_fk" FOREIGN KEY ("campeonato_id") REFERENCES "campeonatos"."campeonatos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campeonatos"."combates" ADD CONSTRAINT "combates_seccion_id_secciones_id_fk" FOREIGN KEY ("seccion_id") REFERENCES "campeonatos"."secciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campeonatos"."combates" ADD CONSTRAINT "combates_competidor_hong_id_competidores_id_fk" FOREIGN KEY ("competidor_hong_id") REFERENCES "campeonatos"."competidores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campeonatos"."combates" ADD CONSTRAINT "combates_competidor_chung_id_competidores_id_fk" FOREIGN KEY ("competidor_chung_id") REFERENCES "campeonatos"."competidores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campeonatos"."eventos_combate" ADD CONSTRAINT "eventos_combate_combate_id_combates_id_fk" FOREIGN KEY ("combate_id") REFERENCES "campeonatos"."combates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campeonatos"."llaves" ADD CONSTRAINT "llaves_seccion_id_secciones_id_fk" FOREIGN KEY ("seccion_id") REFERENCES "campeonatos"."secciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campeonatos"."resultados_figura" ADD CONSTRAINT "resultados_figura_seccion_id_secciones_id_fk" FOREIGN KEY ("seccion_id") REFERENCES "campeonatos"."secciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campeonatos"."resultados_figura" ADD CONSTRAINT "resultados_figura_inscripcion_id_inscripciones_id_fk" FOREIGN KEY ("inscripcion_id") REFERENCES "campeonatos"."inscripciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campeonatos"."auditoria" ADD CONSTRAINT "auditoria_campeonato_id_campeonatos_id_fk" FOREIGN KEY ("campeonato_id") REFERENCES "campeonatos"."campeonatos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campeonatos"."movimientos_categoria" ADD CONSTRAINT "movimientos_categoria_inscripcion_id_inscripciones_id_fk" FOREIGN KEY ("inscripcion_id") REFERENCES "campeonatos"."inscripciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campeonatos"."movimientos_categoria" ADD CONSTRAINT "movimientos_categoria_seccion_origen_id_secciones_id_fk" FOREIGN KEY ("seccion_origen_id") REFERENCES "campeonatos"."secciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campeonatos"."movimientos_categoria" ADD CONSTRAINT "movimientos_categoria_seccion_destino_id_secciones_id_fk" FOREIGN KEY ("seccion_destino_id") REFERENCES "campeonatos"."secciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_modalidad_campeonato" ON "campeonatos"."modalidades_campeonato" USING btree ("campeonato_id","modalidad");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_tatami_campeonato_numero" ON "campeonatos"."tatamis" USING btree ("campeonato_id","numero");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_competidor_documento" ON "campeonatos"."competidores" USING btree ("documento");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_competidor_ecosystem_user" ON "campeonatos"."competidores" USING btree ("ecosystem_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_inscripcion_modalidad" ON "campeonatos"."inscripcion_modalidades" USING btree ("inscripcion_id","modalidad");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_inscripcion_campeonato_competidor" ON "campeonatos"."inscripciones" USING btree ("campeonato_id","competidor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_seccion_inscripcion" ON "campeonatos"."seccion_inscripciones" USING btree ("seccion_id","inscripcion_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_evento_ev_id" ON "campeonatos"."eventos_combate" USING btree ("ev_id");