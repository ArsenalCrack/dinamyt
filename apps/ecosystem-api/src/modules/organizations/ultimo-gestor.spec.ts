/**
 * Las dos reglas que sostienen el mando de una organización.
 *
 * Se prueban aparte porque el fallo que las motivó no dejaba rastro. Un clic en
 * la ✕ del panel sacó al MAESTRO de su propio club: el borrado salió bien, no
 * hubo error que leer, y el club quedó sin nadie que pudiera administrarlo —su
 * maestro incluido, porque el permiso cuelga de esa misma fila—. Viven en el
 * servicio y no en la pantalla justamente por eso: se entra por tres puertas
 * (la ✕, el desplegable de rol y el panel de Accesos) y cualquiera de las tres
 * hacía el mismo daño.
 *
 *   1 · **A sí mismo, nunca.** Aunque queden otros diez administradores: quien
 *       pulsa pierde su club en el acto y no puede deshacerlo.
 *   2 · **El último, tampoco.** Aunque lo haga otra persona con permiso: la
 *       organización se queda huérfana.
 *
 * Ninguna se deduce de la otra —la primera protege a la persona de sí misma, la
 * segunda a la organización de cualquiera— y por eso hay casos de las dos, más
 * los de la puerta por la que se sale cuando el club de verdad se cierra.
 */

// La capa de datos se sustituye entera: aquí se prueban las DECISIONES del
// servicio, no las consultas. Mismo truco que `codigo-club.spec.ts`.
jest.mock('../../db', () => ({ db: {} }));

import { ConflictException } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { db } from '../../db';
import type { UsersService } from '../users/users.service';
import type { JwtTokenService } from '../auth/jwt.service';
import type { MailerService } from '../auth/mailer.service';

const MAESTRO = '11111111-1111-4111-8111-111111111111';
const OTRO = '22222222-2222-4222-8222-222222222222';
const CLUB = '33333333-3333-4333-8333-333333333333';

/**
 * Lo que la regla CONSULTA, en orden: la fila del miembro, el club y «¿queda
 * otro que mande?». Sobra sin problema: la regla corta en cuanto sabe la
 * respuesta y lo que no llega a pedir se queda en la cola.
 */
function respuestas({
  rol,
  activo = true,
  hayOtro = false,
}: {
  rol: string;
  activo?: boolean;
  hayOtro?: boolean;
}) {
  return [
    [{ role: rol }],
    [{ name: 'Dojang Sur', isActive: activo }],
    hayOtro ? [{ id: 'otra-fila' }] : [],
  ];
}

/**
 * `db` de mentira. Drizzle encadena y solo al final se resuelve, así que basta
 * con que cada eslabón se devuelva a sí mismo y el objeto sea `then`-able.
 *
 * Las lecturas van por una cola y las ESCRITURAS por su propio carril, no por
 * la misma cola: la regla corta antes o después según el caso, y con un solo
 * carril lo que devolvía el `delete` dependía de cuántos `select` se hubieran
 * llegado a hacer — que es justo lo que cambia de un caso a otro.
 *
 * `borradas` y `escrituras` cuentan lo que llegó a la base: aquí lo que importa
 * no es solo el error, es que la fila SIGA ahí.
 */
function armar(lecturas: unknown[][], escritura: unknown[] = [{ id: 'fila' }]) {
  const cola = [...lecturas];
  const cuenta = { borradas: 0, escrituras: 0 };

  const encadenar = (resolver: () => unknown) => {
    const eslabon: Record<string, unknown> = {};
    for (const metodo of [
      'from',
      'where',
      'limit',
      'orderBy',
      'innerJoin',
      'values',
      'returning',
      'set',
    ]) {
      eslabon[metodo] = () => eslabon;
    }
    eslabon.then = (fn: (v: unknown) => unknown) =>
      Promise.resolve(resolver()).then(fn);
    return eslabon;
  };

  const fake = db as unknown as Record<string, unknown>;
  fake.select = () => encadenar(() => cola.shift() ?? []);
  fake.insert = () => encadenar(() => escritura);
  fake.update = () => {
    cuenta.escrituras++;
    return encadenar(() => escritura);
  };
  fake.delete = () => {
    cuenta.borradas++;
    return encadenar(() => escritura);
  };

  const service = new OrganizationsService(
    {} as UsersService,
    {} as JwtTokenService,
    {} as MailerService,
  );
  return { service, cuenta };
}

describe('Quitar a un miembro', () => {
  it('el único maestro del club NO se puede quitar', async () => {
    const { service, cuenta } = armar(respuestas({ rol: 'maestro' }));
    await expect(service.removeMember(CLUB, MAESTRO)).rejects.toThrow(
      ConflictException,
    );
    // Lo que de verdad se prueba: la fila sigue en su sitio.
    expect(cuenta.borradas).toBe(0);
  });

  it('el mensaje dice qué hacer, no solo que no', async () => {
    const { service } = armar(respuestas({ rol: 'maestro' }));
    await expect(service.removeMember(CLUB, MAESTRO)).rejects.toThrow(
      /nombra antes a otro maestro/i,
    );
  });

  it('con otro maestro en el club, quitarlo es normal y corriente', async () => {
    const { service, cuenta } = armar(
      respuestas({ rol: 'maestro', hayOtro: true }),
      [{ id: 'fila', role: 'maestro' }], // lo que devuelve el DELETE
    );
    await expect(service.removeMember(CLUB, MAESTRO)).resolves.toEqual({
      ok: true,
    });
    expect(cuenta.borradas).toBe(1);
  });

  it('a un alumno no lo protege nadie: la regla es sobre el mando', async () => {
    const { service, cuenta } = armar(respuestas({ rol: 'student' }), [
      { id: 'fila', role: 'student' },
    ]);
    await expect(service.removeMember(CLUB, OTRO)).resolves.toEqual({
      ok: true,
    });
    expect(cuenta.borradas).toBe(1);
  });

  /**
   * La salida. `remove()` exige que la organización esté vacía, así que sin
   * esta puerta un club no se podría cerrar jamás: la regla impediría sacar al
   * último maestro y la falta de sitio libre impediría borrarlo.
   */
  it('sobre un club DESACTIVADO la regla se levanta: así se puede cerrar', async () => {
    const { service, cuenta } = armar(
      respuestas({ rol: 'maestro', activo: false }),
      [{ id: 'fila', role: 'maestro' }],
    );
    await expect(service.removeMember(CLUB, MAESTRO)).resolves.toEqual({
      ok: true,
    });
    expect(cuenta.borradas).toBe(1);
  });

  it('a quien no es miembro lo despacha el 404 de siempre, no esta regla', async () => {
    // Sin fila de miembro, y el DELETE tampoco encuentra nada que borrar.
    const { service } = armar([[]], []);
    await expect(service.removeMember(CLUB, OTRO)).rejects.toThrow(
      /no es miembro/i,
    );
  });
});

describe('Quitarse a uno mismo', () => {
  /**
   * El caso que la 2 no cubre: el club tiene OTRO administrador, así que no se
   * queda huérfano — pero el maestro que pulsa se queda fuera de su propio club
   * y sin forma de volver, porque el permiso que necesitaría es el que acaba de
   * borrar.
   */
  it('el maestro no se saca a sí mismo, ni con otro admin en el club', async () => {
    const { service, cuenta } = armar(
      respuestas({ rol: 'maestro', hayOtro: true }),
    );
    await expect(service.removeMember(CLUB, MAESTRO, MAESTRO)).rejects.toThrow(
      ConflictException,
    );
    expect(cuenta.borradas).toBe(0);
  });

  it('el mensaje le dice a quién pedírselo', async () => {
    const { service } = armar(respuestas({ rol: 'maestro', hayOtro: true }));
    await expect(service.removeMember(CLUB, MAESTRO, MAESTRO)).rejects.toThrow(
      /que te saque otra persona|super administrador/i,
    );
  });

  it('tampoco se degrada a sí mismo a alumno', async () => {
    const { service, cuenta } = armar(
      respuestas({ rol: 'maestro', hayOtro: true }),
    );
    await expect(
      service.updateMemberRole(CLUB, MAESTRO, 'competitor', MAESTRO),
    ).rejects.toThrow(ConflictException);
    expect(cuenta.escrituras).toBe(0);
  });

  it('pero sí puede pasarse de maestro a admin: sigue mandando', async () => {
    const { service, cuenta } = armar(
      respuestas({ rol: 'maestro', hayOtro: true }),
      [{ id: 'fila', role: 'admin' }],
    );
    await expect(
      service.updateMemberRole(CLUB, MAESTRO, 'admin', MAESTRO),
    ).resolves.toMatchObject({ role: 'admin' });
    expect(cuenta.escrituras).toBe(1);
  });

  /** Sacar a otro es lo normal: la regla es sobre uno mismo, no sobre el rol. */
  it('a OTRA persona sí la saca, y por eso la regla no estorba', async () => {
    const { service, cuenta } = armar(
      respuestas({ rol: 'maestro', hayOtro: true }),
      [{ id: 'fila', role: 'maestro' }],
    );
    await expect(service.removeMember(CLUB, MAESTRO, OTRO)).resolves.toEqual({
      ok: true,
    });
    expect(cuenta.borradas).toBe(1);
  });

  it('un alumno que se va no rompe nada: la regla es sobre el mando', async () => {
    const { service, cuenta } = armar(respuestas({ rol: 'student' }), [
      { id: 'fila', role: 'student' },
    ]);
    await expect(service.removeMember(CLUB, OTRO, OTRO)).resolves.toEqual({
      ok: true,
    });
    expect(cuenta.borradas).toBe(1);
  });

  /** La misma puerta de siempre: un club desactivado se está cerrando. */
  it('sobre un club DESACTIVADO sí puede salirse solo', async () => {
    const { service, cuenta } = armar(
      respuestas({ rol: 'maestro', activo: false, hayOtro: true }),
      [{ id: 'fila', role: 'maestro' }],
    );
    await expect(service.removeMember(CLUB, MAESTRO, MAESTRO)).resolves.toEqual(
      {
        ok: true,
      },
    );
    expect(cuenta.borradas).toBe(1);
  });
});

describe('Cambiar el rol de un miembro', () => {
  it('degradar al único maestro es la misma avería con otro botón', async () => {
    const { service, cuenta } = armar(respuestas({ rol: 'maestro' }));
    await expect(
      service.updateMemberRole(CLUB, MAESTRO, 'competitor'),
    ).rejects.toThrow(ConflictException);
    expect(cuenta.escrituras).toBe(0);
  });

  it('de maestro a admin no degrada a nadie: los dos mandan', async () => {
    const { service, cuenta } = armar(respuestas({ rol: 'maestro' }), [
      { id: 'fila', role: 'admin' },
    ]);
    await expect(
      service.updateMemberRole(CLUB, MAESTRO, 'admin'),
    ).resolves.toMatchObject({ role: 'admin' });
    expect(cuenta.escrituras).toBe(1);
  });

  it('ascender a un alumno no pregunta nada', async () => {
    const { service, cuenta } = armar(respuestas({ rol: 'student' }), [
      { id: 'fila', role: 'maestro' },
    ]);
    await expect(
      service.updateMemberRole(CLUB, OTRO, 'maestro'),
    ).resolves.toMatchObject({ role: 'maestro' });
    expect(cuenta.escrituras).toBe(1);
  });
});
