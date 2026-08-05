"""
Las fechas que salen de la API llevan zona; las de calendario, no.

El fallo que esto protege: `created_at` se guarda en UTC y SQLite lo devuelve
"naive". Serializado tal cual —`"2026-08-05T03:07:24"`, sin zona— el navegador
lo lee como hora LOCAL, así que un usuario creado a las 22:07 del día 4 en
Colombia aparecía fechado el día 5. A partir de las siete de la tarde, todo lo
que se creaba salía con la fecha de mañana.

Y el reverso, igual de importante: una fecha de calendario (nacimiento, inicio
del campeonato) NO es un timestamp y no puede desplazarse. Un cumpleaños no
cambia de día al cruzar un huso.
"""

import sys
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402

from app import create_app  # noqa: E402
from app.config import DevelopmentConfig  # noqa: E402
from app.extensions import db  # noqa: E402
from app.timeutil import a_local, iso_utc  # noqa: E402

DevelopmentConfig.SQLALCHEMY_DATABASE_URI = "sqlite://"

# Las 03:07 UTC del 5 son las 22:07 del 4 en Colombia: la hora exacta a la que
# se veía el fallo.
DE_MADRUGADA_UTC = datetime(2026, 8, 5, 3, 7, 24)


class TestIsoUtc:
    def test_marca_la_zona_de_un_timestamp_sin_ella(self):
        assert iso_utc(DE_MADRUGADA_UTC) == "2026-08-05T03:07:24+00:00"

    def test_respeta_el_que_ya_trae_zona(self):
        con_zona = DE_MADRUGADA_UTC.replace(tzinfo=timezone.utc)
        assert iso_utc(con_zona) == "2026-08-05T03:07:24+00:00"

    def test_none_sigue_siendo_none(self):
        assert iso_utc(None) is None


class TestHoraDelEvento:
    """`a_local` es la hora IMPRESA en actas y reportes: no la convierte nadie."""

    def test_usa_la_zona_configurada(self, monkeypatch):
        monkeypatch.setenv("TZ", "America/Caracas")
        assert a_local(DE_MADRUGADA_UTC).strftime("%d/%m/%Y %H:%M") == "04/08/2026 23:07"

    def test_por_defecto_colombia(self, monkeypatch):
        monkeypatch.delenv("TZ", raising=False)
        monkeypatch.delenv("ZONA_HORARIA", raising=False)
        assert a_local(DE_MADRUGADA_UTC).strftime("%d/%m/%Y %H:%M") == "04/08/2026 22:07"

    def test_una_zona_mal_escrita_cae_a_la_de_por_defecto(self, monkeypatch):
        """Y no a UTC, que es donde la dejaría el runtime sin avisar."""
        monkeypatch.setenv("TZ", "Zona/Inventada")
        assert a_local(DE_MADRUGADA_UTC).strftime("%d/%m/%Y %H:%M") == "04/08/2026 22:07"


@pytest.fixture()
def app_con_admin():
    app = create_app("development")
    with app.app_context():
        db.create_all()

        from flask_jwt_extended import create_access_token
        from app.models.usuario import Usuario

        admin = Usuario(email="admin@test.local", nombre="ADMIN", rol="admin",
                        es_superadmin=True, activo=True)
        admin.set_password("secret123")
        db.session.add(admin)
        db.session.commit()
        token = create_access_token(
            identity=str(admin.id),
            additional_claims={"rol": "admin", "nombre": admin.nombre,
                               "email": admin.email},
        )
        yield app, token, admin
        db.session.remove()
        db.drop_all()


class TestLoQueSaleDeLaApi:
    def test_el_usuario_creado_de_noche_no_sale_fechado_manana(self, app_con_admin):
        """La prueba del fallo tal y como se ve: `created_at` con su zona.

        Sin el `+00:00`, el navegador lee "2026-08-05T03:07:24" como hora local
        y `toLocaleDateString` escribe 5/08 cuando en Colombia son las 22:07 del
        día 4.
        """
        app, token, admin = app_con_admin
        from app.models.usuario import Usuario

        creado = Usuario.query.get(admin.id)
        creado.created_at = DE_MADRUGADA_UTC
        db.session.commit()

        resp = app.test_client().get("/api/auth/users", headers={
            "Authorization": f"Bearer {token}",
        })

        assert resp.status_code == 200
        assert resp.get_json()[0]["created_at"] == "2026-08-05T03:07:24+00:00"

    def test_las_fechas_de_calendario_NO_se_desplazan(self, app_con_admin):
        """Un campeonato que empieza el 5 empieza el 5 en todos los husos."""
        app, token, _ = app_con_admin
        cliente = app.test_client()
        cabeceras = {"Authorization": f"Bearer {token}"}

        cliente.post("/api/campeonatos", headers=cabeceras, json={
            "nombre": "Copa", "fecha_inicio": "2026-08-05", "fecha_fin": "2026-08-06",
        })

        camp = cliente.get("/api/campeonatos", headers=cabeceras).get_json()[0]
        assert camp["fecha_inicio"] == "2026-08-05"
        assert camp["fecha_fin"] == "2026-08-06"
        # Y su `created_at`, que sí es un timestamp, sale con zona.
        assert camp["created_at"].endswith("+00:00")

    def test_la_fecha_de_nacimiento_no_se_desplaza(self, app_con_admin):
        """Un cumpleaños no cambia de día al cruzar un huso horario."""
        app, token, _ = app_con_admin
        cliente = app.test_client()
        cabeceras = {"Authorization": f"Bearer {token}"}

        resp = cliente.post("/api/competidores", headers=cabeceras, json={
            "nombre_completo": "ALUMNO DE PRUEBA",
            "fecha_nacimiento": "2012-01-01",
        })

        assert resp.status_code == 201
        comp = resp.get_json()["competidor"]
        assert comp["fecha_nacimiento"] == "2012-01-01"
        assert isinstance(date.fromisoformat(comp["fecha_nacimiento"]), date)
        assert comp["created_at"].endswith("+00:00")
