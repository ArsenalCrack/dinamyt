/**
 * Cumpleaños: qué día se celebra un nacimiento y cuántos años se cumplen.
 *
 * Todo trabaja con FECHAS CIVILES ('YYYY-MM-DD'), que no tienen zona: el 14 de
 * marzo es el 14 de marzo en Bogotá y en Madrid. Nada de `new Date(...)` con
 * horas, que corre el día (ver `packages/shared/src/fechas.ts` del monorepo).
 *
 * Lo usan tres sitios, y por eso vive aquí: el panel («quién cumple hoy»), el
 * aviso de la mañana (`generarAvisos`) y el calendario del mes. Si cada uno
 * decidiera por su cuenta qué pasa con el 29 de febrero, el calendario diría
 * una cosa y el aviso otra.
 */

export function esBisiesto(ano: number): boolean {
  return (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
}

/**
 * Los 'MM-DD' de nacimiento que se celebran el día `today`.
 *
 * **El 29 de febrero se celebra el 28 los años que no son bisiestos.** Sin
 * esto, quien nació un 29 de febrero no cumple años en esta aplicación tres de
 * cada cuatro años. Es el único caso que, si no se contempla, jamás se
 * descubre probando.
 */
export function nacimientosQueSeCelebran(today: string): string[] {
  const mmdd = today.slice(5);
  return mmdd === '02-28' && !esBisiesto(Number(today.slice(0, 4)))
    ? ['02-28', '02-29']
    : [mmdd];
}

/** El día del año `ano` en que se celebra quien nació en `birthDate`. */
export function diaDeCelebracion(birthDate: string, ano: number): string {
  const mmdd = birthDate.slice(5, 10);
  const dia = mmdd === '02-29' && !esBisiesto(ano) ? '02-28' : mmdd;
  return `${ano}-${dia}`;
}

/** Los años que cumple en `ano`. Es el número que se dice en voz alta. */
export function anosQueCumple(birthDate: string, ano: number): number {
  return ano - Number(birthDate.slice(0, 4));
}
