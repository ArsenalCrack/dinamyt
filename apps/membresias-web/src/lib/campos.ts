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
  /** El motivo de una excepción del calendario: es una frase, no un dato. */
  notaCalendario: 500,
  /**
   * PIN de check-in. La columna acepta doce dígitos, pero la app genera de
   * cuatro y el maestro los teclea a mano solo para corregirlos: dejar escribir
   * doce era ofrecer un PIN que ningún niño va a acertar en el kiosco.
   */
  checkinPin: 6,
  /** bcrypt solo mira los primeros 72 bytes; más allá es decorado. */
  password: 72,
  /** El precio es `decimal(10,2)`: ocho dígitos enteros. */
  precioEnteros: 8,
  /** Ningún club vende diez mil clases de golpe. */
  clases: 4,
  /** Cuadro de búsqueda: no viaja a ninguna columna, pero tampoco es infinito. */
  busqueda: 80,
} as const;

/**
 * Los ocho grupos sanguíneos del sistema ABO/Rh. Lista cerrada y no campo
 * libre: un tipo escrito a mano —«O positivo», «0+», «o +»— no le sirve a nadie
 * el día que hay que leerlo deprisa. Mismos valores que valida la API
 * (`TIPOS_SANGRE` en `lib/validacion.ts`).
 */
export const TIPOS_SANGRE = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'] as const;

/** Solo dígitos, recortado a `max` cifras. */
export function soloDigitos(valor: string, max: number): string {
  return valor.replace(/\D/g, '').slice(0, max);
}

/*
 * El filtro de los importes ya no vive aquí: lo hace `<CampoDinero>`
 * (`components/CampoDinero.tsx`), que además los escribe con el símbolo de la
 * moneda y los miles separados. Tuvo que mudarse porque cuál es el separador
 * decimal depende del idioma configurado, y aquí se daba por hecho que era la
 * coma.
 */

/**
 * Un teléfono. Dígitos y los signos que la gente escribe de verdad
 * (`+57 300 123-4567`, `(1) 555 0000`): filtrar a dígitos puros obligaría a
 * borrar el formato con el que cada quien se sabe su número.
 *
 * El tope real son los DÍGITOS, no los caracteres. Antes el campo dejaba
 * teclear cuarenta caracteres —el ancho de la columna— y el aviso de «entre 7
 * y 15 dígitos» aparecía debajo mientras el número seguía creciendo: se podía
 * escribir un teléfono de veinte cifras y descubrir al enviar que no valía.
 * Ahora el dígito dieciséis simplemente no entra, y los separadores se siguen
 * pudiendo escribir y borrar con normalidad.
 */
export function soloTelefono(valor: string): string {
  const limpio = valor.replace(/[^\d+()\-.\s]/g, '').slice(0, LIM.telefono);

  let digitos = 0;
  let cortado = '';
  for (const c of limpio) {
    if (/\d/.test(c)) {
      if (digitos >= TELEFONO_DIGITOS_MAX) continue;
      digitos++;
    }
    cortado += c;
  }
  return cortado;
}

/**
 * Cuántos dígitos tiene que tener un teléfono para ser uno.
 *
 * Se cuentan los DÍGITOS y no los caracteres: `+57 (300) 123-4567` son
 * diecinueve caracteres y doce dígitos, y lo que importa es lo segundo. Siete
 * es el abonado local más corto que existe; quince, el máximo internacional
 * (E.164). Mismos números que la API — ver `lib/validacion.ts`.
 */
export const TELEFONO_DIGITOS_MIN = 7;
export const TELEFONO_DIGITOS_MAX = 15;

export function digitosDe(valor: string): number {
  return valor.replace(/\D/g, '').length;
}

/**
 * `true` si el teléfono está vacío (es opcional) o si es plausible. Se usa para
 * avisar MIENTRAS se escribe, en vez de dejar que el formulario viaje y vuelva
 * con un 422.
 */
export function telefonoValido(valor: string): boolean {
  const n = digitosDe(valor);
  return n === 0 || (n >= TELEFONO_DIGITOS_MIN && n <= TELEFONO_DIGITOS_MAX);
}
