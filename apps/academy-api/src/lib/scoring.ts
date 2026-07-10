/**
 * Calificación de una evaluación (RF-ACA-19/21), en escala 0-100.
 *
 * Cada bloque (opción múltiple / evidencias) se normaliza por sus puntos y la
 * nota final es la suma ponderada: `mcWeight`% el bloque automático y el resto
 * las evidencias. Si la evaluación solo tiene un tipo de pregunta, ese bloque
 * vale el 100% (el peso configurado no castiga lo que no existe).
 */

export interface BloquePuntos {
  /** Puntos obtenidos en el bloque. */
  obtenidos: number;
  /** Puntos posibles del bloque (0 si no hay preguntas de ese tipo). */
  posibles: number;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

/** Nota 0-100 de un bloque, o null si el bloque no tiene preguntas. */
export function notaBloque(b: BloquePuntos): number | null {
  if (b.posibles <= 0) return null;
  return redondear((100 * b.obtenidos) / b.posibles);
}

/** Nota final ponderada (RF-ACA-21). null si no hay nada calificable. */
export function notaFinal(
  mcWeight: number,
  mcScore: number | null,
  evidenceScore: number | null,
): number | null {
  if (mcScore === null && evidenceScore === null) return null;
  if (evidenceScore === null) return mcScore;
  if (mcScore === null) return evidenceScore;
  const w = Math.min(100, Math.max(0, mcWeight));
  return redondear((w * mcScore + (100 - w) * evidenceScore) / 100);
}
