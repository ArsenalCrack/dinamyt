"""
Sesión por cookie httpOnly y su defensa de CSRF.

El token ya no vive en localStorage, así que lo que hay que garantizar es:
que la cookie autentica, que no es legible desde JavaScript, y que una web
ajena no puede aprovecharla para escribir.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402

from app import create_app  # noqa: E402
from app.config import DevelopmentConfig  # noqa: E402
from app.extensions import db  # noqa: E402
from app.models.usuario import Usuario  # noqa: E402

DevelopmentConfig.SQLALCHEMY_DATABASE_URI = "sqlite://"

PASSWORD = "secret123"
EMAIL = "admin@test.local"


@pytest.fixture()
def cliente():
    app = create_app("development")
    with app.app_context():
        db.create_all()
        admin = Usuario(
            email=EMAIL, nombre="Admin", rol="admin", es_superadmin=True, activo=True
        )
        admin.set_password(PASSWORD)
        db.session.add(admin)
        db.session.commit()
        yield app.test_client()
        db.session.remove()
        db.drop_all()


def entrar(cliente):
    return cliente.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD})


def cookie(respuesta, nombre):
    """Cabecera Set-Cookie de `nombre`, o None."""
    for cabecera, valor in respuesta.headers:
        if cabecera == "Set-Cookie" and valor.startswith(f"{nombre}="):
            return valor
    return None


def test_login_entrega_la_sesion_en_cookie_httponly(cliente):
    res = entrar(cliente)
    assert res.status_code == 200

    sesion = cookie(res, "dinamyt_session")
    assert sesion is not None
    # Lo que impide que un XSS se lleve la sesión.
    assert "HttpOnly" in sesion


def test_la_cookie_de_csrf_si_es_legible(cliente):
    res = entrar(cliente)
    csrf = cookie(res, "csrf_access_token")
    assert csrf is not None
    # El cliente tiene que poder copiarla a la cabecera: si fuera httpOnly,
    # el doble envío sería imposible.
    assert "HttpOnly" not in csrf


def test_la_cookie_sola_autentica_una_lectura(cliente):
    entrar(cliente)
    # El cliente de test conserva las cookies: no se manda Authorization.
    res = cliente.get("/api/auth/me")
    assert res.status_code == 200
    assert res.get_json()["email"] == EMAIL


def test_escritura_por_cookie_sin_csrf_se_rechaza(cliente):
    entrar(cliente)
    # Esto es lo que consigue montar una web ajena: el navegador manda la
    # cookie, pero el atacante no puede leer la de CSRF para copiarla.
    res = cliente.post(
        "/api/auth/register",
        json={"email": "nuevo@test.local", "password": "otra1234", "nombre": "X", "rol": "juez"},
    )
    assert res.status_code == 401


def test_escritura_por_cookie_con_csrf_correcto_pasa(cliente):
    res_login = entrar(cliente)
    csrf = cliente.get_cookie("csrf_access_token")
    assert csrf is not None

    res = cliente.post(
        "/api/auth/register",
        json={
            "email": "nuevo@test.local",
            "password": "otra1234",
            "nombre": "Juez Nuevo",
            "rol": "juez",
        },
        headers={"X-CSRF-TOKEN": csrf.value},
    )
    assert res.status_code == 201, res.get_data(as_text=True)
    assert res_login.status_code == 200


def test_con_cabecera_authorization_no_se_exige_csrf(cliente):
    token = entrar(cliente).get_json()["token"]
    # Sin cookies: el navegador nunca pone Authorization sola en una petición
    # de otro sitio, así que ahí no hay CSRF que valga.
    cliente.delete_cookie("dinamyt_session")
    cliente.delete_cookie("csrf_access_token")

    res = cliente.post(
        "/api/auth/register",
        json={
            "email": "otro@test.local",
            "password": "otra1234",
            "nombre": "Juez Cabecera",
            "rol": "juez",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 201, res.get_data(as_text=True)


def test_logout_borra_la_cookie_y_corta_el_acceso(cliente):
    entrar(cliente)
    csrf = cliente.get_cookie("csrf_access_token")

    res = cliente.post("/api/auth/logout", headers={"X-CSRF-TOKEN": csrf.value})
    assert res.status_code == 200

    # Ya sin sesión: la lectura que antes pasaba ahora no.
    assert cliente.get("/api/auth/me").status_code == 401


def test_socket_ticket_requiere_sesion_y_devuelve_un_token(cliente):
    assert cliente.post("/api/auth/socket-ticket").status_code == 401

    entrar(cliente)
    csrf = cliente.get_cookie("csrf_access_token")
    res = cliente.post("/api/auth/socket-ticket", headers={"X-CSRF-TOKEN": csrf.value})
    assert res.status_code == 200
    assert res.get_json()["ticket"]
