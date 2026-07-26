import { describe, it, expect } from 'vitest';
import { nextDue, estado, diasFaltantes } from './billing';

describe('billing — vencimiento por mes calendario', () => {
  it('mensual: mismo día del mes siguiente', () => {
    expect(
      nextDue({ today: '2026-01-15', prevDue: null, planType: 'mensual', anchorDay: 15 }),
    ).toBe('2026-02-15');
  });

  it('mensual: día 31 → último día de febrero, y recupera el 31 en marzo', () => {
    const feb = nextDue({
      today: '2026-01-31',
      prevDue: null,
      planType: 'mensual',
      anchorDay: 31,
    });
    expect(feb).toBe('2026-02-28');
    const mar = nextDue({
      today: '2026-02-28',
      prevDue: '2026-02-28',
      planType: 'mensual',
      anchorDay: 31,
    });
    expect(mar).toBe('2026-03-31');
  });

  it('mensual: la fecha queda estable en el día ancla, se pague antes o después', () => {
    // paga anticipado (vence 03-10, paga 03-05) → ancla en el vencimiento
    expect(
      nextDue({ today: '2026-03-05', prevDue: '2026-03-10', planType: 'mensual', anchorDay: 10 }),
    ).toBe('2026-04-10');
    // paga tarde (ya vencido) → ancla en el mes de hoy, mismo día
    expect(
      nextDue({ today: '2026-03-20', prevDue: '2026-03-10', planType: 'mensual', anchorDay: 10 }),
    ).toBe('2026-04-10');
  });

  it('semanal: +7 días', () => {
    expect(
      nextDue({ today: '2026-03-01', prevDue: null, planType: 'semanal', durationDays: 7 }),
    ).toBe('2026-03-08');
  });

  it('clase/paquete: no cambian el vencimiento por tiempo', () => {
    expect(
      nextDue({ today: '2026-03-01', prevDue: '2026-03-20', planType: 'paquete' }),
    ).toBe('2026-03-20');
  });

  it('estado y días faltantes', () => {
    expect(estado('2026-03-10', '2026-03-01')).toBe('al_dia');
    expect(estado('2026-03-03', '2026-03-01')).toBe('por_vencer');
    expect(estado('2026-02-27', '2026-03-01')).toBe('vencido');
    expect(estado(null, '2026-03-01')).toBe('sin_plan');
    expect(diasFaltantes('2026-03-10', '2026-03-01')).toBe(9);
    expect(diasFaltantes('2026-02-27', '2026-03-01')).toBe(-2);
  });
});
