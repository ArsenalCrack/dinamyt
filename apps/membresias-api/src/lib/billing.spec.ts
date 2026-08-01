import { describe, it, expect } from 'vitest';
import {
  nextDue,
  nextDueVarios,
  iniciosDePeriodo,
  estado,
  diasFaltantes,
} from './billing';

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

  it('semanal: cubre LA SEMANA, hasta el domingo', () => {
    // 2026-03-04 es miércoles: quien paga el miércoles paga «esta semana» y
    // vuelve a pagar el lunes, igual que quien pagó el lunes.
    expect(nextDue({ today: '2026-03-04', prevDue: null, planType: 'semanal' })).toBe(
      '2026-03-08',
    );
    // Lunes: la misma semana, no ocho días.
    expect(nextDue({ today: '2026-03-02', prevDue: null, planType: 'semanal' })).toBe(
      '2026-03-08',
    );
    // Domingo: el día en que vence sigue siendo suyo.
    expect(nextDue({ today: '2026-03-08', prevDue: null, planType: 'semanal' })).toBe(
      '2026-03-08',
    );
  });

  it('semanal: renovar antes de vencer compra la semana siguiente, no la misma', () => {
    expect(
      nextDue({ today: '2026-03-04', prevDue: '2026-03-08', planType: 'semanal' }),
    ).toBe('2026-03-15');
    // Paga el mismo domingo en que le vence: se lleva la que viene.
    expect(
      nextDue({ today: '2026-03-08', prevDue: '2026-03-08', planType: 'semanal' }),
    ).toBe('2026-03-15');
    // Vuelve dos semanas tarde: no se le regalan las que no vino.
    expect(
      nextDue({ today: '2026-03-18', prevDue: '2026-03-08', planType: 'semanal' }),
    ).toBe('2026-03-22');
  });

  it('clase/paquete: no cambian el vencimiento por tiempo', () => {
    expect(
      nextDue({ today: '2026-03-01', prevDue: '2026-03-20', planType: 'paquete' }),
    ).toBe('2026-03-20');
  });

  it('varios meses de golpe: tres pagos seguidos y uno de tres dan la misma fecha', () => {
    const deUnaVez = nextDueVarios({
      today: '2026-01-15',
      prevDue: null,
      planType: 'mensual',
      anchorDay: 15,
      periodos: 3,
    });
    expect(deUnaVez).toBe('2026-04-15');
  });

  it('varios meses: el día ancla manda aunque se pase por febrero', () => {
    // Pagar dos meses desde el 31 de enero: febrero recorta a 28, marzo lo
    // recupera. Multiplicar días habría perdido esos tres días para siempre.
    expect(
      nextDueVarios({
        today: '2026-01-31',
        prevDue: null,
        planType: 'mensual',
        anchorDay: 31,
        periodos: 2,
      }),
    ).toBe('2026-03-31');
  });

  it('varias semanas: una semana calendario por cada una', () => {
    // Miércoles 4 de marzo, tres semanas: esta (hasta el domingo 8) y las dos
    // siguientes.
    expect(
      nextDueVarios({
        today: '2026-03-04',
        prevDue: null,
        planType: 'semanal',
        periodos: 3,
      }),
    ).toBe('2026-03-22');
  });

  it('los periodos de un pago arrancan cada uno en su mes', () => {
    // Es lo que permite repartir el dinero: 2 meses pagados el 27 de julio son
    // mitad de julio y mitad de agosto, no todo de julio.
    expect(
      iniciosDePeriodo({ desde: '2026-07-27', planType: 'mensual', periodos: 2 }),
    ).toEqual(['2026-07-27', '2026-08-27']);
    expect(
      iniciosDePeriodo({
        desde: '2026-07-27',
        planType: 'semanal',
        durationDays: 7,
        periodos: 3,
      }),
    ).toEqual(['2026-07-27', '2026-08-03', '2026-08-10']);
  });

  it('estado y días faltantes', () => {
    expect(estado({ venceEl: '2026-03-10' }, '2026-03-01')).toBe('al_dia');
    expect(estado({ venceEl: '2026-03-03' }, '2026-03-01')).toBe('por_vencer');
    expect(estado({ venceEl: '2026-02-27' }, '2026-03-01')).toBe('vencido');
    expect(estado({ venceEl: null }, '2026-03-01')).toBe('sin_plan');
    expect(diasFaltantes('2026-03-10', '2026-03-01')).toBe(9);
    expect(diasFaltantes('2026-02-27', '2026-03-01')).toBe(-2);
  });

  it('estado: las clases del paquete también son cobertura', () => {
    // El caso que estaba mal: el alumno pasó de mensualidad a clase suelta. Su
    // pago no mueve `venceEl` —suma clases—, así que el panel le seguía
    // diciendo «por vencer» con una fecha que ya no significa nada.
    expect(estado({ venceEl: '2026-03-03', clasesRestantes: 1 }, '2026-03-01')).toBe('al_dia');
    expect(estado({ venceEl: '2026-02-01', clasesRestantes: 4 }, '2026-03-01')).toBe('al_dia');
    // Sin fecha y sin clases gastadas: se acabó el paquete.
    expect(estado({ venceEl: null, clasesRestantes: 0 }, '2026-03-01')).toBe('vencido');
    expect(estado({ venceEl: null, clasesRestantes: 3 }, '2026-03-01')).toBe('al_dia');
    // Mensualidad viva y paquete viejo agotado: manda la mejor de las dos.
    expect(estado({ venceEl: '2026-03-20', clasesRestantes: 0 }, '2026-03-01')).toBe('al_dia');
    // Ni fecha ni saldo: no ha comprado nada.
    expect(estado({ venceEl: null, clasesRestantes: null }, '2026-03-01')).toBe('sin_plan');
  });
});
