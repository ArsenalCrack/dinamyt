import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  attendances,
  memberships,
  notifications,
  orgs,
  payments,
  plans,
  users,
} from '@dinamyt/membresias-db';
import { config } from './config';
import { aprovisionarFicha } from './lib/aprovisionar';
import { NOMBRE_ELIMINADO } from './lib/eliminar-del-club';
import { olvidarEliminadosRecientes } from './lib/eliminados-recientes';
import { crearEscenario, type Escenario } from './testing/escenario';

/**
 * **Eliminar del club no es desactivar.**
 *
 * Desactivar deja la ficha entera para quien vuelve, y por eso se queda para
 * siempre en «sin acceso». Eliminar es el segundo gesto: para el alta por error
 * y para quien no va a volver.
 *
 * Lo que estas pruebas defienden:
 *
 * · Sin historia, la ficha desaparece entera.
 * · Con historia, la ficha se vacía de todo lo que dice quién era y sus pagos y
 *   asistencias siguen ahí, anónimos: la caja del club no cambia hacia atrás.
 * · El eliminado no reaparece en ninguna lista, ni con «Sin acceso».
 * · Si también es del club en DINAMYT, el portal se pide PRIMERO, y si dice que
 *   no, aquí no se toca nada: a medias, la próxima alta del espejo le haría
 *   nacer una ficha nueva.
 * · Solo el maestro, nunca a sí mismo, nunca a otro maestro, nunca fuera de su
 *   club.
 */

const ECO_ALUMNO = '00000000-0000-4000-8000-0000000000aa';
const ECO_MAESTRO = '00000000-0000-4000-8000-0000000000ab';
const ECO_ORG = '00000000-0000-4000-8000-0000000000bb';

let e: Escenario;
beforeEach(async () => {
  e = await crearEscenario();
});
afterEach(() => olvidarEliminadosRecientes());

const eliminar = (id: string, quien = e.ids.owner) =>
  e.app.inject({ method: 'POST', url: `/users/${id}/eliminar`, headers: e.auth(quien) });

const fila = async (id: string) =>
  (await e.db.select().from(users).where(eq(users.id, id)).limit(1))[0];

/** Una membresía con un pago y una asistencia: historia que el club conserva. */
async function conHistoria(userId: string) {
  const [m] = await e.db
    .insert(memberships)
    .values({ orgId: e.orgId, userId, checkinPin: '4242' })
    .returning();
  const [plan] = await e.db
    .insert(plans)
    .values({ orgId: e.orgId, name: 'Mensual', type: 'mensual', price: '80000' })
    .returning();
  await e.db.insert(payments).values({
    membershipId: m.id,
    planId: plan.id,
    amount: '80000',
    method: 'efectivo',
    registeredByUserId: e.ids.owner,
    notes: 'Lo trajo la mamá, Ana Pérez',
  });
  await e.db.update(memberships).set({ payerUserId: e.ids.alumno2 }).where(eq(memberships.id, m.id));
  await e.db
    .insert(attendances)
    .values({ membershipId: m.id, checkinDate: '2026-10-01', method: 'pin' });
  await e.db
    .insert(notifications)
    .values({ userId, membershipId: m.id, type: 'venc', channel: 'push' });
  return m.id;
}

describe('POST /users/:id/eliminar', () => {
  it('sin historia: la ficha se borra entera', async () => {
    const r = await eliminar(e.ids.alumno);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ ok: true, resultado: 'borrada' });
    expect(await fila(e.ids.alumno)).toBeUndefined();
  });

  it('con historia: se vacía, y los pagos y la asistencia se quedan', async () => {
    const membresia = await conHistoria(e.ids.alumno);

    const r = await eliminar(e.ids.alumno);
    expect(r.json()).toMatchObject({ ok: true, resultado: 'anonimizada' });

    const u = await fila(e.ids.alumno);
    expect(u.fullName).toBe(NOMBRE_ELIMINADO);
    expect(u.email).toBe(`eliminado-${e.ids.alumno}@eliminado.invalid`);
    expect(u.phone).toBeNull();
    expect(u.passwordHash).toBeNull();
    expect(u.ecoSub).toBeNull();
    expect(u.isActive).toBe(false);
    expect(u.eliminadoEl).not.toBeNull();

    const pagos = await e.db.select().from(payments).where(eq(payments.membershipId, membresia));
    expect(pagos).toHaveLength(1);
    expect(pagos[0].amount).toBe('80000.00');
    expect(pagos[0].notes).toBeNull();
    expect(
      await e.db.select().from(attendances).where(eq(attendances.membershipId, membresia)),
    ).toHaveLength(1);
    const [m] = await e.db.select().from(memberships).where(eq(memberships.id, membresia));
    expect(m.checkinPin).toBeNull();
    expect(m.payerUserId).toBeNull();
    expect(m.status).toBe('retirado');
    expect(
      await e.db.select().from(notifications).where(eq(notifications.membershipId, membresia)),
    ).toHaveLength(0);
  });

  it('el eliminado no sale en ninguna lista, ni con «Sin acceso»', async () => {
    await conHistoria(e.ids.alumno);
    await eliminar(e.ids.alumno);

    const lista = await e.app.inject({
      method: 'GET',
      url: '/users?acceso=todos',
      headers: e.auth(e.ids.owner),
    });
    const ids = (lista.json().items as { id: string }[]).map((p) => p.id);
    expect(ids).not.toContain(e.ids.alumno);
    expect(ids).toContain(e.ids.alumno2);

    const ficha = await e.app.inject({
      method: 'GET',
      url: `/users/${e.ids.alumno}`,
      headers: e.auth(e.ids.owner),
    });
    expect(ficha.statusCode).toBe(404);
  });

  it('las estadísticas del club dejan de contarlo', async () => {
    await conHistoria(e.ids.alumno);
    const panel = () =>
      e.app.inject({
        method: 'GET',
        url: '/reports/estadisticas',
        headers: e.auth(e.ids.owner),
      });
    const antes = (await panel()).json();
    await eliminar(e.ids.alumno);
    const despues = (await panel()).json();
    expect(despues.alumnos.total).toBe(antes.alumnos.total - 1);
  });

  it('el auxiliar no elimina a nadie', async () => {
    const r = await eliminar(e.ids.alumno, e.ids.staff);
    expect(r.statusCode).toBe(403);
    expect(await fila(e.ids.alumno)).toBeDefined();
  });

  it('nadie se elimina a sí mismo, ni a otro maestro', async () => {
    expect((await eliminar(e.ids.owner)).statusCode).toBe(400);
    await e.db.update(users).set({ role: 'owner' }).where(eq(users.id, e.ids.alumno2));
    expect((await eliminar(e.ids.alumno2)).statusCode).toBe(409);
    expect(await fila(e.ids.alumno2)).toBeDefined();
  });

  it('no alcanza a la gente de otro club', async () => {
    expect((await eliminar(e.ids.alumnoAjeno)).statusCode).toBe(404);
    expect(await fila(e.ids.alumnoAjeno)).toBeDefined();
  });
});

describe('POST /users/:id/eliminar · alumno que también es del club en DINAMYT', () => {
  let jwksOriginal: string;
  let secretoOriginal: string | undefined;
  const llamadas: { url: string; cuerpo: unknown }[] = [];
  let contesta: { status: number; cuerpo: unknown };

  beforeEach(async () => {
    jwksOriginal = config.ecosystemJwksUrl;
    secretoOriginal = process.env.ECOSYSTEM_SYNC_SECRET;
    config.ecosystemJwksUrl = 'https://id.ejemplo.test/auth/jwks';
    process.env.ECOSYSTEM_SYNC_SECRET = 'secreto-de-prueba';
    llamadas.length = 0;
    contesta = { status: 201, cuerpo: { encontrada: true, aplicado: true } };
    vi.stubGlobal('fetch', async (url: string, init: { body: string }) => {
      llamadas.push({ url, cuerpo: JSON.parse(init.body) });
      return new Response(JSON.stringify(contesta.cuerpo), { status: contesta.status });
    });

    await e.db.update(orgs).set({ ecoOrgId: ECO_ORG }).where(eq(orgs.id, e.orgId));
    await e.db.update(users).set({ ecoSub: ECO_ALUMNO }).where(eq(users.id, e.ids.alumno));
    await e.db.update(users).set({ ecoSub: ECO_MAESTRO }).where(eq(users.id, e.ids.owner));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    config.ecosystemJwksUrl = jwksOriginal;
    if (secretoOriginal === undefined) delete process.env.ECOSYSTEM_SYNC_SECRET;
    else process.env.ECOSYSTEM_SYNC_SECRET = secretoOriginal;
  });

  it('pide la baja al portal, con quién la pide, y después elimina aquí', async () => {
    const r = await eliminar(e.ids.alumno);
    expect(r.statusCode).toBe(200);
    expect(llamadas).toEqual([
      {
        url: 'https://id.ejemplo.test/sync/baja',
        cuerpo: { ecoSub: ECO_ALUMNO, ecoOrgId: ECO_ORG, porEcoSub: ECO_MAESTRO },
      },
    ]);
    expect(await fila(e.ids.alumno)).toBeUndefined();
  });

  it('si el portal dice que no, aquí no se toca nada y se dice por qué', async () => {
    contesta = {
      status: 403,
      cuerpo: { statusCode: 403, message: 'No gestionas esta organización.' },
    };
    const r = await eliminar(e.ids.alumno);
    expect(r.statusCode).toBe(409);
    expect(r.json().error).toBe('No gestionas esta organización.');
    expect((await fila(e.ids.alumno)).fullName).not.toBe(NOMBRE_ELIMINADO);
  });

  it('si el portal no contesta, tampoco', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('ECONNREFUSED');
    });
    const r = await eliminar(e.ids.alumno);
    expect(r.statusCode).toBe(503);
    expect(await fila(e.ids.alumno)).toBeDefined();
  });

  it('un pase de DINAMYT de antes de la baja no lo devuelve al club', async () => {
    const emitidoAntes = Math.floor(Date.now() / 1000) - 60;
    expect((await eliminar(e.ids.alumno)).statusCode).toBe(200);
    const pase = {
      sub: ECO_ALUMNO,
      org_id: ECO_ORG,
      email: 'alumno1@club.com',
      fullName: 'ALUMNO UNO',
      role_membresias: 'student',
      is_super_admin: false,
      iat: emitidoAntes,
    };
    expect(await aprovisionarFicha(e.db, pase)).toBeNull();
    // Y uno emitido después —el maestro lo volvió a invitar— sí entra.
    expect(await aprovisionarFicha(e.db, { ...pase, iat: emitidoAntes + 3600 })).not.toBeNull();
  });

  it('con el puente apagado no se elimina a medias', async () => {
    delete process.env.ECOSYSTEM_SYNC_SECRET;
    const r = await eliminar(e.ids.alumno);
    expect(r.statusCode).toBe(409);
    expect(llamadas).toEqual([]);
    expect((await fila(e.ids.alumno)).fullName).not.toBe(NOMBRE_ELIMINADO);
  });

  it('un maestro sin cuenta enlazada no puede pedir la baja allí', async () => {
    await e.db.update(users).set({ ecoSub: null }).where(eq(users.id, e.ids.owner));
    const r = await eliminar(e.ids.alumno);
    expect(r.statusCode).toBe(409);
    expect(llamadas).toEqual([]);
    expect(await fila(e.ids.alumno)).toBeDefined();
  });
});
