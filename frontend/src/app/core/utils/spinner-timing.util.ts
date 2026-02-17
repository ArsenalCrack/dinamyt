/**
 * Duración mínima del spinner de carga en milisegundos.
 * Evita que el spinner aparezca y desaparezca demasiado rápido,
 * lo cual genera una mala experiencia visual para el usuario.
 */
export const DEFAULT_MIN_SPINNER_MS = 900;

/**
 * Calcula el tiempo restante que debe mostrarse el spinner para
 * cumplir con la duración mínima establecida.
 *
 * @param inicioMs Marca de tiempo (Date.now()) de cuando inició la carga
 * @param duracionMinimaMs Duración mínima del spinner (por defecto 900ms)
 * @returns Promesa que se resuelve cuando haya pasado el tiempo mínimo
 */
export function delayRemaining(
  inicioMs: number,
  duracionMinimaMs: number = DEFAULT_MIN_SPINNER_MS
): Promise<void> {
  const transcurrido = Date.now() - inicioMs;
  const restante = Math.max(0, duracionMinimaMs - transcurrido);
  if (restante <= 0) return Promise.resolve();
  return new Promise(resolve => setTimeout(resolve, restante));
}
