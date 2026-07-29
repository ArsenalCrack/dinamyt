import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { users } from '@dinamyt/membresias-db';
import { crearEscenario, type Escenario } from './testing/escenario';
import { todayStr } from './lib/billing';

/**
 * La fecha de expedición del carnet.
 *
 * **El error que arregla.** El carnet no guardaba ninguna fecha: la vista
 * previa calculaba «emitido hoy, vence dentro de un año» en el navegador, en el
 * momento de imprimir. Consecuencia: el carnet no vencía jamás —reimprimirlo
 * ERA renovarlo— y dos copias del mismo carnet decían cosas distintas según el
 * día en que salieran de la impresora.
 *
 * Ahora la fecha es una columna, se pone al dar de alta a la persona y solo la
 * mueve un acto explícito del maestro. Lo que estos tests vigilan es
 * precisamente eso: que NADA más la toque.
 */
describe('membresias-api — vigencia del carnet', () => {
  let e: Escenario;
  beforeEach(async () => {
    e = await crearEscenario();
  });

  async function emitidoEl(userId: string): Promise<string | null> {
    const [u] = await e.db
      .select({ f: users.carnetEmitidoEl })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return u?.f ?? null;
  }

  it('quien se da de alta estrena carnet con la fecha de hoy', async () => {
    const r = await e.app.inject({
      method: 'POST',
      url: '/users',
      headers: e.auth(e.ids.owner),
      payload: {
        email: 'nuevo@club.com',
        fullName: 'Alumno Nuevo',
        password: 'Prueba1234',
        role: 'student',
      },
    });
    expect(r.statusCode).toBe(201);
    expect(r.json().carnetEmitidoEl).toBe(todayStr());
  });

  it('la fecha viaja en el perfil y en la sesión: es lo que imprime el carnet', async () => {
    const yo = await e.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: e.auth(e.ids.alumno),
    });
    expect(yo.json().user.carnetEmitidoEl).toBe(await emitidoEl(e.ids.alumno));

    const ficha = await e.app.inject({
      method: 'GET',
      url: `/users/${e.ids.alumno}`,
      headers: e.auth(e.ids.owner),
    });
    expect(ficha.json().carnetEmitidoEl).toBe(await emitidoEl(e.ids.alumno));
  });

  it('reexpedir es lo único que mueve la fecha, y la pone en hoy', async () => {
    // Un carnet de hace dos años: vencido de sobra.
    await e.db
      .update(users)
      .set({ carnetEmitidoEl: '2023-01-15' })
      .where(eq(users.id, e.ids.alumno));

    const r = await e.app.inject({
      method: 'POST',
      url: `/users/${e.ids.alumno}/carnet`,
      headers: e.auth(e.ids.owner),
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().carnetEmitidoEl).toBe(todayStr());
    expect(await emitidoEl(e.ids.alumno)).toBe(todayStr());
  });

  it('editar la ficha NO reexpide el carnet', async () => {
    await e.db
      .update(users)
      .set({ carnetEmitidoEl: '2023-01-15' })
      .where(eq(users.id, e.ids.alumno));

    const r = await e.app.inject({
      method: 'PATCH',
      url: `/users/${e.ids.alumno}`,
      headers: e.auth(e.ids.owner),
      payload: { fullName: 'Alumno Uno Corregido', belt: 'Verde' },
    });
    expect(r.statusCode).toBe(200);
    // Cambiar el nombre o el cinturón cambia lo que dice el carnet, pero no
    // hasta cuándo vale: lo contrario sería renovarlo por la puerta de atrás.
    expect(await emitidoEl(e.ids.alumno)).toBe('2023-01-15');
  });

  it('el auxiliar no reexpide carnets: los firma el maestro', async () => {
    const r = await e.app.inject({
      method: 'POST',
      url: `/users/${e.ids.alumno}/carnet`,
      headers: e.auth(e.ids.staff),
    });
    expect(r.statusCode).toBe(403);
  });

  it('un maestro no reexpide el carnet de un alumno de otro club', async () => {
    const r = await e.app.inject({
      method: 'POST',
      url: `/users/${e.ids.alumnoAjeno}/carnet`,
      headers: e.auth(e.ids.owner),
    });
    expect(r.statusCode).toBe(404);
  });

  it('el alumno no se reexpide el carnet a sí mismo', async () => {
    const r = await e.app.inject({
      method: 'POST',
      url: `/users/${e.ids.alumno}/carnet`,
      headers: e.auth(e.ids.alumno),
    });
    expect(r.statusCode).toBe(403);
  });
});
