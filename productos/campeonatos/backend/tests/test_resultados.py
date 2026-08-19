"""
Test: API pública de resultados (sin login).
Verifica que exponga podios de llaves y rankings de figuras, y que oculte
los campeonatos inactivos.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402

from app import create_app  # noqa: E402
from app.config import DevelopmentConfig  # noqa: E402
from app.extensions import db  # noqa: E402

DevelopmentConfig.SQLALCHEMY_DATABASE_URI = "sqlite://"


@pytest.fixture()
def app():
    app = create_app("development")
    with app.app_context():
        db.create_all()
        from app.seeds.seed_categorias import seed_categorias
        seed_categorias()
        yield app
        db.session.remove()
        db.drop_all()


def _campeonato_con_llave_terminada(activo=True):
    """Crea un campeonato con una llave de combate ya con campeón definido."""
    from app.models.campeonato import Campeonato
    from app.models.tatami import Tatami
    from app.models.llave import Llave
    from app.api.llaves import (
        generar_estructura, siguiente_partido, registrar_resultado,
    )

    camp = Campeonato(nombre="Copa Test", activo=activo)
    db.session.add(camp)
    db.session.flush()
    tatami = Tatami(campeonato_id=camp.id, numero=1)
    db.session.add(tatami)
    db.session.flush()

    est = generar_estructura([{"nombre": "Ana"}, {"nombre": "Luis"}, {"nombre": "Mia"}])
    # Jugar todos los partidos hasta que haya campeón (siempre gana el lado 1)
    while True:
        sig = siguiente_partido(est)
        if sig is None:
            break
        r, p, _ = sig
        registrar_resultado(est, r, p, 1)
    llave = Llave(
        campeonato_id=camp.id, tatami_id=tatami.id, tipo="combate",
        nombre="COMBATE -60KG", estado="terminada", estructura=est,
    )
    db.session.add(llave)
    db.session.commit()
    return camp.id


def test_resultados_publicos_muestran_podio(app):
    with app.app_context():
        camp_id = _campeonato_con_llave_terminada(activo=True)

    cliente = app.test_client()
    # SIN token de autenticación (acceso público)
    resp = cliente.get(f"/api/resultados/campeonato/{camp_id}")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["campeonato"]["nombre"] == "Copa Test"
    combate = next((r for r in data["resultados"] if r["tipo"] == "combate"), None)
    assert combate is not None, "debe aparecer el podio de la llave"
    assert combate["podio"][0]["puesto"] == 1
    # Los participantes se exponen para poder buscar por nombre
    assert "Ana" in combate["participantes"]
    assert "COMBATE -60KG" in data["categorias"]


def test_resultados_ocultan_campeonato_inactivo(app):
    with app.app_context():
        camp_id = _campeonato_con_llave_terminada(activo=False)

    cliente = app.test_client()
    resp = cliente.get(f"/api/resultados/campeonato/{camp_id}")
    assert resp.status_code == 404


def test_listar_campeonatos_publicos_con_resultados(app):
    with app.app_context():
        _campeonato_con_llave_terminada(activo=True)

    cliente = app.test_client()
    resp = cliente.get("/api/resultados/campeonatos")
    assert resp.status_code == 200
    data = resp.get_json()
    assert len(data) == 1
    assert data[0]["num_resultados"] >= 1
