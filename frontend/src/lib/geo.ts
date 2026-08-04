// Catálogo geográfico local (país → ciudades) para los desplegables del
// campeonato. Autónomo (sin API externa) para funcionar offline en la LAN.
// Los nombres son propios y no se traducen; si una ciudad no está en la lista,
// el selector ofrece "Otra ciudad…" para escribirla a mano.

export const GEO: Record<string, string[]> = {
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
  // Venezuela va completa: las capitales de las 24 entidades federales más las
  // cabeceras de municipio y los pueblos con club. Por eso esta lista sí está
  // en orden alfabético y no "las grandes primero" como las demás: con 219
  // entradas, buscar por tamaño de ciudad no lleva a ninguna parte, y el
  // <select> nativo de "Crear campeonato" salta por la primera letra.
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
};

// Países ordenados alfabéticamente (es) para el desplegable.
export const PAISES: string[] = Object.keys(GEO).sort((a, b) => a.localeCompare(b, "es"));

/** Ciudades de un país (vacío si no está en el catálogo). */
export function ciudadesDe(pais: string): string[] {
  return GEO[pais] || [];
}
