-- El cobro deja de ser un importe fijo y pasa a ser POR PERSONA.
--
-- ── Por qué el modelo de antes no servía ──
--
-- `subscription_plans` tenía `price_monthly` y `price_annual`: dos importes
-- fijos. Pero un club de 15 alumnos y uno de 300 no pueden pagar lo mismo —con
-- precio fijo, o el pequeño no entra o el grande está regalado— y la intención
-- siempre fue tarifa por usuario. Los precios que había en la base eran de
-- relleno.
--
-- Y había una consecuencia menos obvia: `subscriptions.total_amount` se fijaba
-- al crear la fila, así que el importe era una CONSTANTE. Con tarifa por
-- persona, lo que se debe cambia con el padrón, y el panel de recaudo sumaba
-- importes fijos que ya no significaban nada.
--
-- ── La decisión: se cobra AL RENOVAR, sobre el padrón de ese día ──
--
-- Prepago, no postpago, y es lo que hace que encaje con el resto:
--
--   · **El club sabe cuánto paga ANTES de pagar.** Con corte al final, el mes
--     termina debiendo una cifra que nadie anunció.
--   · **Encaja con el bloqueo por impago** (`0019_plan_del_club` de Membresías).
--     Cobrar por detrás significaría bloquear a alguien por una deuda que se
--     generó sola.
--   · **No se baja quitando gente la víspera.** Con corte al vencer, quitar
--     cuarenta alumnos el día antes y devolverlos después divide la factura.
--
-- Lo que crezca a mitad de mes se cobra en la renovación siguiente, que es
-- cuando se vuelve a contar.
--
-- ── Qué cuenta como persona facturable ──
--
-- **Toda persona activa del club**: cualquiera con fila en `org_members` de esa
-- organización y la cuenta activa. Alumnos, auxiliares y el maestro.
--
-- Es una definición y no una preferencia: sin ella, la cifra depende de la
-- consulta que se escriba ese día. Se eligió ésta porque es una sola consulta,
-- no admite interpretación, y **se puede auditar contra la pantalla** — el
-- número que factura es el mismo que el maestro ve en su lista de gente.

-- ── 1. El plan: precio unitario y mínimo facturable ─────────────────────────
--
-- Los dos son NULL por defecto, y eso importa: un plan sin `price_per_user`
-- sigue cobrándose por `price_monthly`, como hasta hoy. Nada cambia de precio
-- por aplicar esta migración; cambia cuando alguien ponga el número.
ALTER TABLE "ecosystem"."subscription_plans"
  ADD COLUMN IF NOT EXISTS "price_per_user" numeric(10, 2);
--> statement-breakpoint
-- Nadie factura 3 alumnos: por debajo del mínimo se cobra el mínimo. Sin esto,
-- un club que arranca con 4 personas paga una cifra que no cubre ni el soporte.
ALTER TABLE "ecosystem"."subscription_plans"
  ADD COLUMN IF NOT EXISTS "min_users" integer;
--> statement-breakpoint

COMMENT ON COLUMN "ecosystem"."subscription_plans"."price_per_user" IS
  'Precio por persona y mes. NULL = este plan se cobra por price_monthly (el modelo viejo).';
--> statement-breakpoint
COMMENT ON COLUMN "ecosystem"."subscription_plans"."min_users" IS
  'Minimo facturable: por debajo de esta cifra se cobra igualmente por ella.';
--> statement-breakpoint

-- ── 2. La suscripción: por cuánta gente se cobró de verdad ──────────────────
--
-- El importe ya vive en `total_amount`, pero solo con el importe no se puede
-- responder a «¿por qué me cobraron esto?», que es la primera pregunta cuando
-- la cifra cambia cada mes. Guardar el padrón del día de corte convierte la
-- factura en algo que se explica sin rehacer la cuenta — y sin depender de que
-- el padrón de hoy siga siendo el de entonces, que no lo es.
ALTER TABLE "ecosystem"."subscriptions"
  ADD COLUMN IF NOT EXISTS "billed_users" integer;
--> statement-breakpoint

COMMENT ON COLUMN "ecosystem"."subscriptions"."billed_users" IS
  'Cuantas personas activas tenia el club el dia que se cobro el periodo vigente. NULL = se cobro con el modelo viejo, de importe fijo.';
--> statement-breakpoint

-- ── 3. El censo diario ──────────────────────────────────────────────────────
--
-- Una fila por club y día con cuánta gente activa tenía.
--
-- ── Por qué existe si el cobro es al renovar ──
--
-- Porque es el único dato que NO se puede recuperar hacia atrás. Hoy el cobro
-- mira el padrón del día de corte y no necesita historia; pero sin ella:
--
--   · el panel no puede proyectar lo que entrará el mes que viene sin volver a
--     contar cada club en cada carga;
--   · no hay forma de ver si un club creció o se está vaciando, que es lo que
--     de verdad dice si el negocio va bien;
--   · y el día que se quiera cobrar por el MÁXIMO del periodo —la otra opción
--     razonable— haría falta un año de datos que nadie guardó.
--
-- Lo escribe el barrido diario, que ya recorre todos los clubes para lo del
-- plan vencido. Sale gratis: es la misma pasada.
CREATE TABLE IF NOT EXISTS "ecosystem"."org_headcount" (
  "org_id" uuid NOT NULL REFERENCES "ecosystem"."organizations"("id") ON DELETE CASCADE,
  -- Fecha CIVIL, no instante: es «el padrón del día 3», no «el de las 08:00:14».
  -- Ver la regla de las dos clases de fecha en el esquema.
  "dia" date NOT NULL,
  "personas" integer NOT NULL,
  "medido_en" timestamp with time zone NOT NULL DEFAULT now(),
  -- La clave compuesta es lo que hace el barrido idempotente: correrlo dos
  -- veces el mismo día actualiza la fila en vez de duplicarla.
  PRIMARY KEY ("org_id", "dia")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "org_headcount_dia_idx"
  ON "ecosystem"."org_headcount" ("dia");
