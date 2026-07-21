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
  "Venezuela": [
    "Caracas", "Maracaibo", "Valencia", "Barquisimeto", "Maracay",
    "Ciudad Guayana", "San Cristóbal", "Maturín",
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
