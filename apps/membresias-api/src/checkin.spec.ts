import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { memberships, scheduleExceptions, type Db } from '@dinamyt/membresias-db';
import { crearEscenario } from './testing/escenario';
import { todayStr } from './lib/billing';

describe('membresias-api — check-in', () => {
  /** Deja al alumno con un estado de membresía concreto. */
  async function estadoDe(
    db: Db,
    orgId: string,
    userId: string,
    extra: Partial<typeof memberships.$inferInsert> = {},
  ) {
    const [m] = await db
      .insert(memberships)
      .values({ orgId, userId, ...extra })
      .returning();
    return m;
  }

  const checkin = (value: string, type = 'manual') => ({
    method: 'POST' as const,
    url: '/checkin',
    payload: { identifier: { type, value } },
  });

  it('alumno al día: registra asistencia', async () => {
    const { app, db, auth, ids, orgId } = await crearEscenario();
    await estadoDe(db, orgId, ids.alumno, { venceEl: '2099-12-31' });

    const res = await app.inject({ ...checkin(ids.alumno), headers: auth(ids.owner) });
    expect(res.statusCode).toBe(201);
    expect(res.json().bloqueado).toBe(false);
    expect(res.json().estado).toBe('al_dia');
    expect(res.json().accionSugerida).toBe('ok');
    await app.close();
  });

  it('el carnet QR del alumno sirve como identificador', async () => {
    const { app, db, auth, ids, orgId } = await crearEscenario();
    await estadoDe(db, orgId, ids.alumno, { venceEl: '2099-12-31' });

    const res = await app.inject({
      ...checkin(ids.alumno, 'qr'),
      headers: auth(ids.owner),
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().userId).toBe(ids.alumno);
    await app.close();
  });

  it('un carnet QR de otro club no da de alta a nadie', async () => {
    const { app, auth, ids, db } = await crearEscenario();

    const res = await app.inject({
      ...checkin(ids.alumnoAjeno, 'qr'),
      headers: auth(ids.owner),
    });
    expect(res.statusCode).toBe(404);

    // Y no quedó ninguna membresía fantasma en el club que escaneó.
    const filas = await db
      .select()
      .from(memberships)
      .where(eq(memberships.userId, ids.alumnoAjeno));
    expect(filas).toHaveLength(0);
    await app.close();
  });

  it('rechaza el doble check-in el mismo día', async () => {
    const { app, db, auth, ids, orgId } = await crearEscenario();
    await estadoDe(db, orgId, ids.alumno, { venceEl: '2099-12-31' });
    const owner = auth(ids.owner);

    expect((await app.inject({ ...checkin(ids.alumno), headers: owner })).statusCode).toBe(201);
    const dup = await app.inject({ ...checkin(ids.alumno), headers: owner });
    expect(dup.statusCode).toBe(409);
    await app.close();
  });

  it('bloquea el check-in en un día cerrado del calendario', async () => {
    const { app, db, auth, ids, orgId } = await crearEscenario();
    await estadoDe(db, orgId, ids.alumno, { venceEl: '2099-12-31' });
    await db.insert(scheduleExceptions).values({ orgId, date: todayStr(), isClosed: true });

    const res = await app.inject({ ...checkin(ids.alumno), headers: auth(ids.owner) });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('mora: vencido 1ª vez deja entrar y avisa (contador sube a 1)', async () => {
    const { app, db, auth, ids, orgId } = await crearEscenario();
    const m = await estadoDe(db, orgId, ids.alumno, {
      venceEl: '2000-01-01',
      moraCheckins: 0,
    });

    const res = await app.inject({ ...checkin(ids.alumno), headers: auth(ids.owner) });
    expect(res.statusCode).toBe(201);
    expect(res.json().estado).toBe('vencido');
    expect(res.json().accionSugerida).toBe('avisar');

    const [row] = await db.select().from(memberships).where(eq(memberships.id, m.id));
    expect(row.moraCheckins).toBe(1);
    await app.close();
  });

  it('mora: vencido con contador ≥1 bloquea el acceso', async () => {
    const { app, db, auth, ids, orgId } = await crearEscenario();
    await estadoDe(db, orgId, ids.alumno, { venceEl: '2000-01-01', moraCheckins: 1 });

    const res = await app.inject({ ...checkin(ids.alumno), headers: auth(ids.owner) });
    expect(res.statusCode).toBe(402);
    expect(res.json().bloqueado).toBe(true);
    expect(res.json().accionSugerida).toBe('bloquear');
    await app.close();
  });

  it('identifica por PIN', async () => {
    const { app, db, auth, ids, orgId } = await crearEscenario();
    await estadoDe(db, orgId, ids.alumno, { venceEl: '2099-12-31', checkinPin: '4321' });

    const res = await app.inject({
      method: 'POST',
      url: '/checkin',
      headers: auth(ids.owner),
      payload: { identifier: { type: 'pin', value: '4321' } },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().userId).toBe(ids.alumno);
    await app.close();
  });

  it('el PIN de otro club no sirve aquí', async () => {
    const { app, db, auth, ids, otroOrgId } = await crearEscenario();
    await estadoDe(db, otroOrgId, ids.alumnoAjeno, {
      venceEl: '2099-12-31',
      checkinPin: '4321',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/checkin',
      headers: auth(ids.owner),
      payload: { identifier: { type: 'pin', value: '4321' } },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('el auxiliar (kiosco) también puede registrar check-in', async () => {
    const { app, db, auth, ids, orgId } = await crearEscenario();
    await estadoDe(db, orgId, ids.alumno, { venceEl: '2099-12-31' });
    const res = await app.inject({ ...checkin(ids.alumno), headers: auth(ids.staff) });
    expect(res.statusCode).toBe(201);
    await app.close();
  });
});
