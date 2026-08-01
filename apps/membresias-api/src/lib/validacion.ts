/**
 * Límites de los campos de texto y de número, en un solo sitio.
 *
 * Existen porque las columnas son `varchar(n)`: sin este filtro, un nombre de
 * 300 caracteres no da un aviso al usuario, revienta contra PostgreSQL y sale
 * un 500 sin explicación. Aquí se convierte en un 422 con un texto que la
 * pantalla puede mostrar tal cual.
 *
 * Los números son el mismo problema al revés: `price` es `decimal(10,2)`, así
 * que un valor más grande que 99 999 999,99 —o con letras dentro— tampoco
 * cabe en la columna.
 *
 * La web repite estos topes como `maxLength` para que el usuario no llegue
 * siquiera a escribir de más; esto es la red de seguridad, porque el navegador
 * no es el único que llama a esta API.
 */

/** Máximos que impone el esquema (ver `packages/membresias-db/src/schema`). */
export const LIMITES = {
  orgNombre: 120,
  orgSlug: 60,
  ciudad: 80,
  pais: 80,
  nombrePersona: 150,
  correo: 255,
  telefono: 40,
  planNombre: 120,
  /**
   * El motivo de una excepción del calendario. Más largo que el resto a
   * propósito: aquí no cabe un dato, cabe una explicación —«cerrado por el
   * campeonato departamental, volvemos el lunes»— y con 200 se cortaba a
   * media frase.
   */
  notaCalendario: 500,
  notaPago: 500,
  grupo: 80,
  checkinPin: 12,
  /** bcrypt ignora todo lo que pase de 72 bytes: aceptar más engaña al usuario. */
  password: 72,
} as const;

/**
 * Los ocho grupos sanguíneos del sistema ABO/Rh. Es una lista cerrada a
 * propósito: un tipo de sangre escrito a mano —«O positivo», «0+», «o+»— no le
 * sirve a nadie el día que hay que leerlo deprisa.
 */
export const TIPOS_SANGRE = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'] as const;

/** Precio/monto: `decimal(10,2)` → ocho enteros y dos decimales. */
export const MAX_DINERO = 99_999_999.99;
/** Clases de un paquete: `integer`, y ningún club vende diez mil de golpe. */
export const MAX_CLASES = 9999;

/**
 * Un campo validado: o trae el valor listo para guardar, o el texto del error
 * que se le muestra a quien lo escribió.
 */
export type Campo<T> = { ok: true; valor: T } | { ok: false; error: string };

const bien = <T>(valor: T): Campo<T> => ({ ok: true, valor });
const mal = (error: string): Campo<never> => ({ ok: false, error });

/**
 * Recorta un texto y comprueba que quepa. Devuelve el valor ya normalizado
 * (`null` si quedó vacío).
 */
export function textoOpcional(
  valor: string | null | undefined,
  max: number,
  campo: string,
): Campo<string | null> {
  const limpio = (valor ?? '').trim();
  if (limpio.length > max) return mal(`${campo} no puede pasar de ${max} caracteres.`);
  return bien(limpio || null);
}

/**
 * Un teléfono.
 *
 * Se guarda tal cual lo escribió su dueño —`+57 300 123 4567`, `(1) 555 0000`—
 * porque así lo reconoce, pero lo que se cuenta son los DÍGITOS: sin un mínimo,
 * un «3» suelto pasaba por teléfono válido y el maestro se quedaba con un
 * número al que no puede llamar. Siete es el abonado local más corto que existe
 * y quince el máximo del plan de numeración internacional (E.164).
 */
export const TELEFONO_DIGITOS_MIN = 7;
export const TELEFONO_DIGITOS_MAX = 15;

export function telefono(
  valor: string | null | undefined,
  campo = 'El teléfono',
): Campo<string | null> {
  const texto = textoOpcional(valor, LIMITES.telefono, campo);
  if (!texto.ok || !texto.valor) return texto;

  const digitos = texto.valor.replace(/\D/g, '').length;
  if (digitos < TELEFONO_DIGITOS_MIN) {
    return mal(`${campo} debe tener al menos ${TELEFONO_DIGITOS_MIN} dígitos.`);
  }
  if (digitos > TELEFONO_DIGITOS_MAX) {
    return mal(`${campo} no puede pasar de ${TELEFONO_DIGITOS_MAX} dígitos.`);
  }
  return texto;
}

/**
 * Un correo con forma de correo.
 *
 * Hasta aquí solo se comprobaba que viniera algo y que cupiera, así que
 * `pepito` entraba como correo válido: el `type="email"` del navegador no es
 * validación, es una sugerencia que se salta cualquiera que llame a la API sin
 * pasar por la web. Y ese correo es la llave con la que el alumno entra —una
 * cuenta con un correo imposible no la puede usar nadie y solo el maestro
 * puede arreglarla—.
 *
 * ── Por qué no basta con «tiene arroba y un punto» ──
 *
 * Con eso pasaba `pepito@g.com`, que es lo que sale cuando alguien empieza a
 * escribir «gmail» y le da a enviar antes de tiempo: el correo es sintáctico
 * pero no existe, y la cuenta nace inservible sin que nadie se entere hasta
 * que el alumno no puede entrar. Así que además de la forma se comprueba el
 * DOMINIO pieza por pieza (ver `DOMINIO_*` abajo).
 *
 * Lo que NO se hace aquí es adivinar: no existe una expresión que acepte todos
 * los correos legales y rechace todos los ilegales, y un correo raro pero
 * bueno rechazado es peor que uno malo aceptado —el segundo se corrige, el
 * primero deja a alguien fuera del club—. Corregir los despistes típicos
 * (`gmial.com`) es cosa de la web, que los SUGIERE sin bloquear.
 */

/** Longitud mínima del dominio registrable —la etiqueta antes del TLD—. */
const DOMINIO_ETIQUETA_MIN = 2;
/** Un TLD son solo letras: entre `.co` y los largos tipo `.international`. */
const DOMINIO_TLD = /^[a-z]{2,24}$/;
/** Cada etiqueta del dominio: letras, dígitos y guiones por dentro. */
const DOMINIO_ETIQUETA = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export function correo(valor: string | null | undefined): Campo<string> {
  const texto = textoObligatorio(valor, LIMITES.correo, 'El correo');
  if (!texto.ok) return texto;

  const limpio = texto.valor.toLowerCase();
  const forma = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio);
  if (!forma) return mal('El correo debe tener la forma nombre@dominio.com.');

  const arroba = limpio.lastIndexOf('@');
  const buzon = limpio.slice(0, arroba);
  const dominio = limpio.slice(arroba + 1);

  // El buzón admite casi cualquier cosa (hay direcciones con `+`, `_` y `'`),
  // pero no puntos sueltos en los extremos ni dobles: eso siempre es un dedazo.
  if (buzon.length > 64 || buzon.startsWith('.') || buzon.endsWith('.') || buzon.includes('..')) {
    return mal('El correo debe tener la forma nombre@dominio.com.');
  }

  const etiquetas = dominio.split('.');
  if (etiquetas.length < 2 || etiquetas.some((e) => !DOMINIO_ETIQUETA.test(e) || e.length > 63)) {
    return mal(`El dominio «${dominio}» no parece un dominio de correo.`);
  }
  const tld = etiquetas[etiquetas.length - 1];
  if (!DOMINIO_TLD.test(tld)) {
    return mal(`El dominio «${dominio}» no parece un dominio de correo.`);
  }
  // La etiqueta registrable de una letra —`g.com`— es casi siempre un dominio
  // a medio escribir. Existen unos pocos de verdad (x.com), pero ninguno da
  // correo a nadie, y dejarla pasar es dejar pasar el error que se cuela de
  // verdad en la inscripción.
  if (etiquetas[etiquetas.length - 2].length < DOMINIO_ETIQUETA_MIN) {
    return mal(`El dominio «${dominio}» está incompleto. ¿Faltó parte del nombre?`);
  }
  return bien(limpio);
}

/**
 * El nombre de una persona, completo.
 *
 * `textoObligatorio` daba por bueno «A»: una letra suelta pasaba la validación
 * y quedaba impresa en el carnet, en el recibo de los pagos y en la lista del
 * maestro. Y en una lista de treinta alumnos, «Juan» a secas tampoco identifica
 * a nadie el día que hay dos.
 *
 * La regla es la mínima que sirve: al menos DOS palabras con nombre de tal
 * —dos letras o más—. Eso deja pasar «Ana M. Restrepo» (la inicial no cuenta
 * como palabra, pero Ana y Restrepo sí) y «Li Wu», que son nombres reales, y
 * corta «J», «Juan» y «A B».
 *
 * No se exige un apellido concreto ni se cuentan las palabras hacia arriba:
 * hay gente con un nombre y cuatro apellidos, y gente con dos de cada.
 */
export function nombreCompleto(
  valor: string | null | undefined,
  campo = 'El nombre',
): Campo<string> {
  const base = textoObligatorio(valor, LIMITES.nombrePersona, campo);
  if (!base.ok) return base;

  // Los espacios de más se colapsan: «Ana   Restrepo» y «Ana Restrepo» son la
  // misma persona, y guardarlos distintos rompe la búsqueda por nombre.
  const limpio = base.valor.replace(/\s+/g, ' ');
  if (/[^\p{L}\p{M}\s'’.-]/u.test(limpio)) {
    return mal(`${campo} solo puede llevar letras, espacios, apóstrofos y guiones.`);
  }
  const palabras = limpio.split(' ').filter((p) => contarLetras(p) >= 2);
  if (palabras.length < 2) {
    return mal(`${campo} debe ir completo: nombre y apellido.`);
  }
  return bien(mayusculas(limpio));
}

/**
 * El nombre de una persona, en MAYÚSCULAS.
 *
 * Se guarda así, no solo se pinta así, y esa es la diferencia que importa: los
 * nombres los teclean personas distintas en momentos distintos —el maestro al
 * inscribir, el auxiliar al corregir un dedazo— y salían «Juan pérez», «JUAN
 * PEREZ» y «Juan Pérez» en la misma lista. En el carnet impreso, que es un
 * documento, eso se nota. Normalizándolo al guardar, la lista, el carnet, el
 * recibo del pago y el aviso dicen todos lo mismo sin que ninguna pantalla
 * tenga que acordarse de convertirlo.
 *
 * `toUpperCase()` a secas y no `toLocaleUpperCase`: para el español dan el
 * mismo resultado —las tildes se conservan (josé → JOSÉ)— y la versión con
 * idioma solo cambia las cosas en turco, donde la «i» tiene otras reglas.
 *
 * Es una conversión que PIERDE información: de «JUAN PÉREZ» ya no se puede
 * volver a «Juan Pérez». Es la decisión que se tomó a propósito.
 */
export function mayusculas(valor: string): string;
export function mayusculas(valor: string | null): string | null;
export function mayusculas(valor: string | null): string | null {
  return valor === null ? null : valor.toUpperCase();
}

/** Letras de verdad (con tildes y diacríticos), sin puntos ni guiones. */
function contarLetras(texto: string): number {
  return (texto.match(/\p{L}/gu) ?? []).length;
}

/** Un grupo sanguíneo de la lista, o nada. */
export function tipoSangre(valor: string | null | undefined): Campo<string | null> {
  const texto = (valor ?? '').trim().toUpperCase();
  if (!texto) return bien(null);
  if (!(TIPOS_SANGRE as readonly string[]).includes(texto)) {
    return mal(`El tipo de sangre debe ser uno de: ${TIPOS_SANGRE.join(', ')}.`);
  }
  return bien(texto);
}

/** Igual que `textoOpcional`, pero además exige que venga algo. */
export function textoObligatorio(
  valor: string | null | undefined,
  max: number,
  campo: string,
): Campo<string> {
  const r = textoOpcional(valor, max, campo);
  if (!r.ok) return r;
  if (!r.valor) return mal(`${campo} es obligatorio.`);
  return bien(r.valor);
}

/**
 * Un importe de dinero. Acepta número o texto ("35000", "35000.50") y rechaza
 * lo que no sea un número, lo negativo y lo que no quepa en la columna.
 */
export function dinero(valor: unknown, campo: string): Campo<string> {
  const texto = typeof valor === 'number' ? String(valor) : String(valor ?? '').trim();
  if (!/^\d{1,8}([.,]\d{1,2})?$/.test(texto)) {
    return mal(`${campo} debe ser un número (hasta dos decimales).`);
  }
  const n = parseFloat(texto.replace(',', '.'));
  if (!isFinite(n) || n < 0) return mal(`${campo} debe ser un número positivo.`);
  if (n > MAX_DINERO) return mal(`${campo} no puede pasar de ${MAX_DINERO}.`);
  return bien(n.toFixed(2));
}

/**
 * Una fecha `YYYY-MM-DD` de verdad.
 *
 * No basta con la forma: `2026-02-31` la cumple y PostgreSQL la rechaza con un
 * error que no se le puede enseñar a nadie. Se comprueba reconstruyéndola, que
 * es lo único que descarta los días que no existen.
 *
 * El rango por defecto (2000–2100) es el mismo que aceptan los formularios de
 * la web: un `type="date"` sin acotar admite años de cinco cifras.
 */
export function fecha(
  valor: unknown,
  campo: string,
  rango: { min?: string; max?: string } = {},
): Campo<string | null> {
  const texto = String(valor ?? '').trim();
  if (!texto) return bien(null);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    return mal(`${campo} debe tener el formato AAAA-MM-DD.`);
  }
  const d = new Date(`${texto}T00:00:00.000Z`);
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== texto) {
    return mal(`${campo} no es una fecha real.`);
  }
  const min = rango.min ?? '2000-01-01';
  const max = rango.max ?? '2100-12-31';
  if (texto < min) return mal(`${campo} no puede ser anterior a ${min}.`);
  if (texto > max) return mal(`${campo} no puede ser posterior a ${max}.`);
  return bien(texto);
}

/** Un entero de 0 a `max`. `null`, `undefined` y '' pasan como `null`. */
export function enteroOpcional(
  valor: unknown,
  max: number,
  campo: string,
): Campo<number | null> {
  if (valor === undefined || valor === null || valor === '') return bien(null);
  const n = typeof valor === 'number' ? valor : Number(String(valor).trim());
  if (!Number.isInteger(n) || n < 0) {
    return mal(`${campo} debe ser un número entero positivo.`);
  }
  if (n > max) return mal(`${campo} no puede pasar de ${max}.`);
  return bien(n);
}
