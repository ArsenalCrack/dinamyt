"""Tests del catálogo geográfico (app/geo.py) y su espejo del frontend."""

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.geo import GEO, _normalizar, pais_de_ciudad, pais_valido  # noqa: E402

# El catálogo del frontend, del que este es espejo.
GEO_TS = (
    Path(__file__).resolve().parents[2]
    / "frontend" / "src" / "lib" / "geo.ts"
)


def _ciudades_del_frontend(pais):
    """Ciudades de un país leídas de lib/geo.ts (sin ejecutar TypeScript)."""
    texto = GEO_TS.read_text(encoding="utf-8")
    bloque = re.search(rf'"{pais}":\s*\[(.*?)\]', texto, re.S)
    assert bloque, f"No se encontró '{pais}' en {GEO_TS.name}"
    return re.findall(r'"([^"]+)"', bloque.group(1))


class TestVenezuela:
    """La lista larga: 24 entidades federales, sin repetidas y ordenada."""

    def test_estan_las_capitales_de_las_24_entidades(self):
        capitales = [
            "Puerto Ayacucho", "Barcelona", "San Fernando de Apure", "Maracay",
            "Barinas", "Ciudad Bolívar", "Valencia", "San Carlos", "Tucupita",
            "Caracas", "Coro", "San Juan de los Morros", "Barquisimeto",
            "Mérida", "Los Teques", "Maturín", "La Asunción", "Guanare",
            "Cumaná", "San Cristóbal", "Trujillo", "La Guaira", "San Felipe",
            "Maracaibo",
        ]
        assert len(capitales) == 24
        faltan = [c for c in capitales if c not in GEO["Venezuela"]]
        assert not faltan, f"Faltan capitales en el catálogo: {faltan}"

    def test_sin_repetidas_y_en_orden_alfabetico(self):
        ciudades = GEO["Venezuela"]
        # Repetida = misma clave normalizada: rompería la key de React en el
        # desplegable y aparecería dos veces en la lista.
        assert len(ciudades) == len({_normalizar(c) for c in ciudades})
        # Ordenada sin tener en cuenta los acentos: con 200 y pico entradas, el
        # <select> nativo se recorre por la primera letra.
        assert ciudades == sorted(ciudades, key=_normalizar)


class TestEspejoConElFrontend:
    """Si los dos catálogos se separan, el país derivado deja de cuadrar."""

    def test_venezuela_es_identica_en_los_dos_catalogos(self):
        assert _ciudades_del_frontend("Venezuela") == GEO["Venezuela"]


class TestPaisDeCiudad:
    def test_una_ciudad_unica_da_su_pais(self):
        assert pais_de_ciudad("Punto Fijo") == "Venezuela"
        assert pais_de_ciudad("Bogotá") == "Colombia"

    def test_tolera_acentos_y_mayusculas(self):
        assert pais_de_ciudad("TARIBA") == "Venezuela"
        assert pais_de_ciudad("  san cristobal ") == "Venezuela"

    def test_un_nombre_repetido_entre_paises_no_se_adivina(self):
        """Barcelona son dos ciudades reales; elegir una sería inventarse el país.

        Antes ganaba el último país declarado en el diccionario, así que al
        agregar Venezuela un maestro de Barcelona (España) habría quedado con la
        delegación en Venezuela sin que nadie lo notara. `None` es lo mismo que
        devuelve una ciudad desconocida: el país lo pone el desplegable.
        """
        for ambigua in ("Barcelona", "Valencia", "Mérida", "Trujillo",
                        "Santo Domingo", "San Francisco", "Granada", "León"):
            assert pais_de_ciudad(ambigua) is None, ambigua

    def test_ciudad_desconocida(self):
        assert pais_de_ciudad("Ciudad Inventada") is None
        assert pais_de_ciudad("") is None
        assert pais_de_ciudad(None) is None


class TestPaisValido:
    def test_canoniza_el_pais(self):
        assert pais_valido("venezuela") == "Venezuela"
        assert pais_valido("MEXICO") == "México"

    def test_rechaza_lo_que_no_esta_en_el_catalogo(self):
        assert pais_valido("Wakanda") is None
        assert pais_valido(None) is None
