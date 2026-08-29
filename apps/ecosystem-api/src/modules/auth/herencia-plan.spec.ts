/**
 * Lo que el pase le abre a un maestro de club afiliado (decisión 11 del plan:
 * *la organización contrata y sus clubes heredan*).
 *
 * Se prueba aquí y no solo en `common/jerarquia.spec.ts` porque la cadena de
 * mando puede estar perfecta y el token seguir saliendo vacío: lo que decide
 * qué abre la persona es cómo se REPARTEN las suscripciones de la cadena entre
 * sus clubes, y de paso cuál de sus clubes acaba siendo el `org_id` del pase.
 */

jest.mock('../../db', () => ({ db: {} }));

import { AuthService } from './auth.service';
import { db } from '../../db';
import type { UsersService } from '../users/users.service';
import type { JwtTokenService, JwtPayload } from './jwt.service';
import type { MailerService } from './mailer.service';
import type { SessionsService } from './sessions.service';

const PERSONA = '11111111-1111-4111-8111-111111111111';
const CLUB = '22222222-2222-4222-8222-222222222222';
const OTRO_CLUB = '33333333-3333-4333-8333-333333333333';
const FEDERACION = '44444444-4444-4444-8444-444444444444';

/**
 * Un `db.select()…` de mentira que devuelve, EN ORDEN, lo que se le diga.
 * Mismo truco que `organizations/codigo-club.spec.ts`: cada eslabón se
 * devuelve a sí mismo y el objeto es `then`-able.
 */
function encadenar(resultados: unknown[][]) {
  const cola = [...resultados];
  const eslabon: Record<string, unknown> = {};
  for (const metodo of ['from', 'where', 'limit', 'orderBy', 'innerJoin']) {
    eslabon[metodo] = () => eslabon;
  }
  eslabon.then = (resolver: (v: unknown) => unknown) =>
    Promise.resolve(cola.shift() ?? []).then(resolver);
  return eslabon;
}

/**
 * Firma el pase de una persona con las respuestas de base de datos dadas, y
 * devuelve el payload que se habría firmado.
 *
 * El orden de `resultados` es el de las consultas de `buildToken`:
 *   1. pertenencias (`org_members`)
 *   2. una por cada nivel al subir por `parent_id` (`organizations`)
 *   3. suscripciones activas de toda la cadena
 *   4. suscripciones personales
 */
async function pase(resultados: unknown[][]): Promise<JwtPayload> {
  // Una sola cadena para todas las consultas: es la que lleva la cuenta de por
  // cuál va. Devolver una nueva en cada `select()` haría que todas contestaran
  // lo primero de la lista.
  const cadena = encadenar(resultados);
  const fake = db as unknown as Record<string, unknown>;
  fake.select = () => cadena;

  let firmado: JwtPayload | null = null;
  const jwt = {
    signToken: (p: JwtPayload) => {
      firmado = p;
      return 'token-de-mentira';
    },
  } as unknown as JwtTokenService;

  const service = new AuthService(
    {} as UsersService,
    jwt,
    {} as MailerService,
    {} as SessionsService,
  );

  await (
    service as unknown as {
      buildToken: (u: unknown, jti: string) => Promise<string>;
    }
  ).buildToken(
    { id: PERSONA, email: 'maestro@dinamyt.org', fullName: 'Maestro' },
    'sesion-1',
  );

  if (!firmado) throw new Error('No se firmó ningún pase.');
  return firmado;
}

describe('El plan de la federación llega a sus clubes', () => {
  it('el maestro de un club afiliado abre lo que paga su federación', async () => {
    const payload = await pase([
      // 1. es maestro de un club, y el club no paga nada
      [{ orgId: CLUB, role: 'maestro', roleCampeonatos: 'maestro' }],
      // 2. el club cuelga de la federación; la federación no cuelga de nadie
      [{ id: CLUB, parentId: FEDERACION }],
      [{ id: FEDERACION, parentId: null }],
      // 3. la que paga es la federación
      [{ orgId: FEDERACION, appsIncluded: ['campeonatos'] }],
      // 4. sin suscripción personal
      [],
    ]);

    expect(payload.app_scopes).toEqual(['campeonatos']);
    // Y sigue siendo maestro de SU club, no de la federación: heredar el plan
    // no mueve a nadie de sitio.
    expect(payload.org_id).toBe(CLUB);
    expect(payload.role_campeonatos).toBe('maestro');
  });

  it('el plan propio del club se SUMA al de la federación', async () => {
    const payload = await pase([
      [{ orgId: CLUB, role: 'maestro' }],
      [{ id: CLUB, parentId: FEDERACION }],
      [{ id: FEDERACION, parentId: null }],
      [
        { orgId: FEDERACION, appsIncluded: ['campeonatos'] },
        { orgId: CLUB, appsIncluded: ['membresias'] },
      ],
      [],
    ]);

    expect([...payload.app_scopes].sort()).toEqual([
      'campeonatos',
      'membresias',
    ]);
  });

  it('un club sin plan y sin federación no abre nada', async () => {
    const payload = await pase([
      [{ orgId: CLUB, role: 'maestro' }],
      [{ id: CLUB, parentId: null }],
      [],
      [],
    ]);

    expect(payload.app_scopes).toEqual([]);
    // La pertenencia manda aunque no haya plan: sin esto, la gente entraría al
    // portal sin club y las apps no sabrían quién es.
    expect(payload.org_id).toBe(CLUB);
  });

  it('entre dos clubes, el `org_id` es el que abre algo — aunque sea heredado', async () => {
    const payload = await pase([
      // El primero de la lista no paga ni cuelga de nadie; el segundo hereda.
      [
        { orgId: OTRO_CLUB, role: 'competitor' },
        { orgId: CLUB, role: 'maestro' },
      ],
      [
        { id: OTRO_CLUB, parentId: null },
        { id: CLUB, parentId: FEDERACION },
      ],
      [{ id: FEDERACION, parentId: null }],
      [{ orgId: FEDERACION, appsIncluded: ['campeonatos'] }],
      [],
    ]);

    expect(payload.org_id).toBe(CLUB);
    expect(payload.app_scopes).toEqual(['campeonatos']);
  });

  it('la herencia no sube: la federación no abre lo que paga su club', async () => {
    const payload = await pase([
      // Administra la federación, y quien paga es un club que cuelga de ella.
      [{ orgId: FEDERACION, role: 'admin' }],
      [{ id: FEDERACION, parentId: null }],
      [],
      [],
    ]);

    expect(payload.app_scopes).toEqual([]);
  });
});
