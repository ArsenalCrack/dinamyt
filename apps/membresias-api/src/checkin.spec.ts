import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPair, SignJWT, jwtVerify } from 'jose';
import { eq } from 'drizzle-orm';
import type { JwtPayload } from '@dinamyt/shared';
import { createTestDb } from '@dinamyt/membresias-db/testing';
import { memberships, scheduleExceptions } from '@dinamyt/membresias-db';
import type { Db } from '@dinamyt/membresias-db';
import { buildApp } from './app';
import { todayStr } from './lib/billing';

describe('membresias-api — check-in', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let priv: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pub: any;

  const ORG = '00000000-0000-0000-0000-000000000010';
  const OWNER = '00000000-0000-0000-0000-000000000011';

  beforeAll(async () => {
    const kp = await generateKeyPair('RS256');
    priv = kp.privateKey;
    pub = kp.publicKey;
  });

  async function token(role: string | null = 'owner'): Promise<string> {
    const payload: JwtPayload = {
      sub: OWNER,
      email: 'maestro@dinamyt.com',
      fullName: 'Maestro',
      org_id: ORG,
      app_scopes: ['membresias'],
      role_academy: null,
      role_campeonatos: null,
      role_membresias: role,
      is_super_admin: false,
    };
    return new SignJWT({ ...payload })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(priv);
  }

  async function makeApp() {
    const db = (await createTestDb()) as unknown as Db;
    const app = buildApp({
      db,
      verifyToken: async (t) =>
        (await jwtVerify(t, pub, { algorithms: ['RS256'] }))
          .payload as unknown as JwtPayload,
      fetchMembers: async () => [],
    });
    return { app, db };
  }

  async function seedMember(
    db: Db,
    ecosystemUserId: string,
    extra: Partial<typeof memberships.$inferInsert> = {},
  ) {
    const [m] = await db
      .insert(memberships)
      .values({ orgId: ORG, ecosystemUserId, ...extra })
      .returning();
    return m;
  }

  async function authHeaders(role: string | null = 'owner') {
    return { authorization: `Bearer ${await token(role)}` };
  }

  const checkin = (value: string, type = 'manual') => ({
    method: 'POST' as const,
    url: '/checkin',
    payload: { identifier: { type, value } },
  });

  it('alumno al día: registra asistencia', async () => {
    const { app, db } = await makeApp();
    const ALUM = '00000000-0000-0000-0000-0000000000a1';
    await seedMember(db, ALUM, { venceEl: '2099-12-31' });

    const res = await app.inject({ ...checkin(ALUM), headers: await authHeaders() });
    expect(res.statusCode).toBe(201);
    const b = res.json();
    expect(b.bloqueado).toBe(false);
    expect(b.estado).toBe('al_dia');
    expect(b.accionSugerida).toBe('ok');
    await app.close();
  });

  it('rechaza el doble check-in el mismo día', async () => {
    const { app, db } = await makeApp();
    const ALUM = '00000000-0000-0000-0000-0000000000a2';
    await seedMember(db, ALUM, { venceEl: '2099-12-31' });

    expect((await app.inject({ ...checkin(ALUM), headers: await authHeaders() })).statusCode).toBe(201);
    const dup = await app.inject({ ...checkin(ALUM), headers: await authHeaders() });
    expect(dup.statusCode).toBe(409);
    await app.close();
  });

  it('bloquea el check-in en un día cerrado del calendario', async () => {
    const { app, db } = await makeApp();
    const ALUM = '00000000-0000-0000-0000-0000000000a3';
    await seedMember(db, ALUM, { venceEl: '2099-12-31' });
    await db.insert(scheduleExceptions).values({ orgId: ORG, date: todayStr(), isClosed: true });

    const res = await app.inject({ ...checkin(ALUM), headers: await authHeaders() });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('mora: vencido 1ª vez deja entrar y avisa (contador sube a 1)', async () => {
    const { app, db } = await makeApp();
    const ALUM = '00000000-0000-0000-0000-0000000000a4';
    const m = await seedMember(db, ALUM, { venceEl: '2000-01-01', moraCheckins: 0 });

    const res = await app.inject({ ...checkin(ALUM), headers: await authHeaders() });
    expect(res.statusCode).toBe(201);
    expect(res.json().estado).toBe('vencido');
    expect(res.json().accionSugerida).toBe('avisar');

    const [row] = await db.select().from(memberships).where(eq(memberships.id, m.id));
    expect(row.moraCheckins).toBe(1);
    await app.close();
  });

  it('mora: vencido con contador ≥1 bloquea el acceso', async () => {
    const { app, db } = await makeApp();
    const ALUM = '00000000-0000-0000-0000-0000000000a5';
    await seedMember(db, ALUM, { venceEl: '2000-01-01', moraCheckins: 1 });

    const res = await app.inject({ ...checkin(ALUM), headers: await authHeaders() });
    expect(res.statusCode).toBe(402);
    expect(res.json().bloqueado).toBe(true);
    expect(res.json().accionSugerida).toBe('bloquear');
    await app.close();
  });

  it('identifica por PIN', async () => {
    const { app, db } = await makeApp();
    const ALUM = '00000000-0000-0000-0000-0000000000a6';
    await seedMember(db, ALUM, { venceEl: '2099-12-31', checkinPin: '4321' });

    const res = await app.inject({
      method: 'POST',
      url: '/checkin',
      headers: await authHeaders(),
      payload: { identifier: { type: 'pin', value: '4321' } },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().ecosystemUserId).toBe(ALUM);
    await app.close();
  });

  it('el staff (kiosco) también puede registrar check-in', async () => {
    const { app, db } = await makeApp();
    const ALUM = '00000000-0000-0000-0000-0000000000a7';
    await seedMember(db, ALUM, { venceEl: '2099-12-31' });
    const res = await app.inject({ ...checkin(ALUM), headers: await authHeaders('staff') });
    expect(res.statusCode).toBe(201);
    await app.close();
  });
});
