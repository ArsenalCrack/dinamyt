import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  attendances,
  clubSchedule,
  memberships,
  scheduleExceptions,
  type Db,
} from '@dinamyt/membresias-db';
import { crearEscenario } from './testing/escenario';
import { todayStr } from './lib/billing';

/** Suma (o resta) días a una fecha `YYYY-MM-DD`, en UTC. */
function masDias(dia: string, n: number): string {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

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

  // ── El calendario manda ────────────────────────────────────────────────────

  it('un club sin días de clase configurados NO pasa lista', async () => {
    // Antes se daba por abierto, y el efecto era el contrario del que se
    // buscaba: el club que nunca configuró el calendario aceptaba asistencias
    // los domingos, los festivos y el 25 de diciembre, y las contaba.
    const { app, db, auth, ids, orgId } = await crearEscenario();
    await db.delete(clubSchedule).where(eq(clubSchedule.orgId, orgId));
    await estadoDe(db, orgId, ids.alumno, { venceEl: '2099-12-31' });

    const res = await app.inject({ ...checkin(ids.alumno), headers: auth(ids.owner) });
    expect(res.statusCode).toBe(422);
    expect(res.json().codigo).toBe('SIN_CALENDARIO');
    // Y el mensaje dice qué hacer: el maestro está en la puerta con la fila.
    expect(res.json().error).toContain('Calendario');

    // Nada llegó a la tabla: no basta con no contarla, es que no existe.
    expect(await db.select().from(attendances)).toHaveLength(0);
    await app.close();
  });

  it('una apertura extra abre un día que no es de clase', async () => {
    const { app, db, auth, ids, orgId } = await crearEscenario();
    await db.delete(clubSchedule).where(eq(clubSchedule.orgId, orgId));
    await estadoDe(db, orgId, ids.alumno, { venceEl: '2099-12-31' });
    await db
      .insert(scheduleExceptions)
      .values({ orgId, date: todayStr(), isClosed: false, note: 'Entreno especial' });

    const res = await app.inject({ ...checkin(ids.alumno), headers: auth(ids.owner) });
    expect(res.statusCode).toBe(201);
    await app.close();
  });

  it('el día de la semana apagado tampoco deja marcar', async () => {
    const { app, db, auth, ids, orgId } = await crearEscenario();
    await db.delete(clubSchedule).where(eq(clubSchedule.orgId, orgId));
    const hoy = new Date(`${todayStr()}T00:00:00Z`).getUTCDay();
    // El club existe y tiene horario, pero justo hoy está desactivado.
    await db.insert(clubSchedule).values([
      { orgId, weekday: hoy, isActive: false },
      { orgId, weekday: (hoy + 1) % 7 },
    ]);
    await estadoDe(db, orgId, ids.alumno, { venceEl: '2099-12-31' });

    const res = await app.inject({ ...checkin(ids.alumno), headers: auth(ids.owner) });
    expect(res.statusCode).toBe(422);
    expect(res.json().codigo).toBe('SIN_CLASE');
    await app.close();
  });

  // ── La cola sin conexión ───────────────────────────────────────────────────

  it('la marca que viene de la cola se guarda con SU día, no con el de hoy', async () => {
    // El caso real: el salón se quedó sin señal el sábado y el celular recuperó
    // datos el lunes. Antes llegaba sin fecha y quedaba fechada el lunes.
    const { app, db, auth, ids, orgId } = await crearEscenario();
    await estadoDe(db, orgId, ids.alumno, { venceEl: '2099-12-31' });
    const anteayer = masDias(todayStr(), -2);

    const res = await app.inject({
      method: 'POST',
      url: '/checkin',
      headers: auth(ids.owner),
      payload: {
        identifier: { type: 'manual', value: ids.alumno },
        fecha: anteayer,
        marcadoEn: `${anteayer}T23:10:00.000Z`,
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().fecha).toBe(anteayer);

    const [fila] = await db.select().from(attendances);
    expect(fila.checkinDate).toBe(anteayer);
    // Y la hora que enseña la lista es la de aquel día, no la del reintento.
    expect(fila.checkedInAt?.toISOString()).toBe(`${anteayer}T23:10:00.000Z`);
    await app.close();
  });

  it('la cola no puede regalar asistencias del futuro ni de hace un mes', async () => {
    // El reloj de un celular se cambia a mano: la fecha se cree solo hacia
    // atrás y dentro de una ventana corta.
    const { app, db, auth, ids, orgId } = await crearEscenario();
    await estadoDe(db, orgId, ids.alumno, { venceEl: '2099-12-31' });

    for (const fecha of [masDias(todayStr(), 1), masDias(todayStr(), -30)]) {
      const res = await app.inject({
        method: 'POST',
        url: '/checkin',
        headers: auth(ids.owner),
        payload: { identifier: { type: 'manual', value: ids.alumno }, fecha },
      });
      expect(res.statusCode).toBe(422);
    }
    expect(await db.select().from(attendances)).toHaveLength(0);
    await app.close();
  });

  it('la cola tampoco cuela un día en que el club estaba cerrado', async () => {
    const { app, db, auth, ids, orgId } = await crearEscenario();
    await estadoDe(db, orgId, ids.alumno, { venceEl: '2099-12-31' });
    const ayer = masDias(todayStr(), -1);
    await db.insert(scheduleExceptions).values({ orgId, date: ayer, isClosed: true });

    const res = await app.inject({
      method: 'POST',
      url: '/checkin',
      headers: auth(ids.owner),
      payload: { identifier: { type: 'manual', value: ids.alumno }, fecha: ayer },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().codigo).toBe('SIN_CLASE');
    await app.close();
  });

  it('la mora se juzga con el día en que se marcó, no con el del reintento', async () => {
    // Entrenó el lunes estando al día y su mensualidad venció el martes: que el
    // kiosco recuperara la señal el miércoles no le apunta una mora.
    const { app, db, auth, ids, orgId } = await crearEscenario();
    const ayer = masDias(todayStr(), -1);
    const m = await estadoDe(db, orgId, ids.alumno, { venceEl: ayer, moraCheckins: 0 });

    const res = await app.inject({
      method: 'POST',
      url: '/checkin',
      headers: auth(ids.owner),
      payload: { identifier: { type: 'manual', value: ids.alumno }, fecha: ayer },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().accionSugerida).not.toBe('bloquear');

    const [row] = await db.select().from(memberships).where(eq(memberships.id, m.id));
    expect(row.moraCheckins).toBe(0);
    await app.close();
  });
});
