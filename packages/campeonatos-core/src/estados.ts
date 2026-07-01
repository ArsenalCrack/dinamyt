// Ciclo de vida de un campeonato (Requerimientos v3, §6.1).
// BORRADOR → LISTO → EN_CURSO → FINALIZADO. Solo se avanza un paso; no se
// retrocede ni se salta. Portado del control de estados de DINAMYT-PROJECT.

export const ESTADOS_CAMPEONATO = [
  'BORRADOR',
  'LISTO',
  'EN_CURSO',
  'FINALIZADO',
] as const;

export type EstadoCampeonato = (typeof ESTADOS_CAMPEONATO)[number];

/** Estado siguiente en el ciclo, o null si ya está FINALIZADO. */
export function siguienteEstado(e: EstadoCampeonato): EstadoCampeonato | null {
  const i = ESTADOS_CAMPEONATO.indexOf(e);
  return i >= 0 && i < ESTADOS_CAMPEONATO.length - 1
    ? ESTADOS_CAMPEONATO[i + 1]
    : null;
}

/** Solo es válido avanzar exactamente un paso en el ciclo. */
export function transicionValida(
  desde: EstadoCampeonato,
  hasta: EstadoCampeonato,
): boolean {
  return siguienteEstado(desde) === hasta;
}
