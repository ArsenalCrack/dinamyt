import { describe, it, expect } from 'vitest';
import { memberships } from '@dinamyt/membresias-db';
import { crearEscenario } from './testing/escenario';
import { planNotificaciones } from './lib/notifications';

describe('notificaciones', () => {
  it('planNotificaciones marca vencidos y por vencer, ignora al día/sin plan', () => {
    const plan = planNotificaciones(
      [
        { userId: 'u1', membershipId: 'm1', venceEl: '2000-01-01' },
        { userId: 'u2', membershipId: 'm2', venceEl: '2099-12-31' },
        { userId: 'u3', membershipId: 'm3', venceEl: null },
      ],
      '2026-07-02',
    );
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ userId: 'u1', type: 'venc' });
  });

  it('planNotificaciones marca por_vencer dentro de la ventana', () => {
    const plan = planNotificaciones(
      [{ userId: 'u', membershipId: 'm', venceEl: '2026-07-04' }],
      '2026-07-02',
      3,
    );
    expect(plan[0].type).toBe('pre_venc');
  });

  describe('POST /notifications/run', () => {
    it('encola avisos in-app y es idempotente el mismo día', async () => {
      const { app, db, auth, ids, orgId } = await crearEscenario();
      const headers = auth(ids.owner);
      await db
        .insert(memberships)
        .values({ orgId, userId: ids.alumno, venceEl: '2000-01-01' });

      const r1 = await app.inject({ method: 'POST', url: '/notifications/run', headers });
      expect(r1.statusCode).toBe(200);
      expect(r1.json().creados).toBe(1);

      const r2 = await app.inject({ method: 'POST', url: '/notifications/run', headers });
      expect(r2.json().creados).toBe(0); // idempotente el mismo día

      const list = await app.inject({ method: 'GET', url: '/notifications?all=1', headers });
      expect(list.statusCode).toBe(200);
      expect(list.json()).toHaveLength(1);
      expect(list.json()[0].type).toBe('venc');
      await app.close();
    });

    it('el alumno solo ve SUS avisos', async () => {
      const { app, db, auth, ids, orgId } = await crearEscenario();
      await db.insert(memberships).values([
        { orgId, userId: ids.alumno, venceEl: '2000-01-01' },
        { orgId, userId: ids.alumno2, venceEl: '2000-01-01' },
      ]);
      await app.inject({
        method: 'POST',
        url: '/notifications/run',
        headers: auth(ids.owner),
      });

      const mios = await app.inject({
        method: 'GET',
        url: '/notifications',
        headers: auth(ids.alumno),
      });
      expect(mios.json()).toHaveLength(1);
      expect(mios.json()[0].userId).toBe(ids.alumno);
      await app.close();
    });
  });
});
