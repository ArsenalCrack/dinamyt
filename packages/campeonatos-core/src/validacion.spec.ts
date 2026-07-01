import { describe, it, expect } from 'vitest';
import {
  expandirCinturonRango,
  normalizarCinturon,
  validarCategorias,
  validarDatosCampeonato,
} from './validacion';

describe('expandirCinturonRango', () => {
  it('expande por orden de grupo', () => {
    expect(expandirCinturonRango('PRINCIPIANTE', 'AVANZADO')).toEqual([
      'PRINCIPIANTE',
      'INTERMEDIO',
      'AVANZADO',
    ]);
    expect(expandirCinturonRango('AVANZADO', 'BLANCO')).toEqual([]); // orden inválido
  });
});

describe('normalizarCinturon', () => {
  it('rellena grupos para individual y rango', () => {
    const r = normalizarCinturon({
      genero: 'mixto',
      cinturon: [
        { activa: true, tipo: 'individual', valor: 'INTERMEDIO' },
        { activa: true, tipo: 'rango', desde: 'BLANCO', hasta: 'INTERMEDIO' },
      ],
    });
    expect(r.cinturon![0].grupos).toEqual(['INTERMEDIO']);
    expect(r.cinturon![1].grupos).toEqual(['BLANCO', 'PRINCIPIANTE', 'INTERMEDIO']);
  });
});

describe('validarCategorias', () => {
  it('acepta categorías válidas', () => {
    expect(
      validarCategorias({
        genero: 'separado',
        cinturon: [{ activa: true, tipo: 'individual', valor: 'INTERMEDIO' }],
        edad: [{ activa: true, tipo: 'rango', desde: '12', hasta: '15' }],
        peso: [{ activa: true, tipo: 'rango', desde: '40', hasta: '60' }],
      }),
    ).toEqual([]);
  });

  it('rechaza edad fuera de límite y rangos solapados', () => {
    const errs = validarCategorias({
      genero: 'mixto',
      edad: [
        { activa: true, tipo: 'rango', desde: '2', hasta: '8' }, // <4
        { activa: true, tipo: 'rango', desde: '6', hasta: '10' }, // solapa
      ],
    });
    expect(errs.length).toBeGreaterThanOrEqual(2);
  });

  it('rechaza cinturón con orden invertido y peso bajo mínimo', () => {
    const errs = validarCategorias({
      genero: 'mixto',
      cinturon: [{ activa: true, tipo: 'rango', desde: 'NEGRO', hasta: 'BLANCO' }],
      peso: [{ activa: true, tipo: 'individual', valor: '5' }],
    });
    expect(errs.some((e) => e.includes('cinturón'))).toBe(true);
    expect(errs.some((e) => e.includes('peso'))).toBe(true);
  });
});

describe('validarDatosCampeonato', () => {
  it('acepta datos válidos', () => {
    expect(
      validarDatosCampeonato({
        nombre: 'Copa Norte',
        ubicacion: 'Coliseo',
        alcance: 'Nacional',
        numTatamis: 4,
        maxParticipantes: 100,
        fechaInicio: '2026-08-01',
        fechaFin: '2026-08-02',
      }),
    ).toEqual([]);
  });

  it('rechaza límites inválidos', () => {
    const errs = validarDatosCampeonato({
      nombre: 'X', // <3
      alcance: 'Galáctico',
      numTatamis: 20,
      maxParticipantes: 1,
      fechaInicio: '2026-08-10',
      fechaFin: '2026-08-01',
    });
    expect(errs.length).toBeGreaterThanOrEqual(4);
  });
});
