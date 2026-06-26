import { describe, it, expect } from 'vitest';
import {
  PUNTOS_COMBATE,
  totalCombate,
  descalificado,
  totalFigura,
  desempatesPodio,
} from './puntuacion';

describe('puntuación de combate (§7.5)', () => {
  it('valores de las acciones', () => {
    expect(PUNTOS_COMBATE.patada_cabeza).toBe(2);
    expect(PUNTOS_COMBATE.giratoria_cabeza).toBe(3);
    expect(PUNTOS_COMBATE.kyong_go).toBe(-0.5);
    expect(PUNTOS_COMBATE.gam_jeom).toBe(-1);
  });

  it('suma con penalizaciones', () => {
    // +2 +3 -0.5 = 4.5
    expect(
      totalCombate(['patada_cabeza', 'giratoria_cabeza', 'kyong_go']),
    ).toBe(4.5);
  });

  it('descalificación por acumulación de faltas', () => {
    expect(descalificado(6, 0)).toBe(true);
    expect(descalificado(0, 3)).toBe(true);
    expect(descalificado(5, 2)).toBe(false);
  });
});

describe('puntuación de figuras (§7.2)', () => {
  it('suma los jueces activos e ignora ausentes', () => {
    expect(totalFigura([8, 9, 7.5, 8])).toBe(32.5);
    expect(totalFigura([8, 9, null, undefined])).toBe(17); // < 4 jueces
  });
});

describe('desempates de podio (§7.3)', () => {
  it('detecta empate en 1-2 dentro del podio', () => {
    const r = desempatesPodio([
      { id: 'a', total: 30 },
      { id: 'b', total: 30 },
      { id: 'c', total: 25 },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].posiciones).toEqual([1, 2]);
    expect(r[0].ids).toEqual(['a', 'b']);
  });

  it('NO desempata 4-5 o más', () => {
    const r = desempatesPodio([
      { id: 'a', total: 30 },
      { id: 'b', total: 28 },
      { id: 'c', total: 26 },
      { id: 'd', total: 20 },
      { id: 'e', total: 20 }, // empate en 4-5: no se disputa
    ]);
    expect(r).toHaveLength(0);
  });

  it('sin empates, sin desempates', () => {
    expect(
      desempatesPodio([
        { id: 'a', total: 30 },
        { id: 'b', total: 29 },
      ]),
    ).toHaveLength(0);
  });
});
