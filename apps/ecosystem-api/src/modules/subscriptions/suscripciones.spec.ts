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
import { db } from '../../db';

const SUB = '33333333-3333-4333-8333-333333333333';

/** Un `db.select()…` de mentira que devuelve, en orden, lo que se le diga. */
function encadenar(resultados: unknown[][]) {
  const cola = [...resultados];
  const eslabon: Record<string, unknown> = {};
  for (const metodo of [
    'from',
    'where',
    'limit',
    'orderBy',
    'innerJoin',
    'values',
    'returning',
    'set',
  ]) {
    eslabon[metodo] = () => eslabon;
  }
  eslabon.then = (resolver: (v: unknown) => unknown) =>
    Promise.resolve(cola.shift() ?? []).then(resolver);
  return eslabon;
}

function armar(resultados: unknown[][]) {
  const fake = db as unknown as Record<string, unknown>;
  const cadena = encadenar(resultados);
  fake.select = () => cadena;
  fake.insert = () => cadena;
  fake.update = () => cadena;
  fake.delete = () => cadena;
  return new SubscriptionsService();
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
