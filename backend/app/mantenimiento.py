"""
Modo mantenimiento: cerrar la aplicación mientras se sube una actualización.

Lo enciende el SUPERADMIN con un botón. Mientras está activo, la API responde
503 a todo el mundo menos a él, y la web enseña una pantalla de «estamos
actualizando» en vez de dejar a la gente a medias.

Por qué existe: subir una versión nueva reinicia el backend y reemplaza el
frontend. Quien estaba puntuando un combate o inscribiendo alumnos en ese
momento se encontraba errores sueltos, formularios que no guardaban y pantallas
con código viejo hablando con un servidor nuevo. Avisar antes y cerrar la puerta
un minuto es la diferencia entre una actualización y un susto.

Qué NO hace: no expulsa a nadie ni borra sesiones. Al desactivarlo, todo el
mundo sigue donde estaba — las pantallas vuelven solas.

── Dónde vive el interruptor ──
En la base de datos (tabla `ajustes`), no en memoria: el proceso se reinicia
justo durante la actualización, y un interruptor en memoria se apagaría solo en
el peor momento posible — con la versión nueva arrancando y la puerta abierta.

En memoria hay solo una CACHÉ de unos segundos para no consultar la tabla en
cada petición. El backend corre en un único worker (ver `wsgi.py`), así que
escribir invalida la caché de todos: el botón hace efecto al instante.
"""

import time

from flask import jsonify, request

from .extensions import db
from .models.ajuste import Ajuste
from .timeutil import iso_utc

CLAVE = "mantenimiento"

# Segundos que se reutiliza el valor leído. Es un techo, no un retardo: el botón
# invalida la caché al escribir. Solo cuenta si alguien cambia la fila desde
# fuera del proceso (una consola de la base, otro despliegue).
CACHE_SEGUNDOS = 5

# Rutas que siguen funcionando con el mantenimiento puesto. Son las mínimas para
# que el superadmin pueda entrar y apagarlo, y para que la web sepa que el corte
# es un mantenimiento y no un servidor caído:
#   · el propio estado, que es lo que consulta la pantalla de aviso;
#   · el login y el logout, o el superadmin se quedaría fuera de su propio botón;
#   · `/auth/me`, porque la web lo llama al arrancar y un fallo ahí cierra la
#     sesión de todos — justo lo que este modo intenta evitar.
RUTAS_LIBRES = frozenset({
    "/api/mantenimiento",
    "/api/auth/login",
    "/api/auth/logout",
    "/api/auth/me",
    "/api/auth/sesion",
})

_cache = {"valor": None, "leido_en": 0.0}

APAGADO = {"activo": False, "mensaje": None, "desde": None}


def _normalizar(valor):
    """El JSON guardado, con la forma que espera el resto del código."""
    if not isinstance(valor, dict):
        return dict(APAGADO)
    return {
        "activo": bool(valor.get("activo")),
        "mensaje": valor.get("mensaje") or None,
        "desde": valor.get("desde") or None,
    }


def invalidar_cache():
    """Olvida el valor cacheado. Lo llama quien escribe el ajuste."""
    _cache["valor"] = None
    _cache["leido_en"] = 0.0


def estado():
    """Estado actual del mantenimiento: {activo, mensaje, desde}.

    Nunca propaga errores: si la tabla todavía no existe (una instalación que
    aún no ha arrancado con esta versión) o la base no responde, se devuelve
    «apagado». Un fallo aquí no puede cerrar la aplicación entera — eso sería
    exactamente lo contrario de lo que este módulo viene a hacer.
    """
    ahora = time.time()
    if _cache["valor"] is not None and ahora - _cache["leido_en"] < CACHE_SEGUNDOS:
        return _cache["valor"]

    try:
        fila = db.session.get(Ajuste, CLAVE)
        valor = _normalizar(fila.valor if fila else None)
    except Exception:  # noqa: BLE001 — sin tabla o sin base: se sigue abierto
        db.session.rollback()
        valor = dict(APAGADO)

    _cache["valor"] = valor
    _cache["leido_en"] = ahora
    return valor


def fijar(activo, mensaje=None, usuario=None):
    """Enciende o apaga el mantenimiento. Devuelve el estado resultante."""
    from datetime import datetime, timezone

    fila = db.session.get(Ajuste, CLAVE)
    if fila is None:
        fila = Ajuste(clave=CLAVE)
        db.session.add(fila)

    anterior = _normalizar(fila.valor)
    # `desde` marca cuándo se encendió ESTA vez. Volver a guardar con el
    # mantenimiento ya puesto (p. ej. para cambiar el aviso) no reinicia el
    # reloj: si no, el aviso mentiría sobre cuánto lleva cerrado.
    if not activo:
        desde = None
    else:
        desde = anterior["desde"] or iso_utc(datetime.now(timezone.utc))

    fila.valor = {
        "activo": bool(activo),
        "mensaje": (mensaje or "").strip() or None,
        "desde": desde,
    }
    fila.actualizado_por_id = getattr(usuario, "id", None)
    db.session.commit()
    invalidar_cache()
    return _normalizar(fila.valor)


def respuesta_503(estado_actual):
    """El 503 que ve todo el que no es el superadmin."""
    respuesta = jsonify({
        "error": estado_actual["mensaje"] or (
            "El sistema está en mantenimiento. Vuelve a intentarlo en unos minutos."
        ),
        # Lo que distingue esto de un servidor caído: la web lo mira para
        # enseñar la pantalla de mantenimiento en vez de un error de conexión.
        "mantenimiento": True,
        "desde": estado_actual["desde"],
    })
    respuesta.status_code = 503
    respuesta.headers["Retry-After"] = "60"
    return respuesta


def usuario_exento():
    """El usuario del request si puede saltarse el mantenimiento, o None.

    Solo el superadmin. Se relee el token aquí (en vez de fiarse de lo que dejó
    otro `before_request`) para que esta puerta no dependa del orden en que se
    registren los ganchos.
    """
    from flask_jwt_extended import verify_jwt_in_request

    try:
        verify_jwt_in_request(optional=True)
        from .api.scoping import usuario_actual

        user = usuario_actual()
    except Exception:  # noqa: BLE001 — token ausente, caducado o ilegible
        return None
    return user if user is not None and getattr(user, "es_super", False) else None


def socket_permitido(token):
    """True si esta conexión de Socket.IO puede abrirse.

    El tatami en vivo no pasa por `/api/*`: habla por el socket, y sin esto
    seguiría marcando combates contra un backend a punto de reiniciarse. Solo
    afecta a conexiones NUEVAS — las abiertas se caen solas cuando el proceso
    se reinicia, y el cliente reintenta hasta que se apague el mantenimiento.
    """
    if not estado()["activo"]:
        return True
    if not token:
        return False
    try:
        from flask_jwt_extended import decode_token

        from .models.usuario import Usuario

        datos = decode_token(token)
        user = db.session.get(Usuario, int(datos.get("sub")))
    except Exception:  # noqa: BLE001 — token ilegible o usuario inexistente
        return False
    return bool(user is not None and user.es_super)


def registrar_modo_mantenimiento(app):
    """Cierra `/api/*` mientras el mantenimiento esté puesto."""

    @app.before_request
    def _puerta_mantenimiento():
        # OPTIONS es el preflight de CORS: el navegador lo manda solo, y
        # contestarlo con un 503 haría que la petición real fallara por CORS y
        # la web no llegara ni a leer el motivo.
        if request.method == "OPTIONS" or not request.path.startswith("/api/"):
            return None
        if request.path in RUTAS_LIBRES:
            return None

        actual = estado()
        if not actual["activo"]:
            return None
        if usuario_exento() is not None:
            return None
        return respuesta_503(actual)
