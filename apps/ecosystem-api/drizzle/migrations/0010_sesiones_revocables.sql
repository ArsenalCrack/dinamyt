-- ── Sesiones revocables y zona horaria ─────────────────────────────────────
--
-- Hasta aquí la sesión era ÚNICAMENTE el JWT: nadie llevaba la cuenta de
-- quién estaba dentro, así que «cerrar sesión» solo borraba la copia del
-- navegador y el token seguía abriendo puertas hasta caducar solo. Esta tabla
-- es el registro que faltaba: mientras la fila viva y no esté revocada, la
-- sesión existe; en cuanto se revoca, el token deja de valer aunque su firma
-- sea perfecta y su `exp` esté en el futuro.

CREATE TABLE "ecosystem"."sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	-- Lo que se ve desde fuera: qué navegador y desde dónde. No es estadística,
	-- es lo que permite a alguien reconocer «ese es el computador prestado» en
	-- la lista de dispositivos conectados de su perfil.
	"user_agent" text,
	"ip" varchar(60),
	"created_at" timestamp DEFAULT now() NOT NULL,
	-- La última señal de vida. De esto —y no del `exp` del token— depende el
	-- cierre por inactividad.
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	-- El techo absoluto: pase lo que pase, la sesión muere aquí. Sin este
	-- campo, alguien que toca la pantalla cada quince minutos no vuelve a
	-- escribir su contraseña nunca.
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	-- Por qué se cerró: `salir`, `salir-todas`, `cambio-contrasena`,
	-- `recuperacion`, `inactividad`, `caducada`, `admin`. Se guarda para poder
	-- DECIRLO —«tu sesión se cerró porque cambiaste la contraseña»— en vez de
	-- devolver a alguien al login sin explicación.
	"revoked_reason" varchar(30)
);
--> statement-breakpoint
ALTER TABLE "ecosystem"."sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "ecosystem"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- La lista de dispositivos de una persona, y la limpieza de lo caducado.
CREATE INDEX "ix_sessions_user" ON "ecosystem"."sessions" USING btree ("user_id","last_seen_at");
--> statement-breakpoint
CREATE INDEX "ix_sessions_expires" ON "ecosystem"."sessions" USING btree ("expires_at");
--> statement-breakpoint

-- ── Zona horaria ───────────────────────────────────────────────────────────
--
-- Dos zonas distintas y a propósito:
--
--   · `users.timezone` es dónde está la PERSONA. Con ella se le escribe la
--     hora de lo que pasó: cuándo entró, cuándo se registró un pago, a qué
--     hora se envió un aviso. La detecta el navegador al entrar y se puede
--     cambiar en el perfil.
--
--   · `organizations.timezone` es dónde está el CLUB. Con ella se leen los
--     horarios de entrenamiento y se cuenta la asistencia. «La clase es a las
--     7 pm» es hora del club: convertirla a la zona de quien lee el horario
--     desde otro país sería exactamente el error contrario.
--
-- Ninguna de las dos se aplica a una FECHA CIVIL (un vencimiento, un
-- cumpleaños). El 31 es el 31 en todo el planeta; esas se guardan y se pintan
-- sin convertir nada.
ALTER TABLE "ecosystem"."users" ADD COLUMN "timezone" varchar(64);--> statement-breakpoint
ALTER TABLE "ecosystem"."users" ADD COLUMN "locale" varchar(10);--> statement-breakpoint
-- ¿La eligió la persona a mano?
--
-- La zona se detecta sola al entrar y se actualiza en cada renovación, que es
-- lo que hace que a quien viaja le lleguen los correos en su hora sin tener
-- que tocar nada. Pero eso mismo pisaría la elección de quien entró al perfil
-- y puso la suya a propósito —«escríbeme siempre en hora de Colombia aunque
-- esté fuera»—, y una preferencia que se borra sola no es una preferencia.
-- Con esta bandera, la detección automática solo escribe cuando nadie ha
-- dicho nada.
ALTER TABLE "ecosystem"."users" ADD COLUMN "timezone_manual" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "ecosystem"."organizations" ADD COLUMN "timezone" varchar(64) DEFAULT 'America/Bogota';
