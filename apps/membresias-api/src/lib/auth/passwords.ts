import bcrypt from 'bcryptjs';

/**
 * Hash de contraseñas.
 *
 * 10 rondas, no las 12 por defecto de la librería: en la CPU compartida de un
 * plan económico 12 rondas tardan segundos y cada login se siente colgado. 10
 * sigue siendo seguro y es ~4× más rápido. Ajustable con `BCRYPT_ROUNDS`.
 */
const RONDAS = parseInt(process.env.BCRYPT_ROUNDS ?? '10', 10);

/** Longitud mínima aceptada al fijar o cambiar una contraseña. */
export const MIN_PASSWORD = 8;

export async function hashPassword(plano: string): Promise<string> {
  return bcrypt.hash(plano, RONDAS);
}

export async function verificarPassword(
  plano: string,
  hash: string,
): Promise<boolean> {
  try {
    return await bcrypt.compare(plano, hash);
  } catch {
    return false;
  }
}

/**
 * `true` si el hash guardado usa MÁS rondas que las configuradas. Permite bajar
 * el costo de forma transparente: tras un login correcto se vuelve a hashear.
 */
export function necesitaRehash(hash: string): boolean {
  try {
    return parseInt(hash.split('$')[2], 10) > RONDAS;
  } catch {
    return true;
  }
}

/** Valida una contraseña nueva. Devuelve el error legible, o `null` si sirve. */
export function validarPassword(plano: string): string | null {
  if (!plano || plano.length < MIN_PASSWORD) {
    return `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`;
  }
  return null;
}
