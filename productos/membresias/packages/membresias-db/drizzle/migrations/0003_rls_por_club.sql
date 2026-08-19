-- Row Level Security: red de seguridad por club.
--
-- El aislamiento entre clubes ya lo hace la API (cada consulta filtra por
-- org_id). Esto es la capa de debajo: el dia que una consulta nueva se olvide
-- del filtro, PostgreSQL devuelve cero filas en vez de las de otro club.
--
-- Como sabe la base "que club soy": la API abre cada request en una transaccion
-- y fija `app.org_id` con set_config(..., true) -- local a la transaccion, asi
-- que no se filtra entre peticiones que compartan conexion del pool.
--
-- `FORCE` es imprescindible: sin el las politicas NO se aplican al dueno de las
-- tablas, que es justo el rol con el que se conecta la API. Ojo: un rol
-- SUPERUSER o con BYPASSRLS se salta esto igual -- ver `verificarRls()`.

CREATE OR REPLACE FUNCTION membresias.org_actual() RETURNS uuid
  LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.org_id', true), '')::uuid
  $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION membresias.acceso_total() RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT coalesce(current_setting('app.acceso_total', true), 'off') = 'on'
  $$;
--> statement-breakpoint
ALTER TABLE membresias.orgs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE membresias.orgs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY orgs_por_club ON membresias.orgs
  USING (membresias.acceso_total() OR id = membresias.org_actual())
  WITH CHECK (membresias.acceso_total() OR id = membresias.org_actual());
--> statement-breakpoint
ALTER TABLE membresias.users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE membresias.users FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY users_por_club ON membresias.users
  USING (membresias.acceso_total() OR org_id = membresias.org_actual())
  WITH CHECK (membresias.acceso_total() OR org_id = membresias.org_actual());
--> statement-breakpoint
ALTER TABLE membresias.plans ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE membresias.plans FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY plans_por_club ON membresias.plans
  USING (membresias.acceso_total() OR org_id = membresias.org_actual())
  WITH CHECK (membresias.acceso_total() OR org_id = membresias.org_actual());
--> statement-breakpoint
ALTER TABLE membresias.memberships ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE membresias.memberships FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY memberships_por_club ON membresias.memberships
  USING (membresias.acceso_total() OR org_id = membresias.org_actual())
  WITH CHECK (membresias.acceso_total() OR org_id = membresias.org_actual());
--> statement-breakpoint
ALTER TABLE membresias.club_schedule ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE membresias.club_schedule FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY club_schedule_por_club ON membresias.club_schedule
  USING (membresias.acceso_total() OR org_id = membresias.org_actual())
  WITH CHECK (membresias.acceso_total() OR org_id = membresias.org_actual());
--> statement-breakpoint
ALTER TABLE membresias.schedule_exceptions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE membresias.schedule_exceptions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY schedule_exceptions_por_club ON membresias.schedule_exceptions
  USING (membresias.acceso_total() OR org_id = membresias.org_actual())
  WITH CHECK (membresias.acceso_total() OR org_id = membresias.org_actual());
--> statement-breakpoint
ALTER TABLE membresias.devices ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE membresias.devices FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY devices_por_club ON membresias.devices
  USING (membresias.acceso_total() OR org_id = membresias.org_actual())
  WITH CHECK (membresias.acceso_total() OR org_id = membresias.org_actual());
--> statement-breakpoint
ALTER TABLE membresias.audit ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE membresias.audit FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY audit_por_club ON membresias.audit
  USING (membresias.acceso_total() OR org_id = membresias.org_actual())
  WITH CHECK (membresias.acceso_total() OR org_id = membresias.org_actual());
--> statement-breakpoint
ALTER TABLE membresias.payments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE membresias.payments FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY payments_por_club ON membresias.payments
  USING (membresias.acceso_total()
    OR EXISTS (
      SELECT 1 FROM membresias.memberships m
      WHERE m.id = membership_id AND m.org_id = membresias.org_actual()
    ))
  WITH CHECK (membresias.acceso_total()
    OR EXISTS (
      SELECT 1 FROM membresias.memberships m
      WHERE m.id = membership_id AND m.org_id = membresias.org_actual()
    ));
--> statement-breakpoint
ALTER TABLE membresias.attendances ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE membresias.attendances FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY attendances_por_club ON membresias.attendances
  USING (membresias.acceso_total()
    OR EXISTS (
      SELECT 1 FROM membresias.memberships m
      WHERE m.id = membership_id AND m.org_id = membresias.org_actual()
    ))
  WITH CHECK (membresias.acceso_total()
    OR EXISTS (
      SELECT 1 FROM membresias.memberships m
      WHERE m.id = membership_id AND m.org_id = membresias.org_actual()
    ));
--> statement-breakpoint
ALTER TABLE membresias.push_subscriptions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE membresias.push_subscriptions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY push_subscriptions_por_club ON membresias.push_subscriptions
  USING (membresias.acceso_total()
    OR EXISTS (
      SELECT 1 FROM membresias.users u
      WHERE u.id = user_id AND u.org_id = membresias.org_actual()
    ))
  WITH CHECK (membresias.acceso_total()
    OR EXISTS (
      SELECT 1 FROM membresias.users u
      WHERE u.id = user_id AND u.org_id = membresias.org_actual()
    ));
--> statement-breakpoint
ALTER TABLE membresias.notifications ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE membresias.notifications FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY notifications_por_club ON membresias.notifications
  USING (membresias.acceso_total()
    OR EXISTS (
      SELECT 1 FROM membresias.users u
      WHERE u.id = user_id AND u.org_id = membresias.org_actual()
    ))
  WITH CHECK (membresias.acceso_total()
    OR EXISTS (
      SELECT 1 FROM membresias.users u
      WHERE u.id = user_id AND u.org_id = membresias.org_actual()
    ));
-- Las politicas filtran por org_id en cada fila, pero NO hacen falta indices
-- nuevos: users(org_id) ya lo tiene en `ix_users_org`, y en memberships lo
-- cubre `uq_membership_org_user (org_id, user_id)`, donde org_id es la columna
-- lider. Crearlos aparte solo anadiria peso a cada escritura, y ademas
-- quedarian fuera del esquema de drizzle: el proximo `generate` los borraria.
