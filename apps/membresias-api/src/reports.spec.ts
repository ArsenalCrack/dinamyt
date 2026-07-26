import { describe, it, expect } from 'vitest';
import { memberships } from '@dinamyt/membresias-db';
import { crearEscenario } from './testing/escenario';

describe('membresias-api — reportes', () => {
  it('revenue: recaudado y esperado reflejan el pago del mes', async () => {
    const { app, auth, ids } = await crearEscenario();
    const headers = auth(ids.owner);

    const plan = (
      await app.inject({
        method: 'POST',
        url: '/plans',
        headers,
        payload: { name: 'Mensual', type: 'mensual', price: '60000' },
      })
    ).json();

    await app.inject({
      method: 'POST',
      url: `/memberships/${ids.alumno}/payments`,
      headers,
      payload: { planId: plan.id, amount: '60000', method: 'efectivo' },
    });

    const rev = await app.inject({ method: 'GET', url: '/reports/revenue', headers });
    expect(rev.statusCode).toBe(200);
    const b = rev.json();
    expect(b.recaudado).toBe(60000);
    expect(b.numPagos).toBe(1);
    expect(b.esperadoMensual).toBe(60000);
    await app.close();
  });

  it('overdue: lista a los alumnos vencidos', async () => {
    const { app, db, auth, ids, orgId } = await crearEscenario();
    await db
      .insert(memberships)
      .values({ orgId, userId: ids.alumno, venceEl: '2000-01-01' });

    const res = await app.inject({
      method: 'GET',
      url: '/reports/overdue',
      headers: auth(ids.owner),
    });
    expect(res.statusCode).toBe(200);
    const list = res.json();
    expect(list).toHaveLength(1);
    expect(list[0].userId).toBe(ids.alumno);
    expect(list[0].diasVencido).toBeGreaterThan(0);
    await app.close();
  });

  it('los reportes no mezclan clubes', async () => {
    const { app, db, auth, ids, orgId, otroOrgId } = await crearEscenario();
    await db.insert(memberships).values([
      { orgId, userId: ids.alumno, venceEl: '2000-01-01' },
      { orgId: otroOrgId, userId: ids.alumnoAjeno, venceEl: '2000-01-01' },
    ]);

    const res = await app.inject({
      method: 'GET',
      url: '/reports/overdue',
      headers: auth(ids.owner),
    });
    expect(res.json()).toHaveLength(1);
    expect(res.json()[0].userId).toBe(ids.alumno);
    await app.close();
  });

  it('attendance: cuenta las asistencias del día', async () => {
    const { app, db, auth, ids, orgId } = await crearEscenario();
    const headers = auth(ids.owner);
    await db
      .insert(memberships)
      .values({ orgId, userId: ids.alumno, venceEl: '2099-12-31' });

    await app.inject({
      method: 'POST',
      url: '/checkin',
      headers,
      payload: { identifier: { type: 'manual', value: ids.alumno } },
    });

    const res = await app.inject({ method: 'GET', url: '/reports/attendance', headers });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBe(1);
    expect(res.json().hoy).toBe(1);
    await app.close();
  });
});
