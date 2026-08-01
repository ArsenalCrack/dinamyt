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

/**
 * Un nombre de persona, en MAYÚSCULAS mientras se escribe.
 *
 * La API los guarda así de todas formas (`mayusculas` en su `lib/validacion.ts`),
 * pero convertirlos solo allí deja al maestro tecleando «Juan Pérez» y viendo
 * «JUAN PÉREZ» al recargar, sin saber por qué. Aplicándolo en el `onChange` lo
 * que se escribe es exactamente lo que se guarda.
 *
 * `toUpperCase()` conserva las tildes: «josé» → «JOSÉ», no «JOSE». El acento es
 * parte del nombre.
 */
export function enMayusculas(valor: string): string {
  return valor.toUpperCase();
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

/**
 * ¿Está completo el nombre? Dos palabras de dos letras o más.
 *
 * Es la misma regla que la API (`nombreCompleto` en `lib/validacion.ts`), aquí
 * para poder decirlo MIENTRAS se escribe: descubrir al pulsar «Crear» que el
 * nombre no valía, con el resto del formulario ya lleno, es la peor forma de
 * enterarse. Vacío cuenta como válido: de eso se encarga el `required`, y
 * teñir de rojo un campo que todavía no se ha tocado no ayuda a nadie.
 *
 * La inicial suelta no cuenta como palabra, así que «Ana M. Restrepo» pasa
 * (Ana y Restrepo) y «Juan» o «A B» no.
 */
export function nombreCompletoValido(valor: string): boolean {
  const limpio = valor.trim().replace(/\s+/g, ' ');
  if (!limpio) return true;
  if (/[^\p{L}\p{M}\s'’.-]/u.test(limpio)) return false;
  return limpio.split(' ').filter((p) => (p.match(/\p{L}/gu) ?? []).length >= 2).length >= 2;
}

/**
 * ¿Tiene forma de correo, con un dominio que exista de verdad?
 *
 * Mismas reglas que la API: buzón, etiquetas del dominio, TLD de solo letras y
 * —la que importa— un dominio registrable de dos letras para arriba. `g.com`
 * es lo que queda cuando alguien empieza a escribir «gmail» y envía antes de
 * tiempo: la cuenta nace con una llave que no abre nada.
 */
export function correoValido(valor: string): boolean {
  const limpio = valor.trim().toLowerCase();
  if (!limpio) return true;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio)) return false;

  const arroba = limpio.lastIndexOf('@');
  const buzon = limpio.slice(0, arroba);
  if (buzon.length > 64 || buzon.startsWith('.') || buzon.endsWith('.') || buzon.includes('..')) {
    return false;
  }
  const etiquetas = limpio.slice(arroba + 1).split('.');
  if (etiquetas.length < 2) return false;
  if (etiquetas.some((e) => e.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(e))) {
    return false;
  }
  if (!/^[a-z]{2,24}$/.test(etiquetas[etiquetas.length - 1])) return false;
  return etiquetas[etiquetas.length - 2].length >= 2;
}

/** Los proveedores de correo que usa casi todo el mundo por aquí. */
const PROVEEDORES = [
  'gmail.com',
  'hotmail.com',
  'outlook.com',
  'yahoo.com',
  'icloud.com',
  'live.com',
  'hotmail.es',
  'outlook.es',
];

/**
 * «¿Quisiste decir …?» para el dominio mal tecleado.
 *
 * Va SOLO en la web y no bloquea nada: `gmial.com` es sintácticamente
 * impecable, así que la API no tiene forma de rechazarlo sin rechazar también
 * dominios raros pero buenos —el correo del colegio, el de la empresa del
 * papá—. Aquí, en cambio, se puede preguntar sin cerrarle la puerta a nadie.
 *
 * Solo se sugiere a un dedazo o dos de distancia: más allá deja de ser un
 * despiste y empieza a ser otro dominio (`ymail.com` es de verdad, y está a
 * una letra de `gmail.com` — por eso la sugerencia no se impone).
 */
export function dominioSugerido(valor: string): string | null {
  const limpio = valor.trim().toLowerCase();
  const arroba = limpio.lastIndexOf('@');
  if (arroba < 0) return null;
  const dominio = limpio.slice(arroba + 1);
  if (!dominio || PROVEEDORES.includes(dominio)) return null;

  for (const p of PROVEEDORES) {
    const d = distancia(dominio, p);
    if (d > 0 && d <= 2) return `${limpio.slice(0, arroba)}@${p}`;
  }
  return null;
}

/** Distancia de edición (Levenshtein), con una sola fila de memoria. */
function distancia(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 99;
  let fila = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const siguiente = [i];
    for (let j = 1; j <= b.length; j++) {
      siguiente[j] = Math.min(
        fila[j] + 1,
        siguiente[j - 1] + 1,
        fila[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    fila = siguiente;
  }
  return fila[b.length];
}
