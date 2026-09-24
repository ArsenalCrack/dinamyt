/**
 * **El directorio de clubes para Campeonatos** (`GET /sync/clubes`, F5 de
 * PLAN-CAMPEONATOS).
 *
 * Campeonatos invita clubes a un campeonato, y el administrador los busca
 * aquí. Lo que estas pruebas defienden:
 *
 *  · La puerta: sin `ECOSYSTEM_SYNC_SECRET` la ruta no existe, y con el
 *    secreto equivocado no pasa. Es la misma de las demás rutas del espejo.
 *  · Que solo sale lo que el buscador del portal ya enseña: id, nombre y
 *    ciudad. Ni el padre, ni el tipo.
 *  · Que los afiliados a la federación que invita salen primero y marcados.
 */

jest.mock('../../db', () => ({ db: {} }));

import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { SyncController } from './sync.controller';
import type { OrganizationsService } from '../organizations/organizations.service';

const SECRETO = 'secreto-del-espejo';
const FEDE = 'fede0000-0000-4000-8000-000000000000';

function armar() {
  const busquedas: (string | undefined)[] = [];
  const orgs = {
    listarClubes: async (search?: string) => {
      busquedas.push(search);
      return [
        { id: 'c1', name: 'Dojang Sur', type: 'CLUB', city: 'Cali', parentId: null },
        { id: 'c2', name: 'Academia Norte', type: 'ACADEMY', city: null, parentId: FEDE },
        { id: 'c3', name: 'Club Centro', type: 'CLUB', city: 'Pasto', parentId: 'otra' },
      ];
    },
  } as unknown as OrganizationsService;
  return { controlador: new SyncController(orgs), busquedas };
}

describe('GET /sync/clubes', () => {
  const antes = process.env.ECOSYSTEM_SYNC_SECRET;
  afterEach(() => {
    process.env.ECOSYSTEM_SYNC_SECRET = antes;
  });

  it('sin el secreto configurado, la ruta no existe', async () => {
    delete process.env.ECOSYSTEM_SYNC_SECRET;
    const { controlador } = armar();
    await expect(controlador.clubes(SECRETO)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('con el secreto equivocado no pasa', async () => {
    process.env.ECOSYSTEM_SYNC_SECRET = SECRETO;
    const { controlador } = armar();
    await expect(controlador.clubes('otro')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('busca con lo que se escribe y devuelve solo id, nombre y ciudad', async () => {
    process.env.ECOSYSTEM_SYNC_SECRET = SECRETO;
    const { controlador, busquedas } = armar();
    const lista = await controlador.clubes(SECRETO, 'doj');
    expect(busquedas).toEqual(['doj']);
    expect(Object.keys(lista[0]).sort()).toEqual(['afiliado', 'city', 'id', 'name']);
    expect(lista.every((c) => c.afiliado === false)).toBe(true);
  });

  it('con federación, sus afiliados van primero y marcados', async () => {
    process.env.ECOSYSTEM_SYNC_SECRET = SECRETO;
    const { controlador } = armar();
    const lista = await controlador.clubes(SECRETO, undefined, FEDE);
    expect(lista.map((c) => c.id)).toEqual(['c2', 'c3', 'c1']);
    expect(lista[0].afiliado).toBe(true);
  });
});
