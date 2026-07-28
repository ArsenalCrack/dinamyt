import { describe, it, expect, beforeAll } from 'vitest';
import { crearEscenario, type Escenario } from './testing/escenario';

/**
 * Lo que se escribe en un formulario tiene que caber en la columna.
 *
 * Sin estas comprobaciones, un texto largo o un precio con letras no daban un
 * aviso: se iban tal cual a PostgreSQL y volvían como un 500 sin explicación,
 * con la pantalla en blanco y nada que decirle al usuario.
 */
describe('membresias-api — límites de los campos', () => {
  let e: Escenario;
  beforeAll(async () => {
    e = await crearEscenario();
  });

  const largo = (n: number) => 'a'.repeat(n);

  it('un nombre de club más largo que la columna da 422, no 500', async () => {
    const r = await e.app.inject({
      method: 'POST',
      url: '/orgs',
      headers: e.auth(e.ids.superadmin),
      payload: { name: largo(121) },
    });
    expect(r.statusCode).toBe(422);
    expect(r.json().error).toContain('120');
  });

  it('ciudad y país también tienen tope', async () => {
    const r = await e.app.inject({
      method: 'POST',
      url: '/orgs',
      headers: e.auth(e.ids.superadmin),
      payload: { name: 'Club Nuevo', city: largo(81), country: 'Colombia' },
    });
    expect(r.statusCode).toBe(422);
    expect(r.json().error).toContain('ciudad');
  });

  it('un precio con letras no llega a la base', async () => {
    const r = await e.app.inject({
      method: 'POST',
      url: '/plans',
      headers: e.auth(e.ids.owner),
      payload: { name: 'Mensual', type: 'mensual', price: '35000abc' },
    });
    expect(r.statusCode).toBe(422);
  });

  it('un precio que no cabe en decimal(10,2) se rechaza', async () => {
    const r = await e.app.inject({
      method: 'POST',
      url: '/plans',
      headers: e.auth(e.ids.owner),
      payload: { name: 'Mensual', type: 'mensual', price: '999999999' },
    });
    expect(r.statusCode).toBe(422);
  });

  it('un precio normal sigue pasando, con dos decimales', async () => {
    const r = await e.app.inject({
      method: 'POST',
      url: '/plans',
      headers: e.auth(e.ids.owner),
      payload: { name: 'Mensual', type: 'mensual', price: '35000' },
    });
    expect(r.statusCode).toBe(201);
    expect(r.json().price).toBe('35000.00');
  });

  it('el número de clases no admite decimales ni negativos', async () => {
    const r = await e.app.inject({
      method: 'POST',
      url: '/plans',
      headers: e.auth(e.ids.owner),
      payload: { name: 'Paquete', type: 'paquete', price: '100000', nClasses: -4 },
    });
    expect(r.statusCode).toBe(422);
  });

  it('un teléfono larguísimo da 422 al crear un alumno', async () => {
    const r = await e.app.inject({
      method: 'POST',
      url: '/users',
      headers: e.auth(e.ids.owner),
      payload: {
        email: 'nuevo@club.com',
        fullName: 'Alumno Nuevo',
        password: 'Prueba1234',
        phone: largo(41),
      },
    });
    expect(r.statusCode).toBe(422);
  });

  it('un teléfono de dos dígitos no es un teléfono', async () => {
    const r = await e.app.inject({
      method: 'POST',
      url: '/users',
      headers: e.auth(e.ids.owner),
      payload: {
        email: 'corto@club.com',
        fullName: 'Alumno Corto',
        password: 'Prueba1234',
        phone: '30',
      },
    });
    expect(r.statusCode).toBe(422);
    expect(r.json().error).toContain('7');
  });

  it('un teléfono con separadores sí pasa: se cuentan los dígitos, no los signos', async () => {
    const r = await e.app.inject({
      method: 'POST',
      url: '/users',
      headers: e.auth(e.ids.owner),
      payload: {
        email: 'contel@club.com',
        fullName: 'Alumno Con Teléfono',
        password: 'Prueba1234',
        phone: '+57 (300) 123-4567',
      },
    });
    expect(r.statusCode).toBe(201);
    expect(r.json().phone).toBe('+57 (300) 123-4567');
  });

  it('un cinturón fuera del catálogo se rechaza; uno del catálogo se normaliza', async () => {
    const malo = await e.app.inject({
      method: 'POST',
      url: '/users',
      headers: e.auth(e.ids.owner),
      payload: {
        email: 'cinturon@club.com',
        fullName: 'Alumno Cinturón',
        password: 'Prueba1234',
        belt: 'Morado',
      },
    });
    expect(malo.statusCode).toBe(422);

    const bueno = await e.app.inject({
      method: 'POST',
      url: '/users',
      headers: e.auth(e.ids.owner),
      payload: {
        email: 'cinturon@club.com',
        fullName: 'Alumno Cinturón',
        password: 'Prueba1234',
        belt: 'negro',
      },
    });
    expect(bueno.statusCode).toBe(201);
    expect(bueno.json().belt).toBe('Negro');
  });

  it('una contraseña de más de 72 caracteres se rechaza (bcrypt la truncaría)', async () => {
    const r = await e.app.inject({
      method: 'POST',
      url: '/users',
      headers: e.auth(e.ids.owner),
      payload: {
        email: 'otro@club.com',
        fullName: 'Alumno Otro',
        password: largo(73),
      },
    });
    expect(r.statusCode).toBe(422);
    expect(r.json().error).toContain('72');
  });

  it('una nota de calendario más larga que la columna da 422', async () => {
    const r = await e.app.inject({
      method: 'POST',
      url: '/schedule/exceptions',
      headers: e.auth(e.ids.owner),
      payload: { date: '2026-12-25', isClosed: true, note: largo(201) },
    });
    expect(r.statusCode).toBe(422);
  });
});

/**
 * Catálogo geográfico de los formularios. Es público a propósito: no expone un
 * solo dato del club, y así el desplegable carga sin depender de la sesión.
 */
describe('membresias-api — catálogo geográfico', () => {
  let e: Escenario;
  beforeAll(async () => {
    e = await crearEscenario();
  });

  it('lista los países con su iso2, sin necesidad de sesión', async () => {
    const r = await e.app.inject({ method: 'GET', url: '/geo/paises' });
    expect(r.statusCode).toBe(200);
    const paises = r.json() as { iso2: string; nombre: string }[];
    expect(paises.length).toBeGreaterThan(190);
    expect(paises.find((p) => p.iso2 === 'CO')).toBeTruthy();
  });

  it('lista las ciudades de un país, sin repetidas', async () => {
    const r = await e.app.inject({ method: 'GET', url: '/geo/ciudades?pais=CO' });
    expect(r.statusCode).toBe(200);
    const ciudades = r.json() as string[];
    expect(ciudades.length).toBeGreaterThan(100);
    expect(new Set(ciudades).size).toBe(ciudades.length);
  });

  it('sin un iso2 válido responde 400', async () => {
    const r = await e.app.inject({ method: 'GET', url: '/geo/ciudades?pais=Colombia' });
    expect(r.statusCode).toBe(400);
  });
});
