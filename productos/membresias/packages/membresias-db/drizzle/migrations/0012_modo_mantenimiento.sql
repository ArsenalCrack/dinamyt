-- Interruptores globales de la instalación (hoy: el modo mantenimiento).
--
-- Es la única tabla que NO pertenece a ningún club, y su política de RLS lo
-- dice explícitamente en vez de dejarla fuera:
--
--   · LEER la puede cualquiera, incluso sin contexto de club. Tiene que ser
--     así: quien consulta si hay mantenimiento suele estar SIN sesión —una
--     pantalla pública, alguien cuyo token caducó— y con la política por club
--     de las demás tablas no vería ni una fila, así que la web daría por hecho
--     que todo está abierto justo cuando no lo está.
--   · ESCRIBIRLA exige `acceso_total()`, que es la puerta del superadmin (ver
--     `lib/db-contexto.ts`). Un maestro no puede cerrar la aplicación de todos.
--
-- Sin ENABLE + FORCE aquí, `verificarRls()` reportaría el esquema como
-- desprotegido al arrancar: comprueba TODAS las tablas de `membresias`.
CREATE TABLE IF NOT EXISTS "membresias"."app_settings" (
  "key" varchar(60) PRIMARY KEY NOT NULL,
  "value" jsonb,
  "updated_by_id" uuid,
  "updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE membresias.app_settings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE membresias.app_settings FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS app_settings_global ON membresias.app_settings;
--> statement-breakpoint
CREATE POLICY app_settings_global ON membresias.app_settings
  USING (true)
  WITH CHECK (membresias.acceso_total());
