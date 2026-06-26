// Generación de brackets de eliminación directa (§8.3), portado de
// DINAMYT-COMBAT: tamaño = siguiente potencia de 2; los byes se reparten para
// que ningún competidor enfrente a otro bye en la primera ronda y avanzan solos.

export interface SlotCompetidor {
  id: string;
  nombre: string;
  club?: string;
}

export interface Partido {
  comp1: SlotCompetidor | null;
  comp2: SlotCompetidor | null;
  ganador: 1 | 2 | null;
}

export interface Bracket {
  competidores: SlotCompetidor[];
  rondas: Partido[][];
  campeon: SlotCompetidor | null;
}

export type Shuffle = <T>(arr: ReadonlyArray<T>) => T[];

/** Shuffle por defecto (Fisher-Yates). En tests se inyecta uno determinista. */
const shuffleAleatorio: Shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** Siguiente potencia de 2 >= n (mínimo 2). */
export function siguientePotenciaDe2(n: number): number {
  if (n <= 1) return 2;
  return 2 ** Math.ceil(Math.log2(n));
}

/**
 * Genera el cuadro inicial. `shuffle` es inyectable para tests deterministas
 * (por defecto, sorteo aleatorio).
 */
export function generarBracket(
  competidores: ReadonlyArray<SlotCompetidor>,
  shuffle: Shuffle = shuffleAleatorio,
): Bracket {
  const comps = shuffle(competidores);
  const n = comps.length;
  const size = n > 1 ? siguientePotenciaDe2(n) : 2;
  const numByes = size - n;

  const partidosR0: Partido[] = [];
  for (let i = 0; i < numByes; i++) {
    partidosR0.push({ comp1: comps[i], comp2: null, ganador: null });
  }
  const resto = comps.slice(numByes);
  for (let i = 0; i < resto.length; i += 2) {
    partidosR0.push({
      comp1: resto[i],
      comp2: resto[i + 1] ?? null,
      ganador: null,
    });
  }
  const r0 = shuffle(partidosR0);

  const rondas: Partido[][] = [r0];
  let enRonda = r0.length;
  while (enRonda > 1) {
    enRonda = Math.floor(enRonda / 2);
    rondas.push(
      Array.from({ length: enRonda }, () => ({
        comp1: null,
        comp2: null,
        ganador: null as 1 | 2 | null,
      })),
    );
  }

  const bracket: Bracket = { competidores: comps, rondas, campeon: null };

  // Los byes (sin comp2) avanzan automáticamente a la siguiente ronda.
  rondas[0].forEach((p, idx) => {
    if (p.comp1 && !p.comp2) {
      p.ganador = 1;
      avanzar(bracket, 0, idx);
    }
  });

  return bracket;
}

/** Coloca al ganador de un partido en su lugar de la siguiente ronda (o campeón). */
export function avanzar(
  bracket: Bracket,
  rondaIdx: number,
  partidoIdx: number,
): void {
  const partido = bracket.rondas[rondaIdx][partidoIdx];
  const ganador =
    partido.ganador === 1
      ? partido.comp1
      : partido.ganador === 2
        ? partido.comp2
        : null;
  if (!ganador) return;

  const siguiente = rondaIdx + 1;
  if (siguiente >= bracket.rondas.length) {
    bracket.campeon = ganador;
    return;
  }

  const destino = Math.floor(partidoIdx / 2);
  const slot = partidoIdx % 2 === 0 ? 'comp1' : 'comp2';
  bracket.rondas[siguiente][destino][slot] = ganador;
}
