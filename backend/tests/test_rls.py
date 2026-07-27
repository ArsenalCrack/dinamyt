"""
RLS: red de seguridad por workspace.

Lo que se protege aquí no es tanto que las políticas se creen —eso solo pasa
con PostgreSQL— como que **intentar crearlas nunca tumbe el arranque**. Un
despliegue real murió con `status 1` porque el rol de Neon no era dueño de las
tablas y el `ALTER TABLE` subía la excepción hasta gunicorn: la aplicación
entera caída por una defensa que es opcional.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402

from app import create_app  # noqa: E402
from app.config import DevelopmentConfig  # noqa: E402
from app.extensions import db  # noqa: E402
from app import rls  # noqa: E402

DevelopmentConfig.SQLALCHEMY_DATABASE_URI = "sqlite://"


@pytest.fixture()
def app():
    aplicacion = create_app("development")
    with aplicacion.app_context():
        db.create_all()
        yield aplicacion
        db.session.remove()
        db.drop_all()


def test_en_sqlite_no_aplica_y_no_revienta(app):
    # SQLite no tiene RLS: se reconoce y se sale sin tocar nada.
    assert rls.ensure_rls() is None


def test_si_el_ddl_falla_lo_reporta_en_vez_de_propagar(app, monkeypatch):
    # Se le hace creer que hay PostgreSQL para que ejecute el DDL de verdad.
    # Contra SQLite todas las sentencias fallan, que es justo el escenario del
    # despliegue roto: el motor las rechaza y ensure_rls tiene que aguantarlo.
    monkeypatch.setattr(rls, "_es_postgres", lambda: True)

    aplicadas, fallos = rls.ensure_rls()

    assert aplicadas == 0
    assert fallos, "los fallos deben devolverse, no lanzarse"
    # Cada fallo llega como (sentencia, error) para poder mostrarlo en el log.
    sentencia, error = fallos[0]
    assert isinstance(sentencia, str) and isinstance(error, str)


def test_un_fallo_no_impide_intentar_el_resto(app, monkeypatch):
    monkeypatch.setattr(rls, "_es_postgres", lambda: True)

    _, fallos = rls.ensure_rls()

    # Si la primera excepción cortara el bucle solo habría un fallo. Se recorren
    # todas para que en un Postgres a medio permisos se aplique lo que se pueda.
    assert len(fallos) == len(rls._sentencias())


def test_el_contexto_de_usuario_no_filtra_por_workspace_a_jueces(app):
    """Un juez arbitra campeonatos de otro workspace: no se le puede filtrar."""
    from app.models.usuario import Usuario

    juez = Usuario(email="j@t.local", nombre="Juez", rol="juez", activo=True)
    workspace_id, acceso_total = rls.contexto_de_usuario(juez)
    assert acceso_total is True
    assert workspace_id is None


def test_el_contexto_de_un_admin_se_limita_a_su_workspace(app):
    from app.models.usuario import Usuario

    admin = Usuario(email="a@t.local", nombre="Admin", rol="admin", activo=True)
    admin.id = 7
    workspace_id, acceso_total = rls.contexto_de_usuario(admin)
    assert acceso_total is False
    assert workspace_id == 7
