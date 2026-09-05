import {
  esPorPersona,
  importeDelPeriodo,
  mensualComprometido,
} from './cobro-por-persona';

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

describe('mensualComprometido · la tarifa pactada no se mueve sola', () => {
  it('un ciclo de un mes vale lo que dice la suscripción', () => {
    expect(mensualComprometido('120000', 1)).toBe(120000);
  });

  it('un ciclo de tres meses se reparte entre los tres', () => {
    // Sin esto, un club que paga por trimestre contaba por tres en la
    // previsión mensual, y bastaban dos o tres así para que la cifra del mes
    // no significara nada.
    expect(mensualComprometido('360000', 3)).toBe(120000);
  });

  it('una fila antigua sin `renewal_months` es un ciclo de un mes', () => {
    // Es lo que era antes de que la columna existiera.
    expect(mensualComprometido('90000', null)).toBe(90000);
    expect(mensualComprometido('90000', undefined)).toBe(90000);
  });

  it('un ciclo de cero o negativo no divide por cero', () => {
    expect(mensualComprometido('90000', 0)).toBe(90000);
    expect(mensualComprometido('90000', -2)).toBe(90000);
  });

  it('sin importe es cero, no `NaN`', () => {
    // Un `NaN` aquí se propaga a la suma entera del panel y deja la pantalla
    // enseñando «NaN» en vez de una cifra.
    expect(mensualComprometido(null, 1)).toBe(0);
    expect(mensualComprometido('', 1)).toBe(0);
    expect(mensualComprometido('nada', 1)).toBe(0);
  });

  it('EL PUNTO: no depende del padrón de hoy', () => {
    // Es la prueba que faltaba. El panel calculaba esta cifra volviendo a
    // multiplicar la tarifa por el censo del momento, así que cada alumno que
    // entraba a mitad de mes la subía: la misma suscripción valía una cosa el
    // día 3 y otra el 27, sin que nadie hubiera pactado ningún cambio.
    //
    // Lo comprometido sale de `total_amount`, que se fijó al renovar. Que esta
    // función no reciba el censo NO es un descuido: es la regla.
    const alRenovar = mensualComprometido('120000', 1);
    // Entran veinte alumnos ese mes. `total_amount` no cambia hasta la
    // próxima renovación, y por tanto la cifra tampoco.
    const aFinDeMes = mensualComprometido('120000', 1);
    expect(aFinDeMes).toBe(alRenovar);

    // Y lo que SÍ sube con el padrón es la proyección, que es otra pregunta y
    // vive en otra cifra del panel (`proyeccionRenovacion`).
    const POR_PERSONA = { pricePerUser: '3000', minUsers: 10 };
    expect(importeDelPeriodo(POR_PERSONA, 40).importe).toBeGreaterThan(
      importeDelPeriodo(POR_PERSONA, 20).importe,
    );
  });
});
