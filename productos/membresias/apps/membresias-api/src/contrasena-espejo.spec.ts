import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { orgs, users } from '@dinamyt/membresias-db';
import { config } from './config';
import { crearEscenario, PASSWORD, type Escenario } from './testing/escenario';

/**
 * La contraseña: **una sola para todo DINAMYT, y se fija en el portal.**
 *
 * ── Lo que se rompía ──
 *
 * La reconciliación trajo las cuentas de esta app al portal con su hash puesto,
 * así que la misma contraseña abría las dos… el primer día. Quien la cambiaba
 * en el portal —o la recuperaba con «¿olvidaste tu contraseña?»— seguía
 * teniendo AQUÍ la vieja. Dos contraseñas para una sola cuenta, y ninguna
 * pantalla que lo dijera: lo único que veía el alumno era que en el club no
 * entraba.
 *
 * ── Se arregla por los dos lados, y por eso hay pruebas de los dos ──
 *
 * 1. El portal COPIA cada contraseña nueva (`POST /sync/contrasena`).
 * 2. Este lado deja de dejar que se fije desde aquí — si no, volvería el empate
 *    de siempre: gana el último que guarda.
 *
 * Y con su gemelo, siempre: la ficha SIN cuenta del ecosistema —el alumno sin
 * correo, que entra con carnet QR o PIN— y Membresías como producto
 * independiente siguen funcionando exactamente igual que antes.
 *
 * Vive en su propio archivo y no en `ecosistema.spec.ts` por una razón muy
 * prosaica: cada escenario levanta su propio PostgreSQL en WebAssembly, y
 * veintitantos en un mismo worker acaban pasándose del tiempo límite.
 */

const JWKS_DE_PRUEBA = 'https://ejemplo.invalid/.well-known/jwks.json';
const ECO_SUB = '00000000-0000-4000-8000-0000000000aa';
const ECO_ORG = '00000000-0000-4000-8000-0000000000bb';
const SECRETO = 'secreto-del-espejo-para-las-pruebas';

/** La contraseña que se elige en el portal. */
const PASSWORD_NUEVA = 'OtraClave9999';
/**
 * Su hash, **a las 12 rondas del ecosistema** y escrito a mano.
 *
 * Calcularlo aquí sería lo natural y no se puede: `bcryptjs` es JavaScript puro
 * y doce rondas le cuestan segundos, así que cada prueba que lo hiciera se
 * pasaría del tiempo límite. Escrito, además, prueba mejor lo que importa: que
 * un hash de OTRO costo —12 allí, 4 en las pruebas de aquí— entra tal cual y
 * sirve para iniciar sesión. Esa es toda la razón de mandar el hash y no la
 * contraseña.
 */
const HASH_DEL_PORTAL = '$2b$12$2VkaVsZgOEM/Qf7.JrMCHexMALpLAyzqbzqrGUsrp5XSgtph4YW3C';

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

const correoDe = async (e: Escenario, id: string) => {
  const [fila] = await e.db.select({ email: users.email }).from(users).where(eq(users.id, id));
  return fila.email;
};

const entrar = (e: Escenario, email: string, password: string) =>
  e.app.inject({ method: 'POST', url: '/auth/login', payload: { email, password } });

const avisar = (e: Escenario, payload: unknown, secreto: string | null = SECRETO) =>
  e.app.inject({
    method: 'POST',
    url: '/sync/contrasena',
    headers: secreto ? { 'x-dinamyt-sync': secreto } : {},
    payload: payload as never,
  });

describe('membresias-api — el portal copia la contraseña hasta aquí', () => {
  it('la nueva entra, la vieja deja de servir', async () => {
    const e = await crearEscenario();
    await enlazarConElPortal(e);
    process.env.ECOSYSTEM_SYNC_SECRET = SECRETO;
    const email = await correoDe(e, e.ids.alumno);

    const res = await avisar(e, { ecoSub: ECO_SUB, passwordHash: HASH_DEL_PORTAL });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ encontrada: true });

    // Se guarda TAL CUAL: no se rehashea al recibirlo. Eso lo hace
    // `necesitaRehash` tras el primer login, que es cuando sí hay contraseña en
    // claro con la que hacerlo.
    const [fila] = await e.db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, e.ids.alumno));
    expect(fila.passwordHash).toBe(HASH_DEL_PORTAL);

    expect((await entrar(e, email, PASSWORD_NUEVA)).statusCode).toBe(200);
    expect((await entrar(e, email, PASSWORD)).statusCode).toBe(401);
  });

  it('sin secreto la ruta no existe, y con el equivocado no entra nadie', async () => {
    const e = await crearEscenario();
    await enlazarConElPortal(e);
    const [antes] = await e.db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, e.ids.alumno));

    // Sin `ECOSYSTEM_SYNC_SECRET`: una ruta sin autenticar que reescribe
    // contraseñas no puede quedarse abierta «por si acaso».
    expect(
      (await avisar(e, { ecoSub: ECO_SUB, passwordHash: HASH_DEL_PORTAL }, null)).statusCode,
    ).toBe(404);

    process.env.ECOSYSTEM_SYNC_SECRET = SECRETO;
    expect(
      (await avisar(e, { ecoSub: ECO_SUB, passwordHash: HASH_DEL_PORTAL }, 'otro-cualquiera'))
        .statusCode,
    ).toBe(401);

    const [despues] = await e.db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, e.ids.alumno));
    expect(despues.passwordHash).toBe(antes.passwordHash);
  });

  it('lo que no tiene forma de bcrypt se rechaza', async () => {
    const e = await crearEscenario();
    await enlazarConElPortal(e);
    process.env.ECOSYSTEM_SYNC_SECRET = SECRETO;

    // Esta columna decide quién entra: un valor que no sea un hash la dejaría
    // comparando contra basura para siempre, y nadie volvería a entrar.
    for (const basura of ['', 'hola', '$2b$10$corto', PASSWORD_NUEVA]) {
      expect((await avisar(e, { ecoSub: ECO_SUB, passwordHash: basura })).statusCode).toBe(422);
    }
    expect((await avisar(e, { passwordHash: HASH_DEL_PORTAL })).statusCode).toBe(422);
  });

  it('solo alcanza a quien tiene ese `eco_sub`, y sin ficha no es un error', async () => {
    const e = await crearEscenario();
    await enlazarConElPortal(e);
    process.env.ECOSYSTEM_SYNC_SECRET = SECRETO;
    const [ownerAntes] = await e.db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, e.ids.owner));

    await avisar(e, { ecoSub: ECO_SUB, passwordHash: HASH_DEL_PORTAL });

    const [ownerDespues] = await e.db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, e.ids.owner));
    expect(ownerDespues.passwordHash).toBe(ownerAntes.passwordHash);

    // Una cuenta del portal que aquí no tiene ficha: pertenece a un club que
    // todavía no usa Membresías. No es un fallo del aviso.
    const res = await avisar(e, {
      ecoSub: '00000000-0000-4000-8000-00000000ffff',
      passwordHash: HASH_DEL_PORTAL,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ encontrada: false });
  });
});

describe('membresias-api — con cuenta del ecosistema, aquí no se fija la contraseña', () => {
  it('ni el alumno la cambia, ni el maestro se la escribe a mano', async () => {
    const e = await crearEscenario();
    await enlazarConElPortal(e);
    config.ecosystemJwksUrl = JWKS_DE_PRUEBA;
    const email = await correoDe(e, e.ids.alumno);

    const propia = await e.app.inject({
      method: 'POST',
      url: '/auth/change-password',
      headers: e.auth(e.ids.alumno),
      payload: { actual: PASSWORD, nueva: PASSWORD_NUEVA },
    });
    expect(propia.statusCode).toBe(400);
    expect(propia.json().error).toMatch(/DINAMYT/);

    const delMaestro = await e.app.inject({
      method: 'POST',
      url: `/users/${e.ids.alumno}/password`,
      headers: e.auth(e.ids.owner),
      payload: { password: PASSWORD_NUEVA },
    });
    expect(delMaestro.statusCode).toBe(409);
    expect(delMaestro.json().error).toMatch(/DINAMYT/);

    // Y no se movió ninguna de las dos veces.
    expect((await entrar(e, email, PASSWORD)).statusCode).toBe(200);
  });

  // Los dos gemelos que impiden que la reja se coma los casos para los que se
  // hicieron esas rutas.
  it('al alumno SIN cuenta del ecosistema se la sigue poniendo su maestro', async () => {
    const e = await crearEscenario();
    config.ecosystemJwksUrl = JWKS_DE_PRUEBA;

    const res = await e.app.inject({
      method: 'POST',
      url: `/users/${e.ids.alumno}/password`,
      headers: e.auth(e.ids.owner),
      payload: { password: PASSWORD_NUEVA },
    });
    expect(res.statusCode).toBe(200);
  });

  it('y Membresías sola —sin portal detrás— la sigue cambiando aquí', async () => {
    const e = await crearEscenario();
    await enlazarConElPortal(e);
    // Sin `ecosystemJwksUrl` no hay ecosistema: `eco_sub` es un resto de datos
    // y no hay ningún portal al que mandar a nadie.
    config.ecosystemJwksUrl = '';

    const res = await e.app.inject({
      method: 'POST',
      url: '/auth/change-password',
      headers: e.auth(e.ids.alumno),
      payload: { actual: PASSWORD, nueva: PASSWORD_NUEVA },
    });
    expect(res.statusCode).toBe(200);
  });
});
