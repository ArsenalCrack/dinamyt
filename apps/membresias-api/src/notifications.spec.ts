import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { memberships, notifications } from '@dinamyt/membresias-db';
import { crearEscenario } from './testing/escenario';
import { planNotificaciones, resumenParaElClub } from './lib/notifications';
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
   * ── El aviso que le llega AL MAESTRO ──────────────────────────────────────
   *
   * El push de Membresías era solo para el alumno. El maestro tenía la misma
   * información en su campana pero **solo si abría la app**, y la abre cuando
   * se acuerda; así que los avisos existían y nadie se enteraba hasta que
   * alguien preguntaba en clase.
   *
   * Lo que se prueba aquí es lo que hace que ese aviso se lea en vez de
   * barrerse: que sea UNO, que diga cuántos y de qué clase, y que no salga
   * cuando no hay nada que decir.
   */
  describe('el resumen del día para quien lleva el club', () => {
    it('cuenta vencidos y por vencer, y lo dice en una frase', () => {
      const r = resumenParaElClub(
        [
          { type: 'venc' as const },
          { type: 'venc' as const },
          { type: 'mora' as const },
          { type: 'pre_venc' as const },
        ],
        'Club Norte',
      );
      expect(r).toEqual({
        title: 'DINAMYT · Club Norte',
        body: 'Hoy: 3 alumnos con la mensualidad vencida y 1 por vencer.',
      });
    });

    it('el singular se dice en singular', () => {
      // Un «1 alumnos» es de esas cosas que hacen dudar de todo lo demás.
      expect(resumenParaElClub([{ type: 'venc' }], 'Club Norte')?.body).toBe(
        'Hoy: 1 alumno con la mensualidad vencida.',
      );
      expect(resumenParaElClub([{ type: 'pre_venc' }], null)?.body).toBe(
        'Hoy: 1 por vencer.',
      );
    });

    it('el club va en el título: quien lleva dos no tiene que adivinar', () => {
      expect(resumenParaElClub([{ type: 'venc' }], null)?.title).toBe(
        'DINAMYT · Mi Club',
      );
    });

    it('sin nada que decir no se manda nada', () => {
      // Un push que dice «cero» es ruido puro, y el ruido se paga en que el
      // siguiente aviso —el que sí importaba— también se barra.
      expect(resumenParaElClub([], 'Club Norte')).toBeNull();
    });
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

    // `/notifications/leidos` ya no lo dispara abrir la campana: es el botón
    // «marcar todo como leído». Lo que no ha cambiado —y es lo que prueba este
    // test— es su alcance: toca los MÍOS y ni uno más.
    it('«marcar todo» marca los MÍOS y solo los míos', async () => {
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

    /**
     * ── La campana baja de dos a uno, no de dos a cero ──
     *
     * Abrir la campana marcaba TODO como leído. Con nueve avisos, el alumno la
     * abría para mirar uno y los otros ocho desaparecían sin que los hubiera
     * visto —lo leído no vuelve a esta lista— y el número saltaba de 9 a 0 de
     * un tirón. Un número que no se puede seguir con los ojos deja de decir
     * nada, y una campana en la que no se confía no se vuelve a abrir.
     */
    it('marcar UN aviso baja la cuenta en uno y deja el otro en pie', async () => {
      const { app, db, auth, ids, orgId } = await crearEscenario();
      // Dos avisos del MISMO alumno. Uno no vale: un alumno tiene UNA membresía
      // por club (`uq_membership_org_user`), así que `run` solo le genera uno.
      // El segundo es de los que escribe una persona (`maestro`), que es
      // justamente el caso en el que se juntan varios sin leer.
      await db
        .insert(memberships)
        .values({ orgId, userId: ids.alumno, venceEl: '2000-01-01' });
      await app.inject({
        method: 'POST',
        url: '/notifications/run',
        headers: auth(ids.owner),
      });
      await db.insert(notifications).values({
        userId: ids.alumno,
        type: 'maestro',
        channel: 'inapp',
        // Más viejo que el de `run`, para que el orden sea el que se espera:
        // lo último primero.
        scheduledFor: new Date('2000-01-01T00:00:00.000Z'),
        status: 'ENVIADA',
      });

      const mios = auth(ids.alumno);
      const antes = (
        await app.inject({ method: 'GET', url: '/notifications', headers: mios })
      ).json();
      expect(antes).toHaveLength(2);

      const r = await app.inject({
        method: 'POST',
        url: `/notifications/${antes[0].id}/leido`,
        headers: mios,
      });
      expect(r.json()).toEqual({ marcado: true });

      const despues = (
        await app.inject({ method: 'GET', url: '/notifications', headers: mios })
      ).json();
      expect(despues).toHaveLength(1);
      expect(despues[0].id).toBe(antes[1].id);
      await app.close();
    });

    it('marcar el mismo dos veces no es un error: la segunda no hace nada', async () => {
      // Pasa de verdad: dos toques seguidos, o la misma cuenta abierta en el
      // celular y en el portátil. Un 404 ahí pintaría de rojo una pantalla por
      // hacer bien lo que se pedía.
      const { app, db, auth, ids, orgId } = await crearEscenario();
      await db
        .insert(memberships)
        .values({ orgId, userId: ids.alumno, venceEl: '2000-01-01' });
      await app.inject({
        method: 'POST',
        url: '/notifications/run',
        headers: auth(ids.owner),
      });
      const mios = auth(ids.alumno);
      const [aviso] = (
        await app.inject({ method: 'GET', url: '/notifications', headers: mios })
      ).json();

      const url = `/notifications/${aviso.id}/leido`;
      expect((await app.inject({ method: 'POST', url, headers: mios })).json()).toEqual(
        { marcado: true },
      );
      expect((await app.inject({ method: 'POST', url, headers: mios })).json()).toEqual(
        { marcado: false },
      );
      await app.close();
    });

    it('nadie puede dar por leído el aviso de otro', async () => {
      // El `user_id` de la consulta no es decorativo: sin él, cualquiera con
      // sesión podría apagarle un aviso a otro pasando su identificador.
      const { app, db, auth, ids, orgId } = await crearEscenario();
      await db
        .insert(memberships)
        .values({ orgId, userId: ids.alumno, venceEl: '2000-01-01' });
      await app.inject({
        method: 'POST',
        url: '/notifications/run',
        headers: auth(ids.owner),
      });
      const [suyo] = (
        await app.inject({
          method: 'GET',
          url: '/notifications',
          headers: auth(ids.alumno),
        })
      ).json();

      // El maestro lo VE (es de su club) pero no lo puede dar por leído: eso lo
      // dice su dueño.
      const intento = await app.inject({
        method: 'POST',
        url: `/notifications/${suyo.id}/leido`,
        headers: auth(ids.owner),
      });
      expect(intento.json()).toEqual({ marcado: false });

      const sigue = (
        await app.inject({
          method: 'GET',
          url: '/notifications',
          headers: auth(ids.alumno),
        })
      ).json();
      expect(sigue).toHaveLength(1);
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

    /**
     * ── La campana del club también se vacía ────────────────────────────────
     *
     * Era lo único de la aplicación que no respondía a haberla mirado: el
     * maestro abría el aviso, lo leía, y ahí seguía — un día y otro. No era un
     * descuido, era que la fila tiene dos lectores y hasta ahora una sola
     * marca: `read_at` es del ALUMNO, y dejar que el maestro la escribiera le
     * borraba el recado a alguien que no lo había visto.
     */
    describe('lo que el maestro da por visto', () => {
      /** Un alumno moroso desde hace tres días: tres filas, una por día. */
      async function morosoDeTresDias(
        db: Awaited<ReturnType<typeof crearEscenario>>['db'],
        orgId: string,
        userId: string,
      ) {
        const [m] = await db
          .insert(memberships)
          .values({ orgId, userId, venceEl: '2000-01-01' })
          .returning();
        await db.insert(notifications).values(
          ['2026-08-29', '2026-08-30', '2026-08-31'].map((d) => ({
            userId,
            membershipId: m.id,
            type: 'venc' as const,
            channel: 'inapp' as const,
            scheduledFor: new Date(`${d}T00:00:00.000Z`),
            status: 'ENVIADA' as const,
          })),
        );
        return m;
      }

      it('un moroso de tres días sale UNA vez, no tres', async () => {
        // El generador escribe una fila por alumno y por día mientras siga
        // debiendo. Sin colapsar, un moroso de dos semanas ocupaba catorce
        // renglones con la misma frase y tapaba a todos los demás.
        const { app, db, auth, ids, orgId } = await crearEscenario();
        await morosoDeTresDias(db, orgId, ids.alumno);

        const lista = (
          await app.inject({
            method: 'GET',
            url: '/notifications?all=1',
            headers: auth(ids.owner),
          })
        ).json();
        expect(lista).toHaveLength(1);
        // Y el que sale es el más reciente.
        expect(lista[0].scheduledFor).toContain('2026-08-31');
        await app.close();
      });

      it('darlo por visto lo quita de la campana del club, entero', async () => {
        const { app, db, auth, ids, orgId } = await crearEscenario();
        await morosoDeTresDias(db, orgId, ids.alumno);
        const headers = auth(ids.owner);

        const [aviso] = (
          await app.inject({ method: 'GET', url: '/notifications?all=1', headers })
        ).json();

        // Marca las TRES filas, no solo la que se estaba mirando: si marcara
        // una, al recargar aparecería la de ayer diciendo lo mismo y parecería
        // que el botón no hizo nada.
        const r = await app.inject({
          method: 'POST',
          url: `/notifications/${aviso.id}/visto`,
          headers,
        });
        expect(r.json()).toEqual({ marcados: 3 });

        const despues = await app.inject({
          method: 'GET',
          url: '/notifications?all=1',
          headers,
        });
        expect(despues.json()).toHaveLength(0);
        await app.close();
      });

      it('y NO le borra el aviso al alumno, que es de quien es', async () => {
        // La razón de que existan dos columnas. Con una sola, vaciar la campana
        // del maestro dejaba sin recado a alumnos que no lo habían abierto.
        const { app, db, auth, ids, orgId } = await crearEscenario();
        await morosoDeTresDias(db, orgId, ids.alumno);

        const [aviso] = (
          await app.inject({
            method: 'GET',
            url: '/notifications?all=1',
            headers: auth(ids.owner),
          })
        ).json();
        await app.inject({
          method: 'POST',
          url: `/notifications/${aviso.id}/visto`,
          headers: auth(ids.owner),
        });

        const suyos = await app.inject({
          method: 'GET',
          url: '/notifications',
          headers: auth(ids.alumno),
        });
        expect(suyos.json()).toHaveLength(3);
        expect(suyos.json()[0].readAt).toBeNull();
        await app.close();
      });

      it('«marcar todo» vacía la campana del club de una pasada', async () => {
        const { app, db, auth, ids, orgId } = await crearEscenario();
        await morosoDeTresDias(db, orgId, ids.alumno);
        await morosoDeTresDias(db, orgId, ids.alumno2);
        const headers = auth(ids.owner);

        expect(
          (await app.inject({ method: 'GET', url: '/notifications?all=1', headers })).json(),
        ).toHaveLength(2);

        const r = await app.inject({
          method: 'POST',
          url: '/notifications/vistos',
          headers,
        });
        expect(r.json()).toEqual({ marcados: 6 });
        expect(
          (await app.inject({ method: 'GET', url: '/notifications?all=1', headers })).json(),
        ).toHaveLength(0);
        await app.close();
      });

      it('un alumno no vacía la campana de su club', async () => {
        // Puede VER sus propios avisos, no descartar los de los demás. Sin esta
        // puerta, cualquiera con sesión le limpiaría la lista de cobro al
        // maestro.
        const { app, db, auth, ids, orgId } = await crearEscenario();
        await morosoDeTresDias(db, orgId, ids.alumno);
        const [aviso] = (
          await app.inject({
            method: 'GET',
            url: '/notifications?all=1',
            headers: auth(ids.owner),
          })
        ).json();

        expect(
          (
            await app.inject({
              method: 'POST',
              url: `/notifications/${aviso.id}/visto`,
              headers: auth(ids.alumno),
            })
          ).statusCode,
        ).toBe(403);
        expect(
          (
            await app.inject({
              method: 'POST',
              url: '/notifications/vistos',
              headers: auth(ids.alumno),
            })
          ).statusCode,
        ).toBe(403);
        await app.close();
      });
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
