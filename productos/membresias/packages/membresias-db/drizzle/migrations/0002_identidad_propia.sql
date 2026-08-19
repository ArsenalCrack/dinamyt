-- Identidad propia de DINAMYT Membresías.
--
-- Hasta aquí las personas vivían en el ecosistema DINAMYT y esta base solo
-- guardaba el estado del alumno en el club. Esta migración trae los clubes y
-- los usuarios a casa: la app pasa a funcionar sin ningún servicio externo.
--
-- Escrita a mano, no generada: `memberships.ecosystem_user_id` se RENOMBRA a
-- `user_id`. drizzle-kit lo habría resuelto como DROP + ADD, que vacía la
-- columna y desconecta a cada alumno de su historial de pagos y asistencias.

-- ── Clubes ───────────────────────────────────────────────────────────────────
CREATE TABLE "membresias"."orgs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"slug" varchar(60) NOT NULL,
	"city" varchar(80),
	"country" varchar(80),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "orgs_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint

-- ── Usuarios ─────────────────────────────────────────────────────────────────
CREATE TYPE "membresias"."rol_usuario" AS ENUM('owner', 'staff', 'guardian', 'student');--> statement-breakpoint

CREATE TABLE "membresias"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"full_name" varchar(150) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"phone" varchar(40),
	"avatar_url" text,
	"role" "membresias"."rol_usuario" DEFAULT 'student' NOT NULL,
	"is_super_admin" boolean DEFAULT false NOT NULL,
	"org_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint

ALTER TABLE "membresias"."users" ADD CONSTRAINT "users_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "membresias"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_users_org" ON "membresias"."users" USING btree ("org_id");--> statement-breakpoint

-- ── El alumno ya no vive fuera: la columna deja de hablar del ecosistema ─────
-- Sin FK contra `users`: una base que ya venía funcionando puede tener aquí
-- UUIDs del ecosistema, y la restricción rechazaría la migración entera.
ALTER TABLE "membresias"."memberships" RENAME COLUMN "ecosystem_user_id" TO "user_id";--> statement-breakpoint

-- ── Fuera la biometría ───────────────────────────────────────────────────────
-- El lector de huella se retiró del producto: el check-in va por carnet QR,
-- PIN o marcado manual.
DROP TABLE IF EXISTS "membresias"."biometric_templates" CASCADE;
