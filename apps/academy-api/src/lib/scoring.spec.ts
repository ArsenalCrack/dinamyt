import { describe, it, expect } from 'vitest';
import { notaBloque, notaFinal } from './scoring';

describe('calificación ponderada (RF-ACA-21)', () => {
  it('normaliza cada bloque a 0-100 por sus puntos', () => {
    expect(notaBloque({ obtenidos: 1, posibles: 2 })).toBe(50);
    expect(notaBloque({ obtenidos: 3, posibles: 4 })).toBe(75);
    expect(notaBloque({ obtenidos: 0, posibles: 0 })).toBeNull();
  });

  it('pondera opción múltiple y evidencias según mcWeight', () => {
    // 60% MC (50) + 40% evidencias (75) = 30 + 30 = 60
    expect(notaFinal(60, 50, 75)).toBe(60);
    expect(notaFinal(50, 100, 0)).toBe(50);
  });

  it('si solo hay un bloque, ese bloque vale el 100%', () => {
    expect(notaFinal(60, 80, null)).toBe(80);
    expect(notaFinal(60, null, 90)).toBe(90);
    expect(notaFinal(60, null, null)).toBeNull();
  });

  it('acota mcWeight fuera de rango', () => {
    expect(notaFinal(150, 100, 0)).toBe(100);
    expect(notaFinal(-10, 100, 0)).toBe(0);
  });
});
