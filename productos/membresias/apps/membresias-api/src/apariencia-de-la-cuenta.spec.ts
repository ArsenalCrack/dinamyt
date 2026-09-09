import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { users } from '@dinamyt/membresias-db';
import { crearEscenario } from './testing/escenario';

/**
 * El tema y el idioma quedan guardados EN LA CUENTA de Membresías.
 *
 * ── La avería ────────────────────────────────────────────────────────────────
 *
 * Se reportó en dos mitades que resultaron ser la misma: «el modo y el idioma
 * no viajan de Membresías al ecosistema» y «esta información no queda guardada
 * por cuentas».
 *
 * `PATCH /me/apariencia` **no guardaba nada aquí**: leía el `eco_sub` de la fila
 * y reenviaba al portal. Y el reenvío se rinde en silencio dos veces —sin
 * `ECOSYSTEM_SYNC_SECRET`, y sin `eco_sub`—, así que para el alumno de carnet QR
 * la elección no se guardaba en ningún sitio: vivía en la cookie del navegador
 * y se perdía al cambiar de teléfono.
 *
 * Estas pruebas corren SIN ecosistema (el escenario no lo configura), que es
 * justo el caso que estaba roto del todo.
 */
describe('membresias-api — el tema y el idioma son de la cuenta', () => {
  it('se guardan en la fila, sin ecosistema ninguno', async () => {
    const { app, auth, ids } = await crearEscenario();

    const r = await app.inject({
      method: 'PATCH',
      url: '/me/apariencia',
      headers: auth(ids.alumno),
      payload: { theme: 'claro', locale: 'en-US' },
    });

    expect(r.statusCode).toBe(200);
    expect(r.json().guardadoEnLaCuenta).toBe(true);
    // Sin `eco_sub` y sin puente, no viaja — y ahora lo DICE en vez de callarlo.
    expect(r.json().enElEcosistema).toBe(false);

    const [fila] = await app.db
      .select({ theme: users.theme, locale: users.locale })
      .from(users)
      .where(eq(users.id, ids.alumno))
      .limit(1);
    expect(fila.theme).toBe('claro');
    expect(fila.locale).toBe('en-US');

    await app.close();
  });

  it('y se leen de vuelta: es lo que hace que sobrevivan al cambio de teléfono', async () => {
    const { app, auth, ids } = await crearEscenario();

    await app.inject({
      method: 'PATCH',
      url: '/me/apariencia',
      headers: auth(ids.alumno),
      payload: { theme: 'oscuro' },
    });

    const r = await app.inject({
      method: 'GET',
      url: '/me/apariencia',
      headers: auth(ids.alumno),
    });

    expect(r.statusCode).toBe(200);
    expect(r.json().theme).toBe('oscuro');
    // `delEcosistema` sigue siendo falso: esto salió de la copia local, y la
    // pantalla puede querer saber de dónde vino.
    expect(r.json().delEcosistema).toBe(false);

    await app.close();
  });

  it('cambiar solo el idioma no borra el tema', async () => {
    const { app, auth, ids } = await crearEscenario();

    await app.inject({
      method: 'PATCH',
      url: '/me/apariencia',
      headers: auth(ids.alumno),
      payload: { theme: 'claro' },
    });
    await app.inject({
      method: 'PATCH',
      url: '/me/apariencia',
      headers: auth(ids.alumno),
      payload: { locale: 'en-US' },
    });

    const [fila] = await app.db
      .select({ theme: users.theme, locale: users.locale })
      .from(users)
      .where(eq(users.id, ids.alumno))
      .limit(1);
    // El `set` es campo a campo: mandar uno no puede vaciar el otro.
    expect(fila.theme).toBe('claro');
    expect(fila.locale).toBe('en-US');

    await app.close();
  });

  it('la eleccion de una persona no toca la de otra', async () => {
    const { app, auth, ids } = await crearEscenario();

    await app.inject({
      method: 'PATCH',
      url: '/me/apariencia',
      headers: auth(ids.alumno),
      payload: { theme: 'claro' },
    });

    const [otro] = await app.db
      .select({ theme: users.theme })
      .from(users)
      .where(eq(users.id, ids.owner))
      .limit(1);
    expect(otro.theme).toBeNull();

    await app.close();
  });
});
