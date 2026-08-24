#!/usr/bin/env bash
#
# El reloj de los avisos. Se instala en el VPS y lo dispara un `systemd timer`
# una vez al día (ver `OPERAR.md`, §4.5).
#
# ── Por qué un guion y no un cron de la nube ──
#
# El reloj de los avisos de Membresías era el cron de Vercel, y Vercel ya no
# existe en este proyecto: desde el 20 de agosto todo corre en un VPS propio.
# Al mudarse se llevaron las apps, pero **el reloj se quedó allí**, así que los
# avisos dejaron de dispararse sin que nadie lo notara — no fallan, sencillamente
# no ocurren, que es la clase de avería más difícil de ver.
#
# ── Los dos avisos son cosas distintas ──
#
#   · El del ECOSISTEMA avisa al MAESTRO de que la suscripción de su club vence.
#   · El de MEMBRESÍAS avisa al ALUMNO de que su mensualidad vence.
#
# Se disparan juntos porque comparten reloj, no porque sean lo mismo. Si uno
# falla, el otro se intenta igual: un club sin correo configurado no puede dejar
# a los alumnos sin su aviso.
#
# ── Los secretos ──
#
# Cada API tiene el suyo en su `.env` (`CRON_SECRET`). Este guion los lee de ahí
# en vez de llevarlos escritos: un secreto en un archivo que se versiona es un
# secreto quemado.
set -uo pipefail

ECO_ENV=${ECO_ENV:-/srv/dinamyt/apps/ecosystem-api/.env}
MEMB_ENV=${MEMB_ENV:-/srv/membresias/apps/membresias-api/.env}
ECO_URL=${ECO_URL:-http://127.0.0.1:3001}
MEMB_URL=${MEMB_URL:-http://127.0.0.1:3004}

# Lee una variable de un `.env` sin importar el archivo entero: `source` de un
# `.env` ajeno ejecuta lo que haya dentro y pisa el entorno de este guion.
leer() {
  local archivo=$1 clave=$2
  [ -r "$archivo" ] || return 1
  sed -n "s/^${clave}=//p" "$archivo" | tail -n 1 | tr -d '"'\''\r'
}

disparar() {
  local nombre=$1 url=$2 secreto=$3
  if [ -z "$secreto" ]; then
    echo "[$nombre] sin CRON_SECRET: los avisos automáticos están apagados."
    return 0
  fi
  local respuesta codigo
  respuesta=$(curl -sS -m 60 -w '\n%{http_code}' -X POST "$url" \
    -H "x-cron-secret: $secreto" \
    -H 'content-type: application/json' \
    -d '{}' 2>&1) || { echo "[$nombre] no respondió: $respuesta"; return 1; }
  codigo=$(printf '%s' "$respuesta" | tail -n 1)
  local cuerpo
  cuerpo=$(printf '%s' "$respuesta" | sed '$d')
  if [ "$codigo" = "200" ] || [ "$codigo" = "201" ]; then
    echo "[$nombre] ok: $cuerpo"
    return 0
  fi
  # Un 404 aquí no es «la ruta no existe»: es que a ESA api le falta su
  # `CRON_SECRET`, que es como se apaga la función a propósito.
  echo "[$nombre] respondió $codigo: $cuerpo"
  return 1
}

fallos=0
disparar "ecosystem/suscripciones" "$ECO_URL/subscriptions/avisos/cron" \
  "$(leer "$ECO_ENV" CRON_SECRET || true)" || fallos=$((fallos + 1))
disparar "membresias/mensualidades" "$MEMB_URL/notifications/cron" \
  "$(leer "$MEMB_ENV" CRON_SECRET || true)" || fallos=$((fallos + 1))

exit "$fallos"
