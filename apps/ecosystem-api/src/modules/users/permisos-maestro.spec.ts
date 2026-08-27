/**
 * Quién puede tocar la ficha de quién (`UsersService.isOrgManagerOf`).
 *
 * Es la regla que sostiene `assertCanManage`, y de ella cuelga el 403 «No
 * tienes permiso sobre este perfil». Se prueba aparte porque tenía un fallo que
 * ninguna pantalla delataba: `OrganizationsService.esGestorDe` cuenta como
 * gestor de un club al admin de la federación que lo tiene afiliado, y esta
 * regla se quedaba mirando solo el club. Ese admin podía quitar a un miembro y
 * cambiarle el rol, pero al abrir su ficha —misma pantalla, misma sesión—
 * recibía un 403.
 *
 * Los casos de abajo son las dos mitades de la respuesta: hasta dónde SUBE el
 * permiso (por la línea de mando) y dónde se planta (de lado, entre clubes
 * hermanos).
 */

// La capa de datos se sustituye entera: aquí se prueban las DECISIONES del
// servicio, no las consultas.
jest.mock('../../db', () => ({ db: {} }));

import { UsersService } from './users.service';
import { db } from '../../db';

const MAESTRO = '11111111-1111-4111-8111-111111111111';
const ALUMNO = '22222222-2222-4222-8222-222222222222';
const CLUB = '33333333-3333-4333-8333-333333333333';
const CLUB_VECINO = '44444444-4444-4444-8444-444444444444';
const LIGA = '55555555-5555-4555-8555-555555555555';
const FEDERACION = '66666666-6666-4666-8666-666666666666';

/**
 * Un `db.select()…` de mentira que devuelve, en orden, lo que se le diga.
 *
 * Drizzle encadena y solo al final se resuelve: con que cada eslabón se
 * devuelva a sí mismo y el objeto sea `then`-able basta. Mismo truco que
 * `codigo-club.spec.ts`.
 */
function armar(resultados: unknown[][]) {
  const cola = [...resultados];
  const eslabon: Record<string, unknown> = {};
  for (const metodo of ['from', 'where', 'limit', 'orderBy', 'innerJoin']) {
    eslabon[metodo] = () => eslabon;
  }
  eslabon.then = (resolver: (v: unknown) => unknown) =>
    Promise.resolve(cola.shift() ?? []).then(resolver);
  (db as unknown as Record<string, unknown>).select = () => eslabon;
  return new UsersService();
}

describe('isOrgManagerOf · el permiso sobre la ficha de otro', () => {
  it('el maestro gestiona a su alumno: comparten club y él lo manda', async () => {
    const service = armar([
      [{ orgId: CLUB }], // dónde está el alumno
      [{ orgId: CLUB, role: 'maestro' }], // dónde manda el maestro
    ]);
    await expect(service.isOrgManagerOf(MAESTRO, ALUMNO)).resolves.toBe(true);
  });

  it('el simple miembro no gestiona a nadie, ni en su propio club', async () => {
    const service = armar([
      [{ orgId: CLUB }],
      [{ orgId: CLUB, role: 'member' }],
    ]);
    await expect(service.isOrgManagerOf(MAESTRO, ALUMNO)).resolves.toBe(false);
  });

  /**
   * El fallo que motivó esta prueba. El admin de la federación ya podía quitar
   * a este alumno del club; ahora también puede corregirle el apellido, que es
   * lo que la otra mitad del sistema llevaba tiempo dando por hecho.
   */
  it('el admin de la federación gestiona a los alumnos de sus clubes afiliados', async () => {
    const service = armar([
      [{ orgId: CLUB }], // el alumno está en el club
      [{ orgId: FEDERACION, role: 'admin' }], // y él manda la federación
      [{ parentId: FEDERACION }], // el club cuelga de ella
    ]);
    await expect(service.isOrgManagerOf(MAESTRO, ALUMNO)).resolves.toBe(true);
  });

  it('sube dos escalones: club dentro de liga dentro de federación', async () => {
    const service = armar([
      [{ orgId: CLUB }],
      [{ orgId: FEDERACION, role: 'admin' }],
      [{ parentId: LIGA }], // el club cuelga de la liga…
      [{ parentId: FEDERACION }], // …y la liga de la federación
    ]);
    await expect(service.isOrgManagerOf(MAESTRO, ALUMNO)).resolves.toBe(true);
  });

  /**
   * El límite, y es a propósito: por encima del club solo cuenta `admin`. Si
   * contara cualquier rol gestor, el maestro de un club acabaría editando las
   * fichas del club vecino por estar los dos afiliados a la misma liga.
   */
  it('el maestro NO se cuela en el club vecino por compartir federación', async () => {
    const service = armar([
      [{ orgId: CLUB_VECINO }],
      [{ orgId: CLUB, role: 'maestro' }],
    ]);
    await expect(service.isOrgManagerOf(MAESTRO, ALUMNO)).resolves.toBe(false);
  });

  it('un club suelto no le da permiso a ningún admin de fuera', async () => {
    const service = armar([
      [{ orgId: CLUB_VECINO }],
      [{ orgId: CLUB, role: 'admin' }],
      [{ parentId: null }], // el club vecino no está afiliado a nadie
    ]);
    await expect(service.isOrgManagerOf(MAESTRO, ALUMNO)).resolves.toBe(false);
  });

  /**
   * El caso que explica el 403 que se ve tras dar de baja a alguien: la regla
   * cuelga de `org_members`, así que al borrar la fila el maestro deja de poder
   * tocar esa ficha EN EL MISMO INSTANTE. Es correcto —el perfil es de la
   * persona en todo el ecosistema, no del club— pero conviene que esté escrito.
   */
  it('a quien ya no pertenece a ningún club no lo gestiona nadie', async () => {
    const service = armar([[]]); // sin membresías: ni se mira al solicitante
    await expect(service.isOrgManagerOf(MAESTRO, ALUMNO)).resolves.toBe(false);
  });

  it('quien no manda en ninguna organización tampoco gestiona a nadie', async () => {
    const service = armar([[{ orgId: CLUB }], []]);
    await expect(service.isOrgManagerOf(MAESTRO, ALUMNO)).resolves.toBe(false);
  });
});
