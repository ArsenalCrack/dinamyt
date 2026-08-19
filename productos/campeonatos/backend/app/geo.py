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
    # Venezuela va completa: capitales de las 24 entidades federales más las
    # cabeceras de municipio y los pueblos con club. En orden alfabético (ver
    # la nota del espejo en lib/geo.ts).
    "Venezuela": [
        "Acarigua", "Achaguas", "Aguasay", "Altagracia de Orituco", "Anaco",
        "Aragua de Barcelona", "Araure", "Araya", "Aroa", "Bachaquero",
        "Bailadores", "Barbacoas", "Barcelona", "Barinas", "Barinitas",
        "Barquisimeto", "Barrancas del Orinoco", "Baruta", "Bejuma",
        "Betijoque", "Biruaca", "Biscucuy", "Boconó", "Bruzual", "Cabimas",
        "Cabudare", "Cagua", "Caicara del Orinoco", "Calabozo", "Cantaura",
        "Capacho", "Caracas", "Carayaca", "Cariaco", "Caripe", "Caripito",
        "Carora", "Carrizal", "Carúpano", "Carvajal", "Casanay",
        "Catia La Mar", "Caucagua", "Chacao", "Charallave", "Chichiriviche",
        "Chivacoa", "Churuguara", "Ciudad Bolívar", "Ciudad Bolivia",
        "Ciudad Guayana", "Ciudad Ojeda", "Clarines", "Cocorote",
        "Colonia Tovar", "Coro", "Cúa", "Cumaná", "Curiapo", "Dabajuro",
        "Duaca", "Ejido", "El Baúl", "El Callao", "El Dorado", "El Hatillo",
        "El Limón", "El Pilar", "El Sombrero", "El Tigre", "El Tocuyo",
        "El Valle del Espíritu Santo", "El Vigía", "Elorza", "Encontrados",
        "Escuque", "Guacara", "Guama", "Guanare", "Guanarito", "Guanta",
        "Guarenas", "Guasdualito", "Guasipati", "Guatire", "Güigüe",
        "Güiria", "Higuerote", "Juan Griego", "Judibana", "La Asunción",
        "La Azulita", "La Concepción", "La Fría", "La Grita", "La Guaira",
        "La Quebrada", "La Vela de Coro", "La Victoria", "Lagunillas",
        "Las Mercedes del Llano", "Las Tejerías", "Las Vegas", "Lechería",
        "Libertad de Barinas", "Los Guayos", "Los Puertos de Altagracia",
        "Los Taques", "Los Teques", "Machiques", "Macuto", "Maiquetía",
        "Maracaibo", "Maracay", "Mariara", "Marigüitar", "Maroa", "Maturín",
        "Mene de Mauroa", "Mene Grande", "Mérida", "Michelena", "Montalbán",
        "Monte Carmelo", "Morón", "Motatán", "Mucuchíes", "Naguanagua",
        "Naiguatá", "Nirgua", "Ocumare de la Costa", "Ocumare del Tuy",
        "Ospino", "Palmira", "Palo Negro", "Pampán", "Pampatar", "Papelón",
        "Pariaguán", "Pedernales", "Petare", "Porlamar", "Pregonero",
        "Puerto Ayacucho", "Puerto Cabello", "Puerto Cumarebo",
        "Puerto La Cruz", "Puerto Ordaz", "Puerto Píritu", "Punta de Mata",
        "Punta de Piedras", "Punto Fijo", "Quíbor", "Río Caribe",
        "Río Chico", "Rubio", "Sabana de Mendoza", "Sabaneta",
        "San Antonio de los Altos", "San Antonio del Golfo",
        "San Antonio del Táchira", "San Carlos", "San Carlos del Zulia",
        "San Casimiro", "San Cristóbal", "San Diego", "San Felipe",
        "San Félix", "San Fernando de Apure", "San Fernando de Atabapo",
        "San Francisco", "San Juan Bautista", "San Juan de Colón",
        "San Juan de los Morros", "San Mateo", "San Rafael de El Moján",
        "San Tomé", "Sanare", "Santa Ana del Táchira",
        "Santa Bárbara de Barinas", "Santa Bárbara del Zulia",
        "Santa Cruz de Mora", "Santa Elena de Uairén", "Santa Lucía",
        "Santa María de Ipire", "Santa Rita", "Santa Teresa del Tuy",
        "Santo Domingo", "Sarare", "Sinamaica", "Siquisique", "Socopó",
        "Táriba", "Temblador", "Tía Juana", "Timotes", "Tinaco",
        "Tinaquillo", "Tocuyito", "Tovar", "Trujillo", "Tucacas", "Tucupido",
        "Tucupita", "Tumeremo", "Turén", "Turmero", "Upata", "Urachiche",
        "Ureña", "Valencia", "Valera", "Valle de la Pascua", "Villa Bruzual",
        "Villa de Cura", "Villa del Rosario", "Yaguaraparo", "Yaritagua",
        "Zaraza",
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


# Índice invertido: ciudad normalizada → país. Solo entran las ciudades cuyo
# nombre es ÚNICO en todo el catálogo.
#
# Hay nombres que se repiten entre países: Barcelona (España y Anzoátegui),
# Valencia (España y Carabobo), Mérida (México y Venezuela), Trujillo (Perú y
# Venezuela), Santo Domingo (Ecuador, República Dominicana y Mérida)... Antes
# el diccionario se sobrescribía y ganaba el último país declarado, así que un
# maestro de Barcelona quedaba con la delegación en el país equivocado sin que
# nadie lo notara. Ante un nombre ambiguo no se adivina: se devuelve None, que
# es lo mismo que pasa con una ciudad que no está en el catálogo — el país lo
# elige el admin del desplegable, esto solo es el respaldo para datos viejos.
_CIUDAD_A_PAIS: dict[str, str] = {}
_CIUDADES_AMBIGUAS: set[str] = set()
for _pais, _ciudades in GEO.items():
    for _ciudad in _ciudades:
        _clave = _normalizar(_ciudad)
        if _clave in _CIUDAD_A_PAIS and _CIUDAD_A_PAIS[_clave] != _pais:
            _CIUDADES_AMBIGUAS.add(_clave)
        _CIUDAD_A_PAIS.setdefault(_clave, _pais)
for _clave in _CIUDADES_AMBIGUAS:
    del _CIUDAD_A_PAIS[_clave]

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
