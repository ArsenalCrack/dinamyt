"""
API: Modo mantenimiento (solo el superadmin lo cambia).

    GET  /api/mantenimiento  — público: ¿está cerrado? ¿desde cuándo?
    PUT  /api/mantenimiento  — superadmin: encenderlo o apagarlo.

El GET es público a propósito: es lo que consulta la pantalla de aviso, y esa
la ve gente SIN sesión (la pantalla pública de un tatami, un maestro cuya
sesión caducó). Exigir token ahí dejaría al usuario mirando un error de
conexión sin saber que hay un mantenimiento en curso.

Ver `app/mantenimiento.py` para el porqué del modo y para la puerta que cierra
el resto de la API.
"""

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from .. import mantenimiento
from ..models.usuario import Usuario
from .scoping import usuario_actual

mantenimiento_bp = Blueprint("mantenimiento", __name__)

# Tope del aviso personalizado. Es una frase para una pantalla, no un
# comunicado: más largo que esto no cabe ni se lee.
MENSAJE_MAX = 300


def _vista(estado, exento):
    return {
        "activo": estado["activo"],
        "mensaje": estado["mensaje"],
        "desde": estado["desde"],
        # Si quien pregunta puede seguir usando la aplicación pese al
        # mantenimiento. Lo decide el servidor y no el navegador: el perfil
        # cacheado del cliente puede ser de un login viejo y no traer el dato.
        "exento": exento,
    }


@mantenimiento_bp.route("/mantenimiento", methods=["GET"])
def obtener():
    """GET /api/mantenimiento — estado actual (sin token)."""
    exento = mantenimiento.usuario_exento() is not None
    return jsonify(_vista(mantenimiento.estado(), exento)), 200


@mantenimiento_bp.route("/mantenimiento", methods=["PUT"])
@jwt_required()
def cambiar():
    """PUT /api/mantenimiento — encender/apagar. Body: {activo, mensaje?}."""
    user: Usuario | None = usuario_actual()
    if user is None or not user.es_super:
        # 404 y no 403: quien no es superadmin no tiene por qué enterarse de
        # que este interruptor existe (mismo criterio que el resto de la API).
        return jsonify({"error": "No encontrado"}), 404

    data = request.get_json(silent=True) or {}
    if "activo" not in data:
        return jsonify({"error": "Falta el campo 'activo'"}), 400

    mensaje = data.get("mensaje")
    if mensaje is not None:
        if not isinstance(mensaje, str):
            return jsonify({"error": "El aviso debe ser texto"}), 400
        if len(mensaje.strip()) > MENSAJE_MAX:
            return jsonify({
                "error": f"El aviso no puede pasar de {MENSAJE_MAX} caracteres"
            }), 400

    estado = mantenimiento.fijar(bool(data["activo"]), mensaje, user)
    return jsonify(_vista(estado, True)), 200
