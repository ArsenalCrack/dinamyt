"""
Un maestro con VARIOS dojangs, y un dojang con VARIOS maestros.

Lo segundo siempre funcionó de hecho (nunca hubo unicidad sobre el nombre del
club), pero no había forma de comprobarlo ni nada que lo protegiera. Lo primero
no cabía: `usuarios.club` era una sola columna de texto, así que al admin no le
quedaba más remedio que abrir una segunda cuenta para el mismo maestro.

Ver `clubes` en `app/models/usuario.py` y `_club_del_maestro` en
`app/api/competidores.py`.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402

from app import create_app  # noqa: E402
from app.config import DevelopmentConfig  # noqa: E402
from app.extensions import db  # noqa: E402

DevelopmentConfig.SQLALCHEMY_DATABASE_URI = "sqlite://"


def _token(user):
    from flask_jwt_extended import create_access_token

    return create_access_token(
        identity=str(user.id),
        additional_claims={"rol": user.rol, "nombre": user.nombre, "email": user.email},
    )


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def entorno():
    """App con un admin, su campeonato en preparación y un cliente."""
    app = create_app("development")
    with app.app_context():
        db.create_all()
        from app.models.campeonato import Campeonato
        from app.models.usuario import Usuario

        admin = Usuario(email="admin@test.local", nombre="ADMIN", rol="admin",
                        es_superadmin=True, activo=True)
        admin.set_password("secret123")
        db.session.add(admin)
        db.session.commit()

        camp = Campeonato(nombre="COPA", estado="preparacion", activo=True,
                          created_by=admin.id)
        db.session.add(camp)
        db.session.commit()

        yield app, _token(admin), camp.id
        db.session.remove()
        db.drop_all()


def _crear_maestro(cliente, token, email, clubes, **extra):
    return cliente.post(
        "/api/auth/register",
        headers=_auth(token),
        json={
            "email": email, "password": "secret123", "nombre": "MAESTRO PRUEBA",
            "rol": "maestro", "clubes": clubes, **extra,
        },
    )


class TestVariosClubesPorMaestro:
    def test_se_crea_con_varios_dojangs(self, entorno):
        app, token, _ = entorno
        resp = _crear_maestro(app.test_client(), token, "m1@test.local",
                              ["Dojang Sur", "Dojang Norte"])

        assert resp.status_code == 201
        user = resp.get_json()["user"]
        assert user["clubes"] == ["DOJANG SUR", "DOJANG NORTE"]
        # `club` sigue viajando: es el principal, o sea el primero. Lo leen los
        # paquetes de sincronización y el "solicitado por" de una inscripción.
        assert user["club"] == "DOJANG SUR"

    def test_el_club_suelto_de_siempre_sigue_valiendo(self, entorno):
        """Un cliente sin actualizar (o el importador) manda `club`, no `clubes`."""
        app, token, _ = entorno
        resp = app.test_client().post(
            "/api/auth/register",
            headers=_auth(token),
            json={"email": "m2@test.local", "password": "secret123",
                  "nombre": "MAESTRO DOS", "rol": "maestro", "club": "Dojang Único"},
        )

        assert resp.status_code == 201
        assert resp.get_json()["user"]["clubes"] == ["DOJANG ÚNICO"]

    def test_no_se_repite_el_mismo_dojang(self, entorno):
        app, token, _ = entorno
        resp = _crear_maestro(app.test_client(), token, "m3@test.local",
                              ["Dojang Sur", "DOJANG SUR", "  dojang sur  "])

        assert resp.status_code == 201
        assert resp.get_json()["user"]["clubes"] == ["DOJANG SUR"]

    def test_un_maestro_sigue_necesitando_al_menos_uno(self, entorno):
        app, token, _ = entorno
        resp = _crear_maestro(app.test_client(), token, "m4@test.local", [])

        assert resp.status_code == 400
        assert "club" in resp.get_json()["error"].lower()

    def test_editar_reemplaza_la_lista_y_el_principal(self, entorno):
        app, token, _ = entorno
        cliente = app.test_client()
        creado = _crear_maestro(cliente, token, "m5@test.local",
                                ["Dojang Sur", "Dojang Norte"]).get_json()["user"]

        resp = cliente.put(
            f"/api/auth/users/{creado['id']}",
            headers=_auth(token),
            json={"clubes": ["Dojang Norte", "Dojang Este"]},
        )

        assert resp.status_code == 200
        user = resp.get_json()["user"]
        assert user["clubes"] == ["DOJANG NORTE", "DOJANG ESTE"]
        assert user["club"] == "DOJANG NORTE"

    def test_dejar_de_ser_maestro_le_quita_los_clubes(self, entorno):
        app, token, _ = entorno
        cliente = app.test_client()
        creado = _crear_maestro(cliente, token, "m6@test.local",
                                ["Dojang Sur", "Dojang Norte"]).get_json()["user"]

        resp = cliente.put(f"/api/auth/users/{creado['id']}",
                           headers=_auth(token), json={"rol": "juez"})

        assert resp.status_code == 200
        user = resp.get_json()["user"]
        assert user["clubes"] == []
        assert user["club"] is None


class TestVariosMaestrosPorClub:
    def test_dos_maestros_pueden_compartir_dojang(self, entorno):
        app, token, _ = entorno
        cliente = app.test_client()
        uno = _crear_maestro(cliente, token, "a@test.local", ["Dojang Centro"])
        dos = _crear_maestro(cliente, token, "b@test.local",
                             ["Dojang Centro", "Dojang Alto"])

        assert uno.status_code == 201
        assert dos.status_code == 201
        assert uno.get_json()["user"]["club"] == "DOJANG CENTRO"
        assert dos.get_json()["user"]["club"] == "DOJANG CENTRO"

    def test_el_catalogo_de_clubes_los_junta_sin_repetir(self, entorno):
        """`/auth/clubes` alimenta el desplegable de club del admin."""
        app, token, _ = entorno
        cliente = app.test_client()
        _crear_maestro(cliente, token, "c@test.local", ["Dojang Centro"])
        _crear_maestro(cliente, token, "d@test.local",
                       ["Dojang Centro", "Dojang Alto"])

        resp = cliente.get("/api/auth/clubes", headers=_auth(token))

        assert resp.status_code == 200
        # Los dos dojangs del segundo maestro, y el compartido una sola vez.
        assert resp.get_json() == ["DOJANG ALTO", "DOJANG CENTRO"]


class TestInscribirEligiendoDojang:
    """Al inscribir, el alumno va a UNO de los dojangs de su maestro."""

    def _maestro_con_dos(self, app, token):
        cliente = app.test_client()
        creado = _crear_maestro(cliente, token, "insc@test.local",
                                ["Dojang Sur", "Dojang Norte"]).get_json()["user"]
        from app.models.usuario import Usuario
        return _token(Usuario.query.get(creado["id"]))

    def _inscribir(self, cliente, token_maestro, camp_id, club=None):
        competidor = {"nombre_completo": "ALUMNO DE PRUEBA", "genero": "M"}
        if club is not None:
            competidor["club"] = club
        return cliente.post(
            f"/api/inscripciones/maestro/campeonato/{camp_id}",
            headers=_auth(token_maestro),
            json={"competidor": competidor, "modalidades": ["COMBATE"]},
        )

    def test_elige_cual_de_sus_dojangs(self, entorno):
        app, token, camp_id = entorno
        cliente = app.test_client()
        tk = self._maestro_con_dos(app, token)

        resp = self._inscribir(cliente, tk, camp_id, club="Dojang Norte")

        assert resp.status_code == 201
        # En mayúsculas y tal y como está guardado en su lista: si no, los
        # reportes agruparían "Dojang Norte" y "DOJANG NORTE" por separado.
        assert resp.get_json()["inscripcion"]["competidor"]["club"] == "DOJANG NORTE"

    def test_sin_indicarlo_va_al_principal(self, entorno):
        app, token, camp_id = entorno
        cliente = app.test_client()
        tk = self._maestro_con_dos(app, token)

        resp = self._inscribir(cliente, tk, camp_id)

        assert resp.status_code == 201
        assert resp.get_json()["inscripcion"]["competidor"]["club"] == "DOJANG SUR"

    def test_no_puede_inscribir_a_nombre_de_un_club_ajeno(self, entorno):
        """Lo que impide que el club del alumno sea texto libre del cliente."""
        app, token, camp_id = entorno
        cliente = app.test_client()
        tk = self._maestro_con_dos(app, token)

        resp = self._inscribir(cliente, tk, camp_id, club="Dojang De Otro")

        assert resp.status_code == 400
        assert "no es uno de los tuyos" in resp.get_json()["error"]
