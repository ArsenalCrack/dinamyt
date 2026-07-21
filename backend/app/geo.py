"""
Catálogo geográfico: países → ciudades.

Espejo del catálogo del frontend (lib/geo.ts) para que el backend pueda
derivar automáticamente el país a partir de la delegación (ciudad) asignada
al maestro.  La única función pública que importa es `pais_de_ciudad`.
"""

import unicodedata
import re

GEO: dict[str, list[str]] = {
    "Argentina": [
        "Buenos Aires", "Córdoba", "Rosario", "Mendoza", "La Plata",
        "Mar del Plata", "San Miguel de Tucumán", "Salta", "Santa Fe", "Neuquén",
    ],
    "Bolivia": [
        "La Paz", "Santa Cruz de la Sierra", "Cochabamba", "Sucre", "El Alto",
        "Oruro", "Tarija", "Potosí",
    ],
    "Brasil": [
        "São Paulo", "Río de Janeiro", "Brasilia", "Salvador", "Fortaleza",
        "Belo Horizonte", "Curitiba", "Manaus", "Porto Alegre", "Recife",
    ],
    "Chile": [
        "Santiago", "Valparaíso", "Concepción", "Viña del Mar", "Antofagasta",
        "Temuco", "La Serena", "Rancagua", "Puerto Montt",
    ],
    "Colombia": [
        "Bogotá", "Medellín", "Cali", "Barranquilla", "Cartagena", "Cúcuta",
        "Bucaramanga", "Pereira", "Santa Marta", "Ibagué", "Manizales",
        "Villavicencio", "Pasto", "Neiva", "Armenia", "Popayán", "Montería",
        "Valledupar", "Sincelejo", "Tunja",
    ],
    "Costa Rica": [
        "San José", "Alajuela", "Cartago", "Heredia", "Liberia", "Puntarenas", "Limón",
    ],
    "Cuba": [
        "La Habana", "Santiago de Cuba", "Camagüey", "Holguín", "Santa Clara", "Bayamo",
    ],
    "Ecuador": [
        "Quito", "Guayaquil", "Cuenca", "Santo Domingo", "Machala", "Manta",
        "Portoviejo", "Ambato", "Loja", "Riobamba",
    ],
    "El Salvador": [
        "San Salvador", "Santa Ana", "San Miguel", "Soyapango", "Santa Tecla",
    ],
    "España": [
        "Madrid", "Barcelona", "Valencia", "Sevilla", "Zaragoza", "Málaga",
        "Murcia", "Bilbao", "Alicante", "Granada",
    ],
    "Estados Unidos": [
        "Nueva York", "Los Ángeles", "Miami", "Chicago", "Houston", "Dallas",
        "Orlando", "Atlanta", "Washington D. C.", "San Francisco",
    ],
    "Guatemala": [
        "Ciudad de Guatemala", "Quetzaltenango", "Escuintla", "Mixco", "Villa Nueva",
    ],
    "Honduras": [
        "Tegucigalpa", "San Pedro Sula", "La Ceiba", "Choloma", "Comayagua",
    ],
    "México": [
        "Ciudad de México", "Guadalajara", "Monterrey", "Puebla", "Tijuana",
        "León", "Ciudad Juárez", "Cancún", "Mérida", "Querétaro", "Toluca",
        "Aguascalientes",
    ],
    "Nicaragua": [
        "Managua", "León", "Masaya", "Chinandega", "Granada", "Estelí",
    ],
    "Panamá": [
        "Ciudad de Panamá", "San Miguelito", "Colón", "David", "La Chorrera",
    ],
    "Paraguay": [
        "Asunción", "Ciudad del Este", "San Lorenzo", "Luque", "Encarnación",
    ],
    "Perú": [
        "Lima", "Arequipa", "Trujillo", "Chiclayo", "Piura", "Cusco",
        "Iquitos", "Huancayo", "Tacna", "Callao",
    ],
    "Puerto Rico": [
        "San Juan", "Bayamón", "Carolina", "Ponce", "Caguas", "Mayagüez",
    ],
    "República Dominicana": [
        "Santo Domingo", "Santiago de los Caballeros", "La Romana",
        "San Pedro de Macorís", "Puerto Plata",
    ],
    "Uruguay": [
        "Montevideo", "Salto", "Ciudad de la Costa", "Paysandú", "Las Piedras", "Maldonado",
    ],
    "Venezuela": [
        "Caracas", "Maracaibo", "Valencia", "Barquisimeto", "Maracay",
        "Ciudad Guayana", "San Cristóbal", "Maturín",
    ],
    "Corea del Sur": [
        "Seúl", "Busan", "Incheon", "Daegu", "Daejeon", "Gwangju", "Suwon", "Ulsan",
    ],
}


def _normalizar(texto: str) -> str:
    """Minúsculas, sin acentos, para comparar ciudades sin sensibilidad."""
    plano = "".join(
        c for c in unicodedata.normalize("NFD", texto)
        if unicodedata.category(c) != "Mn"
    )
    return re.sub(r"\s+", " ", plano.strip().lower())


# Índice invertido: ciudad normalizada → país
_CIUDAD_A_PAIS: dict[str, str] = {}
for _pais, _ciudades in GEO.items():
    for _ciudad in _ciudades:
        _CIUDAD_A_PAIS[_normalizar(_ciudad)] = _pais

# Índice de países normalizados → nombre canónico. Sirve para validar el país
# que el admin elige del catálogo (debe ser uno de la lista, no texto libre).
_PAIS_NORMALIZADO: dict[str, str] = {_normalizar(_p): _p for _p in GEO}

# Países del catálogo (orden alfabético), espejo de PAISES en lib/geo.ts.
PAISES: list[str] = sorted(GEO.keys())


def pais_de_ciudad(ciudad: str | None) -> str | None:
    """Devuelve el país del catálogo para una ciudad, o None si no se encuentra."""
    if not ciudad:
        return None
    return _CIUDAD_A_PAIS.get(_normalizar(ciudad))


def pais_valido(pais: str | None) -> str | None:
    """Nombre canónico del país si está en el catálogo, o None.

    Tolera mayúsculas/acentos ("mexico" → "México"). Con esto el país que el
    admin selecciona se valida contra el catálogo: si no es uno de la lista, es
    texto libre no permitido y se descarta.
    """
    if not pais:
        return None
    return _PAIS_NORMALIZADO.get(_normalizar(pais))


def todas_las_delegaciones() -> list[str]:
    """Lista plana de todas las ciudades del catálogo (para validar)."""
    return [c for ciudades in GEO.values() for c in ciudades]
