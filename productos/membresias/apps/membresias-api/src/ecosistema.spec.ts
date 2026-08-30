import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { orgs, users } from '@dinamyt/membresias-db';
import { config } from './config';
import { crearEscenario, type Escenario } from './testing/escenario';

/**
 * La fuente de verdad de los datos de una PERSONA.
 *
 * Cuando el club vive dentro del ecosistema DINAMYT, su nombre, su correo, su
 * teléfono, su foto, su cinturón, su nacimiento, su sangre y su contacto de
 * emergencia los escribe el PORTAL: la misma cuenta entra también a Campeonatos
 * y a Academy, y las tres tienen que decir lo mismo. Aquí se leen.
 *
 * Lo que estas pruebas cuidan es el empate: se podía editar por los dos lados y
 * ganaba el último que guardara, así que el mismo alumno acababa con dos
 * nombres y dos fotos según por qué puerta se mirara. La reja está en la API y
 * no solo en la pantalla — ver `lib/ecosistema.ts`.
 *
 * Y lo que cuidan por el otro lado, que importa igual: un club que usa
 * Membresías como producto independiente no tiene portal detrás y lo sigue
 * editando TODO aquí. Por eso cada caso tiene su gemelo sin SSO.
 */

const JWKS_DE_PRUEBA = 'https://ejemplo.invalid/.well-known/jwks.json';
const ECO_SUB = '00000000-0000-4000-8000-0000000000aa';
const ECO_ORG = '00000000-0000-4000-8000-0000000000bb';

const SECRETO = 'secreto-del-espejo-para-las-pruebas';

let jwksOriginal = '';
let secretoOriginal: string | undefined;

beforeEach(() => {
  jwksOriginal = config.ecosystemJwksUrl;
  secretoOriginal = process.env.ECOSYSTEM_SYNC_SECRET;
  delete process.env.ECOSYSTEM_SYNC_SECRET;
});
afterEach(() => {
  config.ecosystemJwksUrl = jwksOriginal;
  if (secretoOriginal === undefined) delete process.env.ECOSYSTEM_SYNC_SECRET;
  else process.env.ECOSYSTEM_SYNC_SECRET = secretoOriginal;
});

/** Ata al alumno (y a su club) con el ecosistema, como hace la reconciliación. */
async function enlazarConElPortal(e: Escenario) {
  await e.db.update(users).set({ ecoSub: ECO_SUB }).where(eq(users.id, e.ids.alumno));
  await e.db.update(orgs).set({ ecoOrgId: ECO_ORG }).where(eq(orgs.id, e.orgId));
}

describe('membresias-api — el ecosistema es la fuente de verdad de la persona', () => {
  it('el maestro NO edita los datos personales de un alumno que llegó del portal', async () => {
    const e = await crearEscenario();
    await enlazarConElPortal(e);
    config.ecosystemJwksUrl = JWKS_DE_PRUEBA;

    const res = await e.app.inject({
      method: 'PATCH',
      url: `/users/${e.ids.alumno}`,
      headers: e.auth(e.ids.owner),
      payload: { fullName: 'NOMBRE INVENTADO', avatarUrl: null },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().campos).toEqual(['fullName', 'avatarUrl']);

    const [sinTocar] = await e.db
      .select({ fullName: users.fullName })
      .from(users)
      .where(eq(users.id, e.ids.alumno));
    expect(sinTocar.fullName).toBe('Alumno Uno');
  });

  it('pero SÍ le sigue poniendo lo del club: su rol y su acceso', async () => {
    const e = await crearEscenario();
    await enlazarConElPortal(e);
    config.ecosystemJwksUrl = JWKS_DE_PRUEBA;

    const res = await e.app.inject({
      method: 'PATCH',
      url: `/users/${e.ids.alumno}`,
      headers: e.auth(e.ids.owner),
      payload: { role: 'staff', isActive: false },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().role).toBe('staff');
    expect(res.json().isActive).toBe(false);
  });

  it('la antigüedad también es del portal: vive con el cinturón, en su misma fila', async () => {
    const e = await crearEscenario();
    await enlazarConElPortal(e);
    config.ecosystemJwksUrl = JWKS_DE_PRUEBA;

    // «Desde cuándo entrena» se editaba aquí —donde se imprime el carnet—, y
    // eso obligaba a acordarse de que ESE dato, y solo ese, se corregía en la
    // otra app: vive en `user_disciplines.since` del portal, junto al cinturón,
    // que es la misma fila y el mismo gesto del maestro.
    const res = await e.app.inject({
      method: 'PATCH',
      url: `/users/${e.ids.alumno}`,
      headers: e.auth(e.ids.owner),
      payload: { trainsSince: '2019-03-01' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().campos).toEqual(['trainsSince']);
  });

  it('el propio alumno tampoco se edita: su perfil vive en el portal', async () => {
    const e = await crearEscenario();
    await enlazarConElPortal(e);
    config.ecosystemJwksUrl = JWKS_DE_PRUEBA;

    const res = await e.app.inject({
      method: 'PATCH',
      url: '/auth/me',
      headers: e.auth(e.ids.alumno),
      payload: { phone: '3001234567' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().campos).toEqual(['phone']);
  });

  it('el escudo de un club del ecosistema se pone en el portal, no aquí', async () => {
    const e = await crearEscenario();
    await enlazarConElPortal(e);
    config.ecosystemJwksUrl = JWKS_DE_PRUEBA;

    const res = await e.app.inject({
      method: 'PATCH',
      url: '/mi-club',
      headers: e.auth(e.ids.owner),
      payload: { logoUrl: null },
    });

    expect(res.statusCode).toBe(403);
  });

  it('la ficha dice de quién es, para que la pantalla no tenga que adivinarlo', async () => {
    const e = await crearEscenario();
    await enlazarConElPortal(e);
    config.ecosystemJwksUrl = JWKS_DE_PRUEBA;

    const res = await e.app.inject({
      method: 'GET',
      url: `/users/${e.ids.alumno}`,
      headers: e.auth(e.ids.owner),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().enElEcosistema).toBe(true);
    // El id del portal viaja para poder enlazar derecho a su ficha de allí.
    expect(res.json().ecoSub).toBe(ECO_SUB);
  });

  // ── El otro lado: Membresías como producto independiente ──────────────────

  it('sin SSO configurado, el maestro lo sigue editando todo aquí', async () => {
    const e = await crearEscenario();
    // El enlace con el portal está puesto, pero esta instalación no lo usa: es
    // el caso de un volcado traído del ecosistema a una instalación propia.
    await enlazarConElPortal(e);
    config.ecosystemJwksUrl = '';

    const res = await e.app.inject({
      method: 'PATCH',
      url: `/users/${e.ids.alumno}`,
      headers: e.auth(e.ids.owner),
      payload: { fullName: 'ALUMNO CORREGIDO' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().fullName).toBe('ALUMNO CORREGIDO');
    expect(res.json().enElEcosistema).toBe(false);
  });

  it('con SSO puesto, quien NO vino del portal se sigue editando aquí', async () => {
    const e = await crearEscenario();
    config.ecosystemJwksUrl = JWKS_DE_PRUEBA;
    // `alumno2` no tiene `eco_sub`: es una cuenta que nació en esta app.

    const res = await e.app.inject({
      method: 'PATCH',
      url: `/users/${e.ids.alumno2}`,
      headers: e.auth(e.ids.owner),
      payload: { fullName: 'ALUMNO LOCAL' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().fullName).toBe('ALUMNO LOCAL');
    expect(res.json().enElEcosistema).toBe(false);
  });
});

/**
 * El camino de vuelta: lo que se guarda en el portal tiene que llegar hasta el
 * carnet, que lo imprime esta app con SU tabla. Sin esto, la foto que el
 * maestro sube en DINAMYT no aparecería nunca aquí — el mismo desencuentro de
 * antes, solo que al revés. Ver `routes/sync.ts`.
 */
describe('membresias-api — el espejo del portal', () => {
  it('sin secreto configurado, la ruta no existe', async () => {
    const e = await crearEscenario();
    await enlazarConElPortal(e);

    const res = await e.app.inject({
      method: 'POST',
      url: '/sync/persona',
      payload: { ecoSub: ECO_SUB, fullName: 'QUIEN SEA' },
    });

    expect(res.statusCode).toBe(404);
  });

  it('con el secreto equivocado no entra nadie', async () => {
    const e = await crearEscenario();
    await enlazarConElPortal(e);
    process.env.ECOSYSTEM_SYNC_SECRET = SECRETO;

    const res = await e.app.inject({
      method: 'POST',
      url: '/sync/persona',
      headers: { 'x-dinamyt-sync': 'otro-secreto-cualquiera' },
      payload: { ecoSub: ECO_SUB, fullName: 'QUIEN SEA' },
    });

    expect(res.statusCode).toBe(401);

    const [sinTocar] = await e.db
      .select({ fullName: users.fullName })
      .from(users)
      .where(eq(users.id, e.ids.alumno));
    expect(sinTocar.fullName).toBe('Alumno Uno');
  });

  it('con el secreto bueno, la foto y el cinturón llegan a la ficha de aquí', async () => {
    const e = await crearEscenario();
    await enlazarConElPortal(e);
    process.env.ECOSYSTEM_SYNC_SECRET = SECRETO;

    const foto = 'data:image/jpeg;base64,QUJDRA==';
    const res = await e.app.inject({
      method: 'POST',
      url: '/sync/persona',
      headers: { 'x-dinamyt-sync': SECRETO },
      payload: {
        ecoSub: ECO_SUB,
        fullName: 'ALUMNO CORREGIDO EN EL PORTAL',
        avatarUrl: foto,
        belt: 'Verde',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().encontrada).toBe(true);
    expect(res.json().rechazados).toEqual([]);

    const [ficha] = await e.db
      .select({ fullName: users.fullName, avatarUrl: users.avatarUrl, belt: users.belt })
      .from(users)
      .where(eq(users.id, e.ids.alumno));
    expect(ficha.fullName).toBe('ALUMNO CORREGIDO EN EL PORTAL');
    expect(ficha.avatarUrl).toBe(foto);
    expect(ficha.belt).toBe('Verde');
  });

  it('la antigüedad llega del portal y acaba en el carnet', async () => {
    const e = await crearEscenario();
    await enlazarConElPortal(e);
    process.env.ECOSYSTEM_SYNC_SECRET = SECRETO;

    const res = await e.app.inject({
      method: 'POST',
      url: '/sync/persona',
      headers: { 'x-dinamyt-sync': SECRETO },
      payload: { ecoSub: ECO_SUB, trainsSince: '2019-03-01' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().encontrada).toBe(true);
    expect(res.json().rechazados).toEqual([]);

    const [ficha] = await e.db
      .select({ trainsSince: users.trainsSince })
      .from(users)
      .where(eq(users.id, e.ids.alumno));
    expect(ficha.trainsSince).toBe('2019-03-01');
  });

  it('un campo que aquí no vale no tumba el resto del aviso', async () => {
    const e = await crearEscenario();
    await enlazarConElPortal(e);
    process.env.ECOSYSTEM_SYNC_SECRET = SECRETO;

    const res = await e.app.inject({
      method: 'POST',
      url: '/sync/persona',
      headers: { 'x-dinamyt-sync': SECRETO },
      // «Morado» no está en el catálogo de cinturones de esta app.
      payload: { ecoSub: ECO_SUB, belt: 'Morado', phone: '3001234567' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().aplicados).toEqual(['phone']);
    expect(res.json().rechazados).toHaveLength(1);
    expect(res.json().rechazados[0].campo).toBe('belt');

    const [ficha] = await e.db
      .select({ phone: users.phone, belt: users.belt })
      .from(users)
      .where(eq(users.id, e.ids.alumno));
    expect(ficha.phone).toBe('3001234567');
    expect(ficha.belt).toBeNull();
  });

  it('nadie de aquí se toca: el aviso solo alcanza a quien tiene ese `eco_sub`', async () => {
    const e = await crearEscenario();
    await enlazarConElPortal(e);
    process.env.ECOSYSTEM_SYNC_SECRET = SECRETO;

    await e.app.inject({
      method: 'POST',
      url: '/sync/persona',
      headers: { 'x-dinamyt-sync': SECRETO },
      payload: { ecoSub: ECO_SUB, fullName: 'SOLO YO' },
    });

    const [otro] = await e.db
      .select({ fullName: users.fullName })
      .from(users)
      .where(eq(users.id, e.ids.alumno2));
    expect(otro.fullName).toBe('Alumno Dos');
  });

  it('una persona que aquí no tiene ficha no es un error', async () => {
    const e = await crearEscenario();
    process.env.ECOSYSTEM_SYNC_SECRET = SECRETO;

    const res = await e.app.inject({
      method: 'POST',
      url: '/sync/persona',
      headers: { 'x-dinamyt-sync': SECRETO },
      payload: { ecoSub: '00000000-0000-4000-8000-0000000000ff', fullName: 'NADIE DE AQUI' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().encontrada).toBe(false);
  });

  it('el escudo del club llega por su `eco_org_id`', async () => {
    const e = await crearEscenario();
    await enlazarConElPortal(e);
    process.env.ECOSYSTEM_SYNC_SECRET = SECRETO;

    const escudo = 'data:image/png;base64,QUJDRA==';
    const res = await e.app.inject({
      method: 'POST',
      url: '/sync/club',
      headers: { 'x-dinamyt-sync': SECRETO },
      payload: { ecoOrgId: ECO_ORG, logoUrl: escudo, city: 'Cali' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().encontrado).toBe(true);

    const [club] = await e.db
      .select({ logoUrl: orgs.logoUrl, city: orgs.city })
      .from(orgs)
      .where(eq(orgs.id, e.orgId));
    expect(club.logoUrl).toBe(escudo);
    expect(club.city).toBe('Cali');
  });
});
