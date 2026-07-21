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
    assert user["club"] == "Club Test"
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
