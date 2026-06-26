import { describe, it, expect } from 'vitest';
import {
  generarBracket,
  avanzar,
  siguientePotenciaDe2,
  type SlotCompetidor,
  type Shuffle,
} from './brackets';

// Shuffle identidad → brackets deterministas para los tests.
const sinSorteo: Shuffle = (arr) => [...arr];

function comps(n: number): SlotCompetidor[] {
  return Array.from({ length: n }, (_, i) => ({
    id: String.fromCharCode(97 + i),
    nombre: `C${i + 1}`,
  }));
}

describe('siguientePotenciaDe2', () => {
  it('redondea hacia arriba', () => {
    expect(siguientePotenciaDe2(2)).toBe(2);
    expect(siguientePotenciaDe2(3)).toBe(4);
    expect(siguientePotenciaDe2(5)).toBe(8);
    expect(siguientePotenciaDe2(8)).toBe(8);
  });
});

describe('generarBracket', () => {
  it('2 competidores: una sola pareja, sin byes', () => {
    const b = generarBracket(comps(2), sinSorteo);
    expect(b.rondas).toHaveLength(1);
    expect(b.rondas[0]).toHaveLength(1);
    expect(b.rondas[0][0].comp2).not.toBeNull();
    expect(b.campeon).toBeNull();
  });

  it('3 competidores: tamaño 4, 1 bye que avanza solo', () => {
    const b = generarBracket(comps(3), sinSorteo);
    expect(b.rondas).toHaveLength(2); // r0 (2 partidos) + final
    const byes = b.rondas[0].filter((p) => p.comp1 && !p.comp2);
    expect(byes).toHaveLength(1);
    expect(byes[0].ganador).toBe(1);
    // el bye aparece ya colocado en la siguiente ronda
    const enFinal = b.rondas[1].some(
      (p) => p.comp1?.id === byes[0].comp1!.id || p.comp2?.id === byes[0].comp1!.id,
    );
    expect(enFinal).toBe(true);
  });

  it('5 competidores: tamaño 8, 3 byes; ningún competidor enfrenta un bye', () => {
    const b = generarBracket(comps(5), sinSorteo);
    expect(b.rondas).toHaveLength(3);
    expect(b.rondas[0]).toHaveLength(4);
    expect(b.rondas[0].filter((p) => p.comp1 && !p.comp2)).toHaveLength(3);
    // nunca hay un partido con comp1 vacío (los byes solo dejan comp2 vacío)
    expect(b.rondas[0].every((p) => p.comp1 !== null)).toBe(true);
  });

  it('avanzar declara campeón en la última ronda', () => {
    const b = generarBracket(comps(2), sinSorteo);
    b.rondas[0][0].ganador = 1;
    avanzar(b, 0, 0);
    expect(b.campeon?.id).toBe(b.rondas[0][0].comp1?.id);
  });
});
