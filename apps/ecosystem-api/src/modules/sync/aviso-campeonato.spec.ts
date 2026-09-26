/**
 * **Invitaron al club a un campeonato** (`POST /sync/aviso-campeonato`,
 * punto 3 de lo que quedaba del plan de Campeonatos, 25 sep 2026).
 *
 * Campeonatos lo llama al invitar a un club del directorio, y el aviso llega a
 * la campana de sus gestores. Lo que se defiende:
 *
 *  · La puerta del secreto, como las demás rutas del espejo.
 *  · Que solo avisa a un CLUB que existe, con un id que es un uuid (si no, un
 *    500 de PostgreSQL).
 *  · Que la frase dice quién invita y a qué, recortada.
 */

jest.mock('../../db', () => ({ db: {} }));

import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { SyncController } from './sync.controller';
import { db } from '../../db';
import { textoDelAviso, destinoDelAviso } from '../../common/avisos-org';
import type { OrganizationsService } from '../organizations/organizations.service';
import type { OrgNotificationsService } from '../organizations/org-notifications.service';

const SECRETO = 'secreto-del-espejo';
const CLUB = '33333333-3333-4333-8333-333333333333';

function armar(org: unknown[] = [{ id: CLUB, type: 'CLUB' }]) {
  const avisados: unknown[] = [];
  let consultas = 0;
  (db as unknown as Record<string, unknown>).select = () => {
    consultas += 1;
    const eslabon: Record<string, unknown> = {};
    for (const m of ['from', 'where', 'limit']) eslabon[m] = () => eslabon;
    eslabon.then = (fn: (v: unknown) => unknown) => Promise.resolve(org).then(fn);
    return eslabon;
  };
  const avisos = {
    avisar: async (entrada: unknown) => {
      avisados.push(entrada);
    },
  } as unknown as OrgNotificationsService;
  const controlador = new SyncController({} as unknown as OrganizationsService, avisos);
  return { controlador, avisados, consultas: () => consultas };
}

const cuerpo = (extra: Record<string, unknown> = {}) => ({
  orgId: CLUB,
  campeonato: 'COPA NACIONAL',
  organiza: 'FEDERACIÓN DEL VALLE',
  ...extra,
});

describe('POST /sync/aviso-campeonato', () => {
  const antes = process.env.ECOSYSTEM_SYNC_SECRET;
  beforeEach(() => {
    process.env.ECOSYSTEM_SYNC_SECRET = SECRETO;
  });
  afterEach(() => {
    process.env.ECOSYSTEM_SYNC_SECRET = antes;
  });

  it('sin el secreto configurado no existe; con otro, no pasa', async () => {
    delete process.env.ECOSYSTEM_SYNC_SECRET;
    const a = armar();
    await expect(a.controlador.avisoCampeonato(SECRETO, cuerpo())).rejects.toBeInstanceOf(
      NotFoundException,
    );
    process.env.ECOSYSTEM_SYNC_SECRET = SECRETO;
    for (const secreto of ['otro', undefined]) {
      const b = armar();
      await expect(b.controlador.avisoCampeonato(secreto, cuerpo())).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(b.avisados).toEqual([]);
    }
  });

  it('un orgId que no es un uuid, o sin campeonato, es un 400 sin tocar la base', async () => {
    for (const extra of [{ orgId: 'nombre-del-club' }, { campeonato: '   ' }]) {
      const { controlador, consultas, avisados } = armar();
      await expect(
        controlador.avisoCampeonato(SECRETO, cuerpo(extra)),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(consultas()).toBe(0);
      expect(avisados).toEqual([]);
    }
  });

  it('solo a un club que existe', async () => {
    for (const org of [[], [{ id: CLUB, type: 'FEDERATION' }]]) {
      const { controlador, avisados } = armar(org);
      await expect(controlador.avisoCampeonato(SECRETO, cuerpo())).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(avisados).toEqual([]);
    }
  });

  it('avisa a la campana del club, con los textos recortados', async () => {
    const { controlador, avisados } = armar();

    const r = await controlador.avisoCampeonato(
      SECRETO,
      cuerpo({ campeonato: 'X'.repeat(500) }),
    );

    expect(r).toEqual({ avisado: true });
    expect(avisados).toEqual([
      {
        orgId: CLUB,
        kind: 'campeonato_invitacion',
        data: { campeonato: 'X'.repeat(120), organiza: 'FEDERACIÓN DEL VALLE' },
      },
    ]);
  });

  it('la frase dice quién invita y a qué, y lleva al panel', () => {
    expect(
      textoDelAviso('campeonato_invitacion', {
        club: 'Dojang Sur',
        organiza: 'FEDERACIÓN DEL VALLE',
        campeonato: 'COPA NACIONAL',
      }),
    ).toEqual({
      title: 'DINAMYT · Dojang Sur',
      body: 'FEDERACIÓN DEL VALLE invitó a tu club a COPA NACIONAL.',
    });
    expect(textoDelAviso('campeonato_invitacion', {}).body).toBe(
      'Una organización invitó a tu club a un campeonato.',
    );
    expect(destinoDelAviso('campeonato_invitacion', {})).toBe('/dashboard');
  });
});
