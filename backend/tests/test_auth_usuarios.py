"""Tests de gestión de usuarios: rol maestro y compatibilidad de esquema."""

import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402

from app import create_app  # noqa: E402
from app.config import DevelopmentConfig  # noqa: E402
from app.extensions import db  # noqa: E402

DevelopmentConfig.SQLALCHEMY_DATABASE_URI = "sqlite://"


@pytest.fixture()
def app_con_admin():
    app = create_app("development")
    with app.app_context():
        db.create_all()

        from flask_jwt_extended import create_access_token
        from app.models.usuario import Usuario

        admin = Usuario(
            email="admin@test.local",
            nombre="Admin",
            rol="admin",
            es_superadmin=True,
            activo=True,
        )
        admin.set_password("secret123")
        db.session.add(admin)
        db.session.commit()
        token = create_access_token(
            identity=str(admin.id),
            additional_claims={"rol": "admin", "nombre": admin.nombre, "email": admin.email},
        )

        yield app, token
        db.session.remove()
        db.drop_all()


def test_crear_maestro_con_permiso_de_juez(app_con_admin):
    app, token = app_con_admin
    resp = app.test_client().post(
        "/api/auth/register",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "email": "maestro@test.local",
            "password": "secret123",
            "nombre": "Maestro Test",
            "rol": "maestro",
            "club": "Club Test",
            "puede_juzgar": True,
        },
    )

    assert resp.status_code == 201
    user = resp.get_json()["user"]
    assert user["rol"] == "maestro"
    # Los nombres (de persona y de club) se guardan en mayúsculas.
    assert user["nombre"] == "MAESTRO TEST"
    assert user["club"] == "CLUB TEST"
    assert user["puede_juzgar"] is True


def test_crear_maestro_requiere_club(app_con_admin):
    app, token = app_con_admin
    resp = app.test_client().post(
        "/api/auth/register",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "email": "maestro-sin-club@test.local",
            "password": "secret123",
            "nombre": "Maestro Sin Club",
            "rol": "maestro",
            "puede_juzgar": True,
        },
    )

    assert resp.status_code == 400
    assert resp.get_json()["error"] == "El club es obligatorio para un maestro"


def test_editar_usuario_tambien_sube_a_mayusculas(app_con_admin):
    """Corregir un dedazo no puede reintroducir minúsculas en la lista."""
    app, token = app_con_admin
    cliente = app.test_client()
    cabeceras = {"Authorization": f"Bearer {token}"}

    creado = cliente.post(
        "/api/auth/register",
        headers=cabeceras,
        json={
            "email": "maestro-edit@test.local",
            "password": "secret123",
            "nombre": "maestro edit",
            "rol": "maestro",
            "club": "club edit",
        },
    ).get_json()["user"]

    resp = cliente.put(
        f"/api/auth/users/{creado['id']}",
        headers=cabeceras,
        json={"nombre": "josé maría ñuñez", "club": "águilas del norte"},
    )

    assert resp.status_code == 200
    user = resp.get_json()["user"]
    # Las tildes y la eñe sobreviven: son parte del nombre de la persona.
    assert user["nombre"] == "JOSÉ MARÍA ÑUÑEZ"
    assert user["club"] == "ÁGUILAS DEL NORTE"


def test_normalizar_mayusculas_arregla_lo_ya_guardado(app_con_admin):
    """Los usuarios creados antes de la regla se normalizan al arrancar."""
    from app.models.usuario import Usuario
    from app.schema_compat import _normalizar_mayusculas

    app, _ = app_con_admin
    viejo = Usuario(
        email="viejo@test.local", nombre="josé pérez", rol="maestro",
        club="club viejo", activo=True,
    )
    viejo.set_password("secret123")
    db.session.add(viejo)
    db.session.commit()

    tocados = _normalizar_mayusculas({"usuarios", "competidores", "asignaciones_juez"})

    db.session.refresh(viejo)
    assert viejo.nombre == "JOSÉ PÉREZ"
    assert viejo.club == "CLUB VIEJO"
    assert tocados >= 1
    # Idempotente: en el siguiente arranque no vuelve a escribir nada.
    assert _normalizar_mayusculas({"usuarios", "competidores", "asignaciones_juez"}) == 0


def test_schema_compat_ensancha_rol_viejo_en_postgres(monkeypatch):
    from app import schema_compat

    ejecutadas = []
    commits = []

    class FakeSession:
        def execute(self, stmt):
            ejecutadas.append(str(stmt))

        def commit(self):
            commits.append(True)

    fake_db = SimpleNamespace(
        engine=SimpleNamespace(dialect=SimpleNamespace(name="postgresql")),
        session=FakeSession(),
    )
    fake_inspector = SimpleNamespace(
        get_columns=lambda table: [
            {"name": "id", "type": SimpleNamespace()},
            {"name": "rol", "type": SimpleNamespace(length=5)},
        ]
    )

    monkeypatch.setattr(schema_compat, "db", fake_db)

    schema_compat._ensure_usuarios_rol_width(fake_inspector, {"usuarios"})

    assert ejecutadas == [
        "ALTER TABLE usuarios ALTER COLUMN rol TYPE VARCHAR(20) USING rol::text"
    ]
    assert commits == [True]


def test_schema_compat_convierte_enum_viejo_en_postgres(monkeypatch):
    from app import schema_compat

    ejecutadas = []

    class FakeSession:
        def execute(self, stmt):
            ejecutadas.append(str(stmt))

        def commit(self):
            pass

    fake_db = SimpleNamespace(
        engine=SimpleNamespace(dialect=SimpleNamespace(name="postgresql")),
        session=FakeSession(),
    )
    fake_inspector = SimpleNamespace(
        get_columns=lambda table: [
            {"name": "rol", "type": SimpleNamespace(length=None, enums=["admin", "juez"])},
        ]
    )

    monkeypatch.setattr(schema_compat, "db", fake_db)

    schema_compat._ensure_usuarios_rol_width(fake_inspector, {"usuarios"})

    assert ejecutadas == [
        "ALTER TABLE usuarios ALTER COLUMN rol TYPE VARCHAR(20) USING rol::text"
    ]
