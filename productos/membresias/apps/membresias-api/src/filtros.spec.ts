import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { memberships, users, type Db } from '@dinamyt/membresias-db';
import { crearEscenario, PASSWORD } from './testing/escenario';
import { hashPassword } from './lib/auth/passwords';
import { todayStr } from './lib/billing';

/**
 * Filtrar y ordenar los listados de gente.
 *
 * Lo que protegen estos tests no es que la lista salga bonita: es que el filtro
 * y el paginador trabajen sobre el MISMO conjunto. Un filtro aplicado sobre la
 * página ya recortada acomoda veinticinco personas de doscientas y devuelve un
 * total que no es de nadie — el mismo error que ya costó que el alumno de la
 * página tres fuera inencontrable (ver `paginacion.spec.ts`).
 *
 * Y uno más, que es el que de verdad puede desviarse con el tiempo: el estado
 * de cobro por el que se filtra tiene que ser el MISMO que la etiqueta que
 * después se pinta en la fila. Se calcula con una sola función; esto lo vigila.
 */
describe('membresias-api — filtros y orden de los listados', () => {
  /** Suma (o resta) días a una fecha `YYYY-MM-DD`, en UTC. */
  function masDias(dia: string, n: number): string {
    const d = new Date(`${dia}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  const grado = (db: Db, id: string, belt: string) =>
    db.update(users).set({ belt }).where(eq(users.id, id));

  const cobertura = (
    db: Db,
    orgId: string,
    userId: string,
    extra: Partial<typeof memberships.$inferInsert> = {},
  ) => db.insert(memberships).values({ orgId, userId, ...extra });

  /** Un alumno más, para los casos que necesitan un tercero. */
  async function otroAlumno(db: Db, orgId: string, fullName: string, belt?: string) {
    const [u] = await db
      .insert(users)
      .values({
        email: `${fullName.toLowerCase().replace(/\s+/g, '.')}@club.com`,
        fullName,
        passwordHash: await hashPassword(PASSWORD),
        role: 'student' as const,
        orgId,
        belt,
      })
      .returning();
    return u.id;
  }

  const nombres = (res: { json: () => { items: { fullName: string }[] } }) =>
    res.json().items.map((i) => i.fullName);

  // ── GET /users ────────────────────────────────────────────────────────────

  it('ordena por GRADO y no por el nombre del cinturón', async () => {
    const e = await crearEscenario();
    // Azul es un grado MÁS ALTO que verde, y alfabéticamente va antes: si el
    // orden fuera el del texto, subir de verde a azul sería bajar de puesto.
    await grado(e.db, e.ids.alumno, 'Azul');
    await grado(e.db, e.ids.alumno2, 'Verde');

    const sube = await e.app.inject({
      method: 'GET',
      url: '/users?orden=cinturon',
      headers: e.auth(e.ids.owner),
    });
    // El auxiliar no tiene grado y abre la lista subiendo: sin cinturón va
    // antes que el blanco, que es donde se le espera.
    expect(nombres(sube)).toEqual(['Auxiliar Uno', 'Alumno Dos', 'Alumno Uno']);

    const baja = await e.app.inject({
      method: 'GET',
      url: '/users?orden=cinturon_desc',
      headers: e.auth(e.ids.owner),
    });
    // Y al revés no es «lo mismo por nombre»: por nombre saldría Dos primero.
    expect(nombres(baja)).toEqual(['Alumno Uno', 'Alumno Dos', 'Auxiliar Uno']);
    await e.app.close();
  });

  it('el filtro por cinturón cuenta a TODOS los que caben, no a los de la página', async () => {
    const e = await crearEscenario();
    await grado(e.db, e.ids.alumno, 'Negro');
    await grado(e.db, e.ids.alumno2, 'Blanco');
    for (let i = 0; i < 4; i++) await otroAlumno(e.db, e.orgId, `Negro ${i}`, 'Negro');

    const res = await e.app.inject({
      method: 'GET',
      url: '/users?belt=Negro&limit=2',
      headers: e.auth(e.ids.owner),
    });
    expect(res.json().items).toHaveLength(2);
    // 5 negros en el club aunque en la página quepan dos: es lo que deja
    // escribir «1–2 de 5» y saber que hay más.
    expect(res.json().total).toBe(5);
    await e.app.close();
  });

  it('un cinturón que no está en el catálogo no filtra nada', async () => {
    const e = await crearEscenario();
    // Escribir la dirección a mano no puede vaciar la lista: un club sin
    // alumnos y un filtro imposible se ven igual en pantalla, y el maestro no
    // tiene forma de distinguirlos.
    const res = await e.app.inject({
      method: 'GET',
      url: '/users?belt=Fucsia',
      headers: e.auth(e.ids.owner),
    });
    expect(res.json().total).toBe(3); // auxiliar + los dos alumnos
    await e.app.close();
  });

  it('«inactivos» enseña solo a quien tiene el acceso cortado', async () => {
    const e = await crearEscenario();
    await e.db.update(users).set({ isActive: false }).where(eq(users.id, e.ids.alumno));
    const owner = e.auth(e.ids.owner);

    const activos = await e.app.inject({ method: 'GET', url: '/users', headers: owner });
    expect(nombres(activos)).not.toContain('Alumno Uno');

    const inactivos = await e.app.inject({
      method: 'GET',
      url: '/users?acceso=inactivos',
      headers: owner,
    });
    expect(nombres(inactivos)).toEqual(['Alumno Uno']);

    const todos = await e.app.inject({
      method: 'GET',
      url: '/users?acceso=todos',
      headers: owner,
    });
    expect(todos.json().total).toBe(3);

    // La pantalla vieja manda esto otro y tiene que seguir significando lo
    // mismo: mientras el navegador de alguien no se recargue, es lo que llega.
    const viejo = await e.app.inject({
      method: 'GET',
      url: '/users?includeInactive=1',
      headers: owner,
    });
    expect(viejo.json().total).toBe(3);
    await e.app.close();
  });

  it('un orden inventado no rompe nada: se ordena por nombre', async () => {
    const e = await crearEscenario();
    const res = await e.app.inject({
      method: 'GET',
      url: '/users?orden=; drop table users',
      headers: e.auth(e.ids.owner),
    });
    expect(res.statusCode).toBe(200);
    expect(nombres(res)).toEqual(['Alumno Dos', 'Alumno Uno', 'Auxiliar Uno']);
    await e.app.close();
  });

  // ── GET /memberships (el roster del panel) ────────────────────────────────

  it('el filtro por estado de cobro dice lo mismo que la etiqueta de la fila', async () => {
    const e = await crearEscenario();
    const hoy = todayStr();
    await cobertura(e.db, e.orgId, e.ids.alumno, { venceEl: masDias(hoy, -10) });
    await cobertura(e.db, e.orgId, e.ids.alumno2, { venceEl: masDias(hoy, 40) });

    const vencidos = await e.app.inject({
      method: 'GET',
      url: '/memberships?estado=vencido',
      headers: e.auth(e.ids.owner),
    });
    expect(vencidos.json().total).toBe(1);
    expect(nombres(vencidos)).toEqual(['Alumno Uno']);
    // La fila que devuelve el filtro trae ESE estado escrito: si un día dejaran
    // de coincidir, el maestro vería «Al día» dentro de la lista de vencidos.
    expect(vencidos.json().items[0].estado).toBe('vencido');

    const alDia = await e.app.inject({
      method: 'GET',
      url: '/memberships?estado=al_dia',
      headers: e.auth(e.ids.owner),
    });
    expect(nombres(alDia)).toEqual(['Alumno Dos']);
    await e.app.close();
  });

  it('«sin plan» encuentra también a quien no tiene ni fila de membresía', async () => {
    const e = await crearEscenario();
    await cobertura(e.db, e.orgId, e.ids.alumno, { venceEl: masDias(todayStr(), 40) });
    // Los otros dos no tienen membresía: el recién inscrito al que todavía no
    // se le ha puesto nada es justo a quien busca este filtro.
    await otroAlumno(e.db, e.orgId, 'Recien Llegado');

    const res = await e.app.inject({
      method: 'GET',
      url: '/memberships?estado=sin_plan',
      headers: e.auth(e.ids.owner),
    });
    expect(res.json().total).toBe(2);
    expect(nombres(res)).toEqual(['Alumno Dos', 'Recien Llegado']);
    await e.app.close();
  });

  it('un filtro que no encuentra a nadie responde una lista vacía, no un error', async () => {
    const e = await crearEscenario();
    await cobertura(e.db, e.orgId, e.ids.alumno, { venceEl: masDias(todayStr(), 40) });

    const res = await e.app.inject({
      method: 'GET',
      url: '/memberships?estado=por_vencer',
      headers: e.auth(e.ids.owner),
    });
    // Sin este caso, el `in ()` vacío llega a PostgreSQL y el maestro ve un
    // error del servidor donde tenía que ver «nadie por vencer».
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ items: [], total: 0 });
    await e.app.close();
  });

  it('por vencimiento: primero el que debe desde hace más, y sin fecha al final', async () => {
    const e = await crearEscenario();
    const hoy = todayStr();
    await cobertura(e.db, e.orgId, e.ids.alumno, { venceEl: masDias(hoy, -20) });
    await cobertura(e.db, e.orgId, e.ids.alumno2, { venceEl: masDias(hoy, 5) });
    await otroAlumno(e.db, e.orgId, 'Aaa Sin Fecha');

    const res = await e.app.inject({
      method: 'GET',
      url: '/memberships?orden=vence',
      headers: e.auth(e.ids.owner),
    });
    // Por nombre, «Aaa Sin Fecha» iría primero: quien no tiene fecha no
    // encabeza la lista de quién debe, va al final.
    expect(nombres(res)).toEqual(['Alumno Uno', 'Alumno Dos', 'Aaa Sin Fecha']);
    await e.app.close();
  });

  it('el filtro no se salta el club: nadie ve el roster del club vecino', async () => {
    const e = await crearEscenario();
    const hoy = todayStr();
    await cobertura(e.db, e.otroOrgId, e.ids.alumnoAjeno, { venceEl: masDias(hoy, -30) });
    await cobertura(e.db, e.orgId, e.ids.alumno, { venceEl: masDias(hoy, -10) });

    const res = await e.app.inject({
      method: 'GET',
      url: '/memberships?estado=vencido',
      headers: e.auth(e.ids.owner),
    });
    expect(nombres(res)).toEqual(['Alumno Uno']);
    await e.app.close();
  });
});
