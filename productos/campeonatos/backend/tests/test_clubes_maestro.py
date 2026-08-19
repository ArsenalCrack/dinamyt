"""
Un maestro con VARIOS dojangs —cada uno en su ciudad— y un dojang con VARIOS
maestros.

Lo de varios maestros por club siempre funcionó de hecho (nunca hubo unicidad
sobre el nombre), pero no había nada que lo protegiera. Lo otro no cabía:
`usuarios.club` era una sola columna de texto y `usuarios.delegacion` otra, así
que un maestro con un dojang en Cali y otro en Popayán obligaba a elegir cuál
de las dos ciudades mentir — o a abrirle una segunda cuenta.

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


def _nombres(user):
    """Solo los nombres de los dojangs, para las pruebas que no miran ciudad."""
    return [c["nombre"] for c in user["clubes"]]


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
        assert _nombres(user) == ["DOJANG SUR", "DOJANG NORTE"]
        # `club` sigue viajando: es el principal, o sea el primero. Lo leen los
        # paquetes de sincronización y las instalaciones sin actualizar.
        assert user["club"] == "DOJANG SUR"

    def test_cada_dojang_lleva_su_propia_delegacion(self, entorno):
        """El motivo de todo esto: no están en la misma ciudad."""
        app, token, _ = entorno
        resp = app.test_client().post(
            "/api/auth/register",
            headers=_auth(token),
            json={
                "email": "geo@test.local", "password": "secret123",
                "nombre": "MAESTRO GEO", "rol": "maestro",
                "clubes": [
                    {"nombre": "Dojang Sur", "ciudad": "Cali", "pais": "Colombia"},
                    {"nombre": "Dojang Norte", "ciudad": "Popayán", "pais": "Colombia"},
                ],
            },
        )

        assert resp.status_code == 201
        user = resp.get_json()["user"]
        assert user["clubes"] == [
            {"nombre": "DOJANG SUR", "ciudad": "Cali", "pais": "Colombia"},
            {"nombre": "DOJANG NORTE", "ciudad": "Popayán", "pais": "Colombia"},
        ]
        # La delegación suelta del usuario es la del principal: es lo que leen
        # los paquetes viejos y lo que se enseñaba hasta ahora.
        assert user["delegacion"] == "Cali"
        assert user["pais_delegacion"] == "Colombia"

    def test_el_pais_se_deduce_de_la_ciudad_del_catalogo(self, entorno):
        """Un cliente que manda la ciudad sin país no deja el dojang a medias."""
        app, token, _ = entorno
        resp = app.test_client().post(
            "/api/auth/register",
            headers=_auth(token),
            json={
                "email": "geo2@test.local", "password": "secret123",
                "nombre": "MAESTRO GEO DOS", "rol": "maestro",
                "clubes": [{"nombre": "Dojang Andino", "ciudad": "Maracaibo"}],
            },
        )

        assert resp.status_code == 201
        assert resp.get_json()["user"]["clubes"][0]["pais"] == "Venezuela"

    def test_el_club_suelto_de_siempre_sigue_valiendo(self, entorno):
        """Un cliente sin actualizar (o el importador) manda `club`, no `clubes`.

        Con la delegación al nivel del usuario, que era donde vivía: se dobla
        dentro del único dojang para no perderla.
        """
        app, token, _ = entorno
        resp = app.test_client().post(
            "/api/auth/register",
            headers=_auth(token),
            json={"email": "m2@test.local", "password": "secret123",
                  "nombre": "MAESTRO DOS", "rol": "maestro", "club": "Dojang Único",
                  "delegacion": "Medellín", "pais_delegacion": "Colombia"},
        )

        assert resp.status_code == 201
        assert resp.get_json()["user"]["clubes"] == [
            {"nombre": "DOJANG ÚNICO", "ciudad": "Medellín", "pais": "Colombia"},
        ]

    def test_no_se_repite_el_mismo_dojang(self, entorno):
        app, token, _ = entorno
        resp = _crear_maestro(app.test_client(), token, "m3@test.local",
                              ["Dojang Sur", "DOJANG SUR", "  dojang sur  "])

        assert resp.status_code == 201
        assert _nombres(resp.get_json()["user"]) == ["DOJANG SUR"]

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
        assert _nombres(user) == ["DOJANG NORTE", "DOJANG ESTE"]
        assert user["club"] == "DOJANG NORTE"

    def test_reordenar_cambia_la_delegacion_principal(self, entorno):
        """El principal manda: `delegacion` es la SUYA, no una fija del maestro."""
        app, token, _ = entorno
        cliente = app.test_client()
        creado = cliente.post(
            "/api/auth/register",
            headers=_auth(token),
            json={
                "email": "orden@test.local", "password": "secret123",
                "nombre": "MAESTRO ORDEN", "rol": "maestro",
                "clubes": [
                    {"nombre": "Dojang Sur", "ciudad": "Cali", "pais": "Colombia"},
                    {"nombre": "Dojang Norte", "ciudad": "Popayán", "pais": "Colombia"},
                ],
            },
        ).get_json()["user"]
        assert creado["delegacion"] == "Cali"

        resp = cliente.put(
            f"/api/auth/users/{creado['id']}",
            headers=_auth(token),
            json={"clubes": [
                {"nombre": "Dojang Norte", "ciudad": "Popayán", "pais": "Colombia"},
                {"nombre": "Dojang Sur", "ciudad": "Cali", "pais": "Colombia"},
            ]},
        )

        assert resp.status_code == 200
        assert resp.get_json()["user"]["delegacion"] == "Popayán"

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
        assert user["delegacion"] is None


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

    def test_el_catalogo_con_detalle_trae_la_ciudad_del_club(self, entorno):
        """Para rellenarla al asignarle a otro maestro un club que ya existe.

        Se queda la ficha que SÍ trae ciudad: la del maestro que la dejó en
        blanco no aporta nada y taparía la buena.
        """
        app, token, _ = entorno
        cliente = app.test_client()
        _crear_maestro(cliente, token, "e@test.local", ["Dojang Centro"])
        cliente.post(
            "/api/auth/register",
            headers=_auth(token),
            json={
                "email": "f@test.local", "password": "secret123",
                "nombre": "MAESTRO F", "rol": "maestro",
                "clubes": [{"nombre": "Dojang Centro", "ciudad": "Cali",
                            "pais": "Colombia"}],
            },
        )

        resp = cliente.get("/api/auth/clubes?detalle=1", headers=_auth(token))

        assert resp.status_code == 200
        assert resp.get_json() == [
            {"nombre": "DOJANG CENTRO", "ciudad": "Cali", "pais": "Colombia"},
        ]


class TestInscribirEligiendoDojang:
    """Al inscribir, el alumno va a UNO de los dojangs de su maestro."""

    def _maestro_con_dos(self, app, token):
        """Dos dojangs en ciudades distintas, que es el caso real."""
        cliente = app.test_client()
        creado = cliente.post(
            "/api/auth/register",
            headers=_auth(token),
            json={
                "email": "insc@test.local", "password": "secret123",
                "nombre": "MAESTRO INSC", "rol": "maestro",
                "clubes": [
                    {"nombre": "Dojang Sur", "ciudad": "Cali", "pais": "Colombia"},
                    {"nombre": "Dojang Norte", "ciudad": "Popayán", "pais": "Colombia"},
                ],
            },
        ).get_json()["user"]
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

    def test_la_solicitud_muestra_la_delegacion_del_dojang_del_alumno(self, entorno):
        """El admin revisa la solicitud: tiene que ver de dónde viene el alumno.

        No la del maestro: si dirige uno en Cali y otro en Popayán, enseñar
        siempre "Cali" manda al alumno a la delegación equivocada.
        """
        app, token, camp_id = entorno
        cliente = app.test_client()
        tk = self._maestro_con_dos(app, token)
        self._inscribir(cliente, tk, camp_id, club="Dojang Norte")

        inscripciones = cliente.get(
            f"/api/inscripciones/campeonato/{camp_id}", headers=_auth(token)
        ).get_json()

        solicitante = inscripciones[0]["solicitante"]
        assert solicitante["club"] == "DOJANG NORTE"
        assert solicitante["delegacion"] == "Popayán"
