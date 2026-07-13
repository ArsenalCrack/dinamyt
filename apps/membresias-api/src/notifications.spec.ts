import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPair, SignJWT, jwtVerify } from 'jose';
import type { JwtPayload } from '@dinamyt/shared';
import { createTestDb } from '@dinamyt/membresias-db/testing';
import { memberships } from '@dinamyt/membresias-db';
import type { Db } from '@dinamyt/membresias-db';
import { buildApp } from './app';
import { planNotificaciones } from './lib/notifications';

describe('notificaciones', () => {
  it('planNotificaciones marca vencidos y por vencer, ignora al día/sin plan', () => {
    const plan = planNotificaciones(
      [
        { ecosystemUserId: 'u1', membershipId: 'm1', venceEl: '2000-01-01' },
        { ecosystemUserId: 'u2', membershipId: 'm2', venceEl: '2099-12-31' },
        { ecosystemUserId: 'u3', membershipId: 'm3', venceEl: null },
      ],
      '2026-07-02',
    );
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ userId: 'u1', type: 'venc' });
  });

  it('planNotificaciones marca por_vencer dentro de la ventana', () => {
    const plan = planNotificaciones(
      [{ ecosystemUserId: 'u', membershipId: 'm', venceEl: '2026-07-04' }],
      '2026-07-02',
      3,
    );
    expect(plan[0].type).toBe('pre_venc');
  });

  describe('POST /notifications/run', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let priv: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let pub: any;
    const ORG = '00000000-0000-0000-0000-000000000010';
    const OWNER = '00000000-0000-0000-0000-000000000011';
    const ALUM = '00000000-0000-0000-0000-0000000000c1';

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

    it('encola avisos in-app y es idempotente el mismo día', async () => {
      const { app, db } = await makeApp();
      const headers = { authorization: `Bearer ${await token()}` };
      await db
        .insert(memberships)
        .values({ orgId: ORG, ecosystemUserId: ALUM, venceEl: '2000-01-01' });

      const r1 = await app.inject({ method: 'POST', url: '/notifications/run', headers });
      expect(r1.statusCode).toBe(200);
      expect(r1.json().creados).toBe(1);

      const r2 = await app.inject({ method: 'POST', url: '/notifications/run', headers });
      expect(r2.json().creados).toBe(0); // idempotente el mismo día

      const list = await app.inject({ method: 'GET', url: '/notifications?all=1', headers });
      expect(list.statusCode).toBe(200);
      expect(list.json().length).toBe(1);
      expect(list.json()[0].type).toBe('venc');
      await app.close();
    });
  });
});
