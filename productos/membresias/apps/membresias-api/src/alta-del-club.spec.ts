import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { orgs, users } from '@dinamyt/membresias-db';
import { crearEscenario, type Escenario } from './testing/escenario';

/**
 * **Entrar al club es entrar aquí.**
 *
 * ── Qué estaba roto ──
 *
 * La pertenencia solo viajaba en un sentido. La BAJA llegaba —el maestro sacaba
 * a alguien del club en el portal y aquí se quedaba sin acceso—, pero el ALTA
 * no llegaba a ninguna parte: la ficha solo nacía cuando esa persona abría
 * Membresías por su cuenta (`POST /auth/sso`), y casi nadie lo hace el primer
 * día.
 *
 * Lo que veía el maestro: aceptaba a diez alumnos en el portal, entraba aquí, y
 * **no había ninguno**. No los podía cobrar, ni pasarles lista, ni saber si de
 * verdad habían entrado. La misma gente estaba en un sitio y no en el otro.
 *
 * El apaño que quedaba a mano era volver a asignarles el rol en el portal,
 * porque `/sync/rol` sí ata una ficha suelta por correo. Eso arreglaba a quien
 * YA tenía ficha aquí y no hacía nada por quien no la tenía — así que ni
 * siquiera funcionaba siempre, y había que acordarse persona por persona.
 *
 * ── Los cuatro caminos, y por qué cada uno ──
 *
 * Nace, se ata a la que ya había, revive al que vuelve, y no duplica. Son los
 * cuatro estados en los que se puede encontrar a una persona al entrar a un
 * club, y confundir dos de ellos parte a alguien en dos fichas con sus pagos
 * repartidos.
 */

const ECO_SUB = '00000000-0000-4000-8000-0000000000aa';
const ECO_ORG = '00000000-0000-4000-8000-0000000000bb';
const SECRETO = 'secreto-del-espejo-para-las-pruebas';

let secretoOriginal: string | undefined;

beforeEach(() => {
  secretoOriginal = process.env.ECOSYSTEM_SYNC_SECRET;
  process.env.ECOSYSTEM_SYNC_SECRET = SECRETO;
});
afterEach(() => {
  if (secretoOriginal === undefined) delete process.env.ECOSYSTEM_SYNC_SECRET;
  else process.env.ECOSYSTEM_SYNC_SECRET = secretoOriginal;
});

/** Ata el club con su espejo del ecosistema, como hace la reconciliación. */
async function enlazarClub(e: Escenario) {
  await e.db.update(orgs).set({ ecoOrgId: ECO_ORG }).where(eq(orgs.id, e.orgId));
}

/** El aviso del portal: «esta persona acaba de entrar en este club». */
function darDeAlta(e: Escenario, cuerpo: Record<string, unknown>) {
  return e.app.inject({
    method: 'POST',
    url: '/sync/pertenencia',
    headers: { 'x-dinamyt-sync': SECRETO },
    payload: { ecoOrgId: ECO_ORG, activo: true, ...cuerpo },
  });
}

async function porCorreo(e: Escenario, email: string) {
  const [u] = await e.db.select().from(users).where(eq(users.email, email));
  return u;
}

/** Los ids que el maestro ve en su listado de gente. */
async function enElListado(e: Escenario): Promise<string[]> {
  const r = await e.app.inject({
    method: 'GET',
    url: '/users',
    headers: e.auth(e.ids.owner),
  });
  return r.json().items.map((u: { id: string }) => u.id);
}

describe('membresias-api — el alta que llega del portal', () => {
  it('entra al club en DINAMYT y aquí le nace la ficha, sin que él abra nada', async () => {
    const e = await crearEscenario();
    await enlazarClub(e);

    const r = await darDeAlta(e, {
      ecoSub: ECO_SUB,
      email: 'nuevo@club.com',
      fullName: 'Ana María Pérez',
      role: 'student',
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ encontrada: true, aplicado: true, creada: true });

    const ficha = await porCorreo(e, 'nuevo@club.com');
    expect(ficha).toBeTruthy();
    expect(ficha.orgId).toBe(e.orgId);
    expect(ficha.ecoSub).toBe(ECO_SUB);
    expect(ficha.role).toBe('student');
    expect(ficha.isActive).toBe(true);
    // Sin contraseña propia: la suya vive en el portal (migración 0016).
    expect(ficha.passwordHash).toBeNull();
    // En MAYÚSCULAS como el resto del roster, o el listado ordenaría distinto.
    expect(ficha.fullName).toBe('ANA MARÍA PÉREZ');

    // Y lo que se venía a arreglar: el maestro ya lo ve.
    expect(await enElListado(e)).toContain(ficha.id);
    await e.app.close();
  });

  it('si ya tenía ficha con ese correo, se ATA — no se crea una segunda', async () => {
    // Es el alumno que su maestro dio de alta a mano aquí antes de que
    // existiera el puente. Crear otra lo partiría en dos, con sus pagos en una
    // mitad y su asistencia en la otra.
    const e = await crearEscenario();
    await enlazarClub(e);
    const antes = await porCorreo(e, 'alumno1@club.com');
    expect(antes.ecoSub).toBeNull();

    const r = await darDeAlta(e, {
      ecoSub: ECO_SUB,
      email: 'alumno1@club.com',
      fullName: 'Alumno Uno',
      role: 'student',
    });
    expect(r.json()).toMatchObject({ aplicado: true, creada: false, enlazada: true });

    const despues = await porCorreo(e, 'alumno1@club.com');
    expect(despues.id).toBe(antes.id); // la MISMA ficha
    expect(despues.ecoSub).toBe(ECO_SUB);
    await e.app.close();
  });

  it('quien vuelve recupera el acceso y su historial, no estrena ficha', async () => {
    const e = await crearEscenario();
    await enlazarClub(e);
    await e.db
      .update(users)
      .set({ ecoSub: ECO_SUB, isActive: false })
      .where(eq(users.id, e.ids.alumno));
    expect(await enElListado(e)).not.toContain(e.ids.alumno);

    const r = await darDeAlta(e, {
      ecoSub: ECO_SUB,
      email: 'alumno1@club.com',
      role: 'student',
    });
    expect(r.json()).toMatchObject({ aplicado: true, creada: false });

    const ficha = await porCorreo(e, 'alumno1@club.com');
    expect(ficha.id).toBe(e.ids.alumno);
    expect(ficha.isActive).toBe(true);
    expect(await enElListado(e)).toContain(e.ids.alumno);
    await e.app.close();
  });

  it('el mismo aviso dos veces no duplica nada', async () => {
    // El portal reintenta, y el maestro puede repetir el gesto. Dos fichas de
    // la misma persona en el mismo club es justo lo que no puede pasar.
    const e = await crearEscenario();
    await enlazarClub(e);
    const cuerpo = { ecoSub: ECO_SUB, email: 'nuevo@club.com', role: 'student' };

    await darDeAlta(e, cuerpo);
    const segunda = await darDeAlta(e, cuerpo);
    expect(segunda.json()).toMatchObject({ aplicado: true, creada: false });

    const todas = await e.db.select().from(users).where(eq(users.email, 'nuevo@club.com'));
    expect(todas).toHaveLength(1);
    await e.app.close();
  });

  it('el rol que trae el portal es el que se pone', async () => {
    const e = await crearEscenario();
    await enlazarClub(e);
    await darDeAlta(e, { ecoSub: ECO_SUB, email: 'aux@club.com', role: 'staff' });
    expect((await porCorreo(e, 'aux@club.com')).role).toBe('staff');
    await e.app.close();
  });

  it('un rol que aquí no existe cae a `student`, que es el que no hace daño', async () => {
    const e = await crearEscenario();
    await enlazarClub(e);
    // `judge` es de Campeonatos: aquí no significa nada.
    await darDeAlta(e, { ecoSub: ECO_SUB, email: 'juez@club.com', role: 'judge' });
    expect((await porCorreo(e, 'juez@club.com')).role).toBe('student');
    await e.app.close();
  });

  it('sin correo no se inventa una ficha: se contesta y se deja dicho', async () => {
    const e = await crearEscenario();
    await enlazarClub(e);
    const r = await darDeAlta(e, { ecoSub: ECO_SUB, role: 'student' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      encontrada: false,
      aplicado: false,
      motivo: 'Falta el correo.',
    });
    await e.app.close();
  });

  it('ese «falta el correo» llega TAMBIÉN sin espejo: es el cerrojo del repaso', async () => {
    // El guion `espejo:sembrar` del portal manda justo esta sonda para saber si
    // esta versión entiende el alta: la vieja no mira `activo` y contestaría sin
    // motivo. Si la respuesta dependiera de que el club tenga espejo, un club
    // sin espejo haría saltar el cerrojo contra un despliegue correcto — y el
    // repaso, que es lo que desatasca a los alumnos, no se podría correr.
    const e = await crearEscenario(); // SIN `enlazarClub`
    const r = await darDeAlta(e, { ecoSub: ECO_SUB });
    expect(r.json().motivo).toBe('Falta el correo.');
    await e.app.close();
  });

  it('un club sin espejo no recibe a nadie: ese club del portal no usa Membresías', async () => {
    const e = await crearEscenario(); // sin `enlazarClub`
    const r = await darDeAlta(e, { ecoSub: ECO_SUB, email: 'nadie@club.com' });
    expect(r.json()).toMatchObject({ encontrada: false, aplicado: false });
    expect(await porCorreo(e, 'nadie@club.com')).toBeUndefined();
    await e.app.close();
  });

  it('sin el secreto no entra nadie', async () => {
    const e = await crearEscenario();
    await enlazarClub(e);
    const r = await e.app.inject({
      method: 'POST',
      url: '/sync/pertenencia',
      headers: { 'x-dinamyt-sync': 'el-malo' },
      payload: { ecoSub: ECO_SUB, ecoOrgId: ECO_ORG, activo: true, email: 'x@club.com' },
    });
    expect(r.statusCode).toBe(401);
    expect(await porCorreo(e, 'x@club.com')).toBeUndefined();
    await e.app.close();
  });

  it('sin `activo` sigue siendo una BAJA: lo de antes no cambia', async () => {
    // El portal viejo manda el cuerpo sin `activo`. Si esto cambiara de
    // significado, un despliegue a medias daría de alta a quien salió.
    const e = await crearEscenario();
    await enlazarClub(e);
    await e.db.update(users).set({ ecoSub: ECO_SUB }).where(eq(users.id, e.ids.alumno));

    const r = await e.app.inject({
      method: 'POST',
      url: '/sync/pertenencia',
      headers: { 'x-dinamyt-sync': SECRETO },
      payload: { ecoSub: ECO_SUB, ecoOrgId: ECO_ORG },
    });
    expect(r.json()).toMatchObject({ aplicado: true });
    expect((await porCorreo(e, 'alumno1@club.com')).isActive).toBe(false);
    await e.app.close();
  });
});
