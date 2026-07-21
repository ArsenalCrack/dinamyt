"""
API: Autenticación
Endpoints: login, register, me
"""

from datetime import datetime, timezone

from flask import Blueprint, request, jsonify
from flask_jwt_extended import (
    create_access_token,
    jwt_required,
    get_jwt_identity,
)
from ..extensions import db
from ..geo import pais_de_ciudad
from ..models.asignacion import AsignacionJuez
from ..models.usuario import ROLES_VALIDOS, Usuario
from ..security import intento_bloqueado, limpiar_intentos, segundos_restantes
from .scoping import es_dueno_usuario, require_admin, workspace_owner_id

auth_bp = Blueprint("auth", __name__)

# Límite de intentos de login: 5 por correo y 20 por IP cada 5 minutos
LOGIN_MAX_POR_EMAIL = 5
LOGIN_MAX_POR_IP = 20
LOGIN_VENTANA_SEG = 300

# Tope de caracteres del club (espejo del competidor).
CLUB_MAX = 80
DELEGACION_MAX = 120


def _validar_club(valor):
    """(club, error): club recortado o None; error si excede el tope."""
    club = str(valor or "").strip()
    if not club:
        return None, None
    if len(club) > CLUB_MAX:
        return None, f"El club no puede superar {CLUB_MAX} caracteres."
    return club, None


def _validar_delegacion(valor):
    """(delegacion, pais, error): delegación recortada + país derivado."""
    delegacion = str(valor or "").strip()
    if not delegacion:
        return None, None, None
    if len(delegacion) > DELEGACION_MAX:
        return None, None, f"La delegación no puede superar {DELEGACION_MAX} caracteres."
    pais = pais_de_ciudad(delegacion)
    # Si la ciudad no está en el catálogo, el país se queda en None
    # (el admin puede escribir una delegación libre).
    return delegacion, pais, None


@auth_bp.route("/login", methods=["POST"])
def login():
    """
    POST /api/auth/login
    Body: { "email": "...", "password": "..." }
    Returns: { "token": "...", "user": {...} }
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "Datos requeridos"}), 400

    email = data.get("email", "").strip().lower()
    password = data.get("password", "")

    if not email or not password:
        return jsonify({"error": "Email y contraseña son requeridos"}), 400

    ip = request.remote_addr or "?"
    clave_email = f"login:{email}"
    clave_ip = f"login-ip:{ip}"
    if (
        intento_bloqueado(clave_email, LOGIN_MAX_POR_EMAIL, LOGIN_VENTANA_SEG)
        or intento_bloqueado(clave_ip, LOGIN_MAX_POR_IP, LOGIN_VENTANA_SEG)
    ):
        espera = max(segundos_restantes(clave_email), segundos_restantes(clave_ip))
        return jsonify({
            "error": f"Demasiados intentos de inicio de sesión. Intenta de nuevo en {max(espera, 30)} segundos."
        }), 429

    user = Usuario.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        return jsonify({"error": "Credenciales inválidas"}), 401

    # Login correcto: limpiar contador de intentos fallidos
    limpiar_intentos(clave_email)

    if not user.activo:
        return jsonify({"error": "Usuario desactivado"}), 403

    # Migración transparente del costo de bcrypt: si el hash se creó con más
    # rondas de las configuradas (p. ej. el admin sembrado con 12), se vuelve a
    # hashear con BCRYPT_ROUNDS para que los siguientes logins sean más rápidos.
    if user.necesita_rehash():
        user.set_password(password)
        db.session.commit()

    # Crear token JWT con identity como string del user ID
    token = create_access_token(
        identity=str(user.id),
        additional_claims={
            "rol": user.rol,
            "nombre": user.nombre,
            "email": user.email,
        },
    )

    return jsonify({
        "token": token,
        "user": user.to_dict(),
    }), 200


@auth_bp.route("/register", methods=["POST"])
@jwt_required()
def register():
    """
    POST /api/auth/register (solo Admin)
    Body: { "email": "...", "password": "...", "nombre": "...", "rol": "juez" }
    """
    # Verificar que el usuario actual sea admin
    current_user = require_admin()
    if not current_user:
        return jsonify({"error": "Solo administradores pueden crear usuarios"}), 403

    data = request.get_json()
    if not data:
        return jsonify({"error": "Datos requeridos"}), 400

    email = data.get("email", "").strip().lower()
    password = data.get("password", "")
    nombre = data.get("nombre", "").strip()
    rol = data.get("rol", "juez")

    if not email or not password or not nombre:
        return jsonify({"error": "Email, contraseña y nombre son requeridos"}), 400

    if rol not in ROLES_VALIDOS:
        return jsonify({"error": "Rol debe ser 'admin', 'maestro' o 'juez'"}), 400

    # Jerarquía: solo el superadmin crea administradores. Un admin normal
    # agrega jueces y maestros a SU workspace (los demás admins no los ven).
    if rol == "admin" and not current_user.es_super:
        return jsonify({
            "error": "Solo el superadministrador puede crear administradores"
        }), 403

    # Club y permiso de juez: solo tienen sentido para un maestro.
    club, error = _validar_club(data.get("club"))
    if error:
        return jsonify({"error": error}), 400
    if rol == "maestro" and not club:
        return jsonify({"error": "El club es obligatorio para un maestro"}), 400
    puede_juzgar = bool(data.get("puede_juzgar")) if rol == "maestro" else False

    # Delegación: ciudad de origen del club del maestro.
    delegacion, pais_del, error = _validar_delegacion(data.get("delegacion"))
    if error:
        return jsonify({"error": error}), 400

    if Usuario.query.filter_by(email=email).first():
        return jsonify({"error": f"El email '{email}' ya está registrado"}), 409

    new_user = Usuario(
        email=email,
        nombre=nombre,
        rol=rol,
        activo=True,
        creado_por_id=current_user.id,
        club=club if rol == "maestro" else None,
        delegacion=delegacion if rol == "maestro" else None,
        pais_delegacion=pais_del if rol == "maestro" else None,
        puede_juzgar=puede_juzgar,
    )
    new_user.set_password(password)
    db.session.add(new_user)
    db.session.commit()

    return jsonify({
        "message": f"Usuario '{nombre}' creado exitosamente",
        "user": new_user.to_dict(),
    }), 201


@auth_bp.route("/me", methods=["GET"])
@jwt_required()
def me():
    """
    GET /api/auth/me
    Retorna datos del usuario autenticado.
    """
    current_user_id = get_jwt_identity()
    user = Usuario.query.get(int(current_user_id))
    if not user:
        return jsonify({"error": "Usuario no encontrado"}), 404

    # Incluir tatamis asignados si es juez (o un maestro que también juzga)
    data = user.to_dict()
    if user.puede_ser_juez:
        from ..models.asignacion import AsignacionJuez
        asignaciones = AsignacionJuez.query.filter_by(usuario_id=user.id).all()
        data["tatamis_asignados"] = [a.to_dict() for a in asignaciones]

    return jsonify(data), 200


@auth_bp.route("/users", methods=["GET"])
@jwt_required()
def list_users():
    """
    GET /api/auth/users (solo Admin)
    Superadmin: todos los usuarios. Admin normal: solo los que él creó
    (sus jueces) y él mismo — los usuarios de otros admins no se ven.
    """
    current_user = require_admin()
    if not current_user:
        return jsonify({"error": "Solo administradores"}), 403

    include_inactive = request.args.get("include_inactive") == "1"
    query = Usuario.query
    if not current_user.es_super:
        query = query.filter(db.or_(
            Usuario.creado_por_id == current_user.id,
            Usuario.id == current_user.id,
        ))
    if not include_inactive:
        query = query.filter_by(activo=True)

    users = query.order_by(Usuario.nombre).all()
    return jsonify([u.to_dict(include_asignaciones=True) for u in users]), 200


@auth_bp.route("/clubes", methods=["GET"])
@jwt_required()
def listar_clubes():
    """
    GET /api/auth/clubes (solo Admin)
    Clubes distintos de los maestros del workspace. Alimenta el desplegable de
    club al inscribir competidores ("Independiente"/"Otro…" los agrega el cliente).
    """
    current_user = require_admin()
    if not current_user:
        return jsonify({"error": "Solo administradores"}), 403

    query = Usuario.query.filter(Usuario.rol == "maestro")
    if not current_user.es_super:
        query = query.filter(Usuario.creado_por_id == current_user.id)
    clubes = sorted(
        {(u.club or "").strip() for u in query.all() if (u.club or "").strip()},
        key=str.lower,
    )
    return jsonify(clubes), 200


@auth_bp.route("/users/<int:user_id>", methods=["PUT"])
@jwt_required()
def update_user(user_id):
    """
    PUT /api/auth/users/:id (solo Admin)
    Body opcional: { "nombre", "email", "password", "activo", "rol" }
    Permite al administrador corregir correo, restablecer contraseña,
    cambiar el rol (admin/juez) o activar/desactivar un usuario.
    Un admin normal solo puede editar los usuarios que él creó.
    """
    current_user = require_admin()
    if not current_user:
        return jsonify({"error": "Solo administradores"}), 403

    user = Usuario.query.get(user_id)
    # 404 también cuando el usuario es de otro workspace (no revelar existencia)
    if not user or not es_dueno_usuario(current_user, user):
        return jsonify({"error": "Usuario no encontrado"}), 404

    # El superadmin solo se edita a sí mismo (nadie lo degrada ni desactiva)
    if user.es_super and user.id != current_user.id:
        return jsonify({
            "error": "El superadministrador no puede ser modificado por otros usuarios"
        }), 403

    data = request.get_json() or {}

    if data.get("nombre"):
        user.nombre = data["nombre"].strip()

    if data.get("email"):
        email = data["email"].strip().lower()
        existente = Usuario.query.filter(
            Usuario.email == email, Usuario.id != user.id
        ).first()
        if existente:
            return jsonify({"error": f"El email '{email}' ya está registrado"}), 409
        user.email = email

    if data.get("password"):
        if len(data["password"]) < 6:
            return jsonify({"error": "La contraseña debe tener al menos 6 caracteres"}), 400
        user.set_password(data["password"])

    if data.get("rol"):
        nuevo_rol = data["rol"]
        if nuevo_rol not in ROLES_VALIDOS:
            return jsonify({"error": "Rol inválido (debe ser 'admin', 'maestro' o 'juez')"}), 400
        if user.id == current_user.id and nuevo_rol != "admin":
            return jsonify({"error": "No puedes quitarte tu propio rol de administrador"}), 400
        # Jerarquía: solo el superadmin promueve o degrada ADMINISTRADORES.
        # Alternar entre juez y maestro sí lo puede hacer un admin normal en su
        # propio workspace.
        toca_admin = "admin" in (nuevo_rol, user.rol)
        if nuevo_rol != user.rol and toca_admin and not current_user.es_super:
            return jsonify({
                "error": "Solo el superadministrador puede cambiar el rol de administrador"
            }), 403
        if nuevo_rol != user.rol:
            if nuevo_rol == "admin":
                # Un admin no actúa como juez de tatami: liberar sus asignaciones
                AsignacionJuez.query.filter_by(usuario_id=user.id).delete()
            if nuevo_rol != "maestro":
                # Al dejar de ser maestro, el club, delegación y el permiso
                # de juez dejan de aplicar.
                user.club = None
                user.delegacion = None
                user.pais_delegacion = None
                user.puede_juzgar = False
            user.rol = nuevo_rol

    # Club del maestro (lo fija/edita el admin).
    if "club" in data:
        club, error = _validar_club(data.get("club"))
        if error:
            return jsonify({"error": error}), 400
        if user.rol == "maestro" and not club:
            return jsonify({"error": "El club es obligatorio para un maestro"}), 400
        user.club = club

    # Delegación del maestro (ciudad de origen del club).
    if "delegacion" in data:
        delegacion, pais_del, error = _validar_delegacion(data.get("delegacion"))
        if error:
            return jsonify({"error": error}), 400
        user.delegacion = delegacion
        user.pais_delegacion = pais_del

    # Permiso de juez del maestro. Si se le revoca, se liberan sus asignaciones.
    if "puede_juzgar" in data:
        nuevo = bool(data["puede_juzgar"]) and user.rol == "maestro"
        if user.puede_juzgar and not nuevo:
            AsignacionJuez.query.filter_by(usuario_id=user.id).delete()
        user.puede_juzgar = nuevo

    if "activo" in data:
        if user.id == current_user.id and not data["activo"]:
            return jsonify({"error": "No puedes desactivar tu propio usuario"}), 400
        user.activo = bool(data["activo"])
        if user.activo:
            user.eliminado_at = None
        else:
            # Al desactivar, liberar sus asignaciones de tatami
            AsignacionJuez.query.filter_by(usuario_id=user.id).delete()
            user.eliminado_at = datetime.now(timezone.utc)

    if user.rol == "maestro" and not (user.club or "").strip():
        return jsonify({"error": "El club es obligatorio para un maestro"}), 400

    db.session.commit()
    return jsonify({
        "message": "Usuario actualizado",
        "user": user.to_dict(),
    }), 200


@auth_bp.route("/users/<int:user_id>", methods=["DELETE"])
@jwt_required()
def delete_user(user_id):
    """
    DELETE /api/auth/users/:id (solo Admin)
    Desactiva el usuario y elimina sus asignaciones activas.
    Un admin normal solo puede quitar usuarios que él creó.
    """
    current_user = require_admin()
    if not current_user:
        return jsonify({"error": "Solo administradores"}), 403

    if current_user.id == user_id:
        return jsonify({"error": "No puedes quitar tu propio usuario"}), 400

    user = Usuario.query.get(user_id)
    if not user or not es_dueno_usuario(current_user, user):
        return jsonify({"error": "Usuario no encontrado"}), 404
    if user.es_super:
        return jsonify({"error": "El superadministrador no puede ser eliminado"}), 403

    AsignacionJuez.query.filter_by(usuario_id=user.id).delete()
    user.activo = False
    user.eliminado_at = datetime.now(timezone.utc)
    db.session.commit()

    return jsonify({"message": "Usuario quitado de la aplicación"}), 200
