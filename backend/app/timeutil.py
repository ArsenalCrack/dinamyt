"""
Serialización de fechas para la API y los reportes.

Los timestamps del sistema se guardan en UTC (SQLite los devuelve "naive",
sin zona). Si se serializan tal cual, el navegador los interpreta como hora
local y todo aparece corrido (+5 h en Colombia). Aquí se les hace explícita
la zona UTC para que el navegador convierta bien, y los reportes PDF/Excel
los convierten a la hora local del EVENTO.

NO usar con fechas de calendario elegidas por el usuario (fecha_inicio /
fecha_fin de campeonato, fecha_nacimiento del competidor): esas no son
timestamps y no deben desplazarse. Un cumpleaños no cambia de día al cruzar
un huso horario.
"""

import os
from datetime import timezone

# ── Zona horaria del evento ─────────────────────────────────────────────────
#
# Un servidor arranca en UTC salvo que se le diga otra cosa (Render lo hace),
# y Colombia es UTC−5: a partir de las siete de la tarde el proceso ya cree que
# es mañana. Eso es lo que hacía que un usuario creado a las 22:00 del día 4
# apareciera fechado el día 5.
#
# El arreglo de verdad para lo que ve el navegador es marcar los timestamps
# como UTC (`iso_utc`) y dejar que cada dispositivo convierta a SU hora. Esto
# de aquí es lo otro: la hora que va IMPRESA en el acta y en los reportes, que
# no la convierte ningún navegador y tiene que ser la del sitio donde se está
# compitiendo.
#
# Se lee de `TZ` (la variable estándar, la misma que usa dinamyt-membresias en
# su render.yaml) o de `ZONA_HORARIA`. Para un campeonato fuera de Colombia,
# poner su zona IANA — p. ej. `TZ=America/Caracas`.
ZONA_POR_DEFECTO = "America/Bogota"


def _zona_evento():
    """La zona del evento, o None para caer a la del sistema.

    No se cachea a propósito: son dos accesos a `os.environ` y una tabla que
    `zoneinfo` ya tiene en memoria, y así un cambio de configuración no exige
    reiniciar.

    Si el nombre configurado no existe se usa el POR DEFECTO, no la zona del
    sistema: una `TZ` mal escrita hace que el runtime de Windows se quede en
    UTC sin decir nada, y entonces el acta volvería a salir con la hora corrida
    —que es justo el problema que esto viene a resolver—. Solo cuando tampoco
    se puede resolver la de por defecto (una imagen sin `tzdata`) se devuelve
    None y `a_local` usa la del sistema: se degrada, no se cae.
    """
    from zoneinfo import ZoneInfo

    nombre = os.getenv("TZ") or os.getenv("ZONA_HORARIA")
    for candidata in (nombre, ZONA_POR_DEFECTO):
        if not candidata:
            continue
        try:
            return ZoneInfo(candidata)
        except Exception:  # noqa: BLE001 — zona desconocida o sin tzdata
            continue
    return None


def iso_utc(dt):
    """ISO-8601 con zona UTC explícita (o None). El navegador convierte a local."""
    if not dt:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def a_local(dt):
    """Datetime en la hora del evento (para reportes PDF/Excel), o None."""
    if not dt:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    zona = _zona_evento()
    return dt.astimezone(zona) if zona else dt.astimezone()
