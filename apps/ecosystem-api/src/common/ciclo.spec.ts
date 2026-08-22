import {
  anclaDe,
  diasFaltantes,
  estadoSuscripcion,
  iniciosDePeriodo,
  siguienteVencimiento,
  sumarMeses,
} from './ciclo';

describe('ciclo de cobro · sumar meses', () => {
  it('conserva el día ancla de un mes al siguiente', () => {
    expect(sumarMeses('2026-01-05', 1, 5)).toBe('2026-02-05');
    expect(sumarMeses('2026-08-22', 1, 22)).toBe('2026-09-22');
  });

  it('recorta al último día cuando el mes no tiene el ancla', () => {
    expect(sumarMeses('2026-01-31', 1, 31)).toBe('2026-02-28');
  });

  it('vuelve al ancla en cuanto el mes vuelve a tenerla', () => {
    // Este es el fallo que se evita: sumando 30 días se llegaría al 30 de
    // marzo y el club perdería un día de su ciclo cada febrero.
    expect(sumarMeses('2026-02-28', 1, 31)).toBe('2026-03-31');
  });

  it('cruza el año sin perderse', () => {
    expect(sumarMeses('2026-12-15', 1, 15)).toBe('2027-01-15');
    expect(sumarMeses('2026-11-10', 14, 10)).toBe('2028-01-10');
  });
});

describe('ciclo de cobro · siguiente vencimiento', () => {
  it('quien renueva ANTES de vencer encadena desde su fecha', () => {
    // Le quedaban 10 días: al renovar tiene que acabar con un mes MÁS esos
    // diez, no perderlos por haber pagado pronto.
    expect(
      siguienteVencimiento({
        hoy: '2026-08-12',
        vencimientoAnterior: '2026-08-22',
        meses: 1,
      }),
    ).toBe('2026-09-22');
  });

  it('quien renueva TARDE empieza hoy, no donde se quedó', () => {
    // Venció en mayo y paga en agosto: compra de agosto en adelante. Encadenar
    // desde mayo le vendería meses que ya se gastaron.
    expect(
      siguienteVencimiento({
        hoy: '2026-08-22',
        vencimientoAnterior: '2026-05-10',
        meses: 1,
      }),
    ).toBe('2026-09-22');
  });

  it('renovar el mismo día en que vence compra el mes siguiente', () => {
    expect(
      siguienteVencimiento({
        hoy: '2026-08-22',
        vencimientoAnterior: '2026-08-22',
        meses: 1,
      }),
    ).toBe('2026-09-22');
  });

  it('varios meses de golpe no se multiplican: se encadenan', () => {
    expect(
      siguienteVencimiento({
        hoy: '2026-01-31',
        vencimientoAnterior: null,
        meses: 3,
      }),
    ).toBe('2026-04-30');
  });

  it('el ancla guardada manda sobre el día en que se paga', () => {
    // Su ciclo es el día 5; este mes pagó el 12. El siguiente vuelve al 5.
    expect(
      siguienteVencimiento({
        hoy: '2026-08-12',
        vencimientoAnterior: '2026-08-05',
        meses: 1,
        anclaGuardada: 5,
      }),
    ).toBe('2026-09-05');
  });

  it('una suscripción sin fecha previa arranca hoy', () => {
    expect(
      siguienteVencimiento({
        hoy: '2026-08-22',
        vencimientoAnterior: null,
        meses: 1,
      }),
    ).toBe('2026-09-22');
  });
});

describe('ciclo de cobro · a qué mes le toca el dinero', () => {
  it('un pago de tres meses arranca un periodo por mes', () => {
    expect(iniciosDePeriodo({ desde: '2026-08-22', meses: 3 })).toEqual([
      '2026-08-22',
      '2026-09-22',
      '2026-10-22',
    ]);
  });

  it('el ancla se conserva al pasar por un mes corto', () => {
    expect(iniciosDePeriodo({ desde: '2026-01-31', meses: 3 })).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
    ]);
  });
});

describe('ciclo de cobro · estado y días', () => {
  it('cuenta los días que faltan, y en negativo los que sobran', () => {
    expect(diasFaltantes('2026-08-25', '2026-08-22')).toBe(3);
    expect(diasFaltantes('2026-08-20', '2026-08-22')).toBe(-2);
    expect(diasFaltantes(null, '2026-08-22')).toBeNull();
  });

  it('avisa una semana antes, no tres días', () => {
    expect(estadoSuscripcion('2026-09-22', '2026-08-22')).toBe('al_dia');
    expect(estadoSuscripcion('2026-08-27', '2026-08-22')).toBe('por_vencer');
    expect(estadoSuscripcion('2026-08-21', '2026-08-22')).toBe('vencida');
    expect(estadoSuscripcion(null, '2026-08-22')).toBe('sin_fecha');
  });

  it('el día del vencimiento todavía no está vencida', () => {
    expect(estadoSuscripcion('2026-08-22', '2026-08-22')).toBe('por_vencer');
  });

  it('el ancla sale del día del mes', () => {
    expect(anclaDe('2026-08-22')).toBe(22);
    expect(anclaDe('2026-01-31')).toBe(31);
  });
});
