"""
Tests del motor de secciones (categorización automática) y de la generación
automática de llaves a partir de los inscritos de un campeonato.

Ejecutar desde backend/:  python -m pytest tests/ -v
"""

import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402

from app.engine.secciones_engine import (  # noqa: E402
    calcular_edad,
    config_categorias_default,
    emparejar_seccion,
    en_rango,
    generar_secciones,
    nombre_seccion,
)


# ══════════════════════════════════════════════════════════════════
#  MOTOR PURO
# ══════════════════════════════════════════════════════════════════

class TestEnRango:
    def test_rango_cerrado_inclusive(self):
        assert en_rango(50, "50-60")
        assert en_rango(60, "50-60")
        assert not en_rango(61, "50-60")

    def test_tope_superior(self):
        assert en_rango(45, "-50")
        assert en_rango(50, "-50kg")
        assert not en_rango(51, "-50")

    def test_abierto_hacia_arriba(self):
        assert en_rango(70, "70+")
        assert en_rango(90, "70+kg")
        assert not en_rango(69, "70+")

    def test_valor_individual(self):
        assert en_rango(18, "18")
        assert not en_rango(17, "18")

    def test_etiqueta_invalida(self):
        assert not en_rango(50, "kg")


class TestCalcularEdad:
    def test_antes_y_despues_del_cumpleanos(self):
        ref = date(2026, 6, 15)
        assert calcular_edad(date(2010, 6, 16), ref) == 15
        assert calcular_edad(date(2010, 6, 15), ref) == 16

    def test_sin_fecha(self):
        assert calcular_edad(None) is None


class TestGenerarSecciones:
    def _config_combate(self):
        return [{
            "nombre": "COMBATE", "tipo_llave": "combate", "activa": True,
            "categorias": {
                "genero": "separado",
                "cinturon": [
                    {"activa": True, "valor": "Novatos",
                     "grupos": ["BLANCO", "PRINCIPIANTE"]},
                    {"activa": True, "valor": "Negros", "grupos": ["NEGRO"]},
                ],
                "edad": [
                    {"activa": True, "tipo": "rango", "desde": "12", "hasta": "14"},
                    {"activa": True, "tipo": "individual", "valor": "18+"},
                ],
                "peso": [
                    {"activa": True, "tipo": "individual", "valor": "-60"},
                    {"activa": True, "tipo": "individual", "valor": "60+"},
                ],
            },
        }]

    def test_producto_cartesiano(self):
        secciones = generar_secciones(self._config_combate())
        # 2 géneros × 2 cinturones × 2 edades × 2 pesos = 16 hojas
        assert len(secciones) == 16
        claves = {s["clave"] for s in secciones}
        assert len(claves) == 16  # claves únicas

    def test_modalidad_inactiva_no_genera(self):
        config = self._config_combate()
        config[0]["activa"] = False
        assert generar_secciones(config) == []

    def test_sin_peso_produce_una_sola_rama(self):
        config = self._config_combate()
        config[0]["categorias"]["peso"] = []
        secciones = generar_secciones(config)
        assert len(secciones) == 8
        assert all(s["peso"] is None for s in secciones)

    def test_mixto_una_rama_de_genero(self):
        config = self._config_combate()
        config[0]["categorias"]["genero"] = "mixto"
        secciones = generar_secciones(config)
        assert {s["genero"] for s in secciones} == {"Mixto"}

    def test_config_default_valida(self):
        config = config_categorias_default()
        secciones = generar_secciones(config["modalidades"])
        assert len(secciones) > 0
        assert any(s["tipo_llave"] == "combate" for s in secciones)
        assert any(s["tipo_llave"] == "figuras" for s in secciones)


class TestEmparejarSeccion:
    def _secciones(self):
        return generar_secciones([{
            "nombre": "COMBATE", "tipo_llave": "combate", "activa": True,
            "categorias": {
                "genero": "separado",
                "cinturon": [
                    {"activa": True, "valor": "Novatos",
                     "grupos": ["BLANCO", "PRINCIPIANTE"]},
                    {"activa": True, "valor": "Negros", "grupos": ["NEGRO"]},
                ],
                "edad": [
                    {"activa": True, "tipo": "rango", "desde": "12", "hasta": "14"},
                ],
                "peso": [
                    {"activa": True, "tipo": "individual", "valor": "-50"},
                    {"activa": True, "tipo": "individual", "valor": "50+"},
                ],
            },
        }])

    def test_cae_en_su_seccion(self):
        seccion = emparejar_seccion(self._secciones(), {
            "modalidad": "COMBATE", "genero": "FEMENINO",
            "grupo_cinturon": "PRINCIPIANTE", "edad": 13, "peso": 47.5,
        })
        assert seccion is not None
        assert seccion["genero"] == "Femenino"
        assert seccion["cinturon"] == "Novatos"
        assert seccion["peso"] == "-50"

    def test_fuera_de_rango_no_empareja(self):
        assert emparejar_seccion(self._secciones(), {
            "modalidad": "COMBATE", "genero": "MASCULINO",
            "grupo_cinturon": "NEGRO", "edad": 20, "peso": 60,
        }) is None

    def test_grupo_no_incluido_no_empareja(self):
        assert emparejar_seccion(self._secciones(), {
            "modalidad": "COMBATE", "genero": "MASCULINO",
            "grupo_cinturon": "INTERMEDIO", "edad": 13, "peso": 45,
        }) is None

    def test_seccion_con_peso_exige_peso(self):
        assert emparejar_seccion(self._secciones(), {
            "modalidad": "COMBATE", "genero": "MASCULINO",
            "grupo_cinturon": "NEGRO", "edad": 13, "peso": None,
        }) is None

    def test_seccion_mixta_acepta_ambos_generos(self):
        secciones = generar_secciones([{
            "nombre": "DEFENSA PERSONAL", "tipo_llave": "figuras", "activa": True,
            "categorias": {"genero": "mixto", "cinturon": [], "edad": [], "peso": []},
        }])
        for genero in ("MASCULINO", "FEMENINO"):
            assert emparejar_seccion(secciones, {
                "modalidad": "DEFENSA PERSONAL", "genero": genero,
                "grupo_cinturon": "BLANCO", "edad": 10, "peso": None,
            }) is not None


class TestNombreSeccion:
    def test_incluye_partes_presentes(self):
        nombre = nombre_seccion({
            "modalidad": "COMBATE", "genero": "Masculino",
            "cinturon": "Novatos", "edad": "12-14", "peso": "-50",
        })
        assert "COMBATE" in nombre
        assert "12-14 años" in nombre
        assert "-50 kg" in nombre


# ══════════════════════════════════════════════════════════════════
#  INTEGRACIÓN: inscripciones → secciones → llaves automáticas
# ══════════════════════════════════════════════════════════════════

from app.config import DevelopmentConfig  # noqa: E402

DevelopmentConfig.SQLALCHEMY_DATABASE_URI = "sqlite://"


@pytest.fixture()
def entorno():
    """App + BD en memoria con admin, campeonato e inscritos de prueba."""
    from app import create_app
    from app.extensions import db

    app = create_app("development")
    assert "dinamyt.db" not in str(app.config["SQLALCHEMY_DATABASE_URI"])

    with app.app_context():
        db.create_all()

        from flask_jwt_extended import create_access_token
        from app.models.usuario import Usuario
        from app.models.campeonato import Campeonato
        from app.models.tatami import Tatami
        from app.models.competidor import Competidor, Inscripcion

        # Superadmin: opera sobre cualquier workspace (el scoping por dueño no
        # aplica). Además es dueño del campeonato de prueba.
        admin = Usuario(email="admin@test.com", nombre="Admin", rol="admin",
                        es_superadmin=True)
        admin.set_password("x")
        db.session.add(admin)
        db.session.flush()
        camp = Campeonato(nombre="Camp Auto", activo=True,
                          fecha_inicio=date(2026, 8, 1), created_by=admin.id)
        db.session.add(camp)
        db.session.flush()
        db.session.add(Tatami(campeonato_id=camp.id, numero=1))

        # Config mínima: combate separado por género, sin peso, una edad.
        camp.config_categorias = {"modalidades": [{
            "nombre": "COMBATE", "tipo_llave": "combate", "activa": True,
            "categorias": {
                "genero": "separado",
                "cinturon": [{"activa": True, "valor": "Todos",
                              "grupos": ["BLANCO", "PRINCIPIANTE", "INTERMEDIO",
                                         "AVANZADO", "NEGRO"]}],
                "edad": [{"activa": True, "tipo": "rango",
                          "desde": "10", "hasta": "17"}],
                "peso": [],
            },
        }]}

        datos = [
            ("Ana", "FEMENINO", date(2012, 5, 1)),
            ("Bea", "FEMENINO", date(2013, 2, 1)),
            ("Cami", "FEMENINO", date(2011, 9, 9)),
            ("Dario", "MASCULINO", date(2012, 1, 1)),
            ("Elias", "MASCULINO", date(2013, 3, 3)),
        ]
        for nombre, genero, nacimiento in datos:
            c = Competidor(nombre_completo=nombre, genero=genero,
                           fecha_nacimiento=nacimiento,
                           grupo_cinturon="INTERMEDIO", club="Club X")
            db.session.add(c)
            db.session.flush()
            db.session.add(Inscripcion(
                campeonato_id=camp.id, competidor_id=c.id,
                modalidades=["COMBATE"], grupo_cinturon=c.grupo_cinturon,
            ))
        # Un inscrito sin datos: debe salir en avisos, no en secciones.
        incompleto = Competidor(nombre_completo="SinDatos")
        db.session.add(incompleto)
        db.session.flush()
        db.session.add(Inscripcion(
            campeonato_id=camp.id, competidor_id=incompleto.id,
            modalidades=["COMBATE"],
        ))
        db.session.commit()

        token = create_access_token(identity=str(admin.id))
        yield app, camp.id, token
        db.session.remove()
        db.drop_all()


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


class TestGeneracionAutomatica:
    def test_preview_reparte_por_genero(self, entorno):
        app, camp_id, token = entorno
        client = app.test_client()
        r = client.get(f"/api/campeonatos/{camp_id}/secciones-preview",
                       headers=_auth(token))
        assert r.status_code == 200
        data = r.get_json()
        con_gente = [s for s in data["secciones"] if s["competidores"]]
        assert len(con_gente) == 2  # Femenino (3) y Masculino (2)
        tam = sorted(len(s["competidores"]) for s in con_gente)
        assert tam == [2, 3]
        assert any("SinDatos" in a for a in data["avisos"])

    def test_generar_crea_llaves_y_no_duplica(self, entorno):
        app, camp_id, token = entorno
        client = app.test_client()

        r = client.post(f"/api/campeonatos/{camp_id}/generar-llaves",
                        json={}, headers=_auth(token))
        assert r.status_code == 201
        data = r.get_json()
        assert len(data["creadas"]) == 2

        from app.models.llave import Llave
        with app.app_context():
            llaves = Llave.query.filter_by(campeonato_id=camp_id).all()
            assert len(llaves) == 2
            assert all(l.seccion_clave for l in llaves)
            assert all(l.estado_norm == "pendiente" for l in llaves)
            # La de 3 competidoras tiene cuadro con bye resuelto.
            grande = next(l for l in llaves
                          if len(l.estructura["competidores"]) == 3)
            assert len(grande.estructura["rondas"]) == 2

        # Repetir sin "reemplazar" no duplica: todas quedan omitidas.
        r2 = client.post(f"/api/campeonatos/{camp_id}/generar-llaves",
                         json={}, headers=_auth(token))
        assert r2.status_code == 201
        assert len(r2.get_json()["creadas"]) == 0
        assert len(r2.get_json()["omitidas"]) == 2
        with app.app_context():
            assert Llave.query.filter_by(campeonato_id=camp_id).count() == 2

    def test_reemplazar_solo_pendientes(self, entorno):
        app, camp_id, token = entorno
        client = app.test_client()
        client.post(f"/api/campeonatos/{camp_id}/generar-llaves",
                    json={}, headers=_auth(token))

        from app.extensions import db as _db
        from app.models.llave import Llave
        with app.app_context():
            activa = Llave.query.filter_by(campeonato_id=camp_id).first()
            activa.estado = "activa"
            _db.session.commit()
            id_activa = activa.id

        r = client.post(f"/api/campeonatos/{camp_id}/generar-llaves",
                        json={"reemplazar": True}, headers=_auth(token))
        assert r.status_code == 201
        data = r.get_json()
        assert len(data["creadas"]) == 1   # solo la pendiente se re-sortea
        assert len(data["omitidas"]) == 1  # la activa se respeta
        with app.app_context():
            assert Llave.query.get(id_activa) is not None

    def test_llave_manual_no_se_toca(self, entorno):
        app, camp_id, token = entorno
        client = app.test_client()

        from app.extensions import db as _db
        from app.models.llave import Llave
        from app.api.llaves import generar_estructura
        with app.app_context():
            manual = Llave(
                campeonato_id=camp_id, nombre="MANUAL", estado="pendiente",
                estructura=generar_estructura(
                    [{"nombre": "X"}, {"nombre": "Y"}, {"nombre": "Z"}]),
            )
            _db.session.add(manual)
            _db.session.commit()
            id_manual = manual.id

        client.post(f"/api/campeonatos/{camp_id}/generar-llaves",
                    json={"reemplazar": True}, headers=_auth(token))
        with app.app_context():
            assert Llave.query.get(id_manual) is not None
            assert Llave.query.filter_by(campeonato_id=camp_id).count() == 3

    def test_asignar_tatamis_round_robin(self, entorno):
        app, camp_id, token = entorno
        client = app.test_client()
        r = client.post(f"/api/campeonatos/{camp_id}/generar-llaves",
                        json={"asignar_tatamis": True}, headers=_auth(token))
        assert r.status_code == 201
        from app.models.llave import Llave
        with app.app_context():
            llaves = Llave.query.filter_by(campeonato_id=camp_id).all()
            assert all(l.tatami_id is not None for l in llaves)


# ══════════════════════════════════════════════════════════════════
#  COMPETIDORES: cinturón → grupo automático, validaciones, especial
# ══════════════════════════════════════════════════════════════════

class TestCinturones:
    def test_grupo_derivado(self):
        from app.models.competidor import normalizar_cinturon
        assert normalizar_cinturon("Azul") == ("Azul", "INTERMEDIO")
        assert normalizar_cinturon("marron negro") == ("Marrón/Negro", "AVANZADO")
        assert normalizar_cinturon("NARANJA-VERDE") == ("Naranja/Verde", "PRINCIPIANTE")
        assert normalizar_cinturon("Fucsia") == (None, None)


class TestValidacionCompetidores:
    def _crear(self, client, token, body):
        base = {"nombre_completo": "Test Persona"}
        base.update(body)
        return client.post("/api/competidores", json=base, headers=_auth(token))

    def test_cinturon_fija_grupo_automaticamente(self, entorno):
        app, _, token = entorno
        r = self._crear(app.test_client(), token, {"cinturon": "rojo"})
        assert r.status_code == 201
        comp = r.get_json()["competidor"]
        assert comp["cinturon"] == "Rojo"
        assert comp["grupo_cinturon"] == "AVANZADO"

    def test_cinturon_desconocido_rechazado(self, entorno):
        app, _, token = entorno
        r = self._crear(app.test_client(), token, {"cinturon": "Morado"})
        assert r.status_code == 400
        assert "no reconocido" in r.get_json()["error"]

    def test_documento_solo_numeros(self, entorno):
        app, _, token = entorno
        client = app.test_client()
        r = self._crear(client, token, {"documento": "ABC123"})
        assert r.status_code == 400
        # Con separadores comunes sí pasa (se limpian).
        r2 = self._crear(client, token, {"documento": "1.002.003-1"})
        assert r2.status_code == 201
        assert r2.get_json()["competidor"]["documento"] == "10020031"

    def test_edad_fuera_de_rango(self, entorno):
        app, _, token = entorno
        client = app.test_client()
        hoy = date.today()
        muy_joven = hoy.replace(year=hoy.year - 2).isoformat()
        muy_viejo = hoy.replace(year=hoy.year - 101).isoformat()
        assert self._crear(client, token,
                           {"fecha_nacimiento": muy_joven}).status_code == 400
        assert self._crear(client, token,
                           {"fecha_nacimiento": muy_viejo}).status_code == 400
        valida = hoy.replace(year=hoy.year - 10).isoformat()
        assert self._crear(client, token,
                           {"fecha_nacimiento": valida}).status_code == 201

    def test_peso_fuera_de_rango(self, entorno):
        app, _, token = entorno
        client = app.test_client()
        assert self._crear(client, token, {"peso": 5}).status_code == 400
        assert self._crear(client, token, {"peso": 250}).status_code == 400
        r = self._crear(client, token, {"peso": "62,5"})
        assert r.status_code == 201
        assert r.get_json()["competidor"]["peso"] == 62.5

    def test_nombre_muy_largo(self, entorno):
        app, _, token = entorno
        r = self._crear(app.test_client(), token, {"nombre_completo": "X" * 81})
        assert r.status_code == 400


class TestCategoriaEspecial:
    def test_especial_llega_a_la_estructura_de_figuras(self, entorno):
        # Todo por la API (como lo haría el admin): config solo-figuras,
        # un competidor especial nuevo y Ana cambiada a figuras.
        app, camp_id, token = entorno
        client = app.test_client()

        r = client.put(
            f"/api/campeonatos/{camp_id}/config-categorias",
            json={"config": {"modalidades": [{
                "nombre": "FIGURA A MANOS LIBRES", "tipo_llave": "figuras",
                "activa": True,
                "categorias": {"genero": "mixto", "cinturon": [],
                               "edad": [], "peso": []},
            }]}},
            headers=_auth(token),
        )
        assert r.status_code == 200

        r = client.post(
            f"/api/inscripciones/campeonato/{camp_id}",
            json={
                "competidor": {
                    "nombre_completo": "Pedro Especial", "genero": "M",
                    "fecha_nacimiento": "2012-01-01",
                    "categoria_especial": True,
                },
                "modalidades": ["FIGURA A MANOS LIBRES"],
            },
            headers=_auth(token),
        )
        assert r.status_code == 201

        inscripciones = client.get(
            f"/api/inscripciones/campeonato/{camp_id}", headers=_auth(token)
        ).get_json()
        ins_ana = next(i for i in inscripciones
                       if i["competidor"]["nombre_completo"] == "Ana")
        r = client.put(
            f"/api/inscripciones/{ins_ana['id']}",
            json={"modalidades": ["FIGURA A MANOS LIBRES"]},
            headers=_auth(token),
        )
        assert r.status_code == 200

        r = client.post(f"/api/campeonatos/{camp_id}/generar-llaves",
                        json={}, headers=_auth(token))
        assert r.status_code == 201
        assert len(r.get_json()["creadas"]) == 1

        from app.models.llave import Llave
        with app.app_context():
            llave = Llave.query.filter_by(campeonato_id=camp_id,
                                          tipo="figuras").first()
            assert llave is not None
            comps = llave.estructura["competidores"]
            marca = {c["nombre"]: c.get("especial", False) for c in comps}
            # "PEDRO ESPECIAL" y no "Pedro Especial": los nombres que entran
            # por la API se guardan en mayúsculas (ver `_mayusculas` en
            # api/competidores.py). Ana la creó el fixture con el modelo
            # directamente, así que conserva como se escribió.
            assert marca["PEDRO ESPECIAL"] is True
            assert marca["Ana"] is False
