import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPair, SignJWT, jwtVerify } from 'jose';
import type { JwtPayload } from '@dinamyt/shared';
import { createTestDb } from '@dinamyt/membresias-db/testing';
import type { Db } from '@dinamyt/membresias-db';
import { buildApp } from './app';

// Verifica el guard del ecosystem + el flujo de planes/pagos con PGlite, sin red.
describe('membresias-api (integración con PGlite)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let priv: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pub: any;

  const ORG = '00000000-0000-0000-0000-000000000010';
  const OWNER = '00000000-0000-0000-0000-000000000011';
  const ALUM = '00000000-0000-0000-0000-000000000012';

  beforeAll(async () => {
    const kp = await generateKeyPair('RS256');
    priv = kp.privateKey;
    pub = kp.publicKey;
  });

  async function token(
    opts: {
      scopes?: string[];
      role?: string | null;
      sub?: string;
    } = {},
  ): Promise<string> {
    const payload: JwtPayload = {
      sub: opts.sub ?? OWNER,
      email: 'maestro@dinamyt.com',
      fullName: 'Maestro',
      org_id: ORG,
      app_scopes: opts.scopes ?? ['membresias'],
      role_academy: null,
      role_campeonatos: null,
      role_membresias: opts.role === undefined ? 'owner' : opts.role,
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
    return buildApp({
      db,
      verifyToken: async (t) =>
        (await jwtVerify(t, pub, { algorithms: ['RS256'] }))
          .payload as unknown as JwtPayload,
      fetchMembers: async () => [
        {
          userId: ALUM,
          email: 'alumno@dinamyt.com',
          fullName: 'Alumno Uno',
          phone: null,
          role: 'student',
          avatarUrl: null,
        },
      ],
    });
  }

  it('GET /health es público', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().service).toBe('membresias-api');
    await app.close();
  });

  it('401 sin token y 403 sin el scope membresias', async () => {
    const app = await makeApp();
    const sinToken = await app.inject({ method: 'GET', url: '/plans' });
    expect(sinToken.statusCode).toBe(401);

    const otroScope = await app.inject({
      method: 'GET',
      url: '/plans',
      headers: { authorization: `Bearer ${await token({ scopes: ['campeonatos'], role: null })}` },
    });
    expect(otroScope.statusCode).toBe(403);
    await app.close();
  });

  it('crea plan, registra pago y calcula el vencimiento; el roster refleja el estado', async () => {
    const app = await makeApp();
    const auth = { authorization: `Bearer ${await token()}` };

    const crearPlan = await app.inject({
      method: 'POST',
      url: '/plans',
      headers: auth,
      payload: { name: 'Mensual', type: 'mensual', price: '60000' },
    });
    expect(crearPlan.statusCode).toBe(201);
    const plan = crearPlan.json();

    const pago = await app.inject({
      method: 'POST',
      url: `/memberships/${ALUM}/payments`,
      headers: auth,
      payload: { planId: plan.id, amount: '60000', method: 'efectivo' },
    });
    expect(pago.statusCode).toBe(201);
    const body = pago.json();
    expect(body.payment.status).toBe('PAGADO');
    expect(body.membership.venceEl).toBeTruthy();
    expect(body.membership.estado).toBe('al_dia');

    const roster = await app.inject({ method: 'GET', url: '/memberships', headers: auth });
    expect(roster.statusCode).toBe(200);
    const list = roster.json();
    expect(list).toHaveLength(1);
    expect(list[0].userId).toBe(ALUM);
    expect(list[0].venceEl).toBe(body.membership.venceEl);
    expect(list[0].estado).toBe('al_dia');

    await app.close();
  });

  it('staff no puede crear planes (solo owner)', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/plans',
      headers: { authorization: `Bearer ${await token({ role: 'staff' })}` },
      payload: { name: 'X', type: 'mensual', price: '1' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});
