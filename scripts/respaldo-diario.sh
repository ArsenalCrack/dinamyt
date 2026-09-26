#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  El respaldo diario de la VPS: la base ENTERA y los archivos que no viven en
#  ella. Lo dispara `dinamyt-respaldo.timer` a las 03:00, como root.
#
#  ── Por qué existe (26 sep 2026) ──
#
#  El respaldo diario era una línea en el crontab del usuario `dinamyt`:
#
#      sudo -u postgres pg_dump -Fc dinamyt > …/dinamyt-$(date +%F).dump 2>/dev/null
#
#  y llevaba semanas escribiendo ARCHIVOS DE 0 BYTES: `sudo` pide contraseña, en
#  el cron no hay nadie que la teclee, y el `2>/dev/null` se tragaba el error.
#  Todos los días «había respaldo» y ninguno servía. Lo único bueno eran los
#  manuales de OPERAR.md §2.5.
#
#  Y desde que las fotos viven en disco (§4.20), la base sola ya no basta: una
#  restauración devolvería filas apuntando a archivos que no existen.
#
#  ── Las reglas de este guion ──
#
#  · Corre como root (systemd), así que no hay `sudo` que pueda pedir nada.
#  · **Falla en voz alta.** Si el volcado sale vacío o `pg_restore` no lo sabe
#    leer, termina con error: el servicio queda `failed` y se ve en
#    `systemctl --failed`. Un respaldo que no avisa cuando falla es el de antes.
#  · Guarda 14 días.
#
#  Instalarlo: MONTAR-VPS.md §10.1.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DESTINO=/var/backups/dinamyt
DIAS=14
HOY=$(date +%F)
BASE="$DESTINO/dinamyt-$HOY.dump"
ARCHIVOS="$DESTINO/archivos-$HOY.tar.gz"

# Lo que vive en disco y no en la base. Una carpeta que todavía no existe
# (Academy sin montar) se salta sin error.
CARPETAS=(/srv/dinamyt-media /srv/uploads)

mkdir -p "$DESTINO"

# ── 1 · La base ──────────────────────────────────────────────────────────────
# `runuser` y no `sudo`: somos root, y así no hay contraseña que pedir.
runuser -u postgres -- pg_dump -Fc dinamyt > "$BASE.parcial"

tamano=$(stat -c %s "$BASE.parcial")
if [ "$tamano" -lt 1024 ]; then
  echo "✗ El volcado de la base pesa $tamano bytes: NO es un respaldo." >&2
  rm -f "$BASE.parcial"
  exit 1
fi
# Que se sepa leer: es lo único que prueba que sirve para restaurar.
if ! pg_restore --list "$BASE.parcial" > /dev/null; then
  echo "✗ pg_restore no sabe leer el volcado de hoy." >&2
  rm -f "$BASE.parcial"
  exit 1
fi
mv "$BASE.parcial" "$BASE"
echo "✓ Base: $BASE ($(du -h "$BASE" | cut -f1))"

# ── 2 · Los archivos ─────────────────────────────────────────────────────────
existentes=()
for c in "${CARPETAS[@]}"; do
  [ -d "$c" ] && existentes+=("$c")
done
if [ "${#existentes[@]}" -gt 0 ]; then
  tar -czf "$ARCHIVOS.parcial" "${existentes[@]}" 2>/dev/null || {
    echo "✗ No se pudieron empaquetar ${existentes[*]}." >&2
    rm -f "$ARCHIVOS.parcial"
    exit 1
  }
  mv "$ARCHIVOS.parcial" "$ARCHIVOS"
  echo "✓ Archivos: $ARCHIVOS ($(du -h "$ARCHIVOS" | cut -f1)) — ${existentes[*]}"
fi

# Para que el usuario `dinamyt` pueda bajárselos con `scp` sin sudo.
chown dinamyt:dinamyt "$BASE" "$ARCHIVOS" 2>/dev/null || true

# ── 3 · La rotación ──────────────────────────────────────────────────────────
# Solo lo que tiene más de $DIAS días. Los de 0 bytes del cron viejo se van
# también: no son respaldos y confunden al buscar uno bueno.
find "$DESTINO" -name 'dinamyt-*.dump' -size 0 -delete
find "$DESTINO" \( -name 'dinamyt-*.dump' -o -name 'archivos-*.tar.gz' \) -mtime +"$DIAS" -delete
echo "✓ Quedan $(find "$DESTINO" -name 'dinamyt-*.dump' | wc -l) volcados en $DESTINO"
