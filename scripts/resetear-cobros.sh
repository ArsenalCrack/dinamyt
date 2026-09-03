#!/usr/bin/env bash
#
# Borra las suscripciones y sus pagos para empezar con el cobro por persona.
#
# ── Por qué existe ──
#
# Hasta el 3 de septiembre de 2026 los planes tenían un importe FIJO, y los que
# había en la base eran de relleno: `Plan Membresías` a 60.000, `Academy` a
# 50.000. El cobro pasa a ser POR PERSONA (§4.18 de OPERAR), y mezclar las dos
# cosas deja un histórico con dos criterios distintos: el panel de recaudo
# sumaría importes fijos viejos con importes por padrón nuevos y la cifra no
# significaría nada.
#
# Con tres clubes y un puñado de filas, empezar limpio cuesta menos que explicar
# para siempre por qué enero se cobró de otra manera.
#
# ── QUE PAGOS SON ESTOS, QUE ES LO PRIMERO QUE HAY QUE TENER CLARO ──
#
# Los de **el super-admin cobrandole a los clubes su plan**. NO son las
# mensualidades que el maestro le cobra a sus alumnos.
#
# Son dos cobros distintos, en dos esquemas distintos, y confundirlos aqui
# borraria la contabilidad de un club entero:
#
#   ESTO borra          ecosystem.subscriptions          el plan del CLUB
#                       ecosystem.subscription_payments  lo que el club te paga
#
#   ESTO NO TOCA        membresias.plans                 las tarifas del club
#                       membresias.payments              lo que el ALUMNO le
#                                                        paga a su maestro
#                       membresias.attendances           su asistencia
#                       membresias.memberships           su mensualidad viva
#
# La regla, por si algun dia se edita este guion: **si la tabla empieza por
# `membresias.`, no se toca aqui**. Esa es la caja del club y no es nuestra.
#
# ── Lo que borra, y lo que NO ──
#
#   BORRA  ecosystem.subscription_payments  (lo que los clubes han pagado)
#   BORRA  ecosystem.subscriptions          (los planes de club)
#
#   NO toca las organizaciones, ni la gente, ni los roles, ni las fichas de
#   Membresias. Nadie pierde su cuenta ni su club: lo que desaparece es el
#   registro de cobro DE LOS PLANES, que es lo que se va a rehacer.
#
#   NO borra `ecosystem.user_subscriptions` salvo que se pida con
#   `--tambien-personales`. Son otra cosa: alguien comprandose Academy para si
#   mismo, no un club pagando su plan. No estan en el cambio de modelo.
#
# ⚠️ **Al borrar las suscripciones, ningún club abre nada** hasta que se les
# vuelva a crear la suya: los `app_scopes` salen de ahí. Y el barrido de la
# mañana siguiente pondrá en pausa Membresías para todos (§4.16). O sea que
# esto se corre **cuando se vayan a recrear enseguida**, no un viernes.
#
# ── Cómo se usa ──
#
#   bash scripts/resetear-cobros.sh              # en seco: solo dice qué haría
#   bash scripts/resetear-cobros.sh --aplicar    # lo hace
#
# En seco por defecto y dentro de una transacción que se deshace, igual que la
# reconciliación (§2.8) y la limpieza de roles.

set -euo pipefail

APLICAR=0
PERSONALES=0
for arg in "$@"; do
  case "$arg" in
    --aplicar)             APLICAR=1 ;;
    --tambien-personales)  PERSONALES=1 ;;
  esac
done

PSQL=(sudo -u postgres psql -d dinamyt -P pager=off)

titulo() { printf '\n\033[1m── %s ──\033[0m\n' "$1"; }

titulo 'Lo que hay ahora'
"${PSQL[@]}" -c "
  select
    (select count(*) from ecosystem.subscriptions)         as suscripciones,
    (select count(*) from ecosystem.user_subscriptions)    as personales,
    (select count(*) from ecosystem.subscription_payments) as pagos,
    (select coalesce(sum(amount), 0)
       from ecosystem.subscription_payments)               as dinero_registrado;"

titulo 'A quien afecta'
"${PSQL[@]}" -c "
  select o.name as club,
         count(s.id)                                as suscripciones,
         coalesce(sum(s.paid_amount::numeric), 0)   as abonado,
         max(s.ends_at)::date                       as vence_el
    from ecosystem.organizations o
    join ecosystem.subscriptions s on s.org_id = o.id
   group by o.name
   order by o.name;"

if [ "$APLICAR" -eq 0 ]; then
  cat <<'SECO'

  ── EN SECO: no se ha borrado nada ──

  Antes de aplicar, las tres cosas:

    1. Respaldo delante (`scripts/respaldar-produccion.ps1`) y comprobado
       (`scripts/verificar-respaldo.ps1`). Esto no tiene vuelta atras.
    2. Ten a mano el precio por persona y el minimo de cada plan: sin
       suscripciones, ningun club abre nada hasta que se las vuelvas a crear.
    3. Hazlo cuando puedas recrearlas enseguida. Un club sin suscripcion queda
       en pausa en Membresias al barrido siguiente.

  Para hacerlo de verdad:

    bash scripts/resetear-cobros.sh --aplicar

SECO
  exit 0
fi

titulo 'Aplicando'
# En una sola transacción: o se borra todo o no se borra nada. Un borrado a
# medias —pagos sin suscripciones— es peor que cualquiera de los dos estados.
"${PSQL[@]}" -v ON_ERROR_STOP=1 <<'SQL'
begin;
  -- Los pagos primero: cuelgan de las suscripciones por clave foranea.
  delete from ecosystem.subscription_payments
   where subscription_id is not null;
  delete from ecosystem.subscriptions;
commit;
SQL

if [ "$PERSONALES" -eq 1 ]; then
  titulo 'Y las personales, porque se pidio'
  "${PSQL[@]}" -v ON_ERROR_STOP=1 <<'SQL'
begin;
  delete from ecosystem.subscription_payments
   where user_subscription_id is not null;
  delete from ecosystem.user_subscriptions;
commit;
SQL
fi

titulo 'Como quedo'
"${PSQL[@]}" -c "
  select
    (select count(*) from ecosystem.subscriptions)         as planes_de_club,
    (select count(*) from ecosystem.user_subscriptions)    as personales,
    (select count(*) from ecosystem.subscription_payments) as pagos_de_club,
    -- La prueba de que no se toco la caja del club: este numero tiene que
    -- salir IGUAL antes y despues.
    (select count(*) from membresias.payments)             as pagos_de_alumnos_INTACTOS;"

cat <<'FIN'

  ── Hecho. Lo que sigue, en este orden ──

  1. Ponle el precio a cada plan (por persona y minimo), desde /admin o con:

       PATCH /subscription-plans/<id>  { "pricePerUser": "3000", "minUsers": 10 }

  2. Crea la suscripcion de cada club desde /admin. El importe se calcula solo
     con el padron del dia (§4.18 de OPERAR).

  3. Dispara el barrido para que Membresias se entere de quien vuelve a estar
     al dia, en vez de esperar a las 08:00:

       curl -s -X POST -H "x-cron-secret: $CRON_SECRET" \
         http://127.0.0.1:3001/subscriptions/avisos/cron

  4. Comprueba con `bash scripts/ensayo.sh planes` que no queda ningun club en
     «PAGADO Y NO EXISTE ALLI» ni en pausa por error.

FIN
