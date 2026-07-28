/**
 * Catálogo de cinturones, con el color con el que se pinta cada uno.
 *
 * Los nombres son los mismos que valida la API
 * (`apps/membresias-api/src/lib/cinturones.ts`) y los mismos que usa
 * DINAMYT-LOCAL con sus competidores: un alumno que sube de grado aquí se
 * inscribe allá sin que nadie traduzca nada.
 *
 * El color es solo de esta capa. En el roster, un punto del color del cinturón
 * se lee de un vistazo; el nombre escrito, no.
 */
export interface Cinturon {
  nombre: string;
  /** Color principal del grado. */
  color: string;
  /** Segundo color de los grados mixtos («Naranja/Verde»). */
  color2?: string;
}

export const CINTURONES: Cinturon[] = [
  { nombre: 'Blanco', color: '#f3f1e8' },
  { nombre: 'Amarillo', color: '#f5d020' },
  { nombre: 'Naranja', color: '#f28c28' },
  { nombre: 'Naranja/Verde', color: '#f28c28', color2: '#3ecf8e' },
  { nombre: 'Verde', color: '#3ecf8e' },
  { nombre: 'Verde/Azul', color: '#3ecf8e', color2: '#2266ff' },
  { nombre: 'Azul', color: '#2266ff' },
  { nombre: 'Rojo', color: '#e8002a' },
  { nombre: 'Marrón', color: '#7b4b2a' },
  { nombre: 'Marrón/Negro', color: '#7b4b2a', color2: '#1a1a1a' },
  { nombre: 'Negro', color: '#1a1a1a' },
];

export function cinturonPorNombre(nombre: string | null | undefined): Cinturon | null {
  if (!nombre) return null;
  return CINTURONES.find((c) => c.nombre.toLowerCase() === nombre.toLowerCase()) ?? null;
}

/** Degradado del punto de color: un solo color, o los dos del grado mixto. */
export function fondoCinturon(c: Cinturon): string {
  return c.color2
    ? `linear-gradient(135deg, ${c.color} 0 50%, ${c.color2} 50% 100%)`
    : c.color;
}
