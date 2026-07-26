"""Tests del ajuste de tatamis de un campeonato en preparación."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402

from app import create_app  # noqa: E402
from app.config import DevelopmentConfig  # noqa: E402
from app.extensions import db  # noqa: E402

DevelopmentConfig.SQLALCHEMY_DATABASE_URI = "sqlite://"


@pytest.fixture()
def entorno():
    """(app, token del admin, id del campeonato con 3 tatamis)."""
    app = create_app("development")
    with app.app_context():
        db.create_all()

        from flask_jwt_extended import create_access_token
        from app.models.campeonato import Campeonato
        from app.models.tatami import Tatami
        from app.models.usuario import Usuario

        admin = Usuario(
            email="admin@test.local", nombre="Admin", rol="admin",
            es_superadmin=True, activo=True,
        )
        admin.set_password("secret123")
        db.session.add(admin)
        db.session.commit()

        camp = Campeonato(nombre="Copa Test", estado="preparacion",
                          activo=True, created_by=admin.id)
        db.session.add(camp)
        db.session.flush()
        for numero in (1, 2, 3):
            db.session.add(Tatami(campeonato_id=camp.id, numero=numero, activo=True))
        db.session.commit()

        token = create_access_token(
            identity=str(admin.id),
            additional_claims={"rol": "admin", "nombre": admin.nombre,
                               "email": admin.email},
        )
        yield app, token, camp.id
        db.session.remove()
        db.drop_all()


def _ajustar(app, token, camp_id, n):
    return app.test_client().put(
        f"/api/campeonatos/{camp_id}/tatamis",
        headers={"Authorization": f"Bearer {token}"},
        json={"num_tatamis": n},
    )


# Los tests preparan datos con la sesión que el fixture dejó activa. Anidar un
# `app.app_context()` aquí sería una trampa: la petición del test_client reutiliza
# el contexto ya montado, así que leería la caché de ESTA sesión, no la del
# contexto anidado, y no vería los cambios hechos allí.


def test_subir_crea_los_que_faltan(entorno):
    app, token, camp_id = entorno
    resp = _ajustar(app, token, camp_id, 6)

    assert resp.status_code == 200
    data = resp.get_json()
    assert data["num_tatamis"] == 6
    assert data["creados"] == [4, 5, 6]
    assert data["eliminados"] == []
    assert [t["numero"] for t in data["campeonato"]["tatamis"]] == [1, 2, 3, 4, 5, 6]


def test_bajar_borra_los_de_numero_mas_alto(entorno):
    app, token, camp_id = entorno
    resp = _ajustar(app, token, camp_id, 2)

    assert resp.status_code == 200
    data = resp.get_json()
    assert data["eliminados"] == [3]
    assert sorted(t["numero"] for t in data["campeonato"]["tatamis"]) == [1, 2]


def test_bajar_libera_los_jueces_asignados(entorno):
    app, token, camp_id = entorno
    from app.models.asignacion import AsignacionJuez
    from app.models.tatami import Tatami
    from app.models.usuario import Usuario

    juez = Usuario(email="juez@test.local", nombre="Juez", rol="juez", activo=True)
    juez.set_password("secret123")
    db.session.add(juez)
    tercero = Tatami.query.filter_by(campeonato_id=camp_id, numero=3).first()
    db.session.flush()
    db.session.add(AsignacionJuez(
        usuario_id=juez.id, tatami_id=tercero.id, rol_tatami="arbitro",
    ))
    db.session.commit()

    resp = _ajustar(app, token, camp_id, 2)

    assert resp.status_code == 200
    assert resp.get_json()["jueces_liberados"] == 1
    assert AsignacionJuez.query.count() == 0


def test_bajar_se_niega_si_el_tatami_tiene_llaves(entorno):
    app, token, camp_id = entorno
    from app.models.llave import Llave
    from app.models.tatami import Tatami

    tercero = Tatami.query.filter_by(campeonato_id=camp_id, numero=3).first()
    db.session.add(Llave(
        campeonato_id=camp_id, tatami_id=tercero.id, tipo="combate",
        nombre="INFANTIL", estado="pendiente", estructura={"competidores": []},
    ))
    db.session.commit()

    resp = _ajustar(app, token, camp_id, 2)

    assert resp.status_code == 409
    assert "Tatami 3" in resp.get_json()["error"]
    assert Tatami.query.filter_by(campeonato_id=camp_id).count() == 3


def test_solo_en_preparacion(entorno):
    app, token, camp_id = entorno
    from app.models.campeonato import Campeonato

    db.session.get(Campeonato, camp_id).estado = "en_curso"
    db.session.commit()

    resp = _ajustar(app, token, camp_id, 5)

    assert resp.status_code == 409
    assert "preparación" in resp.get_json()["error"]


def test_fuera_de_rango(entorno):
    app, token, camp_id = entorno
    assert _ajustar(app, token, camp_id, 0).status_code == 400
    assert _ajustar(app, token, camp_id, 11).status_code == 400


def test_admin_ajeno_no_ve_el_campeonato(entorno):
    app, token, camp_id = entorno
    from flask_jwt_extended import create_access_token
    from app.models.usuario import Usuario

    otro = Usuario(email="otro@test.local", nombre="Otro Admin", rol="admin",
                   es_superadmin=False, activo=True)
    otro.set_password("secret123")
    db.session.add(otro)
    db.session.commit()
    token_otro = create_access_token(
        identity=str(otro.id),
        additional_claims={"rol": "admin", "nombre": otro.nombre,
                           "email": otro.email},
    )

    resp = _ajustar(app, token_otro, camp_id, 5)

    assert resp.status_code == 404
