import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { memberships } from '@dinamyt/membresias-db';
import { crearEscenario } from './testing/escenario';
import { planNotificaciones } from './lib/notifications';
import { vigentes } from './routes/notifications';
import { todayStr } from './lib/billing';

/** El día siguiente a hoy, para simular un cobro que corre el vencimiento. */
function manana(): string {
  const d = new Date(`${todayStr()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

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

  /**
   * La mitad de la campana que faltaba: un aviso que ya no es verdad no se
   * enseña. Se prueba con la función pura y con la ruta, porque lo que rompía
   * no era el cálculo —no existía— sino que la lista devolvía la foto vieja.
   */
  describe('un aviso deja de existir cuando deja de ser verdad', () => {
    it('`vigentes` deja pasar lo que sigue siendo cierto y para lo demás', () => {
      const hoy = '2026-08-31';
      const lista = [
        { type: 'venc', venceEl: '2026-08-01', clasesRestantes: null }, // sigue debiendo
        { type: 'venc', venceEl: '2026-09-30', clasesRestantes: null }, // pagó
        { type: 'pre_venc', venceEl: '2026-09-02', clasesRestantes: null }, // sigue por vencer
        { type: 'pre_venc', venceEl: '2026-12-31', clasesRestantes: null }, // pagó de sobra
        { type: 'pre_venc', venceEl: '2026-08-01', clasesRestantes: null }, // ya venció
        { type: 'maestro', venceEl: null, clasesRestantes: null }, // lo escribió alguien
      ];
      expect(vigentes(lista, hoy)).toEqual([lista[0], lista[2], lista[5]]);
    });

    it('se le acaban las clases y el aviso vale; le quedan y no', () => {
      const hoy = '2026-08-31';
      expect(
        vigentes([{ type: 'venc', venceEl: null, clasesRestantes: 0 }], hoy),
      ).toHaveLength(1);
      expect(
        vigentes([{ type: 'venc', venceEl: null, clasesRestantes: 4 }], hoy),
      ).toHaveLength(0);
    });

    it('el alumno paga y su aviso desaparece de la campana del maestro', async () => {
      const { app, db, auth, ids, orgId } = await crearEscenario();
      const headers = auth(ids.owner);
      await db
        .insert(memberships)
        .values({ orgId, userId: ids.alumno, venceEl: '2000-01-01' });
      await app.inject({ method: 'POST', url: '/notifications/run', headers });

      const antes = await app.inject({
        method: 'GET',
        url: '/notifications?all=1',
        headers,
      });
      expect(antes.json()).toHaveLength(1);

      // Lo que hace el cobro: mover el vencimiento. El aviso no se toca — y
      // eso es justamente lo que antes lo dejaba mintiendo en pantalla.
      await db
        .update(memberships)
        .set({ venceEl: manana() })
        .where(eq(memberships.orgId, orgId));

      const despues = await app.inject({
        method: 'GET',
        url: '/notifications?all=1',
        headers,
      });
      expect(despues.json()).toHaveLength(0);
      await app.close();
    });

    it('lo mismo en la campana del alumno, que es la suya', async () => {
      const { app, db, auth, ids, orgId } = await crearEscenario();
      await db
        .insert(memberships)
        .values({ orgId, userId: ids.alumno, venceEl: '2000-01-01' });
      await app.inject({
        method: 'POST',
        url: '/notifications/run',
        headers: auth(ids.owner),
      });

      const antes = await app.inject({
        method: 'GET',
        url: '/notifications',
        headers: auth(ids.alumno),
      });
      expect(antes.json()).toHaveLength(1);

      await db
        .update(memberships)
        .set({ venceEl: manana() })
        .where(eq(memberships.userId, ids.alumno));

      const despues = await app.inject({
        method: 'GET',
        url: '/notifications',
        headers: auth(ids.alumno),
      });
      expect(despues.json()).toHaveLength(0);
      await app.close();
    });
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

    it('el aviso trae el nombre y el vencimiento: la pantalla no tiene que preguntarlos', async () => {
      const { app, db, auth, ids, orgId } = await crearEscenario();
      const headers = auth(ids.owner);
      await db
        .insert(memberships)
        .values({ orgId, userId: ids.alumno, venceEl: '2000-01-01' });
      await app.inject({ method: 'POST', url: '/notifications/run', headers });

      const [aviso] = (
        await app.inject({ method: 'GET', url: '/notifications?all=1', headers })
      ).json();
      expect(aviso.fullName).toBe('Alumno Uno');
      expect(aviso.venceEl).toBe('2000-01-01');
      expect(aviso.readAt).toBeNull();
      await app.close();
    });

    it('abrir la campana marca como leídos los MÍOS y solo los míos', async () => {
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

      const marcado = await app.inject({
        method: 'POST',
        url: '/notifications/leidos',
        headers: auth(ids.alumno),
      });
      expect(marcado.json().marcados).toBe(1);

      const delOtro = await app.inject({
        method: 'GET',
        url: '/notifications',
        headers: auth(ids.alumno2),
      });
      expect(delOtro.json()[0].readAt).toBeNull();
      await app.close();
    });

    it('lo que el alumno ya leyó desaparece de su campana', async () => {
      // La campana es lo que te falta por mirar, no el archivo de todo lo que
      // te ha pasado: un aviso ya abierto que sigue ahí obliga a releerlo cada
      // vez para reconocerlo, y a la tercera se deja de abrir.
      const { app, db, auth, ids, orgId } = await crearEscenario();
      await db
        .insert(memberships)
        .values({ orgId, userId: ids.alumno, venceEl: '2000-01-01' });
      await app.inject({
        method: 'POST',
        url: '/notifications/run',
        headers: auth(ids.owner),
      });

      const antes = await app.inject({
        method: 'GET',
        url: '/notifications',
        headers: auth(ids.alumno),
      });
      expect(antes.json()).toHaveLength(1);

      await app.inject({
        method: 'POST',
        url: '/notifications/leidos',
        headers: auth(ids.alumno),
      });

      const despues = await app.inject({
        method: 'GET',
        url: '/notifications',
        headers: auth(ids.alumno),
      });
      expect(despues.json()).toHaveLength(0);
      await app.close();
    });

    it('pero en la campana del CLUB sigue: ahí «leído» es de su dueño, no del maestro', async () => {
      // Si esto se filtrara por `readAt`, la lista del maestro se vaciaría
      // cuando sus ALUMNOS abrieran sus avisos — que no es asunto suyo. Lo que
      // saca un aviso de esta lista es que su motivo deje de ser verdad.
      const { app, db, auth, ids, orgId } = await crearEscenario();
      await db
        .insert(memberships)
        .values({ orgId, userId: ids.alumno, venceEl: '2000-01-01' });
      await app.inject({
        method: 'POST',
        url: '/notifications/run',
        headers: auth(ids.owner),
      });
      await app.inject({
        method: 'POST',
        url: '/notifications/leidos',
        headers: auth(ids.alumno),
      });

      const delClub = await app.inject({
        method: 'GET',
        url: '/notifications?all=1',
        headers: auth(ids.owner),
      });
      expect(delClub.json()).toHaveLength(1);
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

  /**
   * El disparo diario. Es la diferencia entre unos avisos que existen porque el
   * maestro se acordó de pulsar un botón y unos que salen solos cada mañana.
   */
  describe('POST /notifications/cron', () => {
    it('sin CRON_SECRET la ruta no existe', async () => {
      const { app } = await crearEscenario();
      delete process.env.CRON_SECRET;
      const r = await app.inject({ method: 'POST', url: '/notifications/cron' });
      expect(r.statusCode).toBe(404);
      await app.close();
    });

    it('con el secreto equivocado no pasa', async () => {
      const { app } = await crearEscenario();
      process.env.CRON_SECRET = 'el-bueno';
      const r = await app.inject({
        method: 'POST',
        url: '/notifications/cron',
        headers: { 'x-cron-secret': 'el-malo' },
      });
      expect(r.statusCode).toBe(401);
      delete process.env.CRON_SECRET;
      await app.close();
    });

    it('con el secreto correcto genera los avisos de TODOS los clubes', async () => {
      const { app, db, ids, orgId, otroOrgId } = await crearEscenario();
      process.env.CRON_SECRET = 'el-bueno';
      await db.insert(memberships).values([
        { orgId, userId: ids.alumno, venceEl: '2000-01-01' },
        { orgId: otroOrgId, userId: ids.alumnoAjeno, venceEl: '2000-01-01' },
      ]);

      const r = await app.inject({
        method: 'POST',
        url: '/notifications/cron',
        headers: { 'x-cron-secret': 'el-bueno' },
      });
      expect(r.statusCode).toBe(200);
      expect(r.json().clubes).toBe(2);
      expect(r.json().creados).toBe(2); // uno de cada club

      // Y no se duplican si el cron corre dos veces el mismo día.
      const otra = await app.inject({
        method: 'POST',
        url: '/notifications/cron',
        headers: { 'x-cron-secret': 'el-bueno' },
      });
      expect(otra.json().creados).toBe(0);

      delete process.env.CRON_SECRET;
      await app.close();
    });
  });
});
