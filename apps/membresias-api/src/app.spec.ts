import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { orgs, users } from '@dinamyt/membresias-db';
import { crearEscenario, PASSWORD } from './testing/escenario';

// Identidad propia + aislamiento entre clubes, contra PGlite y sin red.
describe('membresias-api — identidad y permisos', () => {
  it('GET /health es público', async () => {
    const { app } = await crearEscenario();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().service).toBe('membresias-api');
    await app.close();
  });

  it('login correcto devuelve token y club; contraseña mala da 401', async () => {
    const { app } = await crearEscenario();

    const ok = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'maestro@club.com', password: PASSWORD },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().token).toBeTruthy();
    expect(ok.json().user.role).toBe('owner');
    expect(ok.json().club.slug).toBe('club-central');
    // El hash jamás sale de la API.
    expect(JSON.stringify(ok.json())).not.toContain('passwordHash');

    const mal = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'maestro@club.com', password: 'incorrecta' },
    });
    expect(mal.statusCode).toBe(401);
    await app.close();
  });

  it('un correo inexistente responde igual que una contraseña mala', async () => {
    const { app } = await crearEscenario();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'nadie@club.com', password: PASSWORD },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('Correo o contraseña incorrectos.');
    await app.close();
  });

  it('sin token da 401 y con token de alumno da 403 en rutas de maestro', async () => {
    const { app, auth, ids } = await crearEscenario();

    const sinToken = await app.inject({ method: 'GET', url: '/plans' });
    expect(sinToken.statusCode).toBe(401);

    const alumno = await app.inject({
      method: 'GET',
      url: '/plans',
      headers: auth(ids.alumno),
    });
    expect(alumno.statusCode).toBe(403);
    await app.close();
  });

  it('el maestro crea alumnos y el roster los refleja con su carnet QR', async () => {
    const { app, auth, ids } = await crearEscenario();
    const owner = auth(ids.owner);

    const nuevo = await app.inject({
      method: 'POST',
      url: '/users',
      headers: owner,
      payload: {
        email: 'alumno3@club.com',
        fullName: 'Alumno Tres',
        password: PASSWORD,
        role: 'student',
      },
    });
    expect(nuevo.statusCode).toBe(201);

    const roster = await app.inject({ method: 'GET', url: '/memberships', headers: owner });
    expect(roster.statusCode).toBe(200);
    // El roster viene paginado: `{ items, total }`. `total` cuenta TODO lo que
    // cumple el filtro, no lo que cabe en la página.
    const lista = roster.json().items;
    expect(roster.json().total).toBe(3);
    expect(lista).toHaveLength(3); // los 2 sembrados + el nuevo
    // El carnet QR del alumno es su id: lo que escanea la cámara en el check-in.
    expect(lista.every((a: { qr: string; userId: string }) => a.qr === a.userId)).toBe(true);
    await app.close();
  });

  it('el maestro no puede nombrar a otro maestro (eso es del superadmin)', async () => {
    const { app, auth, ids } = await crearEscenario();
    const res = await app.inject({
      method: 'POST',
      url: '/users',
      headers: auth(ids.owner),
      payload: {
        email: 'otro@club.com',
        fullName: 'Otro',
        password: PASSWORD,
        role: 'owner',
      },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('pedir un usuario de otro club responde 404, no 403', async () => {
    const { app, auth, ids } = await crearEscenario();
    const res = await app.inject({
      method: 'GET',
      url: `/users/${ids.alumnoAjeno}`,
      headers: auth(ids.owner),
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('desactivar el club deja fuera a su maestro de inmediato', async () => {
    const { app, db, auth, ids, orgId } = await crearEscenario();
    const owner = auth(ids.owner);

    expect((await app.inject({ method: 'GET', url: '/plans', headers: owner })).statusCode).toBe(200);

    await db.update(orgs).set({ isActive: false }).where(eq(orgs.id, orgId));

    // El token sigue siendo válido: lo que cambió es el estado en la BD, y el
    // guard lo relee en cada request.
    const despues = await app.inject({ method: 'GET', url: '/plans', headers: owner });
    expect(despues.statusCode).toBe(403);
    await app.close();
  });

  it('desactivar a un usuario lo saca aunque su token siga vigente', async () => {
    const { app, db, auth, ids } = await crearEscenario();
    await db.update(users).set({ isActive: false }).where(eq(users.id, ids.staff));

    const res = await app.inject({
      method: 'GET',
      url: '/memberships',
      headers: auth(ids.staff),
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('flujo completo: plan, pago y vencimiento', async () => {
    const { app, auth, ids } = await crearEscenario();
    const owner = auth(ids.owner);

    const crearPlan = await app.inject({
      method: 'POST',
      url: '/plans',
      headers: owner,
      payload: { name: 'Mensual', type: 'mensual', price: '60000' },
    });
    expect(crearPlan.statusCode).toBe(201);
    const plan = crearPlan.json();

    const pago = await app.inject({
      method: 'POST',
      url: `/memberships/${ids.alumno}/payments`,
      headers: owner,
      payload: { planId: plan.id, amount: '60000', method: 'efectivo' },
    });
    expect(pago.statusCode).toBe(201);
    expect(pago.json().payment.status).toBe('PAGADO');
    expect(pago.json().membership.estado).toBe('al_dia');

    const roster = await app.inject({ method: 'GET', url: '/memberships', headers: owner });
    const alumno = roster
      .json()
      .items.find((a: { userId: string }) => a.userId === ids.alumno);
    expect(alumno.estado).toBe('al_dia');
    expect(alumno.venceEl).toBe(pago.json().membership.venceEl);
    await app.close();
  });

  it('registrar un pago a un alumno de otro club da 404', async () => {
    const { app, auth, ids } = await crearEscenario();
    const owner = auth(ids.owner);

    const plan = (
      await app.inject({
        method: 'POST',
        url: '/plans',
        headers: owner,
        payload: { name: 'Mensual', type: 'mensual', price: '60000' },
      })
    ).json();

    const res = await app.inject({
      method: 'POST',
      url: `/memberships/${ids.alumnoAjeno}/payments`,
      headers: owner,
      payload: { planId: plan.id, amount: '60000' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('el auxiliar no crea planes; el maestro sí', async () => {
    const { app, auth, ids } = await crearEscenario();
    const res = await app.inject({
      method: 'POST',
      url: '/plans',
      headers: auth(ids.staff),
      payload: { name: 'X', type: 'mensual', price: '1' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('cambiar la propia contraseña exige la actual', async () => {
    const { app, auth, ids } = await crearEscenario();
    const alumno = auth(ids.alumno);

    const mal = await app.inject({
      method: 'POST',
      url: '/auth/change-password',
      headers: alumno,
      payload: { actual: 'noEsLaMia', nueva: 'NuevaClave123' },
    });
    expect(mal.statusCode).toBe(401);

    const bien = await app.inject({
      method: 'POST',
      url: '/auth/change-password',
      headers: alumno,
      payload: { actual: PASSWORD, nueva: 'NuevaClave123' },
    });
    expect(bien.statusCode).toBe(200);

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'alumno1@club.com', password: 'NuevaClave123' },
    });
    expect(login.statusCode).toBe(200);
    await app.close();
  });

  it('el maestro restablece la contraseña de su alumno sin saber la anterior', async () => {
    const { app, auth, ids } = await crearEscenario();

    const res = await app.inject({
      method: 'POST',
      url: `/users/${ids.alumno}/password`,
      headers: auth(ids.owner),
      payload: { password: 'ClaveDelMaestro1' },
    });
    expect(res.statusCode).toBe(200);

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'alumno1@club.com', password: 'ClaveDelMaestro1' },
    });
    expect(login.statusCode).toBe(200);
    await app.close();
  });
});

// El superadmin: quién entra al sistema y quién no.
describe('membresias-api — superadmin', () => {
  it('las rutas de superadmin responden 404 a un maestro', async () => {
    const { app, auth, ids } = await crearEscenario();
    const res = await app.inject({ method: 'GET', url: '/orgs', headers: auth(ids.owner) });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('crea un club, le nombra maestro y ese maestro entra', async () => {
    const { app, auth, ids } = await crearEscenario();
    const jefe = auth(ids.superadmin);

    const club = await app.inject({
      method: 'POST',
      url: '/orgs',
      headers: jefe,
      payload: { name: 'Dojo Península', city: 'Bogotá' },
    });
    expect(club.statusCode).toBe(201);
    expect(club.json().slug).toBe('dojo-peninsula');

    const maestro = await app.inject({
      method: 'POST',
      url: `/orgs/${club.json().id}/maestros`,
      headers: jefe,
      payload: {
        email: 'nuevo@dojo.com',
        fullName: 'Maestro Nuevo',
        password: PASSWORD,
      },
    });
    expect(maestro.statusCode).toBe(201);
    expect(maestro.json().role).toBe('owner');

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'nuevo@dojo.com', password: PASSWORD },
    });
    expect(login.statusCode).toBe(200);
    await app.close();
  });

  it('suspender el club corta el login de su maestro', async () => {
    const { app, auth, ids, orgId } = await crearEscenario();

    await app.inject({
      method: 'PATCH',
      url: `/orgs/${orgId}`,
      headers: auth(ids.superadmin),
      payload: { isActive: false },
    });

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'maestro@club.com', password: PASSWORD },
    });
    expect(login.statusCode).toBe(403);
    await app.close();
  });

  it('ve todos los clubes y puede operar sobre uno con ?orgId=', async () => {
    const { app, auth, ids, otroOrgId } = await crearEscenario();
    const jefe = auth(ids.superadmin);

    const clubes = await app.inject({ method: 'GET', url: '/orgs', headers: jefe });
    expect(clubes.json()).toHaveLength(2);

    const roster = await app.inject({
      method: 'GET',
      url: `/memberships?orgId=${otroOrgId}`,
      headers: jefe,
    });
    expect(roster.statusCode).toBe(200);
    expect(roster.json().items).toHaveLength(1);
    expect(roster.json().items[0].fullName).toBe('Alumno Rival');
    await app.close();
  });

  it('nadie modifica la cuenta del superadmin desde la API', async () => {
    const { app, auth, ids } = await crearEscenario();
    const res = await app.inject({
      method: 'PATCH',
      url: `/orgs/usuarios/${ids.superadmin}`,
      headers: auth(ids.superadmin),
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});
