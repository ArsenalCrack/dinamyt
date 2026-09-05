-- El club cuyo plan venció deja de funcionar, y se sabe desde cuándo.
--
-- ── Qué estaba roto ──
--
-- Nada bloqueaba a un club con el plan vencido. El portal DINAMYT sí calcula
-- bien los `app_scopes` —los filtra por `status = 'ACTIVE' AND ends_at > now()`
-- al firmar el pase—, pero eso solo gobierna al que ENTRA POR EL PORTAL.
-- Membresías tiene login propio, y una vez que alguien tiene su ficha aquí
-- entra por el formulario de siempre sin pasar por el ecosistema nunca más.
--
-- O sea: el plan vencía, el portal dejaba de ofrecer la tarjeta de «Entrar a
-- Membresías»… y el club seguía cobrando, pasando lista e imprimiendo carnets
-- con normalidad, indefinidamente. El candado estaba puesto en una puerta y la
-- otra no tenía cerradura.
--
-- ── Por qué una columna nueva y NO `is_active` ──
--
-- Porque son dos cosas distintas que se veían igual:
--
--   · `is_active = false` es «el superadmin apagó este club», una decisión
--     tomada mirando, y solo él la deshace.
--   · Esto es «su plan venció», un hecho con fecha que se deshace SOLO, en el
--     momento en que alguien pague.
--
-- Reutilizar `is_active` juntaba las dos: al renovar, el aviso de «plan al día»
-- resucitaría un club que el superadmin había apagado a propósito —y a nadie le
-- constaría por qué volvió—. Con columnas separadas, cada llave abre su cerrojo
-- y hacen falta las dos abiertas para entrar.
--
-- ── Por qué guarda una FECHA y no un booleano ──
--
-- Porque «bloqueado» sin más no se le puede explicar a nadie. Con la fecha, la
-- pantalla dice «desde el 3 de septiembre» y el maestro sabe si lo que está
-- viendo es de esta mañana o de hace tres semanas — que es la diferencia entre
-- «se me pasó» y «esto lleva roto y nadie me avisó». Y sale gratis: es la misma
-- columna.
--
-- ── El valor por defecto es NULL, y eso importa ──
--
-- `NULL` = «no consta», igual que `org_members.membresias_activo` en el
-- ecosistema. Es el valor de TODOS los clubes existentes, así que aplicar esta
-- migración **no bloquea a nadie**: hace falta que el ecosistema lo diga.
--
-- Y es lo que mantiene a Membresías vendible por su cuenta: un club que la
-- instaló en su propio servidor no recibe nunca ese aviso, su columna se queda
-- en NULL para siempre, y para él esta migración no existe.

ALTER TABLE "membresias"."orgs"
  ADD COLUMN IF NOT EXISTS "plan_bloqueado_desde" timestamp with time zone;
--> statement-breakpoint

COMMENT ON COLUMN "membresias"."orgs"."plan_bloqueado_desde" IS
  'Cuándo dijo el ecosistema que el plan de este club dejó de estar al día. '
  'NULL = al día, o no consta (el caso de una instalación independiente). '
  'Lo escribe POST /sync/plan; nadie más lo toca.';
