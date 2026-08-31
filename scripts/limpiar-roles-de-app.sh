#!/usr/bin/env bash
#
# Vaciar los `role_*` que solo repiten lo que ya dice el rol general.
#
# ── Qué son y por qué estorban ──
#
# `org_members` guarda cuatro roles: el GENERAL y uno por app
# (`role_membresias`, `role_campeonatos`, `role_academy`). Los de app **mandan
# sobre el general** (§4.7), y existen para el caso real de que alguien sea otra
# cosa dentro de una aplicación — alumno en su club y juez en la federación.
#
# La reconciliación del 29 de agosto los llenó para todo el mundo, con el rol
# que cada quien tenía en su app en ese momento. Casi todos **dicen lo mismo que
# el general traducido**, así que no aportan nada… y tapan el rol del portal:
# cambiarlo no cambia nada hasta que alguien toque también esa columna. Eso es
# exactamente el fallo que costó cuatro rondas encontrar en agosto, esperando en
# el resto de las filas.
#
# ── Qué hace este guion ──
#
# Vacía **solo** las columnas cuyo valor coincide con lo que daría la traducción
# del rol general (`common/roles-por-app.ts`). Vaciar una de esas **no cambia
# nada**: el pase seguirá llevando el mismo valor, porque `rolParaApp` cae a la
# traducción cuando la columna está vacía. Lo que cambia es que a partir de ahí
# el rol del portal vuelve a mandar.
#
# Lo que NO toca: la columna que dice algo DISTINTO. Ésa es una decisión que
# alguien tomó —o que la reconciliación importó de una app donde esa persona de
# verdad es otra cosa— y se lista aparte para mirarla a mano.
#
# ── Cómo se usa ──
#
#   bash scripts/limpiar-roles-de-app.sh              # ensayo: no escribe nada
#   bash scripts/limpiar-roles-de-app.sh --aplicar    # escribe
#
# Sin `--aplicar` hace todo el trabajo dentro de una transacción y la deshace,
# igual que la reconciliación (§2.8). Respalda antes de aplicar (§2.5).
set -uo pipefail

BASE=${BASE:-dinamyt}
if [ "$(id -un)" = 'postgres' ]; then
  PSQL=(psql -d "$BASE" -P pager=off -X -v ON_ERROR_STOP=1)
else
  PSQL=(sudo -u postgres psql -d "$BASE" -P pager=off -X -v ON_ERROR_STOP=1)
fi

APLICAR=no
[ "${1:-}" = '--aplicar' ] && APLICAR=si

# La traducción, la misma de `common/roles-por-app.ts`. Escrita aquí en SQL
# porque este guion corre contra la base y no contra la aplicación; si aquella
# cambia, ésta hay que cambiarla al lado — están enlazadas por el comentario de
# las dos partes, que es lo único que las mantiene juntas.
TRADUCCION="
  create temporary view traducidos as
  select m.id,
         m.role,
         m.role_membresias,
         m.role_campeonatos,
         m.role_academy,
         case
           when m.role in ('owner','staff','guardian','student') then m.role
           when m.role = 'admin'      then 'owner'
           when m.role = 'maestro'    then 'owner'
           when m.role = 'coach'      then 'staff'
           when m.role = 'competitor' then 'student'
           when m.role = 'member'     then 'student'
         end as esperado_membresias,
         case
           when m.role in ('admin','maestro','coach','competitor','judge') then m.role
           when m.role = 'student' then 'competitor'
         end as esperado_campeonatos,
         case
           when m.role in ('admin','teacher','student') then m.role
           when m.role = 'owner'      then 'admin'
           when m.role = 'maestro'    then 'teacher'
           when m.role = 'coach'      then 'teacher'
           when m.role = 'competitor' then 'student'
         end as esperado_academy
    from ecosystem.org_members m;
"

INFORME="
  \\echo ''
  \\echo '── Las que solo repiten el general (se vacían)'
  select count(*) filter (where role_membresias  = esperado_membresias)  as membresias,
         count(*) filter (where role_campeonatos = esperado_campeonatos) as campeonatos,
         count(*) filter (where role_academy     = esperado_academy)     as academy
    from traducidos;

  \\echo ''
  \\echo '── Las que dicen algo DISTINTO (no se tocan: míralas a mano)'
  select u.email, o.name as organizacion, t.role as general,
         t.role_membresias, t.esperado_membresias,
         t.role_campeonatos, t.esperado_campeonatos,
         t.role_academy, t.esperado_academy
    from traducidos t
    join ecosystem.org_members m on m.id = t.id
    join ecosystem.users u on u.id = m.user_id
    join ecosystem.organizations o on o.id = m.org_id
   where (t.role_membresias  is not null and t.role_membresias  is distinct from t.esperado_membresias)
      or (t.role_campeonatos is not null and t.role_campeonatos is distinct from t.esperado_campeonatos)
      or (t.role_academy     is not null and t.role_academy     is distinct from t.esperado_academy)
   order by u.email;
"

LIMPIEZA="
  update ecosystem.org_members m
     set role_membresias  = case when t.role_membresias  = t.esperado_membresias  then null else m.role_membresias  end,
         role_campeonatos = case when t.role_campeonatos = t.esperado_campeonatos then null else m.role_campeonatos end,
         role_academy     = case when t.role_academy     = t.esperado_academy     then null else m.role_academy     end
    from traducidos t
   where t.id = m.id
     and (t.role_membresias  = t.esperado_membresias
       or t.role_campeonatos = t.esperado_campeonatos
       or t.role_academy     = t.esperado_academy);

  \\echo ''
  \\echo '── Cómo quedó'
  select count(*) as filas,
         count(*) filter (where role_membresias is not null
                            or role_campeonatos is not null
                            or role_academy is not null) as con_rol_de_app_escrito
    from ecosystem.org_members;
"

if [ "$APLICAR" = 'si' ]; then
  echo '⚠️  Escribiendo de verdad. ¿Respaldaste? (§2.5)'
  "${PSQL[@]}" <<SQL
begin;
$TRADUCCION
$INFORME
$LIMPIEZA
commit;
SQL
  echo
  echo 'Hecho. Los pases en circulación duran 30 min: lo nuevo se nota al'
  echo 'renovarlos o al volver a entrar (§4.11).'
else
  echo 'Ensayo en seco: NO se escribe nada. Añade --aplicar cuando lo veas bien.'
  "${PSQL[@]}" <<SQL
begin;
$TRADUCCION
$INFORME
$LIMPIEZA
rollback;
SQL
fi
