import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { orgs, users } from '@dinamyt/membresias-db';
import { buildApp } from './app';
import { config } from './config';
import { COOKIE_SESION } from './lib/auth/cookies';
import { crearEscenario } from './testing/escenario';
import { verificarTokenPropio } from './lib/auth/tokens';
import type { JwtPayload } from './types/auth';

/**
 * SSO por redirección: el portal DINAMYT devuelve su token y Membresías lo
 * canjea por una sesión PROPIA (`POST /auth/sso`).
 *
 * Lo que estas pruebas cuidan es el fallo que motivó la ruta: antes ese token
 * se guardaba en una variable de la web y nunca se convertía en cookie, así que
 * la sesión no aguantaba una recarga —la app devolvía al login, el login
 * mandaba al portal, y el portal entregaba el mismo token otra vez—. La
 * garantía es que entrar por el portal termina EXACTAMENTE donde termina
 * entrar con contraseña: cookie httpOnly puesta por la API.
 *
 * El verificador se inyecta (`buildApp({ verifyToken })`) para no depender del
 * JWKS del ecosistema: aquí se prueba lo que hace la ruta con un token YA
 * verificado. Que solo se acepten tokens del emisor correcto es cosa de
 * `verificadorEcosystem`, en `lib/auth/tokens.ts`.
 */

/**
 * Verificador de prueba: el «token del portal» es el payload en JSON.
 *
 * Cae en el verificador propio cuando no lo es, igual que hace el híbrido de
 * producción (`crearVerificador`): la cookie que deja el canje SÍ lleva un
 * token de Membresías de verdad, y sin este paso la sesión resultante no se
 * podría comprobar.
 */
const verificadorDePrueba = async (token: string): Promise<JwtPayload> => {
  try {
    const p = JSON.parse(token) as JwtPayload;
    if (p && typeof p === 'object') return p;
  } catch {
    // No es un payload de prueba: será un token propio.
  }
  return verificarTokenPropio(token);
};

/** Lo que el portal firmaría para esa persona. */
const tokenDelPortal = (payload: Partial<JwtPayload>) => JSON.stringify(payload);

const JWKS_DE_PRUEBA = 'https://ejemplo.invalid/.well-known/jwks.json';
let jwksOriginal = '';

beforeEach(() => {
  jwksOriginal = config.ecosystemJwksUrl;
  config.ecosystemJwksUrl = JWKS_DE_PRUEBA;
});
afterEach(() => {
  config.ecosystemJwksUrl = jwksOriginal;
});

describe('membresias-api — SSO con el portal DINAMYT', () => {
  it('canjea el token del portal por una sesión con cookie, como el login', async () => {
    const { db } = await crearEscenario();
    const app = buildApp({ db, verifyToken: verificadorDePrueba });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso',
      payload: {
        token: tokenDelPortal({
          sub: '00000000-0000-4000-8000-000000000001',
          email: 'maestro@club.com',
        }),
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().user.email).toBe('maestro@club.com');
    const sesion = res.cookies.find((c) => c.name === COOKIE_SESION);
    expect(sesion).toBeDefined();
    expect(sesion!.httpOnly).toBe(true);
    expect(res.json().csrf).toBeTruthy();
    await app.close();
  });

  it('la sesión que deja SOBREVIVE sin el token: es la cookie la que autentica', async () => {
    // Esta es la prueba del bucle. La web ya no tiene que guardar el token del
    // portal en ningún sitio: recargar la página no la deja fuera.
    const { db } = await crearEscenario();
    const app = buildApp({ db, verifyToken: verificadorDePrueba });

    const canje = await app.inject({
      method: 'POST',
      url: '/auth/sso',
      payload: { token: tokenDelPortal({ email: 'alumno1@club.com' }) },
    });
    const cookie = canje.cookies.find((c) => c.name === COOKIE_SESION)!.value;

    const yo = await app.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: { [COOKIE_SESION]: cookie },
    });

    expect(yo.statusCode).toBe(200);
    expect(yo.json().user.email).toBe('alumno1@club.com');
    await app.close();
  });

  it('reconoce a la persona por su cuenta del ecosistema aunque cambie de correo', async () => {
    // El correo se edita desde el portal; el enlace `eco_sub` que dejó la
    // reconciliación, no. Por eso se mira primero.
    const { db, ids } = await crearEscenario();
    const cuentaEco = '00000000-0000-4000-8000-0000000000aa';
    await db.update(users).set({ ecoSub: cuentaEco }).where(eq(users.id, ids.alumno));

    const app = buildApp({ db, verifyToken: verificadorDePrueba });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso',
      payload: {
        token: tokenDelPortal({ sub: cuentaEco, email: 'otro-correo@nuevo.com' }),
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().user.id).toBe(ids.alumno);
    await app.close();
  });

  it('no da de alta a nadie en silencio: sin ficha en un club, no entra', async () => {
    const { db } = await crearEscenario();
    const app = buildApp({ db, verifyToken: verificadorDePrueba });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso',
      payload: { token: tokenDelPortal({ email: 'nadie@dinamyt.com' }) },
    });

    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('una cuenta desactivada no entra por aquí aunque el portal la deje pasar', async () => {
    const { db, ids } = await crearEscenario();
    await db.update(users).set({ isActive: false }).where(eq(users.id, ids.alumno));

    const app = buildApp({ db, verifyToken: verificadorDePrueba });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso',
      payload: { token: tokenDelPortal({ email: 'alumno1@club.com' }) },
    });

    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('un token que no verifica no abre nada', async () => {
    const { db } = await crearEscenario();
    const app = buildApp({
      db,
      verifyToken: async () => {
        throw new Error('firma o emisor incorrectos');
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso',
      payload: { token: 'lo-que-sea' },
    });

    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('sin SSO configurado la ruta no existe: el modo autónomo sigue intacto', async () => {
    config.ecosystemJwksUrl = '';
    const { db } = await crearEscenario();
    const app = buildApp({ db, verifyToken: verificadorDePrueba });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso',
      payload: { token: tokenDelPortal({ email: 'maestro@club.com' }) },
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

/**
 * La ficha que nace sola (M1 de §4.3 del plan maestro).
 *
 * El agujero era este: el maestro daba de alta al alumno EN EL PORTAL, el
 * alumno pulsaba «entrar a Membresías», y se le decía que le pidiera a su
 * maestro que lo agregara — al mismo maestro que ya lo había agregado. Ahora la
 * ficha se crea al llegar, pero solo cuando el ecosistema ya dijo que esa
 * persona pertenece a un club que aquí tiene espejo.
 */
describe('membresias-api — la ficha que nace del ecosistema', () => {
  const ECO_ORG = '00000000-0000-4000-8000-0000000000aa';
  const ECO_SUB = '00000000-0000-4000-8000-0000000000bb';

  /** El club de la prueba, ya reconciliado con el ecosistema. */
  async function conEspejo(db: Awaited<ReturnType<typeof crearEscenario>>['db'], orgId: string) {
    await db.update(orgs).set({ ecoOrgId: ECO_ORG }).where(eq(orgs.id, orgId));
  }

  it('crea la ficha de quien su maestro ya agregó en el portal, y lo deja entrar', async () => {
    const { db, orgId } = await crearEscenario();
    await conEspejo(db, orgId);
    const app = buildApp({ db, verifyToken: verificadorDePrueba });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso',
      payload: {
        token: tokenDelPortal({
          sub: ECO_SUB,
          email: 'nueva@dinamyt.com',
          fullName: 'Ana Gómez',
          org_id: ECO_ORG,
          role_membresias: 'student',
        }),
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().user.email).toBe('nueva@dinamyt.com');
    // Entra con sesión de verdad, igual que por contraseña.
    expect(res.cookies.find((c) => c.name === COOKIE_SESION)).toBeDefined();

    const [ficha] = await db
      .select()
      .from(users)
      .where(eq(users.email, 'nueva@dinamyt.com'))
      .limit(1);
    expect(ficha.orgId).toBe(orgId);
    expect(ficha.role).toBe('student');
    // El enlace queda guardado: si mañana cambia de correo en el portal, su
    // ficha lo sigue reconociendo.
    expect(ficha.ecoSub).toBe(ECO_SUB);
    // Y en MAYÚSCULAS, como el resto del roster.
    expect(ficha.fullName).toBe('ANA GÓMEZ');
    await app.close();
  });

  it('la ficha nueva no tiene contraseña aquí: por el formulario no se entra', async () => {
    const { db, orgId } = await crearEscenario();
    await conEspejo(db, orgId);
    const app = buildApp({ db, verifyToken: verificadorDePrueba });

    await app.inject({
      method: 'POST',
      url: '/auth/sso',
      payload: {
        token: tokenDelPortal({
          sub: ECO_SUB,
          email: 'nueva@dinamyt.com',
          fullName: 'Ana Gómez',
          org_id: ECO_ORG,
          role_membresias: 'student',
        }),
      },
    });

    const [ficha] = await db
      .select()
      .from(users)
      .where(eq(users.email, 'nueva@dinamyt.com'))
      .limit(1);
    expect(ficha.passwordHash).toBeNull();

    // Y el login la trata como a cualquier otra: mismo mensaje genérico, sin
    // delatar que ese correo existe.
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'nueva@dinamyt.com', password: 'loquesea1234' },
    });
    expect(login.statusCode).toBe(401);
    await app.close();
  });

  it('un club sin espejo NO da de alta a nadie: el modo autónomo no cambia', async () => {
    const { db } = await crearEscenario(); // ningún club tiene `eco_org_id`
    const app = buildApp({ db, verifyToken: verificadorDePrueba });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso',
      payload: {
        token: tokenDelPortal({
          sub: ECO_SUB,
          email: 'nueva@dinamyt.com',
          fullName: 'Ana Gómez',
          org_id: ECO_ORG,
          role_membresias: 'student',
        }),
      },
    });

    expect(res.statusCode).toBe(403);
    const filas = await db.select().from(users).where(eq(users.email, 'nueva@dinamyt.com'));
    expect(filas).toHaveLength(0);
    await app.close();
  });

  it('sin `org_id` en el token tampoco: pertenecer es lo que abre la puerta', async () => {
    const { db, orgId } = await crearEscenario();
    await conEspejo(db, orgId);
    const app = buildApp({ db, verifyToken: verificadorDePrueba });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso',
      payload: {
        token: tokenDelPortal({
          sub: ECO_SUB,
          email: 'nueva@dinamyt.com',
          fullName: 'Ana Gómez',
          org_id: null,
          role_membresias: 'student',
        }),
      },
    });

    expect(res.statusCode).toBe(403);
    const filas = await db.select().from(users).where(eq(users.email, 'nueva@dinamyt.com'));
    expect(filas).toHaveLength(0);
    await app.close();
  });

  it('un club SUSPENDIDO no deja nacer fichas nuevas', async () => {
    const { db, orgId } = await crearEscenario();
    await conEspejo(db, orgId);
    await db.update(orgs).set({ isActive: false }).where(eq(orgs.id, orgId));
    const app = buildApp({ db, verifyToken: verificadorDePrueba });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso',
      payload: {
        token: tokenDelPortal({
          sub: ECO_SUB,
          email: 'nueva@dinamyt.com',
          fullName: 'Ana Gómez',
          org_id: ECO_ORG,
          role_membresias: 'student',
        }),
      },
    });

    expect(res.statusCode).toBe(403);
    const filas = await db.select().from(users).where(eq(users.email, 'nueva@dinamyt.com'));
    expect(filas).toHaveLength(0);
    await app.close();
  });

  it('un rol que esta app no conoce cae a alumno, no a maestro', async () => {
    const { db, orgId } = await crearEscenario();
    await conEspejo(db, orgId);
    const app = buildApp({ db, verifyToken: verificadorDePrueba });

    await app.inject({
      method: 'POST',
      url: '/auth/sso',
      payload: {
        token: tokenDelPortal({
          sub: ECO_SUB,
          email: 'nueva@dinamyt.com',
          fullName: 'Ana Gómez',
          org_id: ECO_ORG,
          // 'judge' es de Campeonatos: aquí no significa nada.
          role_membresias: 'judge',
        }),
      },
    });

    const [ficha] = await db
      .select()
      .from(users)
      .where(eq(users.email, 'nueva@dinamyt.com'))
      .limit(1);
    expect(ficha.role).toBe('student');
    await app.close();
  });

  it('quien YA tiene ficha entra a la suya: no se le crea una segunda', async () => {
    const { db, orgId, ids } = await crearEscenario();
    await conEspejo(db, orgId);
    const app = buildApp({ db, verifyToken: verificadorDePrueba });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso',
      payload: {
        token: tokenDelPortal({
          sub: ECO_SUB,
          email: 'alumno1@club.com',
          fullName: 'Alumno Uno',
          org_id: ECO_ORG,
          role_membresias: 'owner', // aunque el token diga otra cosa
        }),
      },
    });

    expect(res.statusCode).toBe(200);
    const filas = await db.select().from(users).where(eq(users.email, 'alumno1@club.com'));
    expect(filas).toHaveLength(1);
    expect(filas[0].id).toBe(ids.alumno);
    // Y su rol sigue siendo el de su ficha: el aprovisionamiento crea, no asciende.
    expect(filas[0].role).toBe('student');
    await app.close();
  });

  /**
   * La ficha que ya existía y NUNCA se había enlazado.
   *
   * Es el caso de todas las que creó el maestro a mano (`POST /users`) y de
   * todas las que trajo la reconciliación por correo: se las reconocía por el
   * correo en cada entrada y `eco_sub` se quedaba vacío para siempre. Con el
   * hueco abierto, esa ficha se quedaba fuera de las dos cosas que dependen del
   * enlace —la reja de `lib/ecosistema.ts` y el espejo del portal—, y encima
   * habría quedado huérfana el día que su dueño cambiara de correo.
   */
  it('enlaza con el ecosistema la ficha que reconoce por el correo', async () => {
    const { db, orgId, ids } = await crearEscenario();
    await conEspejo(db, orgId);
    const app = buildApp({ db, verifyToken: verificadorDePrueba });

    // De partida no tiene enlace: es una ficha nacida aquí.
    const [antes] = await db.select().from(users).where(eq(users.id, ids.alumno)).limit(1);
    expect(antes.ecoSub).toBeNull();

    const res = await app.inject({
      method: 'POST',
      url: '/auth/sso',
      payload: {
        token: tokenDelPortal({
          sub: ECO_SUB,
          email: 'alumno1@club.com',
          fullName: 'Alumno Uno',
          org_id: ECO_ORG,
          role_membresias: 'student',
        }),
      },
    });
    expect(res.statusCode).toBe(200);

    const [despues] = await db.select().from(users).where(eq(users.id, ids.alumno)).limit(1);
    expect(despues.ecoSub).toBe(ECO_SUB);

    // La prueba de que el enlace sirve: con OTRO correo —el que se acaba de
    // cambiar en el portal— sigue entrando a la misma ficha, con sus pagos y
    // sus asistencias, en vez de estrenar una vacía.
    const res2 = await app.inject({
      method: 'POST',
      url: '/auth/sso',
      payload: {
        token: tokenDelPortal({
          sub: ECO_SUB,
          email: 'otro-correo@club.com',
          fullName: 'Alumno Uno',
          org_id: ECO_ORG,
          role_membresias: 'student',
        }),
      },
    });
    expect(res2.statusCode).toBe(200);
    expect(res2.json().user.id).toBe(ids.alumno);
    expect(await db.select().from(users).where(eq(users.email, 'otro-correo@club.com'))).toHaveLength(
      0,
    );
    await app.close();
  });
});
