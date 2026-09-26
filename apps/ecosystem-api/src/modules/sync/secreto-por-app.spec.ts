/**
 * **Un secreto por app en `/sync/*`** (`common/secreto-sync.ts`).
 *
 * Hasta el 26 sep 2026 las tres apps compartían `ECOSYSTEM_SYNC_SECRET`, y
 * quien lo tuviera entraba a TODAS las rutas. Lo que estas pruebas sostienen:
 *
 * 1. Con el secreto de una app solo se entra a las rutas de esa app: el de
 *    Membresías no lee la gente de un club (`/sync/miembros`) ni el de
 *    Campeonatos apaga el acceso de nadie (`/sync/acceso`).
 * 2. `/sync/alta` es de quien firma: con el de Membresías no se crea un juez
 *    de Campeonatos.
 * 3. La transición no corta nada: el compartido sigue entrando mientras esté
 *    puesto aquí.
 * 4. Sin secreto para ninguna de las apps de una ruta, la ruta no existe.
 */

jest.mock('../../db', () => ({ db: {} }));

import { NotFoundException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { db } from '../../db';
import type { OrganizationsService } from '../organizations/organizations.service';
import { identificarLlamada, secretoParaFirmar } from '../../common/secreto-sync';

const DE_MEMBRESIAS = 'secreto-de-membresias';
const DE_CAMPEONATOS = 'secreto-de-campeonatos';
const COMPARTIDO = 'el-compartido-de-antes';
const CLUB = '33333333-3333-4333-8333-333333333333';
const PERSONA = '11111111-1111-4111-8111-111111111111';

const VARIABLES = [
  'ECOSYSTEM_SYNC_SECRET',
  'SYNC_SECRET_MEMBRESIAS',
  'SYNC_SECRET_CAMPEONATOS',
] as const;

function armar() {
  const verbos: string[] = [];
  const llamadas: unknown[][] = [];
  const encadenar = () => {
    const eslabon: Record<string, unknown> = {};
    for (const m of ['from', 'where', 'limit', 'returning', 'set', 'innerJoin', 'orderBy']) {
      eslabon[m] = () => eslabon;
    }
    eslabon.then = (fn: (v: unknown) => unknown) =>
      Promise.resolve([{ id: CLUB, type: 'CLUB' }]).then(fn);
    return eslabon;
  };
  const fake = db as unknown as Record<string, unknown>;
  for (const verbo of ['select', 'update', 'insert', 'delete']) {
    fake[verbo] = () => {
      verbos.push(verbo);
      return encadenar();
    };
  }
  const servicio = {
    inviteMember: (...args: unknown[]) => {
      llamadas.push(args);
      return Promise.resolve({ miembro: { userId: PERSONA }, cuenta: {}, invitacion: {} });
    },
    listarClubes: () => Promise.resolve([]),
  } as unknown as OrganizationsService;
  return { controlador: new SyncController(servicio), verbos, llamadas };
}

describe('Un secreto por app en /sync', () => {
  const originales: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const v of VARIABLES) {
      originales[v] = process.env[v];
      delete process.env[v];
    }
  });
  afterEach(() => {
    for (const v of VARIABLES) {
      if (originales[v] === undefined) delete process.env[v];
      else process.env[v] = originales[v];
    }
  });

  const porApp = () => {
    process.env.SYNC_SECRET_MEMBRESIAS = DE_MEMBRESIAS;
    process.env.SYNC_SECRET_CAMPEONATOS = DE_CAMPEONATOS;
  };

  // ── 1 · Cada secreto abre solo las rutas de su app ──────────────────────────

  it('el de Membresías no lee la gente de un club (/sync/miembros es de Campeonatos)', async () => {
    porApp();
    const { controlador, verbos } = armar();
    await expect(controlador.miembros(DE_MEMBRESIAS, PERSONA)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(verbos).toEqual([]);
  });

  it('el de Membresías no busca clubes ni avisa de campeonatos', async () => {
    porApp();
    const { controlador } = armar();
    await expect(controlador.clubes(DE_MEMBRESIAS)).rejects.toThrow(UnauthorizedException);
    await expect(
      controlador.avisoCampeonato(DE_MEMBRESIAS, { orgId: CLUB, campeonato: 'Copa' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('el de Campeonatos no apaga el acceso de nadie (/sync/acceso es de Membresías)', async () => {
    porApp();
    const { controlador, verbos } = armar();
    await expect(
      controlador.acceso(DE_CAMPEONATOS, {
        ecoSub: PERSONA,
        ecoOrgId: CLUB,
        activo: false,
      }),
    ).rejects.toThrow(UnauthorizedException);
    expect(verbos).toEqual([]);
  });

  it('cada uno entra a lo suyo', async () => {
    porApp();
    const { controlador } = armar();
    await expect(controlador.clubes(DE_CAMPEONATOS)).resolves.toEqual([]);
    await expect(
      controlador.acceso(DE_MEMBRESIAS, { ecoSub: PERSONA, ecoOrgId: CLUB, activo: true }),
    ).resolves.toMatchObject({ aplicado: true });
  });

  it('la apariencia es de las dos', async () => {
    porApp();
    const { controlador } = armar();
    await expect(controlador.leerApariencia(DE_MEMBRESIAS, PERSONA)).resolves.toBeDefined();
    await expect(controlador.leerApariencia(DE_CAMPEONATOS, PERSONA)).resolves.toBeDefined();
  });

  // ── 2 · El alta es de quien firma ───────────────────────────────────────────

  it('con el de Membresías no se pide un alta de Campeonatos', async () => {
    porApp();
    const { controlador, llamadas } = armar();
    await expect(
      controlador.alta(DE_MEMBRESIAS, { ecoOrgId: CLUB, email: 'j@x.com', role: 'juez', app: 'campeonatos' }),
    ).rejects.toThrow(UnauthorizedException);
    expect(llamadas).toEqual([]);
  });

  it('con el de Campeonatos, sin decir app, el alta es de Campeonatos (y solo jueces)', async () => {
    porApp();
    const { controlador, llamadas } = armar();
    // `student` es un rol de Membresías: desde Campeonatos no pasa.
    await expect(
      controlador.alta(DE_CAMPEONATOS, { ecoOrgId: CLUB, email: 'a@x.com', role: 'student' }),
    ).rejects.toThrow(BadRequestException);
    expect(llamadas).toEqual([]);

    await expect(
      controlador.alta(DE_CAMPEONATOS, { ecoOrgId: CLUB, email: 'j@x.com', role: 'juez' }),
    ).resolves.toMatchObject({ ecoSub: PERSONA });
    expect(llamadas[0][2]).toBe('judge');
  });

  it('con el de Membresías, el alumno sigue entrando como siempre', async () => {
    porApp();
    const { controlador, llamadas } = armar();
    await expect(
      controlador.alta(DE_MEMBRESIAS, { ecoOrgId: CLUB, email: 'a@x.com', role: 'student' }),
    ).resolves.toMatchObject({ ecoSub: PERSONA });
    expect(llamadas[0][2]).toBe('student');
  });

  // ── 3 · La transición ───────────────────────────────────────────────────────

  it('el compartido sigue entrando en todas mientras esté puesto', async () => {
    process.env.ECOSYSTEM_SYNC_SECRET = COMPARTIDO;
    const { controlador } = armar();
    await expect(controlador.clubes(COMPARTIDO)).resolves.toEqual([]);
    await expect(
      controlador.acceso(COMPARTIDO, { ecoSub: PERSONA, ecoOrgId: CLUB, activo: true }),
    ).resolves.toMatchObject({ aplicado: true });
  });

  it('y convive con los nuevos: una app ya cambiada y otra todavía no', async () => {
    process.env.ECOSYSTEM_SYNC_SECRET = COMPARTIDO;
    process.env.SYNC_SECRET_MEMBRESIAS = DE_MEMBRESIAS;
    expect(identificarLlamada(DE_MEMBRESIAS, ['membresias'])).toBe('membresias');
    expect(identificarLlamada(COMPARTIDO, ['campeonatos'])).toBe('compartido');
    expect(identificarLlamada(DE_MEMBRESIAS, ['campeonatos'])).toBe('rechazada');
  });

  it('el ecosistema firma lo que manda a Membresías con el suyo, y si no, con el compartido', () => {
    process.env.ECOSYSTEM_SYNC_SECRET = COMPARTIDO;
    expect(secretoParaFirmar('membresias')).toBe(COMPARTIDO);
    process.env.SYNC_SECRET_MEMBRESIAS = DE_MEMBRESIAS;
    expect(secretoParaFirmar('membresias')).toBe(DE_MEMBRESIAS);
    delete process.env.ECOSYSTEM_SYNC_SECRET;
    delete process.env.SYNC_SECRET_MEMBRESIAS;
    expect(secretoParaFirmar('membresias')).toBe('');
  });

  // ── 4 · Sin secreto, la ruta no existe ──────────────────────────────────────

  it('una ruta de Campeonatos no existe si solo Membresías tiene secreto', async () => {
    process.env.SYNC_SECRET_MEMBRESIAS = DE_MEMBRESIAS;
    const { controlador } = armar();
    await expect(controlador.clubes(DE_MEMBRESIAS)).rejects.toThrow(NotFoundException);
  });

  it('sin cabecera, 401 (y el centinela es undefined, no un valor por defecto)', () => {
    porApp();
    expect(identificarLlamada(undefined, ['membresias', 'campeonatos'])).toBe('rechazada');
    expect(identificarLlamada('', ['membresias'])).toBe('rechazada');
  });
});
