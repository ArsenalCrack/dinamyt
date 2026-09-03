/**
 * Corregir, cancelar y borrar una suscripción.
 *
 * Lo que se cuida aquí es la diferencia entre las dos formas de «quitar» una
 * suscripción, que es la única parte de esto que puede costar dinero:
 *
 *  · **Suspender** corta el acceso y conserva la historia.
 *  · **Borrar** hace desaparecer la fila — y con ella el único registro de que
 *    ese dinero entró, porque no hay tabla de pagos aparte: el abono vive en
 *    `paid_amount`.
 *
 * Por eso la regla vive en el servidor y no en si alguien se acordó de pulsar
 * el botón correcto.
 */

// La capa de datos se sustituye entera: aquí se prueban las DECISIONES.
jest.mock('../../db', () => ({ db: {} }));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { OrgNotificationsService } from '../organizations/org-notifications.service';
import { MailerService } from '../auth/mailer.service';
import { db } from '../../db';

const SUB = '33333333-3333-4333-8333-333333333333';

/** Lo que el servicio escribió: es donde viven las decisiones que importan. */
interface Escrituras {
  set: Record<string, unknown>[];
  values: Record<string, unknown>[];
}

/** Un `db.select()…` de mentira que devuelve, en orden, lo que se le diga. */
function encadenar(resultados: unknown[][], escrito: Escrituras) {
  const cola = [...resultados];
  const eslabon: Record<string, unknown> = {};
  // `groupBy` entró con el cobro por persona: `personasFacturables` cuenta el
  // padrón del club agrupando, y sin este eslabón la cadena se corta con un
  // «no es una función» que no menciona ni suscripciones ni renovar.
  for (const metodo of [
    'from',
    'where',
    'limit',
    'orderBy',
    'innerJoin',
    'groupBy',
    'returning',
  ]) {
    eslabon[metodo] = () => eslabon;
  }
  // Estos dos SÍ se miran: `renovar` no se juzga por lo que devuelve —eso lo
  // decide la cola— sino por lo que deja escrito en la fila y en el pago.
  eslabon.set = (v: Record<string, unknown>) => {
    escrito.set.push(v);
    return eslabon;
  };
  eslabon.values = (v: Record<string, unknown>) => {
    escrito.values.push(v);
    return eslabon;
  };
  eslabon.then = (resolver: (v: unknown) => unknown) =>
    Promise.resolve(cola.shift() ?? []).then(resolver);
  return eslabon;
}

function armar(resultados: unknown[][]) {
  const fake = db as unknown as Record<string, unknown>;
  const escrito: Escrituras = { set: [], values: [] };
  const cadena = encadenar(resultados, escrito);
  fake.select = () => cadena;
  fake.insert = () => cadena;
  fake.update = () => cadena;
  fake.delete = () => cadena;
  const service = new SubscriptionsService(
    {
      // El correo no entra en estas pruebas: aquí se juzgan las cuentas.
      habilitado: () => false,
      avisarVencimientoSuscripcion: jest.fn().mockResolvedValue(false),
    } as unknown as MailerService,
    // Ni la campana: el aviso de que el plan vence se prueba donde se decide a
    // quién le llega, no aquí, donde se juzga cuánto se cobra.
    {
      avisar: jest.fn().mockResolvedValue(undefined),
      resolverPor: jest.fn().mockResolvedValue(undefined),
    } as unknown as OrgNotificationsService,
  );
  return Object.assign(service, { escrito });
}

const suscripcion = {
  id: SUB,
  planId: 'plan-1',
  startsAt: new Date('2026-01-01'),
  endsAt: new Date('2026-12-31'),
  totalAmount: '600000',
  paidAmount: '0',
  notes: null,
};

describe('Suscripciones · borrar', () => {
  it('borra la que nunca recibió un peso', async () => {
    const service = armar([[suscripcion]]);
    await expect(service.remove(SUB)).resolves.toEqual({ ok: true, id: SUB });
  });

  it('NO borra una con pagos: eso borraría el registro del dinero', async () => {
    const service = armar([[{ ...suscripcion, paidAmount: '200000' }]]);
    await expect(service.remove(SUB)).rejects.toThrow(BadRequestException);
  });

  it('y al negarse dice qué hacer en su lugar, no solo que no', async () => {
    const service = armar([[{ ...suscripcion, paidAmount: '200000' }]]);
    // Un «no se puede» a secas deja a quien lo lee buscando otro botón; lo que
    // hace falta es el nombre de la acción correcta.
    await expect(service.remove(SUB)).rejects.toThrow(/susp[ée]ndela/i);
  });

  it('una que no existe no se borra en silencio', async () => {
    const service = armar([[]]);
    await expect(service.remove(SUB)).rejects.toThrow(NotFoundException);
  });
});

describe('Suscripciones · corregir', () => {
  it('rechaza una que termina antes de empezar', async () => {
    const service = armar([[suscripcion]]);
    // El síntoma de esto es «pagué y no me abre», que se busca en el sitio
    // equivocado: nunca da acceso a nada porque ya nació vencida.
    await expect(
      service.update(SUB, { startsAt: '2026-06-01', endsAt: '2026-03-01' }),
    ).rejects.toThrow(/posterior a la de inicio/i);
  });

  it('rechaza el mismo día de inicio y fin', async () => {
    const service = armar([[suscripcion]]);
    await expect(
      service.update(SUB, { startsAt: '2026-06-01', endsAt: '2026-06-01' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza una fecha que no es una fecha', async () => {
    const service = armar([[suscripcion]]);
    await expect(
      service.update(SUB, { startsAt: 'el martes que viene' }),
    ).rejects.toThrow(/no es v[áa]lida/i);
  });

  it('conserva la fecha que no se toca', async () => {
    // Solo se manda el fin: el inicio tiene que seguir siendo el que estaba, y
    // no convertirse en `Invalid Date` por no venir en el cuerpo.
    const service = armar([[suscripcion], [{ ...suscripcion, endsAt: new Date('2027-06-30') }]]);
    await expect(service.update(SUB, { endsAt: '2027-06-30' })).resolves.toMatchObject({
      startsAt: suscripcion.startsAt,
    });
  });

  it('un plan que no existe no se asigna', async () => {
    const service = armar([[suscripcion], []]);
    await expect(
      service.update(SUB, { planId: '99999999-9999-4999-8999-999999999999' }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('Suscripciones · abonar', () => {
  it('suma al pagado en vez de sustituirlo', async () => {
    const service = armar([
      [{ ...suscripcion, paidAmount: '200000' }],
      [{ ...suscripcion, paidAmount: '350000.00', paymentStatus: 'PARTIAL' }],
    ]);
    const r = await service.registerPayment(SUB, { paidAmount: '150000' });
    // 200.000 que ya estaban + 150.000 de hoy. Sustituir en vez de sumar es
    // cómo se pierde el primer abono del mes.
    expect(r.paidAmount).toBe('350000.00');
  });

  it('un abono negativo o cero no pasa', async () => {
    for (const monto of ['0', '-5000', 'mil pesos']) {
      const service = armar([[suscripcion]]);
      await expect(
        service.registerPayment(SUB, { paidAmount: monto }),
      ).rejects.toThrow(/positivo/i);
    }
  });
});

/**
 * ── Renovar ──
 *
 * Es lo que sustituye a «crear otra suscripción cada mes», así que lo que se
 * cuida aquí es que un club no pierda días por pagar pronto ni reciba gratis
 * los meses que estuvo vencido. Las dos cosas son dinero.
 *
 * La aritmética de meses en sí vive en `common/ciclo.spec.ts`; esto prueba las
 * DECISIONES: qué se escribe en la fila y qué se escribe en el pago.
 */
describe('Suscripciones · renovar', () => {
  const PLAN = { id: 'plan-1', name: 'Plan Completo', priceMonthly: '80000' };

  beforeEach(() => {
    jest.useFakeTimers();
    // Mediodía UTC: así el día local es el mismo en toda América.
    jest.setSystemTime(new Date('2026-08-22T12:00:00.000Z'));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  /** La cola que espera `renovar`: suscripción, plan, fila nueva, pago. */
  function colaDe(sub: Record<string, unknown>) {
    return [[sub], [PLAN], [{ ...sub }], [{ id: 'pago-1' }]];
  }

  it('quien renueva ANTES de vencer no pierde los días que le quedaban', async () => {
    const service = armar(
      colaDe({ ...suscripcion, endsAt: new Date('2026-09-05'), anchorDay: 5 }),
    );
    const r = await service.renovar(SUB, {});
    // Le quedaban 14 días. Renovar tiene que darle un mes MÁS esos catorce.
    expect(r.venceEl).toBe('2026-10-05');
  });

  it('quien renueva TARDE no recibe gratis lo que estuvo vencido', async () => {
    const service = armar(
      colaDe({ ...suscripcion, endsAt: new Date('2026-05-10'), anchorDay: null }),
    );
    const r = await service.renovar(SUB, {});
    // Venció en mayo y paga hoy: compra de hoy en adelante. Encadenar desde
    // mayo le vendería meses que ya se gastaron.
    expect(r.venceEl).toBe('2026-09-22');
  });

  it('el día ancla manda aunque se pague otro día', async () => {
    const service = armar(
      colaDe({ ...suscripcion, endsAt: new Date('2026-08-05'), anchorDay: 5 }),
    );
    const r = await service.renovar(SUB, {});
    expect(r.venceEl).toBe('2026-09-05');
  });

  it('renovar REACTIVA: se suspendió por no pagar, y acaba de pagar', async () => {
    const service = armar(
      colaDe({ ...suscripcion, status: 'SUSPENDED', endsAt: new Date('2026-07-01') }),
    );
    await service.renovar(SUB, {});
    expect(service.escrito.set[0]).toMatchObject({ status: 'ACTIVE' });
  });

  it('sin decir el precio, cobra el del plan por cada mes', async () => {
    const service = armar(colaDe({ ...suscripcion, totalAmount: '0', paidAmount: '0' }));
    await service.renovar(SUB, { meses: 3 });
    // 80.000 × 3, y pagado completo: quien renueva es porque le pagaron.
    expect(service.escrito.set[0]).toMatchObject({
      totalAmount: '240000.00',
      paidAmount: '240000.00',
      paymentStatus: 'PAID',
    });
  });

  it('el precio y lo que entregó son cosas distintas', async () => {
    const service = armar(colaDe({ ...suscripcion, totalAmount: '0', paidAmount: '0' }));
    // Le dio la mitad ahora. Mentir en cualquiera de los dos números deja el
    // estado de pago sin significado.
    await service.renovar(SUB, { precio: '80000', amount: '40000' });
    expect(service.escrito.set[0]).toMatchObject({
      totalAmount: '80000.00',
      paidAmount: '40000.00',
      paymentStatus: 'PARTIAL',
    });
  });

  it('el pago dice qué periodo compró, no solo cuándo entró la plata', async () => {
    const service = armar(
      colaDe({ ...suscripcion, endsAt: new Date('2026-09-05'), anchorDay: 5 }),
    );
    await service.renovar(SUB, { meses: 2, method: 'nequi', notes: 'agosto y septiembre' });
    expect(service.escrito.values[0]).toMatchObject({
      subscriptionId: SUB,
      periodos: 2,
      periodoDesde: '2026-09-05',
      periodoHasta: '2026-11-05',
      method: 'nequi',
      notes: 'agosto y septiembre',
    });
  });

  it('un método de pago inventado cae en «otro», no entra tal cual', async () => {
    const service = armar(colaDe(suscripcion));
    await service.renovar(SUB, { method: 'criptomonedas' });
    expect(service.escrito.values[0]).toMatchObject({ method: 'otro' });
  });

  it('renovar borra el aviso anterior: el ciclo empieza de cero', async () => {
    const service = armar(
      colaDe({
        ...suscripcion,
        lastReminderKind: 'VENCIDA',
        lastReminderAt: new Date('2026-08-01'),
      }),
    );
    await service.renovar(SUB, {});
    // Sin esto, el club que acaba de pagar seguiría contando como avisado y no
    // recibiría el aviso del mes siguiente.
    expect(service.escrito.set[0]).toMatchObject({
      lastReminderAt: null,
      lastReminderKind: null,
    });
  });

  it('una que no existe no se renueva en silencio', async () => {
    const service = armar([[]]);
    await expect(service.renovar(SUB, {})).rejects.toThrow(NotFoundException);
  });

  it('un monto negativo no pasa', async () => {
    const service = armar(colaDe(suscripcion));
    await expect(service.renovar(SUB, { precio: '-1000' })).rejects.toThrow(
      BadRequestException,
    );
  });
});
