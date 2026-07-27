/**
 * Topes y filtros de los campos de los formularios.
 *
 * Dos problemas distintos, el mismo sitio:
 *
 * 1. **Longitud.** Las columnas son `varchar(n)`. Sin un `maxLength`, el
 *    usuario escribe de más, pulsa guardar y recibe un error del servidor por
 *    algo que se pudo evitar mientras escribía. Estos números son los mismos
 *    que valida la API (`apps/membresias-api/src/lib/validacion.ts`): el
 *    navegador evita el viaje, la API es la que manda.
 *
 * 2. **Tipo.** Un campo que pide un número aceptaba letras: `inputMode` solo
 *    sugiere el teclado del móvil, no impide teclear. Los filtros de abajo se
 *    aplican en el `onChange`, así que lo que no corresponde simplemente no
 *    llega a aparecer.
 */

/** Máximos del esquema. Reflejan `packages/membresias-db/src/schema`. */
export const LIM = {
  orgNombre: 120,
  ciudad: 80,
  pais: 80,
  nombrePersona: 150,
  correo: 255,
  telefono: 40,
  planNombre: 120,
  notaCalendario: 200,
  checkinPin: 12,
  /** bcrypt solo mira los primeros 72 bytes; más allá es decorado. */
  password: 72,
  /** El precio es `decimal(10,2)`: ocho dígitos enteros. */
  precioEnteros: 8,
  /** Ningún club vende diez mil clases de golpe. */
  clases: 4,
  /** Cuadro de búsqueda: no viaja a ninguna columna, pero tampoco es infinito. */
  busqueda: 80,
} as const;

/** Solo dígitos, recortado a `max` cifras. */
export function soloDigitos(valor: string, max: number): string {
  return valor.replace(/\D/g, '').slice(0, max);
}

/**
 * Un importe: dígitos y como mucho un separador decimal con dos cifras detrás.
 * Se admite la coma porque es lo que se teclea en español, y se normaliza a
 * punto, que es lo que entiende la API.
 */
export function soloDinero(valor: string): string {
  const limpio = valor.replace(/[^\d.,]/g, '').replace(',', '.');
  const [enteros = '', ...resto] = limpio.split('.');
  const cabeza = enteros.slice(0, LIM.precioEnteros);
  if (resto.length === 0) return cabeza;
  // Todo lo que venga tras el primer punto es la parte decimal: si el usuario
  // teclea varios, los de más se ignoran en vez de partir el número.
  return `${cabeza}.${resto.join('').slice(0, 2)}`;
}

/**
 * Un teléfono. Dígitos y los signos que la gente escribe de verdad
 * (`+57 300 123-4567`, `(1) 555 0000`): filtrar a dígitos puros obligaría a
 * borrar el formato con el que cada quien se sabe su número.
 */
export function soloTelefono(valor: string): string {
  return valor.replace(/[^\d+()\-.\s]/g, '').slice(0, LIM.telefono);
}
