import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { memberships, plans, users } from '@dinamyt/membresias-db';
import { crearEscenario } from './testing/escenario';

describe('membresias-api — estadísticas del maestro', () => {
  it('resume alumnos, dinero, asistencia y planes en una sola llamada', async () => {
    const { app, db, auth, ids, orgId } = await crearEscenario();
    const headers = auth(ids.owner);

    const [plan] = await db
      .insert(plans)
      .values({ orgId, name: 'Mensual', type: 'mensual', price: '60000' })
      .returning();
    await db.update(users).set({ belt: 'Azul' }).where(eq(users.id, ids.alumno));
    await app.inject({
      method: 'POST',
      url: `/memberships/${ids.alumno}/payments`,
      headers,
      payload: { planId: plan.id, amount: '60000', method: 'efectivo' },
    });
    await app.inject({
      method: 'POST',
      url: '/checkin',
      headers,
      payload: { identifier: { type: 'manual', value: ids.alumno } },
    });

    const r = await app.inject({ method: 'GET', url: '/reports/estadisticas', headers });
    expect(r.statusCode).toBe(200);
    const s = r.json();

    expect(s.alumnos.total).toBe(2);
    expect(s.alumnos.al_dia).toBe(1);
    expect(s.alumnos.sin_plan).toBe(1);
    expect(s.dinero.recaudadoMes).toBe(60000);
    expect(s.dinero.porMes).toHaveLength(6);
    expect(s.dinero.esperadoMensual).toBe(60000);
    expect(s.asistencia.hoy).toBe(1);
    expect(s.asistencia.masConstantes[0].fullName).toBe('Alumno Uno');
    expect(s.planes[0]).toMatchObject({ name: 'Mensual', alumnos: 1 });
    expect(s.cinturones).toEqual([{ belt: 'Azul', alumnos: 1 }]);
    await app.close();
  });

  /**
   * La asistencia que se ENSEÑA es la de quien sigue en el club.
   *
   * Contaba a todo el mundo, incluido quien ya no está. Un alumno que entrenó
   * veintitrés veces y se fue en julio encabezaba el podio en septiembre,
   * tapando a los que sí vienen — y el maestro leía ese nombre arriba del todo
   * y creía que seguía apareciendo por el salón. Lo mismo, más callado, con el
   * promedio por día: salía inflado por gente que no va a volver, así que un
   * club que venía a menos no lo parecía.
   *
   * **No se borra nada.** Las filas de `attendances` siguen enteras y el
   * historial de cada persona sigue completo en su ficha; lo que cambia es qué
   * se cuenta en la pantalla que mira el maestro para saber cómo va su club.
   */
  it('la asistencia deja de contar a quien ya no está en el club', async () => {
    const { app, db, auth, ids } = await crearEscenario();
    const headers = auth(ids.owner);

    await app.inject({
      method: 'POST',
      url: '/checkin',
      headers,
      payload: { identifier: { type: 'manual', value: ids.alumno } },
    });

    // Con el alumno activo, encabeza el podio y cuenta como presente.
    const antes = (
      await app.inject({ method: 'GET', url: '/reports/estadisticas', headers })
    ).json();
    expect(antes.asistencia.masConstantes).toHaveLength(1);
    expect(antes.asistencia.hoy).toBe(1);
    expect(antes.asistencia.total30).toBe(1);

    await db
      .update(users)
      .set({ isActive: false })
      .where(eq(users.id, ids.alumno));

    // Todo el bloque de asistencia deja de contarlo, y a la vez: si el total
    // lo contara y la curva de al lado no, las dos cifras de la misma tarjeta
    // se contradirían.
    const s = (
      await app.inject({ method: 'GET', url: '/reports/estadisticas', headers })
    ).json();
    expect(s.asistencia.masConstantes).toEqual([]);
    expect(s.asistencia.hoy).toBe(0);
    expect(s.asistencia.total30).toBe(0);
    expect(s.asistencia.promedioPorDia).toBe(0);

    // Y la tarjeta «presentes hoy» del panel, que sale de OTRA ruta, dice lo
    // mismo. Con el filtro en una sola de las dos, el panel diría uno y las
    // estadísticas cero a un metro de distancia.
    const panel = (
      await app.inject({ method: 'GET', url: '/reports/attendance', headers })
    ).json();
    expect(panel.hoy).toBe(0);
    expect(panel.total).toBe(0);

    await app.close();
  });

  it('el alumno no ve las estadísticas del club', async () => {
    const { app, auth, ids } = await crearEscenario();
    const r = await app.inject({
      method: 'GET',
      url: '/reports/estadisticas',
      headers: auth(ids.alumno),
    });
    expect(r.statusCode).toBe(403);
    await app.close();
  });
});

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

  it('un plan borrado deja de esperarse: sin tarifas, no se espera nada', async () => {
    // Borrar un plan es desactivarlo, y la membresía se queda apuntando al
    // plan muerto. Sin filtrar por eso, el club que vaciaba sus tarifas seguía
    // leyendo «60 000 de lo esperado este mes» con la pantalla en blanco: se
    // esperaba el dinero de algo que ya no se le puede cobrar a nadie.
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
      method: 'PATCH',
      url: `/memberships/${ids.alumno}`,
      headers,
      payload: { currentPlanId: plan.id, status: 'activo' },
    });

    const antes = await app.inject({ method: 'GET', url: '/reports/revenue', headers });
    expect(antes.json().esperadoMensual).toBe(60000);

    await app.inject({ method: 'DELETE', url: `/plans/${plan.id}`, headers });

    const despues = await app.inject({ method: 'GET', url: '/reports/revenue', headers });
    expect(despues.json().esperadoMensual).toBe(0);

    const stats = await app.inject({ method: 'GET', url: '/reports/estadisticas', headers });
    expect(stats.json().dinero.esperadoMensual).toBe(0);
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
