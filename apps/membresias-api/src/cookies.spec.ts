import { describe, it, expect } from 'vitest';
import { crearEscenario, PASSWORD, type Escenario } from './testing/escenario';
import { COOKIE_CSRF, COOKIE_SESION } from './lib/auth/cookies';
import { config } from './config';

/**
 * Sesión por cookie httpOnly y su defensa de CSRF.
 *
 * El token ya no vive en localStorage, así que estas son las garantías nuevas:
 * que la cookie autentica, que no es legible desde JavaScript, y que una web
 * ajena no puede usarla para escribir.
 */

async function login(e: Escenario, email = 'maestro@club.com') {
  return e.app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password: PASSWORD },
  });
}

/** Cookies de una respuesta, como { nombre: valor }. */
function cookiesDe(res: Awaited<ReturnType<typeof login>>) {
  const out: Record<string, string> = {};
  for (const c of res.cookies) out[c.name] = c.value;
  return out;
}

describe('sesión por cookie', () => {
  it('el login entrega la sesión en una cookie httpOnly', async () => {
    const e = await crearEscenario();
    const res = await login(e);

    expect(res.statusCode).toBe(200);
    const sesion = res.cookies.find((c) => c.name === COOKIE_SESION);
    expect(sesion).toBeDefined();
    // Lo que impide que un XSS se lleve la sesión.
    expect(sesion!.httpOnly).toBe(true);
    expect(sesion!.path).toBe('/');
  });

  it('la cookie no fija Domain ni SameSite=None: es de PRIMERA parte', async () => {
    const e = await crearEscenario();
    const res = await login(e);
    const sesion = res.cookies.find((c) => c.name === COOKIE_SESION)!;

    // Estas dos condiciones son las que hacen que la sesión aguante una
    // recarga. Sin Domain, la cookie queda asociada al dominio que sirvió la
    // respuesta — el de la web, porque la API se consume por su proxy — y no
    // es cookie de terceros. Con SameSite=None sí lo sería, y Safari la
    // bloquearía: exactamente el fallo de "se cierra la sesión al recargar".
    expect(sesion.domain).toBeUndefined();
    expect(sesion.sameSite?.toLowerCase()).not.toBe('none');
  });

  it('la cookie de CSRF SÍ es legible: el cliente tiene que copiarla', async () => {
    const e = await crearEscenario();
    const res = await login(e);

    const csrf = res.cookies.find((c) => c.name === COOKIE_CSRF);
    expect(csrf).toBeDefined();
    expect(csrf!.httpOnly).toBeFalsy();
  });

  it('la cookie sola autentica una lectura, sin cabecera Authorization', async () => {
    const e = await crearEscenario();
    const cookies = cookiesDe(await login(e));

    const res = await e.app.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: { [COOKIE_SESION]: cookies[COOKIE_SESION] },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().user.email).toBe('maestro@club.com');
  });

  it('una escritura por cookie SIN token CSRF se rechaza', async () => {
    const e = await crearEscenario();
    const cookies = cookiesDe(await login(e));

    // Esto es lo que consigue montar una web ajena: el navegador manda las
    // cookies, pero el atacante no puede leer la de CSRF para copiarla.
    const res = await e.app.inject({
      method: 'PATCH',
      url: '/auth/me',
      cookies: {
        [COOKIE_SESION]: cookies[COOKIE_SESION],
        [COOKIE_CSRF]: cookies[COOKIE_CSRF],
      },
      payload: { fullName: 'Cambiado por CSRF' },
    });

    expect(res.statusCode).toBe(403);
  });

  it('una escritura por cookie CON el token CSRF correcto pasa', async () => {
    const e = await crearEscenario();
    const cookies = cookiesDe(await login(e));

    const res = await e.app.inject({
      method: 'PATCH',
      url: '/auth/me',
      cookies: {
        [COOKIE_SESION]: cookies[COOKIE_SESION],
        [COOKIE_CSRF]: cookies[COOKIE_CSRF],
      },
      headers: { 'x-csrf-token': cookies[COOKIE_CSRF] },
      payload: { fullName: 'Maestro Renombrado' },
    });

    expect(res.statusCode).toBe(200);
    // En mayúsculas: la API normaliza los nombres al guardarlos, para que la
    // lista y el carnet no mezclen «Juan pérez» con «JUAN PEREZ».
    expect(res.json().fullName).toBe('MAESTRO RENOMBRADO');
  });

  it('un token CSRF que no coincide con la cookie no sirve', async () => {
    const e = await crearEscenario();
    const cookies = cookiesDe(await login(e));

    const res = await e.app.inject({
      method: 'PATCH',
      url: '/auth/me',
      cookies: {
        [COOKIE_SESION]: cookies[COOKIE_SESION],
        [COOKIE_CSRF]: cookies[COOKIE_CSRF],
      },
      headers: { 'x-csrf-token': 'inventado-por-el-atacante' },
      payload: { fullName: 'No' },
    });

    expect(res.statusCode).toBe(403);
  });

  it('con Authorization no se exige CSRF: el navegador no la pone sola', async () => {
    const e = await crearEscenario();

    const res = await e.app.inject({
      method: 'PATCH',
      url: '/auth/me',
      headers: e.auth(e.ids.owner),
      payload: { fullName: 'Por cabecera' },
    });

    expect(res.statusCode).toBe(200);
  });

  it('el logout borra las dos cookies', async () => {
    const e = await crearEscenario();
    const cookies = cookiesDe(await login(e));

    const res = await e.app.inject({
      method: 'POST',
      url: '/auth/logout',
      cookies: { [COOKIE_SESION]: cookies[COOKIE_SESION] },
    });

    expect(res.statusCode).toBe(200);
    for (const nombre of [COOKIE_SESION, COOKIE_CSRF]) {
      const borrada = res.cookies.find((c) => c.name === nombre);
      expect(borrada).toBeDefined();
      expect(borrada!.value).toBe('');
    }
  });

  /**
   * Quien entra por DINAMYT tiene DOS sesiones, y esta respuesta es lo que
   * hace que se cierren las dos de una sola pulsación.
   *
   * Antes lo decidía una marca en el `localStorage` de la web, y esa marca se
   * perdía sola —la borraba cualquier 401, y no existía si se había entrado con
   * contraseña—. Sin ella, «Salir» no pasaba por el portal, la sesión de
   * DINAMYT quedaba viva, y el siguiente «entrar con DINAMYT» metía a la
   * persona dentro sin enseñarle una sola pantalla. Había que pulsar Salir dos
   * veces. Ahora lo dice el servidor, que es el único que lo sabe de verdad.
   */
  it('el logout dice si además hay que cerrar la sesión del portal', async () => {
    const e = await crearEscenario();
    const sesion = cookiesDe(await login(e))[COOKIE_SESION];
    const salir = () =>
      e.app.inject({
        method: 'POST',
        url: '/auth/logout',
        cookies: { [COOKIE_SESION]: sesion },
      });

    const antes = config.ecosystemJwksUrl;
    try {
      config.ecosystemJwksUrl = 'https://dinamyt.example/.well-known/jwks.json';
      expect((await salir()).json()).toMatchObject({ portal: true });

      // El club que usa Membresías por su cuenta no tiene portal al que ir, y
      // mandarlo allí sería enseñarle un dominio que no le corresponde.
      config.ecosystemJwksUrl = '';
      expect((await salir()).json()).toMatchObject({ portal: false });
    } finally {
      config.ecosystemJwksUrl = antes;
    }
  });
});
