import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { attendances, memberships, orgs, users } from '@dinamyt/membresias-db';
import { aprovisionarFicha } from './lib/aprovisionar';
import { NOMBRE_ELIMINADO } from './lib/eliminar-del-club';
import { olvidarEliminadosRecientes } from './lib/eliminados-recientes';
import { crearEscenario, type Escenario } from './testing/escenario';

/**
 * **La cuenta se borró en DINAMYT: su ficha de aquí también.**
 *
 * El portal lo pide (`POST /sync/supresion`) antes de borrar lo suyo y espera.
 * Aquí es la misma mitad local de «eliminar del club»: sin historia la ficha se
 * borra, con historia se vacía y sus pagos y asistencias quedan anónimos. Y un
 * pase de antes del borrado no la hace renacer en ningún club.
 */

const ECO_SUB = '00000000-0000-4000-8000-0000000000aa';
const ECO_ORG = '00000000-0000-4000-8000-0000000000bb';
const SECRETO = 'secreto-del-espejo-para-las-pruebas';

let e: Escenario;
let secretoOriginal: string | undefined;

beforeEach(async () => {
  secretoOriginal = process.env.ECOSYSTEM_SYNC_SECRET;
  process.env.ECOSYSTEM_SYNC_SECRET = SECRETO;
  e = await crearEscenario();
  await e.db.update(orgs).set({ ecoOrgId: ECO_ORG }).where(eq(orgs.id, e.orgId));
  await e.db.update(users).set({ ecoSub: ECO_SUB }).where(eq(users.id, e.ids.alumno));
});
afterEach(() => {
  olvidarEliminadosRecientes();
  if (secretoOriginal === undefined) delete process.env.ECOSYSTEM_SYNC_SECRET;
  else process.env.ECOSYSTEM_SYNC_SECRET = secretoOriginal;
});

const suprimir = (cuerpo: unknown = { ecoSub: ECO_SUB }, secreto: string | null = SECRETO) =>
  e.app.inject({
    method: 'POST',
    url: '/sync/supresion',
    headers: secreto === null ? {} : { 'x-dinamyt-sync': secreto },
    payload: cuerpo as Record<string, unknown>,
  });

const fila = async (id: string) =>
  (await e.db.select().from(users).where(eq(users.id, id)).limit(1))[0];

describe('POST /sync/supresion', () => {
  it('sin historia, la ficha se borra', async () => {
    const r = await suprimir();
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ encontrada: true, aplicado: true, resultado: 'borrada' });
    expect(await fila(e.ids.alumno)).toBeUndefined();
  });

  it('con asistencias, se vacía y la asistencia se queda', async () => {
    const [m] = await e.db
      .insert(memberships)
      .values({ orgId: e.orgId, userId: e.ids.alumno })
      .returning();
    await e.db.insert(attendances).values({ membershipId: m.id, checkinDate: '2026-10-01', method: 'qr' });

    const r = await suprimir();
    expect(r.json()).toMatchObject({ resultado: 'anonimizada' });
    const u = await fila(e.ids.alumno);
    expect(u.fullName).toBe(NOMBRE_ELIMINADO);
    expect(u.ecoSub).toBeNull();
    expect(
      await e.db.select().from(attendances).where(eq(attendances.membershipId, m.id)),
    ).toHaveLength(1);
  });

  it('una segunda vez no encuentra a nadie', async () => {
    await suprimir();
    expect((await suprimir()).json()).toEqual({ encontrada: false, aplicado: false });
  });

  it('un pase de antes del borrado no la hace renacer en ningún club', async () => {
    const emitido = Math.floor(Date.now() / 1000) - 60;
    await suprimir();
    const pase = {
      sub: ECO_SUB,
      org_id: ECO_ORG,
      email: 'alumno1@club.com',
      fullName: 'ALUMNO UNO',
      role_membresias: 'student',
      is_super_admin: false,
      iat: emitido,
    };
    expect(await aprovisionarFicha(e.db, pase)).toBeNull();
  });

  it('sin el secreto, la puerta está cerrada', async () => {
    expect((await suprimir(undefined, null)).statusCode).toBe(401);
    expect((await suprimir(undefined, 'otro')).statusCode).toBe(401);
    expect(await fila(e.ids.alumno)).toBeDefined();
  });

  it('pide un ecoSub que sea un id', async () => {
    expect((await suprimir({ ecoSub: 'no' })).statusCode).toBe(422);
  });
});
