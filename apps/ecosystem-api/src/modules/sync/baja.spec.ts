/**
 * **Eliminar del club en Membresías saca también del club en el portal.**
 *
 * Es un solo gesto en dos sitios. Si el portal no se enterara, la persona
 * seguiría en `org_members`, la próxima alta del espejo le haría nacer una
 * ficha nueva en Membresías y el maestro la vería reaparecer.
 *
 * Lo que estas pruebas defienden: que la baja es la MISMA del portal (pasa por
 * `removeMember`, con su copia para readmitir y su regla de mando), que solo
 * la da quien gestiona el club, y que la puerta está cerrada sin el secreto.
 */

jest.mock('../../db', () => ({ db: {} }));

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { SyncController } from './sync.controller';
import { db } from '../../db';
import type { OrganizationsService } from '../organizations/organizations.service';

const SECRETO = 'secreto-del-espejo';
const CLUB = '33333333-3333-4333-8333-333333333333';
const ALUMNO = '11111111-1111-4111-8111-111111111111';
const MAESTRO = '22222222-2222-4222-8222-222222222222';

/** `db` que contesta a la búsqueda de quien pide la baja. */
function conActor(fila: unknown[]) {
  const eslabon: Record<string, unknown> = {};
  for (const m of ['from', 'where', 'limit']) eslabon[m] = () => eslabon;
  eslabon.then = (fn: (v: unknown) => unknown) => Promise.resolve(fila).then(fn);
  (db as unknown as Record<string, unknown>).select = () => eslabon;
}

function armar(orgs: Partial<OrganizationsService> = {}) {
  const llamadas: { gestor: unknown[][]; baja: unknown[][] } = { gestor: [], baja: [] };
  const servicio = {
    exigirGestorDe: async (...a: unknown[]) => {
      llamadas.gestor.push(a);
    },
    removeMember: async (...a: unknown[]) => {
      llamadas.baja.push(a);
      return { ok: true };
    },
    ...orgs,
  } as unknown as OrganizationsService;
  return { controlador: new SyncController(servicio), llamadas };
}

const cuerpo = (extra: Record<string, unknown> = {}) => ({
  ecoSub: ALUMNO,
  ecoOrgId: CLUB,
  porEcoSub: MAESTRO,
  ...extra,
});

describe('POST /sync/baja · el maestro sacó a alguien del club desde Membresías', () => {
  let secretoOriginal: string | undefined;
  beforeEach(() => {
    secretoOriginal = process.env.ECOSYSTEM_SYNC_SECRET;
    process.env.ECOSYSTEM_SYNC_SECRET = SECRETO;
    conActor([{ esSuper: false }]);
  });
  afterEach(() => {
    if (secretoOriginal === undefined) delete process.env.ECOSYSTEM_SYNC_SECRET;
    else process.env.ECOSYSTEM_SYNC_SECRET = secretoOriginal;
  });

  it('da la misma baja que el portal, con quien la pidió', async () => {
    const { controlador, llamadas } = armar();
    await expect(controlador.baja(SECRETO, cuerpo())).resolves.toEqual({
      encontrada: true,
      aplicado: true,
    });
    expect(llamadas.gestor).toEqual([[MAESTRO, CLUB, false]]);
    expect(llamadas.baja).toEqual([[CLUB, ALUMNO, MAESTRO]]);
  });

  it('quien no gestiona el club no saca a nadie', async () => {
    const { controlador, llamadas } = armar({
      exigirGestorDe: async () => {
        throw new ForbiddenException('No gestionas esta organización.');
      },
    });
    await expect(controlador.baja(SECRETO, cuerpo())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(llamadas.baja).toEqual([]);
  });

  it('el super-admin sí, aunque no sea del club', async () => {
    conActor([{ esSuper: true }]);
    const { controlador, llamadas } = armar();
    await controlador.baja(SECRETO, cuerpo());
    expect(llamadas.gestor).toEqual([[MAESTRO, CLUB, true]]);
  });

  it('quien ya no era del club: no es un error, el gesto ya está hecho', async () => {
    const { controlador } = armar({
      removeMember: async () => {
        throw new NotFoundException('Ese usuario no es miembro de la organización.');
      },
    });
    await expect(controlador.baja(SECRETO, cuerpo())).resolves.toEqual({
      encontrada: false,
      aplicado: false,
    });
  });

  it('la regla de mando del portal se respeta y llega a Membresías', async () => {
    const { controlador } = armar({
      removeMember: async () => {
        throw new ForbiddenException('No puedes dejar el club sin quien lo gestione.');
      },
    });
    await expect(controlador.baja(SECRETO, cuerpo())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('con la cuenta de quien lo pide desactivada, tampoco', async () => {
    conActor([{ esSuper: false, activo: false }]);
    const { controlador, llamadas } = armar();
    await expect(controlador.baja(SECRETO, cuerpo())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(llamadas.baja).toEqual([]);
  });

  it('sin cuenta de quien lo pide, no hay baja', async () => {
    conActor([]);
    const { controlador, llamadas } = armar();
    await expect(controlador.baja(SECRETO, cuerpo())).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(llamadas.baja).toEqual([]);
  });

  it('pide los tres ids, y que sean ids', async () => {
    const { controlador } = armar();
    await expect(
      controlador.baja(SECRETO, cuerpo({ porEcoSub: undefined })),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controlador.baja(SECRETO, cuerpo({ ecoSub: 'no-es-un-uuid' })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sin el secreto la puerta está cerrada', async () => {
    const { controlador, llamadas } = armar();
    await expect(controlador.baja('otro', cuerpo())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(llamadas.baja).toEqual([]);
  });
});
