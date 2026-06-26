import { describe, it, expect } from 'vitest';
import {
  grupoAlMenos,
  calcularEdad,
  validarRestriccion,
  generoSeccionCombate,
  enRango,
  etiquetaRango,
  claveSeccion,
  nombreSeccion,
} from './categorizacion';

describe('jerarquía de cinturones', () => {
  it('compara grupos por orden', () => {
    expect(grupoAlMenos('INTERMEDIO', 'INTERMEDIO')).toBe(true);
    expect(grupoAlMenos('AVANZADO', 'INTERMEDIO')).toBe(true);
    expect(grupoAlMenos('PRINCIPIANTE', 'INTERMEDIO')).toBe(false);
  });
});

describe('calcularEdad', () => {
  it('resta un año si aún no cumple en la fecha de referencia', () => {
    const ref = new Date('2026-06-01');
    expect(calcularEdad(new Date('2010-01-15'), ref)).toBe(16);
    expect(calcularEdad(new Date('2010-12-15'), ref)).toBe(15); // cumpleaños posterior
  });
});

describe('restricciones de participación (R1-R5)', () => {
  const ref = new Date('2026-06-01');
  const base = { genero: 'MASCULINO' as const, fechaNacimiento: new Date('2008-01-01') };

  it('R2: BLANCO no puede figura con armas', () => {
    expect(
      validarRestriccion({ ...base, grupoCinturon: 'BLANCO' }, 'figura_armas', ref)
        .permitido,
    ).toBe(false);
    expect(
      validarRestriccion({ ...base, grupoCinturon: 'INTERMEDIO' }, 'figura_armas', ref)
        .permitido,
    ).toBe(true);
  });

  it('R3: saltos requiere >=14 años y cinturón >= INTERMEDIO', () => {
    // 18 años, intermedio → ok
    expect(
      validarRestriccion({ ...base, grupoCinturon: 'INTERMEDIO' }, 'salto_altura', ref)
        .permitido,
    ).toBe(true);
    // intermedio pero 12 años → no
    const nino = { ...base, fechaNacimiento: new Date('2014-01-01'), grupoCinturon: 'INTERMEDIO' as const };
    expect(validarRestriccion(nino, 'salto_altura', ref).permitido).toBe(false);
    // 18 años pero principiante → no
    expect(
      validarRestriccion({ ...base, grupoCinturon: 'PRINCIPIANTE' }, 'salto_altura', ref)
        .permitido,
    ).toBe(false);
  });

  it('combate siempre permitido', () => {
    expect(
      validarRestriccion({ ...base, grupoCinturon: 'BLANCO' }, 'combate', ref).permitido,
    ).toBe(true);
  });
});

describe('género de sección de combate (R4/R5)', () => {
  it('mixto hasta 11, por género desde 12', () => {
    expect(generoSeccionCombate('FEMENINO', 11)).toBe('MIXTO');
    expect(generoSeccionCombate('FEMENINO', 12)).toBe('FEMENINO');
  });
});

describe('rangos verificables', () => {
  it('enRango interpreta -X, A-B y X+', () => {
    expect(enRango(50, '-50kg')).toBe(true);
    expect(enRango(51, '-50kg')).toBe(false);
    expect(enRango(55, '50-60kg')).toBe(true);
    expect(enRango(61, '50-60kg')).toBe(false);
    expect(enRango(70, '70+kg')).toBe(true);
    expect(enRango(69, '70+kg')).toBe(false);
  });

  it('etiquetaRango asigna buckets enteros', () => {
    const cortes = [12, 15, 18];
    expect(etiquetaRango(10, cortes)).toBe('-11');
    expect(etiquetaRango(13, cortes)).toBe('12-14');
    expect(etiquetaRango(16, cortes)).toBe('15-17');
    expect(etiquetaRango(20, cortes)).toBe('18+');
  });
});

describe('identidad de sección', () => {
  const s = {
    modalidad: 'combate' as const,
    genero: 'MASCULINO' as const,
    grupoCinturon: 'INTERMEDIO' as const,
    rangoEdad: '15-17',
    rangoPeso: '-60kg',
  };
  it('clave canónica y nombre legible', () => {
    expect(claveSeccion(s)).toBe('combate|MASCULINO|INTERMEDIO|15-17|-60kg');
    expect(nombreSeccion(s)).toBe('Combate · Masculino · Intermedio · 15-17 · -60kg');
  });
});
