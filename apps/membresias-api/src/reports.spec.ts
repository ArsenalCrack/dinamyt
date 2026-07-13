import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPair, SignJWT, jwtVerify } from 'jose';
import type { JwtPayload } from '@dinamyt/shared';
import { createTestDb } from '@dinamyt/membresias-db/testing';
import { memberships } from '@dinamyt/membresias-db';
import type { Db } from '@dinamyt/membresias-db';
import { buildApp } from './app';

describe('membresias-api — reportes', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let priv: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pub: any;

  const ORG = '00000000-0000-0000-0000-000000000010';
  const OWNER = '00000000-0000-0000-0000-000000000011';
  const ALUM = '00000000-0000-0000-0000-0000000000b1';

  beforeAll(async () => {
    const kp = await generateKeyPair('RS256');
    priv = kp.privateKey;
    pub = kp.publicKey;
  });

  async function token(): Promise<string> {
    const payload: JwtPayload = {
      sub: OWNER,
      email: 'maestro@dinamyt.com',
      fullName: 'Maestro',
      org_id: ORG,
      app_scopes: ['membresias'],
      role_academy: null,
      role_campeonatos: null,
      role_membresias: 'owner',
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

  it('revenue: recaudado y esperado reflejan el pago del mes', async () => {
    const { app } = await makeApp();
    const headers = { authorization: `Bearer ${await token()}` };

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
      url: `/memberships/${ALUM}/payments`,
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
    const { app, db } = await makeApp();
    const headers = { authorization: `Bearer ${await token()}` };
    await db
      .insert(memberships)
      .values({ orgId: ORG, ecosystemUserId: ALUM, venceEl: '2000-01-01' });

    const res = await app.inject({ method: 'GET', url: '/reports/overdue', headers });
    expect(res.statusCode).toBe(200);
    const list = res.json();
    expect(list).toHaveLength(1);
    expect(list[0].ecosystemUserId).toBe(ALUM);
    expect(list[0].diasVencido).toBeGreaterThan(0);
    await app.close();
  });

  it('attendance: cuenta las asistencias del día', async () => {
    const { app, db } = await makeApp();
    const headers = { authorization: `Bearer ${await token()}` };
    await db
      .insert(memberships)
      .values({ orgId: ORG, ecosystemUserId: ALUM, venceEl: '2099-12-31' });

    await app.inject({
      method: 'POST',
      url: '/checkin',
      headers,
      payload: { identifier: { type: 'manual', value: ALUM } },
    });

    const res = await app.inject({ method: 'GET', url: '/reports/attendance', headers });
    expect(res.statusCode).toBe(200);
    const b = res.json();
    expect(b.total).toBe(1);
    expect(b.hoy).toBe(1);
    await app.close();
  });
});
