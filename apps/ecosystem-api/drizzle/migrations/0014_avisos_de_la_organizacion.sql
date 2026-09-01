-- ── La campana de quien lleva un club ────────────────────────────────────────
--
-- ── Qué problema resuelve ──
--
-- Un club funciona por cosas que pasan cuando su maestro no está mirando:
-- alguien teclea el código del club y se queda esperando, alguien acepta la
-- invitación y entra, alguien se va. Nada de eso se contaba en el portal.
--
-- La bandeja de solicitudes existía —`org_join_requests`, y su pantalla—, pero
-- **había que acordarse de abrirla**. Una bandeja que no avisa es una bandeja
-- que se llena: la persona que pidió entrar leía «te avisamos cuando tu maestro
-- responda» y esperaba días a que a alguien se le ocurriera entrar a mirar. El
-- correo al maestro tampoco existía, así que el único camino era la casualidad.
--
-- ── Por qué una fila por PERSONA y no una por evento ──
--
-- Porque leer es de cada quien. Un club puede tener maestro y dos
-- administradores, y «ya lo vi» de uno no puede borrarle el aviso a los otros.
-- Son dos o tres filas por evento, en clubes con decenas de eventos al mes: la
-- tabla no crece a nada.
--
-- ── `resolved_at`, que es lo que la separa de un registro de sucesos ──
--
-- Aquí dentro hay dos clases de aviso, y la diferencia es la que hace que la
-- campana sirva:
--
--   · Los que **son una tarea**: «alguien quiere entrar». Ése deja de existir
--     en cuanto se responde la solicitud, la haya respondido quien la haya
--     respondido. Sin esto, el maestro que acepta a diez personas se queda con
--     diez avisos rojos pidiéndole algo que ya hizo — y a la tercera vez deja
--     de mirar la campana, que es como se muere una.
--   · Los que **son una noticia**: «entró alguien nuevo», «se fue alguien».
--     Ésos no se resuelven porque no piden nada: se leen y quedan como historia
--     de lo que ha pasado en el club.
--
-- `entity_id` es lo que permite resolver sin buscar: apunta a la fila que
-- motivó el aviso (la solicitud, la invitación).
--
-- ── Por qué `kind` es texto y no un enum ──
--
-- Porque añadir una clase de aviso no puede costar una migración y un
-- despliegue coordinado. El catálogo vive en `common/avisos-org.ts`, que es
-- donde además está escrito qué frase y qué enlace le corresponde a cada uno.

CREATE TABLE IF NOT EXISTS "ecosystem"."org_notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "ecosystem"."organizations"("id"),
  -- A quién le llega. Un aviso por cada persona que gestiona el club.
  "user_id" uuid NOT NULL REFERENCES "ecosystem"."users"("id"),
  "kind" varchar(40) NOT NULL,
  -- La fila que lo motivó: con ella se resuelve cuando se responde.
  "entity_id" uuid,
  -- De quién habla: quien pidió entrar, quien se fue.
  "subject_user_id" uuid REFERENCES "ecosystem"."users"("id"),
  -- Quién lo provocó. A él no se le avisa de lo que acaba de hacer.
  "actor_user_id" uuid REFERENCES "ecosystem"."users"("id"),
  -- El nombre, el correo y el rol, copiados. Un aviso cuenta lo que pasó
  -- ENTONCES: si luego cambia el nombre, el aviso viejo sigue diciendo el que
  -- decía.
  "data" jsonb,
  "read_at" timestamptz,
  "resolved_at" timestamptz,
  "created_at" timestamptz DEFAULT now()
);
--> statement-breakpoint

-- La campana pregunta siempre lo mismo: «lo mío, lo último primero». Sin
-- índice, cada apertura del portal recorre la tabla entera.
CREATE INDEX IF NOT EXISTS "ix_org_notifications_destinatario"
  ON "ecosystem"."org_notifications" ("user_id", "created_at");
--> statement-breakpoint

-- Y resolver pregunta por la fila que se acaba de responder.
CREATE INDEX IF NOT EXISTS "ix_org_notifications_entidad"
  ON "ecosystem"."org_notifications" ("entity_id");
