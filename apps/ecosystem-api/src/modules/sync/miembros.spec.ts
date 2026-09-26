/**
 * **La gente del club del maestro** (`GET /sync/miembros`, punto 2 de lo que
 * quedaba del plan de Campeonatos, 25 sep 2026).
 *
 * El maestro inscribe en Campeonatos a los alumnos de su club y la ficha nace
 * enlazada a su cuenta de DINAMYT. Lo que estas pruebas defienden:
 *
 *  · La puerta del secreto, como las demás rutas del espejo.
 *  · Que la regla de QUIÉN puede ver a quién se comprueba aquí, no en
 *    Campeonatos: solo los clubes donde `maestro` es maestro o coach en
 *    Campeonatos. Ni una federación, ni un club donde solo compite.
 *  · Que sale lo que la ficha necesita y nada más: sin correo ni teléfono.
 *  · Que un id que no es un uuid es un 400 y no un 500 de PostgreSQL.
 */

jest.mock('../../db', () => ({ db: {} }));

import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { SyncController } from './sync.controller';
import { db } from '../../db';
import type { OrganizationsService } from '../organizations/organizations.service';

const SECRETO = 'secreto-del-espejo';
const MAESTRO = '22222222-2222-4222-8222-222222222222';
const ALUMNA = '44444444-4444-4444-8444-444444444444';
const CLUB = '33333333-3333-4333-8333-333333333333';

/** `db.select()` de mentira: cada llamada contesta lo siguiente de la cola. */
function armar(respuestas: unknown[][]) {
  const cola = [...respuestas];
  let consultas = 0;
  const encadenar = (resultado: unknown[]) => {
    const eslabon: Record<string, unknown> = {};
    for (const m of ['from', 'innerJoin', 'where', 'orderBy', 'limit']) {
      eslabon[m] = () => eslabon;
    }
    eslabon.then = (fn: (v: unknown) => unknown) => Promise.resolve(resultado).then(fn);
    return eslabon;
  };
  (db as unknown as Record<string, unknown>).select = () => {
    consultas += 1;
    return encadenar(cola.shift() ?? []);
  };
  const controlador = new SyncController({} as unknown as OrganizationsService);
  return { controlador, consultas: () => consultas };
}

const pertenencia = (extra: Record<string, unknown> = {}) => ({
  orgId: CLUB,
  role: 'maestro',
  roleCampeonatos: null,
  rolesCampeonatos: [],
  type: 'CLUB',
  name: 'DOJANG SUR',
  ...extra,
});

const alumna = (extra: Record<string, unknown> = {}) => ({
  sub: ALUMNA,
  fullName: 'LUZ MARINA',
  birthDate: new Date('2012-05-04T00:00:00.000Z'),
  gender: 'FEMENINO',
  documentId: '1088123456',
  isActive: true,
  orgId: CLUB,
  role: 'student',
  membresiasActivo: null,
  ...extra,
});

describe('GET /sync/miembros', () => {
  const antes = process.env.ECOSYSTEM_SYNC_SECRET;
  beforeEach(() => {
    process.env.ECOSYSTEM_SYNC_SECRET = SECRETO;
  });
  afterEach(() => {
    process.env.ECOSYSTEM_SYNC_SECRET = antes;
  });

  // ── La puerta ──────────────────────────────────────────────────────────────

  it('sin el secreto configurado la ruta no existe', async () => {
    delete process.env.ECOSYSTEM_SYNC_SECRET;
    const { controlador, consultas } = armar([]);
    await expect(controlador.miembros(SECRETO, MAESTRO)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(consultas()).toBe(0);
  });

  it('con el secreto equivocado no pasa, ni sin cabecera', async () => {
    for (const secreto of ['otro', undefined]) {
      const { controlador, consultas } = armar([]);
      await expect(controlador.miembros(secreto, MAESTRO)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(consultas()).toBe(0);
    }
  });

  it('un id que no es un uuid es un 400, no un 500 de la base', async () => {
    for (const [maestro, persona] of [
      ['', undefined],
      ["1' or '1'='1", undefined],
      [MAESTRO, 'no-soy-un-uuid'],
    ]) {
      const { controlador, consultas } = armar([]);
      await expect(
        controlador.miembros(SECRETO, maestro, persona),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(consultas()).toBe(0);
    }
  });

  // ── Quién puede ver a quién ────────────────────────────────────────────────

  it('quien solo compite en su club no ve a nadie', async () => {
    const { controlador, consultas } = armar([[pertenencia({ role: 'student' })]]);
    expect(await controlador.miembros(SECRETO, MAESTRO)).toEqual([]);
    expect(consultas()).toBe(1);
  });

  it('el admin de una federación tampoco: solo clubes', async () => {
    const { controlador } = armar([
      [pertenencia({ role: 'admin', type: 'FEDERATION' })],
    ]);
    expect(await controlador.miembros(SECRETO, MAESTRO)).toEqual([]);
  });

  it('el dueño a secas no es maestro en Campeonatos', async () => {
    const { controlador } = armar([[pertenencia({ role: 'owner' })]]);
    expect(await controlador.miembros(SECRETO, MAESTRO)).toEqual([]);
  });

  it('el coach marcado en Campeonatos sí', async () => {
    const { controlador } = armar([
      [pertenencia({ role: 'competitor', rolesCampeonatos: ['coach'] })],
      [alumna()],
    ]);
    expect(await controlador.miembros(SECRETO, MAESTRO)).toHaveLength(1);
  });

  // ── Qué sale ───────────────────────────────────────────────────────────────

  it('sale lo que la ficha necesita, sin correo ni teléfono', async () => {
    const { controlador } = armar([[pertenencia()], [alumna()]]);

    const [luz] = await controlador.miembros(SECRETO, MAESTRO);

    expect(luz).toEqual({
      sub: ALUMNA,
      fullName: 'LUZ MARINA',
      birthDate: '2012-05-04',
      gender: 'FEMENINO',
      documentId: '1088123456',
      club: { id: CLUB, name: 'DOJANG SUR' },
      sinAcceso: false,
    });
  });

  it('una cuenta desactivada no sale, y a quien Membresías cortó se le marca', async () => {
    const { controlador } = armar([
      [pertenencia()],
      [
        alumna({ isActive: false }),
        alumna({ sub: MAESTRO, fullName: 'OTRO', membresiasActivo: false }),
      ],
    ]);

    const lista = await controlador.miembros(SECRETO, MAESTRO);

    expect(lista.map((m) => [m.fullName, m.sinAcceso])).toEqual([['OTRO', true]]);
  });
});
