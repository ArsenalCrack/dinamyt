import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { memberships, plans } from '@dinamyt/membresias-db';
import { crearEscenario, type Escenario } from './testing/escenario';
import { todayStr } from './lib/billing';

/**
 * Registrar un pago: la parte del producto donde un descuido cuesta dinero de
 * verdad.
 *
 * Lo que se cuida aquí: que el pago se pueda fechar cuando de verdad ocurrió,
 * que pagar tres meses sea UN pago de tres y no tres pulsaciones, y que el
 * mismo cobro registrado dos veces se frene en seco.
 */
async function planDe(
  e: Escenario,
  tipo: 'mensual' | 'semanal' | 'clase' | 'paquete' | 'matricula',
  extra: { price?: string; nClasses?: number; durationDays?: number } = {},
) {
  const [p] = await e.db
    .insert(plans)
    .values({
      orgId: e.orgId,
      name: `Plan ${tipo}`,
      type: tipo,
      price: extra.price ?? '80000',
      nClasses: extra.nClasses ?? null,
      durationDays: extra.durationDays ?? null,
    })
    .returning();
  return p;
}

function cobrar(e: Escenario, plan: { id: string }, payload: Record<string, unknown> = {}) {
  return e.app.inject({
    method: 'POST',
    url: `/memberships/${e.ids.alumno}/payments`,
    headers: e.auth(e.ids.owner),
    payload: { planId: plan.id, amount: '80000', ...payload },
  });
}

describe('membresias-api — registrar un pago', () => {
  it('mensual: un pago de tres meses deja la fecha tres meses adelante', async () => {
    const e = await crearEscenario();
    const plan = await planDe(e, 'mensual');

    const r = await cobrar(e, plan, { paidAt: '2026-01-15', periodos: 3, amount: '240000' });
    expect(r.statusCode).toBe(201);
    expect(r.json().membership.venceEl).toBe('2026-04-15');
    // El pago recuerda qué compró: sin esto no se puede repartir por meses.
    expect(r.json().payment.periodos).toBe(3);
    expect(r.json().payment.periodoDesde).toBe('2026-01-15');
    expect(r.json().payment.periodoHasta).toBe('2026-04-15');
    await e.app.close();
  });

  it('la fecha del pago manda sobre la de hoy', async () => {
    const e = await crearEscenario();
    const plan = await planDe(e, 'mensual');

    // Se cobró el 3 de enero y se registra hoy: el vencimiento es el 3 de
    // febrero, no un mes contado desde hoy.
    const r = await cobrar(e, plan, { paidAt: '2026-01-03' });
    expect(r.json().membership.venceEl).toBe('2026-02-03');
    await e.app.close();
  });

  it('una fecha de pago futura se rechaza', async () => {
    const e = await crearEscenario();
    const plan = await planDe(e, 'mensual');
    const r = await cobrar(e, plan, { paidAt: '2099-01-01' });
    expect(r.statusCode).toBe(422);
    await e.app.close();
  });

  it('semanal: cada periodo es una semana calendario, hasta el domingo', async () => {
    const e = await crearEscenario();
    const plan = await planDe(e, 'semanal', { durationDays: 7, price: '25000' });
    // Miércoles 4 de marzo de 2026, dos semanas: la que corre (hasta el domingo
    // 8) y la siguiente. No son catorce días desde el miércoles: quien paga a
    // media semana paga «esta semana», igual que quien pagó el lunes.
    const r = await cobrar(e, plan, { paidAt: '2026-03-04', periodos: 2, amount: '50000' });
    expect(r.json().membership.venceEl).toBe('2026-03-15');
    await e.app.close();
  });

  it('paquete: suma las clases de cada paquete y no toca fechas', async () => {
    const e = await crearEscenario();
    const plan = await planDe(e, 'paquete', { nClasses: 4, price: '60000' });
    const r = await cobrar(e, plan, { periodos: 2, amount: '120000' });
    expect(r.json().membership.clasesRestantes).toBe(8);
    expect(r.json().membership.venceEl).toBeNull();
    expect(r.json().payment.periodoDesde).toBeNull();
    await e.app.close();
  });

  it('quien paga por clases queda AL DÍA, aunque arrastre una fecha vieja', async () => {
    // El error que reportó el maestro: cobraba una clase suelta y el panel del
    // alumno seguía diciendo «Por vencer». El pago por clases no mueve la
    // fecha —suma saldo—, y el estado se calculaba solo con la fecha.
    const e = await crearEscenario();
    const mensual = await planDe(e, 'mensual');
    await cobrar(e, mensual, { paidAt: todayStr() });

    // Ahora se pasa a clase suelta: su mensualidad queda atrás.
    const suelta = await planDe(e, 'clase', { price: '15000' });
    const r = await cobrar(e, suelta, { amount: '15000', confirmarRepetido: true });
    expect(r.statusCode).toBe(201);
    expect(r.json().membership.clasesRestantes).toBe(1);
    expect(r.json().membership.estado).toBe('al_dia');

    // Y lo mismo en el panel del alumno y en el roster del maestro, que es
    // donde el maestro lo vio mal.
    const mi = await e.app.inject({
      method: 'GET',
      url: '/mi',
      headers: e.auth(e.ids.alumno),
    });
    expect(mi.json().estado).toBe('al_dia');

    const roster = await e.app.inject({
      method: 'GET',
      url: `/memberships?userId=${e.ids.alumno}`,
      headers: e.auth(e.ids.owner),
    });
    expect(roster.json().items[0].estado).toBe('al_dia');
    await e.app.close();
  });

  it('gastadas las clases, vuelve a estar vencido', async () => {
    const e = await crearEscenario();
    const suelta = await planDe(e, 'clase', { price: '15000' });
    await cobrar(e, suelta, { amount: '15000' });

    // Marca su única clase: se queda en cero, que es lo mismo que vencido.
    const marca = await e.app.inject({
      method: 'POST',
      url: '/checkin',
      headers: e.auth(e.ids.owner),
      payload: { identifier: { type: 'manual', value: e.ids.alumno } },
    });
    expect(marca.statusCode).toBe(201);
    expect(marca.json().clasesRestantes).toBe(0);

    const mi = await e.app.inject({
      method: 'GET',
      url: '/mi',
      headers: e.auth(e.ids.alumno),
    });
    expect(mi.json().estado).toBe('vencido');
    await e.app.close();
  });

  it('la clase suelta es UNA, aunque se pida otra cosa', async () => {
    // «Clase suelta» y «paquete» hacían lo mismo y los dos pedían un número:
    // nada impedía una «suelta» de ocho, y entonces los dos tipos eran el
    // mismo con distinto nombre.
    const e = await crearEscenario();
    const r = await e.app.inject({
      method: 'POST',
      url: '/plans',
      headers: e.auth(e.ids.owner),
      payload: { name: 'Suelta', type: 'clase', price: '15000', nClasses: 8 },
    });
    expect(r.statusCode).toBe(201);
    expect(r.json().nClasses).toBe(1);
    await e.app.close();
  });

  it('matrícula: marca al alumno como matriculado, sin mover el vencimiento', async () => {
    const e = await crearEscenario();
    const plan = await planDe(e, 'matricula', { price: '50000' });
    const r = await cobrar(e, plan, { amount: '50000' });
    expect(r.json().membership.matriculado).toBe(true);
    expect(r.json().membership.venceEl).toBeNull();
    await e.app.close();
  });

  it('el mismo pago dos veces el mismo día se frena', async () => {
    const e = await crearEscenario();
    const plan = await planDe(e, 'mensual');

    const primero = await cobrar(e, plan);
    expect(primero.statusCode).toBe(201);

    const segundo = await cobrar(e, plan);
    expect(segundo.statusCode).toBe(409);
    expect(segundo.json().codigo).toBe('PAGO_REPETIDO');

    // El vencimiento no se movió con el intento repetido.
    const [m] = await e.db
      .select()
      .from(memberships)
      .where(eq(memberships.userId, e.ids.alumno));
    expect(m.venceEl).toBe(primero.json().membership.venceEl);
    await e.app.close();
  });

  it('…pero si de verdad son dos pagos, se confirma y entra', async () => {
    const e = await crearEscenario();
    const plan = await planDe(e, 'mensual');
    await cobrar(e, plan);
    const segundo = await cobrar(e, plan, { confirmarRepetido: true });
    expect(segundo.statusCode).toBe(201);
    await e.app.close();
  });

  it('el maestro puede fijar el vencimiento a mano', async () => {
    const e = await crearEscenario();
    const r = await e.app.inject({
      method: 'PATCH',
      url: `/memberships/${e.ids.alumno}`,
      headers: e.auth(e.ids.owner),
      payload: { venceEl: '2026-09-05', clasesRestantes: 3 },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().venceEl).toBe('2026-09-05');
    expect(r.json().clasesRestantes).toBe(3);
    // El día ancla se recalcula: a partir de aquí renueva los días 5.
    expect(r.json().anchorDay).toBe(5);
    await e.app.close();
  });

  it('una fecha de vencimiento imposible no llega a la base', async () => {
    const e = await crearEscenario();
    const r = await e.app.inject({
      method: 'PATCH',
      url: `/memberships/${e.ids.alumno}`,
      headers: e.auth(e.ids.owner),
      payload: { venceEl: '2026-02-31' },
    });
    expect(r.statusCode).toBe(422);
    await e.app.close();
  });

  it('el reporte separa la caja del mes de lo que le corresponde', async () => {
    const e = await crearEscenario();
    const plan = await planDe(e, 'mensual');
    const hoy = todayStr();

    // Dos meses pagados hoy: entran 160 000 en caja, pero a este mes solo le
    // corresponden 80 000. Es exactamente lo que descuadraba el panel.
    await cobrar(e, plan, { periodos: 2, amount: '160000' });

    const r = await e.app.inject({
      method: 'GET',
      url: `/reports/revenue?month=${hoy.slice(0, 7)}`,
      headers: e.auth(e.ids.owner),
    });
    expect(r.json().recaudado).toBe(160000);
    expect(r.json().devengado).toBe(80000);
    await e.app.close();
  });
});
