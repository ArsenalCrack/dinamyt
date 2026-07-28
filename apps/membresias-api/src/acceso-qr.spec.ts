import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { users } from '@dinamyt/membresias-db';
import { crearEscenario } from './testing/escenario';

/**
 * QR de acceso rápido: el maestro lo genera en la ficha y el alumno entra
 * escaneándolo, sin teclear correo ni contraseña.
 *
 * Lo que estas pruebas cuidan es que el atajo NO sea un agujero: el código vale
 * para una sola cosa (canjearse por una sesión), lo genera solo el maestro del
 * club, y una cuenta desactivada no entra por aquí aunque tenga un código en la
 * mano.
 */
describe('membresias-api — QR de acceso rápido', () => {
  it('el maestro lo genera y el alumno lo canjea por una sesión', async () => {
    const { app, auth, ids } = await crearEscenario();

    const gen = await app.inject({
      method: 'POST',
      url: `/users/${ids.alumno}/acceso-qr`,
      headers: auth(ids.owner),
    });
    expect(gen.statusCode).toBe(200);
    const { token } = gen.json();
    expect(token).toBeTruthy();

    const canje = await app.inject({
      method: 'POST',
      url: '/auth/acceso-qr',
      payload: { token },
    });
    expect(canje.statusCode).toBe(200);
    expect(canje.json().user.id).toBe(ids.alumno);
    // Sesión de verdad: cookie httpOnly y token de CSRF, igual que el login.
    expect(canje.json().csrf).toBeTruthy();
    await app.close();
  });

  it('el código del QR NO sirve como sesión por sí mismo', async () => {
    const { app, auth, ids } = await crearEscenario();
    const { token } = (
      await app.inject({
        method: 'POST',
        url: `/users/${ids.alumno}/acceso-qr`,
        headers: auth(ids.owner),
      })
    ).json();

    // Es la razón de que se firme con otro emisor: si valiera como sesión, el
    // código sería una llave de 24 horas dibujada en la pantalla.
    const r = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(r.statusCode).toBe(401);
    await app.close();
  });

  it('un maestro no genera el QR de un alumno de otro club', async () => {
    const { app, auth, ids } = await crearEscenario();
    const r = await app.inject({
      method: 'POST',
      url: `/users/${ids.alumnoAjeno}/acceso-qr`,
      headers: auth(ids.owner),
    });
    expect(r.statusCode).toBe(404);
    await app.close();
  });

  it('el auxiliar no reparte accesos: es cosa del maestro', async () => {
    const { app, auth, ids } = await crearEscenario();
    const r = await app.inject({
      method: 'POST',
      url: `/users/${ids.alumno}/acceso-qr`,
      headers: auth(ids.staff),
    });
    expect(r.statusCode).toBe(403);
    await app.close();
  });

  it('una cuenta desactivada no entra aunque tenga el código en la mano', async () => {
    const { app, db, auth, ids } = await crearEscenario();
    const { token } = (
      await app.inject({
        method: 'POST',
        url: `/users/${ids.alumno}/acceso-qr`,
        headers: auth(ids.owner),
      })
    ).json();

    await db.update(users).set({ isActive: false }).where(eq(users.id, ids.alumno));

    const r = await app.inject({
      method: 'POST',
      url: '/auth/acceso-qr',
      payload: { token },
    });
    expect(r.statusCode).toBe(403);
    await app.close();
  });

  it('un código inventado no abre nada', async () => {
    const { app } = await crearEscenario();
    const r = await app.inject({
      method: 'POST',
      url: '/auth/acceso-qr',
      payload: { token: 'esto.no.es.un.jwt' },
    });
    expect(r.statusCode).toBe(401);
    await app.close();
  });
});
