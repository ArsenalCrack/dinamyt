import { beforeEach, describe, expect, it } from 'vitest';
import { crearEscenario, PASSWORD, type Escenario } from './testing/escenario';
import { invalidarCache } from './lib/mantenimiento';

/**
 * Modo mantenimiento: quién lo enciende y a quién deja fuera.
 *
 * La caché del interruptor vive en el proceso, así que se limpia antes de cada
 * test: sin eso, uno arrastra el estado que dejó el anterior.
 */

async function activar(e: Escenario, mensaje?: string) {
  return e.app.inject({
    method: 'PUT',
    url: '/maintenance',
    headers: e.auth(e.ids.superadmin),
    payload: { activo: true, mensaje },
  });
}

describe('membresias-api — modo mantenimiento', () => {
  beforeEach(() => invalidarCache());

  it('el estado se consulta sin sesión y arranca apagado', async () => {
    const e = await crearEscenario();
    const res = await e.app.inject({ method: 'GET', url: '/maintenance' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      activo: false,
      mensaje: null,
      desde: null,
      exento: false,
    });
  });

  it('solo el superadmin lo enciende', async () => {
    const e = await crearEscenario();

    // Al maestro se le responde 404: no tiene por qué enterarse de que este
    // interruptor existe.
    const maestro = await e.app.inject({
      method: 'PUT',
      url: '/maintenance',
      headers: e.auth(e.ids.owner),
      payload: { activo: true },
    });
    expect(maestro.statusCode).toBe(404);

    const anonimo = await e.app.inject({
      method: 'PUT',
      url: '/maintenance',
      payload: { activo: true },
    });
    expect(anonimo.statusCode).toBe(401);

    const res = await activar(e, 'Volvemos en 10 minutos');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      activo: true,
      mensaje: 'Volvemos en 10 minutos',
      exento: true,
    });
    expect(res.json().desde).not.toBeNull();
  });

  it('con el mantenimiento puesto, la API responde 503 a todo el mundo', async () => {
    const e = await crearEscenario();
    await activar(e, 'Actualizando');

    for (const quien of [e.ids.owner, e.ids.staff, e.ids.alumno]) {
      const res = await e.app.inject({
        method: 'GET',
        url: '/users',
        headers: e.auth(quien),
      });
      expect(res.statusCode).toBe(503);
      expect(res.headers['retry-after']).toBe('60');
      // El aviso del superadmin es lo que ve el usuario, no un texto genérico.
      expect(res.json()).toMatchObject({ mantenimiento: true, error: 'Actualizando' });
    }
  });

  it('el superadmin sigue entrando (es quien tiene que apagarlo)', async () => {
    const e = await crearEscenario();
    await activar(e);

    const res = await e.app.inject({
      method: 'GET',
      url: '/orgs',
      headers: e.auth(e.ids.superadmin),
    });
    expect(res.statusCode).toBe(200);

    const estado = await e.app.inject({
      method: 'GET',
      url: '/maintenance',
      headers: e.auth(e.ids.superadmin),
    });
    expect(estado.json()).toMatchObject({ activo: true, exento: true });
  });

  it('el login sigue abierto, o el superadmin no podría entrar a apagarlo', async () => {
    const e = await crearEscenario();
    await activar(e);

    const res = await e.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'super@dinamyt.com', password: PASSWORD },
    });
    expect(res.statusCode).toBe(200);
  });

  it('`/auth/me` sigue respondiendo: un fallo ahí cerraría la sesión de todos', async () => {
    const e = await crearEscenario();
    await activar(e);

    const res = await e.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: e.auth(e.ids.alumno),
    });
    expect(res.statusCode).toBe(200);
  });

  it('apagarlo reabre la aplicación', async () => {
    const e = await crearEscenario();
    await activar(e);

    const apagar = await e.app.inject({
      method: 'PUT',
      url: '/maintenance',
      headers: e.auth(e.ids.superadmin),
      payload: { activo: false },
    });
    expect(apagar.statusCode).toBe(200);
    expect(apagar.json()).toMatchObject({ activo: false, desde: null });

    const res = await e.app.inject({
      method: 'GET',
      url: '/users',
      headers: e.auth(e.ids.owner),
    });
    expect(res.statusCode).toBe(200);
  });

  it('reactivarlo no reinicia el reloj', async () => {
    const e = await crearEscenario();
    const desde = (await activar(e)).json().desde;
    // Segunda pasada (p. ej. para cambiar el aviso): sigue contando desde la
    // primera, que es lo que el usuario ve en pantalla.
    expect((await activar(e, 'Otro aviso')).json().desde).toBe(desde);
  });
});
