"""
Serialización de fechas para la API y los reportes.

Los timestamps del sistema se guardan en UTC (SQLite los devuelve "naive",
sin zona). Si se serializan tal cual, el navegador los interpreta como hora
local y todo aparece corrido (+5 h en Colombia). Aquí se les hace explícita
la zona UTC para que el navegador convierta bien, y los reportes PDF/Excel
los convierten a la hora local del servidor (la del evento).

NO usar con fechas de calendario elegidas por el usuario (fecha_inicio /
fecha_fin de campeonato): esas no son timestamps y no deben desplazarse.
"""

from datetime import timezone


def iso_utc(dt):
    """ISO-8601 con zona UTC explícita (o None). El navegador convierte a local."""
    if not dt:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def a_local(dt):
    """Datetime en hora local del servidor (para reportes PDF/Excel), o None."""
    if not dt:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone()
