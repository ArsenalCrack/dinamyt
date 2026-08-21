import bcrypt from 'bcryptjs';
import { LIMITES } from '../validacion';

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

/**
 * Máximo al FIJAR una contraseña. No es un capricho: bcrypt solo mira los
 * primeros 72 bytes y descarta el resto en silencio, así que aceptar más larga
 * le vende al usuario una seguridad que no tiene. El login no aplica este tope
 * —quien ya tenga una más larga sigue entrando igual.
 */
export const MAX_PASSWORD = LIMITES.password;

export async function hashPassword(plano: string): Promise<string> {
  return bcrypt.hash(plano, RONDAS);
}

/**
 * Comprueba una contraseña contra el hash guardado.
 *
 * El hash puede estar VACÍO, y no es un caso raro: una ficha creada desde el
 * ecosistema no tiene contraseña propia (ver la migración 0016). Entonces esto
 * devuelve `false` sin más, que es lo correcto — por el formulario no se entra
 * — y sin distinguirse de una contraseña equivocada, que es lo que impide que
 * el login delate qué correos están dados de alta.
 */
export async function verificarPassword(
  plano: string,
  hash: string | null | undefined,
): Promise<boolean> {
  if (!hash) return false;
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
export function necesitaRehash(hash: string | null | undefined): boolean {
  // Sin hash no hay nada que rehashear. Devolver `true` aquí haría que el login
  // por SSO intentara guardar el hash de una contraseña que nadie escribió.
  if (!hash) return false;
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
  if (Buffer.byteLength(plano, 'utf8') > MAX_PASSWORD) {
    return `La contraseña no puede pasar de ${MAX_PASSWORD} caracteres.`;
  }
  return null;
}
