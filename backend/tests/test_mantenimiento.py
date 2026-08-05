"""Tests del modo mantenimiento: quién lo enciende y a quién deja fuera."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402

from app import create_app, mantenimiento  # noqa: E402
from app.config import DevelopmentConfig  # noqa: E402
from app.extensions import db  # noqa: E402

DevelopmentConfig.SQLALCHEMY_DATABASE_URI = "sqlite://"


@pytest.fixture()
def app_con_usuarios():
    app = create_app("development")
    with app.app_context():
        db.create_all()
        # La caché del interruptor vive en el proceso: sin limpiarla, un test
        # arrastra el estado que dejó el anterior.
        mantenimiento.invalidar_cache()

        from flask_jwt_extended import create_access_token
        from app.models.usuario import Usuario

        def crear(email, rol, superadmin=False):
            u = Usuario(
                email=email, nombre=email.split("@")[0].upper(),
                rol=rol, es_superadmin=superadmin, activo=True,
            )
            u.set_password("secret123")
            db.session.add(u)
            db.session.commit()
            token = create_access_token(
                identity=str(u.id),
                additional_claims={"rol": rol, "nombre": u.nombre, "email": u.email},
            )
            return u, token

        _, token_super = crear("super@test.local", "admin", superadmin=True)
        _, token_admin = crear("admin@test.local", "admin")
        _, token_juez = crear("juez@test.local", "juez")

        yield app, token_super, token_admin, token_juez

        mantenimiento.invalidar_cache()
        db.session.remove()
        db.drop_all()


def _activar(app, token, mensaje=None):
    return app.test_client().put(
        "/api/mantenimiento",
        headers={"Authorization": f"Bearer {token}"},
        json={"activo": True, "mensaje": mensaje},
    )


def test_estado_publico_sin_sesion(app_con_usuarios):
    app, *_ = app_con_usuarios
    resp = app.test_client().get("/api/mantenimiento")
    assert resp.status_code == 200
    assert resp.get_json() == {
        "activo": False, "mensaje": None, "desde": None, "exento": False,
    }


def test_solo_el_superadmin_lo_enciende(app_con_usuarios):
    app, token_super, token_admin, token_juez = app_con_usuarios

    # Un admin normal ni siquiera se entera de que el interruptor existe.
    assert _activar(app, token_admin).status_code == 404
    assert _activar(app, token_juez).status_code == 404
    assert app.test_client().put("/api/mantenimiento", json={"activo": True}).status_code == 401

    resp = _activar(app, token_super, "Volvemos en 10 minutos")
    assert resp.status_code == 200
    assert resp.get_json()["activo"] is True
    assert resp.get_json()["mensaje"] == "Volvemos en 10 minutos"
    assert resp.get_json()["desde"] is not None


def test_con_mantenimiento_la_api_responde_503(app_con_usuarios):
    app, token_super, token_admin, token_juez = app_con_usuarios
    _activar(app, token_super, "Actualizando")

    for token in (token_admin, token_juez):
        resp = app.test_client().get(
            "/api/campeonatos", headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 503
        cuerpo = resp.get_json()
        assert cuerpo["mantenimiento"] is True
        # El aviso del superadmin es lo que ve el usuario, no un texto genérico.
        assert cuerpo["error"] == "Actualizando"
        assert resp.headers["Retry-After"] == "60"

    # Y las pantallas públicas tampoco: son parte de "la aplicación".
    assert app.test_client().get("/api/campeonatos/publico").status_code == 503


def test_el_superadmin_sigue_entrando(app_con_usuarios):
    app, token_super, *_ = app_con_usuarios
    _activar(app, token_super)

    resp = app.test_client().get(
        "/api/campeonatos", headers={"Authorization": f"Bearer {token_super}"}
    )
    assert resp.status_code == 200

    estado = app.test_client().get(
        "/api/mantenimiento", headers={"Authorization": f"Bearer {token_super}"}
    ).get_json()
    assert estado["activo"] is True
    assert estado["exento"] is True


def test_el_login_sigue_abierto(app_con_usuarios):
    """O el superadmin no podría entrar a apagar lo que él mismo encendió."""
    app, token_super, *_ = app_con_usuarios
    _activar(app, token_super)

    resp = app.test_client().post(
        "/api/auth/login",
        json={"email": "super@test.local", "password": "secret123"},
    )
    assert resp.status_code == 200


def test_apagarlo_reabre_la_aplicacion(app_con_usuarios):
    app, token_super, *_ = app_con_usuarios
    _activar(app, token_super)

    resp = app.test_client().put(
        "/api/mantenimiento",
        headers={"Authorization": f"Bearer {token_super}"},
        json={"activo": False},
    )
    assert resp.status_code == 200
    assert resp.get_json()["activo"] is False
    assert resp.get_json()["desde"] is None

    assert app.test_client().get("/api/campeonatos/publico").status_code == 200


def test_reactivarlo_no_reinicia_el_reloj(app_con_usuarios):
    app, token_super, *_ = app_con_usuarios
    desde = _activar(app, token_super).get_json()["desde"]
    # Segunda pasada (p. ej. para cambiar el aviso): sigue contando desde la
    # primera, que es lo que el usuario ve en pantalla.
    assert _activar(app, token_super, "Otro aviso").get_json()["desde"] == desde
