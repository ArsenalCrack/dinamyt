/**
 * La baja deja de ser un borrado y pasa a ser algo que se puede deshacer.
 *
 * ── El fallo, que no daba ningún error ──
 *
 * Quitar a alguien de un club BORRABA su fila de `org_members`, y con ella todo
 * lo que decía: el rol general, los tres roles por aplicación y desde cuándo
 * pertenecía. La persona desaparecía de la pantalla sin fecha y sin rastro. No
 * se podía saber a quién le había pasado, ni cuándo, ni quién lo hizo, ni
 * deshacerlo — y el botón que lo provoca está en la misma fila que el que
 * cambia el rol.
 *
 * Lo que se prueba aquí es exactamente eso: que antes de borrar se copia, y que
 * lo copiado alcanza para devolver a la persona **como estaba**. Readmitir «de
 * miembro» a quien era maestro es un fallo que no se ve hasta el día que
 * intenta hacer su trabajo y no puede.
 */

// La capa de datos se sustituye entera: aquí se prueban las DECISIONES del
// servicio, no las consultas. Mismo truco que `ultimo-gestor.spec.ts`.
jest.mock('../../db', () => ({ db: {} }));
// El espejo sale a la red; aquí solo interesa que se le llame.
jest.mock('../../common/espejo-membresias', () => ({
  espejarAlta: jest.fn(),
  espejarBaja: jest.fn(),
  espejarClub: jest.fn(),
  espejarRol: jest.fn(),
}));

import { NotFoundException } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { OrgNotificationsService } from './org-notifications.service';
import { espejarAlta } from '../../common/espejo-membresias';
import { db } from '../../db';
import type { UsersService } from '../users/users.service';
import type { JwtTokenService } from '../auth/jwt.service';
import type { MailerService } from '../auth/mailer.service';

const CLUB = '33333333-3333-4333-8333-333333333333';
const MAESTRO = '11111111-1111-4111-8111-111111111111';
const QUIEN = '22222222-2222-4222-8222-222222222222';

/**
 * `db` de mentira. Drizzle encadena y solo al final se resuelve, así que basta
 * con que cada eslabón se devuelva a sí mismo y el objeto sea `then`-able.
 *
 * Las lecturas van por una cola; los `insert` guardan lo que se les pasó, que
 * es justo lo que estas pruebas miran.
 */
function armar(lecturas: unknown[][], borrado: unknown[] = []) {
  const cola = [...lecturas];
  const insertados: unknown[] = [];
  const cuenta = { borradas: 0 };

  const encadenar = (resolver: () => unknown) => {
    const eslabon: Record<string, unknown> = {};
    for (const metodo of [
      'from',
      'where',
      'limit',
      'orderBy',
      'innerJoin',
      'returning',
      'set',
      'onConflictDoUpdate',
    ]) {
      eslabon[metodo] = () => eslabon;
    }
    eslabon.values = (v: unknown) => {
      insertados.push(v);
      return eslabon;
    };
    eslabon.then = (fn: (v: unknown) => unknown) =>
      Promise.resolve(resolver()).then(fn);
    return eslabon;
  };

  const fake = db as unknown as Record<string, unknown>;
  fake.select = () => encadenar(() => cola.shift() ?? []);
  fake.insert = () => encadenar(() => [{ id: 'fila' }]);
  fake.update = () => encadenar(() => [{ id: 'fila' }]);
  fake.delete = () => {
    cuenta.borradas++;
    return encadenar(() => borrado);
  };

  const service = new OrganizationsService(
    {} as UsersService,
    {} as JwtTokenService,
    {} as MailerService,
    { avisar: async () => {}, resolverPor: async () => {} } as unknown as OrgNotificationsService,
  );
  return { service, insertados, cuenta };
}

/** La fila que devuelve el DELETE de `org_members`: lo que la persona ERA. */
const FILA_BORRADA = {
  id: 'fila',
  role: 'maestro',
  roleMembresias: 'owner',
  roleCampeonatos: 'organizador',
  roleAcademy: null,
  membresiasActivo: true,
  joinedAt: new Date('2025-03-01T00:00:00Z'),
};

describe('Dar de baja guarda lo que se borra', () => {
  it('copia los cuatro roles y la antigüedad antes de borrar la fila', async () => {
    const { service, insertados } = armar(
      [
        [{ role: 'maestro' }], // la fila del miembro
        [{ name: 'Dojang Sur', isActive: true }], // el club
        [{ id: 'otra-fila' }], // sí queda otro que mande
      ],
      [FILA_BORRADA],
    );

    await expect(service.removeMember(CLUB, MAESTRO, QUIEN)).resolves.toEqual({
      ok: true,
    });

    // Lo que se guarda tiene que alcanzar para reconstruir la fila entera. Con
    // solo el `role` general, quien era maestro volvería de alumno.
    expect(insertados[0]).toMatchObject({
      orgId: CLUB,
      userId: MAESTRO,
      role: 'maestro',
      roleMembresias: 'owner',
      roleCampeonatos: 'organizador',
      membresiasActivo: true,
      joinedAt: FILA_BORRADA.joinedAt,
      removedByUserId: QUIEN,
    });
  });

  it('a quien no es miembro no le inventa una baja', async () => {
    const { service, insertados } = armar([[]], []);
    await expect(service.removeMember(CLUB, MAESTRO, QUIEN)).rejects.toThrow(
      /no es miembro/i,
    );
    expect(insertados).toHaveLength(0);
  });
});

describe('Readmitir devuelve a la persona como estaba', () => {
  /** La baja guardada, tal como la leería `readmitirMiembro`. */
  const BAJA = {
    id: 'baja-1',
    orgId: CLUB,
    userId: MAESTRO,
    role: 'maestro',
    roleMembresias: 'owner',
    roleCampeonatos: 'organizador',
    roleAcademy: null,
    membresiasActivo: true,
    joinedAt: new Date('2025-03-01T00:00:00Z'),
    removedAt: new Date('2026-09-01T00:00:00Z'),
    removedByUserId: QUIEN,
  };

  beforeEach(() => jest.clearAllMocks());

  it('reescribe la fila con los roles y la fecha de entrada guardados', async () => {
    const { service, insertados, cuenta } = armar([
      [BAJA], // la baja
      [], // no es miembro ahora mismo
      [{ email: 'ana@dojo.test', fullName: 'ANA GÓMEZ' }], // su cuenta
    ]);

    await expect(
      service.readmitirMiembro(CLUB, MAESTRO, QUIEN),
    ).resolves.toEqual({ ok: true, yaEraMiembro: false });

    expect(insertados[0]).toMatchObject({
      orgId: CLUB,
      userId: MAESTRO,
      role: 'maestro',
      roleMembresias: 'owner',
      roleCampeonatos: 'organizador',
      // La antigüedad es suya: readmitir no puede hacerla empezar de cero.
      joinedAt: BAJA.joinedAt,
    });
    // Y la baja se va de la bandeja: ya no es una baja.
    expect(cuenta.borradas).toBe(1);
  });

  it('avisa a Membresías, o vuelve al club aquí y sigue fuera allá', async () => {
    const { service } = armar([
      [BAJA],
      [],
      [{ email: 'ana@dojo.test', fullName: 'ANA GÓMEZ' }],
    ]);
    await service.readmitirMiembro(CLUB, MAESTRO, QUIEN);
    expect(espejarAlta).toHaveBeenCalledWith(
      MAESTRO,
      CLUB,
      expect.objectContaining({ email: 'ana@dojo.test', rolMembresias: 'owner' }),
    );
  });

  it('si volvió por otro camino, no la mete dos veces en el club', async () => {
    // Entró con el código del club mientras la bandeja estaba abierta. Una
    // segunda fila en `org_members` para la misma persona es una pertenencia
    // duplicada, y de ahí salen dos insignias distintas en la misma lista.
    const { service, insertados, cuenta } = armar([
      [BAJA],
      [{ id: 'ya-es-miembro' }],
    ]);

    await expect(
      service.readmitirMiembro(CLUB, MAESTRO, QUIEN),
    ).resolves.toEqual({ ok: true, yaEraMiembro: true });
    expect(insertados).toHaveLength(0);
    // Lo único que se hace es limpiar la baja, que ya no es verdad.
    expect(cuenta.borradas).toBe(1);
  });

  it('sin baja guardada no readmite a nadie', async () => {
    const { service, insertados } = armar([[]]);
    await expect(
      service.readmitirMiembro(CLUB, MAESTRO, QUIEN),
    ).rejects.toThrow(NotFoundException);
    expect(insertados).toHaveLength(0);
  });
});

describe('Olvidar una baja no devuelve a nadie al club', () => {
  it('solo borra el recuerdo: no crea ninguna pertenencia', async () => {
    const { service, insertados, cuenta } = armar([]);
    await expect(service.olvidarBaja(CLUB, MAESTRO)).resolves.toEqual({
      ok: true,
    });
    expect(insertados).toHaveLength(0);
    expect(cuenta.borradas).toBe(1);
  });
});
