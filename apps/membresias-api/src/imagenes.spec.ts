import { describe, it, expect, beforeEach } from 'vitest';
import { crearEscenario, type Escenario } from './testing/escenario';
import { MAX_IMAGEN } from './lib/imagenes';

/**
 * Fotos de perfil.
 *
 * Lo que se prueba aquí no es «se guarda la foto», sino las tres reglas que
 * hacen que guardarla dentro de la base sea sostenible:
 *
 * 1. Que la API no devuelva NUNCA el data-URL en el JSON, sino la dirección de
 *    la ruta que la sirve. Si esto se rompe, el roster vuelve a pesar megas.
 * 2. Que la ruta responda la imagen en binario y con caché.
 * 3. Que no se pueda meter cualquier cosa: ni un archivo enorme, ni algo que no
 *    sea una imagen.
 */

/** PNG de 1×1 transparente: la imagen válida más pequeña que existe. */
const PNG_1x1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('membresias-api — fotos de perfil', () => {
  let e: Escenario;
  beforeEach(async () => {
    e = await crearEscenario();
  });

  it('el maestro sube la foto de un alumno y el JSON devuelve la dirección, no la imagen', async () => {
    const guardado = await e.app.inject({
      method: 'PATCH',
      url: `/users/${e.ids.alumno}`,
      headers: e.auth(e.ids.owner),
      payload: { avatarUrl: PNG_1x1 },
    });
    expect(guardado.statusCode).toBe(200);

    const cuerpo = guardado.json();
    expect(cuerpo.avatarUrl).not.toContain('base64');
    expect(cuerpo.avatarUrl).toMatch(new RegExp(`^/users/${e.ids.alumno}/foto\\?v=\\d+$`));

    // Y en el roster tampoco: es el listado que más gente arrastra.
    const roster = await e.app.inject({
      method: 'GET',
      url: '/memberships',
      headers: e.auth(e.ids.owner),
    });
    const alumno = roster.json().find((m: { userId: string }) => m.userId === e.ids.alumno);
    expect(alumno.avatarUrl).toMatch(/^\/users\/.+\/foto\?v=\d+$/);
  });

  it('la ruta de la foto responde la imagen en binario, cacheada y con ETag', async () => {
    await e.app.inject({
      method: 'PATCH',
      url: `/users/${e.ids.alumno}`,
      headers: e.auth(e.ids.owner),
      payload: { avatarUrl: PNG_1x1 },
    });

    const foto = await e.app.inject({
      method: 'GET',
      url: `/users/${e.ids.alumno}/foto`,
      headers: e.auth(e.ids.owner),
    });
    expect(foto.statusCode).toBe(200);
    expect(foto.headers['content-type']).toBe('image/png');
    expect(String(foto.headers['cache-control'])).toContain('immutable');
    expect(foto.rawPayload.subarray(1, 4).toString()).toBe('PNG');

    // Segunda visita con el ETag: el navegador no se vuelve a traer los bytes.
    const repetida = await e.app.inject({
      method: 'GET',
      url: `/users/${e.ids.alumno}/foto`,
      headers: { ...e.auth(e.ids.owner), 'if-none-match': String(foto.headers.etag) },
    });
    expect(repetida.statusCode).toBe(304);
  });

  it('el alumno ve su propia foto y no la de un compañero', async () => {
    await e.app.inject({
      method: 'PATCH',
      url: '/auth/me',
      headers: e.auth(e.ids.alumno),
      payload: { avatarUrl: PNG_1x1 },
    });

    const propia = await e.app.inject({
      method: 'GET',
      url: `/users/${e.ids.alumno}/foto`,
      headers: e.auth(e.ids.alumno),
    });
    expect(propia.statusCode).toBe(200);

    const ajena = await e.app.inject({
      method: 'GET',
      url: `/users/${e.ids.alumno2}/foto`,
      headers: e.auth(e.ids.alumno),
    });
    expect(ajena.statusCode).toBe(404);
  });

  it('un maestro no ve la foto de un alumno de otro club', async () => {
    await e.app.inject({
      method: 'PATCH',
      url: `/users/${e.ids.alumnoAjeno}`,
      headers: e.auth(e.ids.ownerAjeno),
      payload: { avatarUrl: PNG_1x1 },
    });

    const r = await e.app.inject({
      method: 'GET',
      url: `/users/${e.ids.alumnoAjeno}/foto`,
      headers: e.auth(e.ids.owner),
    });
    expect(r.statusCode).toBe(404);
  });

  it('sin foto responde 404 en vez de una imagen vacía', async () => {
    const r = await e.app.inject({
      method: 'GET',
      url: `/users/${e.ids.alumno}/foto`,
      headers: e.auth(e.ids.owner),
    });
    expect(r.statusCode).toBe(404);
  });

  it('rechaza lo que no es una imagen y lo que no cabe', async () => {
    const noEsImagen = await e.app.inject({
      method: 'PATCH',
      url: `/users/${e.ids.alumno}`,
      headers: e.auth(e.ids.owner),
      payload: { avatarUrl: 'data:text/html;base64,PHNjcmlwdD4=' },
    });
    expect(noEsImagen.statusCode).toBe(422);

    const enorme = await e.app.inject({
      method: 'PATCH',
      url: `/users/${e.ids.alumno}`,
      headers: e.auth(e.ids.owner),
      payload: { avatarUrl: `data:image/jpeg;base64,${'A'.repeat(MAX_IMAGEN)}` },
    });
    expect(enorme.statusCode).toBe(422);
    expect(enorme.json().error).toContain('pesa demasiado');
  });

  it('el maestro pone el escudo de su club y se sirve cacheado', async () => {
    const puesto = await e.app.inject({
      method: 'PATCH',
      url: '/mi-club',
      headers: e.auth(e.ids.owner),
      payload: { logoUrl: PNG_1x1 },
    });
    expect(puesto.statusCode).toBe(200);
    expect(puesto.json().logoUrl).toMatch(new RegExp(`^/orgs/${e.orgId}/logo\\?v=\\d+$`));

    const logo = await e.app.inject({
      method: 'GET',
      url: `/orgs/${e.orgId}/logo`,
      headers: e.auth(e.ids.alumno),
    });
    expect(logo.statusCode).toBe(200);
    expect(logo.headers['content-type']).toBe('image/png');
    expect(String(logo.headers['cache-control'])).toContain('immutable');
  });

  it('el escudo viaja con la sesión, para que toda pantalla lo tenga sin pedirlo', async () => {
    await e.app.inject({
      method: 'PATCH',
      url: '/mi-club',
      headers: e.auth(e.ids.owner),
      payload: { logoUrl: PNG_1x1 },
    });

    const yo = await e.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: e.auth(e.ids.alumno),
    });
    expect(yo.json().club.logoUrl).toMatch(/^\/orgs\/.+\/logo\?v=\d+$/);
    expect(JSON.stringify(yo.json())).not.toContain('base64');
  });

  it('el escudo lo pone el maestro, no el alumno ni el auxiliar', async () => {
    for (const quien of [e.ids.alumno, e.ids.staff]) {
      const r = await e.app.inject({
        method: 'PATCH',
        url: '/mi-club',
        headers: e.auth(quien),
        payload: { logoUrl: PNG_1x1 },
      });
      expect(r.statusCode).toBe(403);
    }
  });

  it('un club no ve el escudo de otro', async () => {
    await e.app.inject({
      method: 'PATCH',
      url: '/mi-club',
      headers: e.auth(e.ids.ownerAjeno),
      payload: { logoUrl: PNG_1x1 },
    });

    const r = await e.app.inject({
      method: 'GET',
      url: `/orgs/${e.otroOrgId}/logo`,
      headers: e.auth(e.ids.owner),
    });
    expect(r.statusCode).toBe(404);
  });

  it('cadena vacía quita la foto', async () => {
    await e.app.inject({
      method: 'PATCH',
      url: `/users/${e.ids.alumno}`,
      headers: e.auth(e.ids.owner),
      payload: { avatarUrl: PNG_1x1 },
    });
    const quitada = await e.app.inject({
      method: 'PATCH',
      url: `/users/${e.ids.alumno}`,
      headers: e.auth(e.ids.owner),
      payload: { avatarUrl: '' },
    });
    expect(quitada.json().avatarUrl).toBeNull();
  });
});
