"""
Seguridad: límite de intentos (rate limiting) en memoria.

Ventana deslizante por clave (IP + identificador). Pensado para un solo
proceso (eventlet), que es como se despliega DINAMYT. Si algún día se
escala a múltiples workers, reemplazar por un backend compartido (Redis).
"""

import functools
import threading
import time

from flask import current_app, jsonify, request

_intentos = {}
_lock = threading.Lock()

# Límite de entradas en memoria para evitar crecimiento sin control
_MAX_CLAVES = 10000


def _podar(ahora):
    """Elimina claves cuyos intentos ya expiraron (se llama con _lock tomado)."""
    if len(_intentos) <= _MAX_CLAVES:
        return
    for clave in list(_intentos.keys()):
        marcas, ventana = _intentos[clave]
        vigentes = [t for t in marcas if ahora - t < ventana]
        if vigentes:
            _intentos[clave] = (vigentes, ventana)
        else:
            del _intentos[clave]


def intento_bloqueado(clave, max_intentos, ventana_segundos):
    """
    Registra un intento para la clave y retorna True si superó el límite.

    Args:
        clave: identificador único, p. ej. "login:1.2.3.4:user@x.com"
        max_intentos: número máximo de intentos permitidos en la ventana
        ventana_segundos: tamaño de la ventana deslizante en segundos
    """
    ahora = time.time()
    with _lock:
        marcas, _ = _intentos.get(clave, ([], ventana_segundos))
        marcas = [t for t in marcas if ahora - t < ventana_segundos]
        if len(marcas) >= max_intentos:
            _intentos[clave] = (marcas, ventana_segundos)
            return True
        marcas.append(ahora)
        _intentos[clave] = (marcas, ventana_segundos)
        _podar(ahora)
        return False


def limpiar_intentos(clave):
    """Borra los intentos de una clave (p. ej. tras un login exitoso)."""
    with _lock:
        _intentos.pop(clave, None)


def reiniciar_limites():
    """Vacía el contador entero. Para los tests: el estado es del proceso y sin
    esto los límites se van sumando de un test al siguiente."""
    with _lock:
        _intentos.clear()


def segundos_restantes(clave):
    """Segundos hasta que la clave vuelva a tener intentos disponibles."""
    ahora = time.time()
    with _lock:
        marcas, ventana = _intentos.get(clave, ([], 0))
        if not marcas:
            return 0
        return max(0, int(ventana - (ahora - min(marcas))) + 1)


# ─────────────────────────────────────────────────────────────────────────────
#  IP del cliente y límites por endpoint
# ─────────────────────────────────────────────────────────────────────────────

def ip_cliente():
    """
    IP real del cliente.

    Cuando hay proxy de confianza (TRUST_PROXY_HOPS > 0) ProxyFix ya reescribió
    remote_addr con el salto correcto de X-Forwarded-For, así que aquí no hay
    que volver a leer la cabecera: hacerlo reabriría justo el agujero que
    ProxyFix cierra (cualquiera puede mandar X-Forwarded-For a mano).
    """
    return request.remote_addr or "?"


def _respuesta_429(espera):
    respuesta = jsonify({
        "error": f"Demasiadas peticiones. Intenta de nuevo en {espera} segundos."
    })
    respuesta.status_code = 429
    respuesta.headers["Retry-After"] = str(espera)
    return respuesta


def limitar(max_peticiones, ventana_segundos, nombre=None):
    """
    Limita un endpoint por IP.

    Se usa en lo que no exige token (pantallas públicas) y en lo que cuesta
    caro aunque venga autenticado (importaciones, exportaciones, generación de
    llaves): ahí el tope del login no protege nada.
    """
    def decorador(fn):
        etiqueta = nombre or fn.__name__

        @functools.wraps(fn)
        def envoltura(*args, **kwargs):
            clave = f"rl:{etiqueta}:{ip_cliente()}"
            if intento_bloqueado(clave, max_peticiones, ventana_segundos):
                return _respuesta_429(max(segundos_restantes(clave), 1))
            return fn(*args, **kwargs)

        return envoltura

    return decorador


# Techo global por IP sobre /api/*. Generoso a propósito: no es para afinar el
# uso normal (una pantalla de tatami consulta seguido), sino para que nadie
# barra la API entera ni martille un endpoint que se nos haya pasado marcar.
GLOBAL_MAX_POR_MINUTO = 600


def registrar_limite_global(app):
    """Aplica el techo global por IP a las rutas /api/*."""

    @app.before_request
    def _limite_global():
        # OPTIONS es el preflight de CORS: el navegador lo manda solo y no
        # debería consumir cupo (ni recibir un 429 que rompa la petición real).
        if request.method == "OPTIONS" or not request.path.startswith("/api/"):
            return None
        maximo = app.config.get("GLOBAL_MAX_POR_MINUTO", GLOBAL_MAX_POR_MINUTO)
        clave = f"rl:global:{ip_cliente()}"
        if intento_bloqueado(clave, maximo, 60):
            return _respuesta_429(max(segundos_restantes(clave), 1))
        return None
