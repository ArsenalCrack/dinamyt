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
  notaCalendario: 200,
  notaPago: 500,
  grupo: 80,
  checkinPin: 12,
  /** bcrypt ignora todo lo que pase de 72 bytes: aceptar más engaña al usuario. */
  password: 72,
} as const;

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
