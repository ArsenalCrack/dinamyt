/**
 * Afiliar un club a dedo: las cuatro puertas que tiene que cerrar.
 *
 * Este camino no le pregunta a nadie —lo abre el super-admin desde `/admin` y
 * el club queda dentro en el acto—, así que las comprobaciones son lo único
 * que hay entre un clic y toda la gente de un club abriendo (o perdiendo) las
 * apps que paga una federación. Ver `afiliarClubDirecto` en el servicio.
 *
 * Se prueba el SERVICIO y no la pantalla porque hay dos puertas a la misma
 * decisión —afiliar directo y aceptar una invitación— y el día que se añada
 * una tercera tiene que chocar con esto.
 */

// La capa de datos se sustituye entera: aquí se prueban las DECISIONES, no las
// consultas. Mismo truco que `ultimo-gestor.spec.ts`.
jest.mock('../../db', () => ({ db: {} }));

import { BadRequestException } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { OrgNotificationsService } from './org-notifications.service';
import { db } from '../../db';
import type { UsersService } from '../users/users.service';
import type { JwtTokenService } from '../auth/jwt.service';
import type { MailerService } from '../auth/mailer.service';

const FED = '11111111-1111-4111-8111-111111111111';
const OTRA_FED = '22222222-2222-4222-8222-222222222222';
const CLUB = '33333333-3333-4333-8333-333333333333';

/**
 * `db` de mentira. Drizzle encadena y solo resuelve al final, así que basta con
 * que cada eslabón se devuelva a sí mismo y el objeto sea `then`-able.
 *
 * `escrituras` es lo que de verdad importa aquí: que una afiliación rechazada
 * no haya tocado la fila. Un error que se lanza DESPUÉS de escribir no protege
 * de nada.
 */
function armar(lecturas: unknown[][]) {
  const cola = [...lecturas];
  const cuenta = { escrituras: 0 };

  const encadenar = (resolver: () => unknown) => {
    const eslabon: Record<string, unknown> = {};
    for (const metodo of ['from', 'where', 'limit', 'set', 'returning']) {
      eslabon[metodo] = () => eslabon;
    }
    eslabon.then = (fn: (v: unknown) => unknown) =>
      Promise.resolve(resolver()).then(fn);
    return eslabon;
  };

  const fake = db as unknown as Record<string, unknown>;
  fake.select = () => encadenar(() => cola.shift() ?? []);
  fake.update = () => {
    cuenta.escrituras++;
    return encadenar(() => [{ id: CLUB }]);
  };

  const service = new OrganizationsService(
    {} as UsersService,
    {} as JwtTokenService,
    {} as MailerService,
    // La campana del club. Estos tests miden lo que se ESCRIBE en la base, y
    // un aviso no es una escritura de las que vigilan: se sustituye por uno
    // que no hace nada para que no cuente ni pida una base de verdad.
    avisosDeMentira(),
  );
  return { service, cuenta };
}

/** Lo que lee `afiliarClubDirecto`, en orden: la federación y luego el club. */
const filas = (org: unknown, club: unknown) => [[org], [club]];

const FEDERACION = { id: FED, type: 'FEDERATION', parentId: null };
const CLUB_LIBRE = { id: CLUB, type: 'CLUB', parentId: null };

/** Una campana que no hace nada: estos tests no la ejercitan. */
function avisosDeMentira(): OrgNotificationsService {
  return {
    avisar: async () => {},
    resolverPor: async () => {},
  } as unknown as OrgNotificationsService;
}

describe('Afiliar un club a dedo (super-admin)', () => {
  it('un club sin federación entra, y la fila se escribe', async () => {
    const { service, cuenta } = armar(filas(FEDERACION, CLUB_LIBRE));
    await expect(service.afiliarClubDirecto(FED, CLUB)).resolves.toEqual({
      ok: true,
      orgId: FED,
      clubId: CLUB,
    });
    // Dos: la fila del club y la invitación que pudiera estar esperando.
    expect(cuenta.escrituras).toBe(2);
  });

  it('un club NO cuelga de otro club', async () => {
    const { service, cuenta } = armar(
      filas({ id: FED, type: 'CLUB', parentId: null }, CLUB_LIBRE),
    );
    await expect(service.afiliarClubDirecto(FED, CLUB)).rejects.toThrow(
      BadRequestException,
    );
    expect(cuenta.escrituras).toBe(0);
  });

  it('una federación no se afilia a otra por esta puerta', async () => {
    const { service, cuenta } = armar(
      filas(FEDERACION, { id: CLUB, type: 'FEDERATION', parentId: null }),
    );
    await expect(service.afiliarClubDirecto(FED, CLUB)).rejects.toThrow(
      /clubes o academias/i,
    );
    expect(cuenta.escrituras).toBe(0);
  });

  it('el que ya cuelga de OTRA federación no se mueve de un tirón', async () => {
    const { service, cuenta } = armar(
      filas(FEDERACION, { ...CLUB_LIBRE, parentId: OTRA_FED }),
    );
    // El mensaje dice qué hacer, no solo que no: el paso de en medio ES el
    // aviso de que a esa gente se le están quitando unos planes y dando otros.
    await expect(service.afiliarClubDirecto(FED, CLUB)).rejects.toThrow(
      /sácalo de ella primero/i,
    );
    expect(cuenta.escrituras).toBe(0);
  });

  it('el que ya está dentro no se afilia dos veces', async () => {
    const { service, cuenta } = armar(
      filas(FEDERACION, { ...CLUB_LIBRE, parentId: FED }),
    );
    await expect(service.afiliarClubDirecto(FED, CLUB)).rejects.toThrow(
      /ya pertenece a esta organización/i,
    );
    expect(cuenta.escrituras).toBe(0);
  });
});

describe('Sacar un club de su federación', () => {
  it('sale el que cuelga de ella', async () => {
    const { service, cuenta } = armar([[{ ...CLUB_LIBRE, parentId: FED }]]);
    await expect(service.desafiliarClub(FED, CLUB)).resolves.toEqual({
      ok: true,
      orgId: FED,
      clubId: CLUB,
    });
    expect(cuenta.escrituras).toBe(1);
  });

  it('no se puede sacar de una federación de la que no cuelga', async () => {
    // La comprobación que impide que una federación desafilie clubes ajenos —y
    // que un id copiado y pegado suelte a un club que no se estaba mirando.
    const { service, cuenta } = armar([[{ ...CLUB_LIBRE, parentId: OTRA_FED }]]);
    await expect(service.desafiliarClub(FED, CLUB)).rejects.toThrow(
      BadRequestException,
    );
    expect(cuenta.escrituras).toBe(0);
  });
});
