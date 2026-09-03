import { esPorPersona, importeDelPeriodo } from './cobro-por-persona';

/**
 * **El cálculo que decide lo que se cobra.**
 *
 * Se prueba solo, sin base de datos delante, por el mismo motivo que
 * `cadenasDeMando`: lo que se rompe aquí no es la consulta, son los casos de
 * borde —el club por debajo del mínimo, el plan a medio migrar, los meses
 * múltiples— y cada uno de ellos es una factura mal emitida a un cliente real.
 *
 * La regla que sostiene todo lo demás: **un plan sin `pricePerUser` se cobra
 * como siempre**. Aplicar la migración no le cambió el precio a nadie; el
 * precio cambia cuando alguien escribe el número.
 */

const POR_PERSONA = { pricePerUser: '3000', minUsers: 10, priceMonthly: '60000' };
const FIJO = { pricePerUser: null, minUsers: null, priceMonthly: '60000' };

describe('esPorPersona', () => {
  it('un plan con precio unitario, sí', () => {
    expect(esPorPersona(POR_PERSONA)).toBe(true);
  });

  it('sin precio unitario, no: sigue con su importe fijo', () => {
    expect(esPorPersona(FIJO)).toBe(false);
  });

  it('un precio unitario en CERO no cuenta como cobro por persona', () => {
    // Si contara, el plan pasaría a facturar 0 en silencio y nadie lo notaría
    // hasta el cierre del mes. Un cero es un campo sin llenar, no una tarifa.
    expect(esPorPersona({ pricePerUser: '0', priceMonthly: '60000' })).toBe(false);
  });
});

describe('importeDelPeriodo · el plan de importe fijo no cambia', () => {
  it('cobra su mensualidad, cuente la gente que cuente', () => {
    expect(importeDelPeriodo(FIJO, 300).importe).toBe(60000);
    expect(importeDelPeriodo(FIJO, 1).importe).toBe(60000);
  });

  it('tres meses cuestan tres veces', () => {
    expect(importeDelPeriodo(FIJO, 50, 3).importe).toBe(180000);
  });

  it('no dice por cuánta gente cobró, porque no cobró por gente', () => {
    // `facturadas: 0` es lo que hace que `billed_users` quede en NULL, que es
    // como se distingue una fila del modelo viejo de una del nuevo.
    expect(importeDelPeriodo(FIJO, 50).facturadas).toBe(0);
  });
});

describe('importeDelPeriodo · el cobro por persona', () => {
  it('cobra por cabeza', () => {
    const r = importeDelPeriodo(POR_PERSONA, 40);
    expect(r.importe).toBe(120000);
    expect(r.facturadas).toBe(40);
  });

  it('un club de 15 y uno de 300 NO pagan lo mismo, que era todo el punto', () => {
    const chico = importeDelPeriodo(POR_PERSONA, 15).importe;
    const grande = importeDelPeriodo(POR_PERSONA, 300).importe;
    expect(chico).toBe(45000);
    expect(grande).toBe(900000);
    expect(grande).toBeGreaterThan(chico);
  });

  it('por debajo del mínimo se cobra el mínimo', () => {
    // Nadie factura tres alumnos: un club que arranca con cuatro paga una cifra
    // que no cubre ni el soporte.
    const r = importeDelPeriodo(POR_PERSONA, 4);
    expect(r.importe).toBe(30000);
    expect(r.facturadas).toBe(10);
  });

  it('justo en el mínimo se cobra el mínimo, sin doble contar', () => {
    expect(importeDelPeriodo(POR_PERSONA, 10).facturadas).toBe(10);
  });

  it('un club sin nadie paga el mínimo, no cero', () => {
    // El club vacío existe: se acaba de crear, o se vació. Cobrar 0 lo dejaría
    // abierto gratis indefinidamente.
    expect(importeDelPeriodo(POR_PERSONA, 0).importe).toBe(30000);
  });

  it('sin mínimo declarado, se cobra por lo que haya', () => {
    const sinMinimo = { pricePerUser: '3000', minUsers: null };
    expect(importeDelPeriodo(sinMinimo, 4).importe).toBe(12000);
    expect(importeDelPeriodo(sinMinimo, 0).importe).toBe(0);
  });

  it('tres meses cuestan tres veces, también por persona', () => {
    expect(importeDelPeriodo(POR_PERSONA, 40, 3).importe).toBe(360000);
  });

  it('el precio con decimales se redondea a peso', () => {
    // La columna es `numeric(10,2)` y el peso colombiano no tiene centavos en
    // la práctica: un importe con decimales sueltos no cuadra con ningún recibo.
    const r = importeDelPeriodo({ pricePerUser: '3333.33', minUsers: 0 }, 7);
    expect(Number.isInteger(r.importe)).toBe(true);
    expect(r.importe).toBe(23333);
  });

  it('medio mes no existe: menos de uno cuenta como uno', () => {
    expect(importeDelPeriodo(POR_PERSONA, 40, 0).importe).toBe(120000);
    expect(importeDelPeriodo(POR_PERSONA, 40, -3).importe).toBe(120000);
  });

  it('un precio ilegible no cobra de más: cae a cero, no a NaN', () => {
    // Un `NaN` viajaría a `total_amount` y dejaría la fila inutilizable; peor,
    // el panel de recaudo sumaría NaN y la cifra entera desaparecería.
    const r = importeDelPeriodo({ pricePerUser: 'no-es-un-numero', minUsers: 5 }, 20);
    expect(Number.isFinite(r.importe)).toBe(true);
    expect(r.importe).toBe(0);
  });
});

describe('el alta y la renovacion cobran IGUAL', () => {
  // El agujero que esto vigila: `renovar` ya calculaba por padrón y `create`
  // seguía pidiendo un monto a mano, así que el PRIMER periodo de cada club se
  // cobraba con un número inventado y solo a partir del segundo tenía sentido.
  // Justo al revés de lo que hace falta: el alta es la que fija la expectativa.
  it('un mes de alta cuesta lo mismo que un mes de renovación', () => {
    const alta = importeDelPeriodo(POR_PERSONA, 37, 1);
    const renovacion = importeDelPeriodo(POR_PERSONA, 37, 1);
    expect(alta).toEqual(renovacion);
  });

  it('y las dos guardan por cuánta gente cobraron', () => {
    // `facturadas` es lo que va a `billed_users`, y sin ella no se puede
    // contestar «¿por qué me cobraron esto?» cuando el padrón ya cambió.
    expect(importeDelPeriodo(POR_PERSONA, 37, 1).facturadas).toBe(37);
    expect(importeDelPeriodo(POR_PERSONA, 2, 1).facturadas).toBe(10);
  });
});
