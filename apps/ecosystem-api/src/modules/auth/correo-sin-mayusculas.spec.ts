jest.mock('../../db', () => ({ db: {} }));

import { db } from '../../db';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { normalizarCorreo, validarCorreo } from '../../common/validacion';
import type { JwtTokenService } from './jwt.service';
import type { MailerService } from './mailer.service';
import type { SessionsService } from './sessions.service';

/**
 * ── El correo no distingue mayúsculas. La app tampoco. ──────────────────────
 *
 * El fallo que esto cierra es de los que no parecen un fallo. La persona se
 * registraba —el alta ya guardaba el correo en minúsculas— y al día siguiente
 * volvía a entrar desde el celular. El teclado de Android le ponía la primera
 * letra en mayúscula, como hace con todo, y ella no lo notaba: `Juan@gmail.com`
 * no se ve raro, así se escriben los nombres. Y la app le contestaba:
 *
 *     «No existe una cuenta con ese correo. Revísalo o regístrate.»
 *
 * Que es mentira, y de la peor clase: la manda a registrarse otra vez con el
 * correo que YA tiene, donde se estrella contra «ya existe una cuenta con ese
 * correo». La persona se queda dando vueltas sin ninguna pista de qué pasa.
 *
 * Ningún proveedor de correo del mundo real entrega `Juan@gmail.com` a un buzón
 * distinto de `juan@gmail.com`. Así que la regla es una sola y va en los dos
 * lados: **se guarda en minúsculas y se busca en minúsculas**.
 */

// ── Lo que de verdad viaja a la consulta ────────────────────────────────────
// Un `eq(users.email, x)` de Drizzle es un objeto con trozos; el valor está en
// los `Param`, que se reconocen porque llevan `value` Y `encoder` (el trozo de
// texto literal ` = ` también tiene `value`, y sin el `encoder` se colaría).
function valoresDe(condicion: unknown): unknown[] {
  const trozos =
    (condicion as { queryChunks?: unknown[] } | null)?.queryChunks ?? [];
  return trozos
    .filter(
      (t): t is { value: unknown } =>
        typeof t === 'object' && t !== null && 'value' in t && 'encoder' in t,
    )
    .map((t) => t.value);
}

/**
 * Un `db` de mentira que apunta CON QUÉ se preguntó y contesta lo que se le
 * haya dejado en la cola. Drizzle encadena y solo resuelve al final, así que
 * basta con que cada eslabón se devuelva a sí mismo.
 */
function armarDb(filas: unknown[][] = []) {
  const cola = [...filas];
  const condiciones: unknown[] = [];

  const encadenar = () => {
    const eslabon: Record<string, unknown> = {};
    for (const metodo of ['from', 'limit', 'set', 'returning', 'values']) {
      eslabon[metodo] = () => eslabon;
    }
    eslabon.where = (c: unknown) => {
      condiciones.push(c);
      return eslabon;
    };
    eslabon.then = (fn: (v: unknown) => unknown) =>
      Promise.resolve(cola.shift() ?? []).then(fn);
    return eslabon;
  };

  const fake = db as unknown as Record<string, unknown>;
  fake.select = encadenar;
  fake.update = encadenar;
  fake.insert = encadenar;
  fake.delete = encadenar;

  return { condiciones, correoPreguntado: () => valoresDe(condiciones[0])[0] };
}

describe('normalizarCorreo · sin espacios y en minúsculas', () => {
  it('el mismo correo se escriba como se escriba', () => {
    expect(normalizarCorreo('Juan@Gmail.com')).toBe('juan@gmail.com');
    expect(normalizarCorreo('  ANA.PEREZ+club@GMAIL.COM  ')).toBe(
      'ana.perez+club@gmail.com',
    );
    expect(normalizarCorreo('maestro@dinamyt.org')).toBe('maestro@dinamyt.org');
  });

  it('no rechaza nada, que es lo que lo separa de `validarCorreo`', () => {
    // Buscar no es dar de alta: si el correo es imposible, lo dice la consulta
    // al no encontrar nada, no un 400 en la cara de quien intenta entrar.
    expect(() => validarCorreo('pepito')).toThrow();
    expect(normalizarCorreo('Pepito')).toBe('pepito');
    expect(normalizarCorreo(null)).toBe('');
    expect(normalizarCorreo(undefined)).toBe('');
  });
});

describe('UsersService · la búsqueda baja el correo a minúsculas', () => {
  it('findByEmail pregunta por el correo normalizado', async () => {
    const { correoPreguntado } = armarDb([[{ id: 'u1' }]]);
    const users = new UsersService();

    await users.findByEmail('  Juan@Gmail.COM ');

    expect(correoPreguntado()).toBe('juan@gmail.com');
  });

  it('registroPendientePorCorreo, igual', async () => {
    const { correoPreguntado } = armarDb([[{ id: 'p1' }]]);
    const users = new UsersService();

    await users.registroPendientePorCorreo('Nueva.Alumna@Gmail.com');

    expect(correoPreguntado()).toBe('nueva.alumna@gmail.com');
  });
});

describe('AuthService · el login con mayúsculas entra', () => {
  const CUENTA = {
    id: 'u1',
    email: 'juan@gmail.com',
    passwordHash: 'hash',
    isEmailVerified: true,
    isActive: true,
    failedLoginAttempts: 0,
    lockedUntil: null,
    passwordOrigen: 'propio',
  };

  /**
   * El `UsersService` usa el `findByEmail` DE VERDAD contra el `db` de mentira:
   * si se lo sustituyera por un `jest.fn()`, el test pasaría aunque la
   * normalización no existiera —que es justo el fallo que se está cerrando—.
   */
  function armar(filaGuardada: Record<string, unknown> | null) {
    armarDb([filaGuardada ? [filaGuardada] : []]);
    const users = new UsersService();
    users.verifyPassword = jest.fn().mockResolvedValue(true);

    const service = new AuthService(
      users,
      {} as JwtTokenService,
      {} as MailerService,
      {} as SessionsService,
    );
    jest
      .spyOn(
        service as unknown as { abrirSesion: () => Promise<unknown> },
        'abrirSesion',
      )
      .mockResolvedValue({ access_token: 'token-de-sesion' });
    return service;
  }

  it('la cuenta guardada en minúsculas se encuentra tecleando mayúsculas', async () => {
    const service = armar(CUENTA);
    await expect(service.login('Juan@Gmail.com', 'ClaveDeVerdad9')).resolves.toEqual(
      { access_token: 'token-de-sesion' },
    );
  });

  it('y con espacios pegados del portapapeles, también', async () => {
    const service = armar(CUENTA);
    await expect(
      service.login('  juan@gmail.com  ', 'ClaveDeVerdad9'),
    ).resolves.toEqual({ access_token: 'token-de-sesion' });
  });

  it('un correo que de verdad no existe sigue diciéndolo', async () => {
    const service = armar(null);
    await expect(service.login('otra@gmail.com', 'x')).rejects.toThrow(
      /No existe una cuenta/,
    );
  });
});
