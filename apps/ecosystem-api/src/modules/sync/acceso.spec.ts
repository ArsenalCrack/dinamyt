/**
 * **El acceso a una app y la pertenencia al club son cosas distintas.**
 *
 * ── El hueco que cierra esta ruta ──
 *
 * Era un hueco conocido y apuntado: un alumno con el acceso retirado en
 * Membresías choca contra un 403 al entrar, **pero el portal no lo sabía** —
 * `org_members` no tenía dónde apuntarlo— y le seguía enseñando su tarjeta de
 * «Entrar a Membresías». Dos personas quedaban a ciegas a la vez: el alumno,
 * que pulsaba un botón que prometía algo que ya no era verdad y acababa en un
 * error sin explicación; y su maestro, que en la lista de su gente veía a esa
 * persona exactamente igual que a las demás.
 *
 * ── Lo que estas pruebas defienden ──
 *
 * Que el aviso **escribe la marca y nada más**: no borra la pertenencia. Perder
 * el acceso a una aplicación no es irse del club — esa persona sigue siendo del
 * club para Campeonatos, para Academy y para su propia cuenta. Darla de baja de
 * verdad es otro gesto, deliberado, en el portal.
 *
 * Y que la puerta está cerrada: sin el secreto compartido esta ruta reescribe
 * el acceso de cualquiera a base de adivinar dos UUID.
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
const CLUB = '33333333-3333-4333-8333-333333333333';
const ALUMNO = '11111111-1111-4111-8111-111111111111';

/**
 * `db` de mentira. `puestos` guarda lo que llegó a cada `.set()` y `verbos`,
 * qué operaciones se pidieron: entre las dos se ve si esto escribió una marca
 * o borró una fila.
 */
function armar(devuelve: unknown[] = [{ id: 'x' }]) {
  const puestos: Record<string, unknown>[] = [];
  const verbos: string[] = [];

  const encadenar = (resolver: () => unknown) => {
    const eslabon: Record<string, unknown> = {};
    for (const metodo of ['from', 'where', 'limit', 'returning']) {
      eslabon[metodo] = () => eslabon;
    }
    eslabon.set = (v: Record<string, unknown>) => {
      puestos.push(v);
      return eslabon;
    };
    eslabon.then = (fn: (v: unknown) => unknown) =>
      Promise.resolve(resolver()).then(fn);
    return eslabon;
  };

  const fake = db as unknown as Record<string, unknown>;
  for (const verbo of ['select', 'update', 'insert', 'delete']) {
    fake[verbo] = () => {
      verbos.push(verbo);
      return encadenar(() => devuelve);
    };
  }

  return {
    controlador: new SyncController({} as OrganizationsService),
    puestos,
    verbos,
  };
}

const cuerpo = (extra: Record<string, unknown> = {}) => ({
  ecoSub: ALUMNO,
  ecoOrgId: CLUB,
  app: 'membresias',
  activo: false,
  ...extra,
});

describe('POST /sync/acceso · Membresías le cortó el acceso a alguien', () => {
  let secretoOriginal: string | undefined;
  beforeEach(() => {
    secretoOriginal = process.env.ECOSYSTEM_SYNC_SECRET;
    process.env.ECOSYSTEM_SYNC_SECRET = SECRETO;
  });
  afterEach(() => {
    if (secretoOriginal === undefined) delete process.env.ECOSYSTEM_SYNC_SECRET;
    else process.env.ECOSYSTEM_SYNC_SECRET = secretoOriginal;
  });

  it('apunta la marca en la pertenencia', async () => {
    const { controlador, puestos } = armar();
    const r = await controlador.acceso(SECRETO, cuerpo());

    expect(r).toEqual({ encontrada: true, aplicado: true });
    expect(puestos).toEqual([{ membresiasActivo: false }]);
  });

  it('devolver el acceso escribe `true`, no borra la marca', async () => {
    // Un `null` volvería a significar «no consta», y entonces el portal no
    // podría distinguir a quien recuperó el acceso de quien nunca tuvo ficha.
    const { controlador, puestos } = armar();
    await controlador.acceso(SECRETO, cuerpo({ activo: true }));
    expect(puestos).toEqual([{ membresiasActivo: true }]);
  });

  /** La regla de producto entera, en un aserto. */
  it('NO lo saca de la organización: solo actualiza, nunca borra', async () => {
    const { controlador, verbos } = armar();
    await controlador.acceso(SECRETO, cuerpo());
    expect(verbos).toEqual(['update']);
    expect(verbos).not.toContain('delete');
  });

  it('sin pertenencia no es un error, pero se dice que no llegó a nadie', async () => {
    // Pasa de verdad: alguien con ficha en un club de Membresías que aquí no
    // es miembro de esa organización. Contestar 404 haría que el otro lado lo
    // registrara como fallo del aviso, y no lo es.
    const { controlador } = armar([]);
    const r = await controlador.acceso(SECRETO, cuerpo());
    expect(r).toEqual({ encontrada: false, aplicado: false });
  });

  it('sin el secreto configurado, la ruta no existe', async () => {
    delete process.env.ECOSYSTEM_SYNC_SECRET;
    const { controlador, verbos } = armar();
    await expect(controlador.acceso(SECRETO, cuerpo())).rejects.toThrow(
      NotFoundException,
    );
    expect(verbos).toEqual([]);
  });

  it('con el secreto equivocado no escribe nada', async () => {
    const { controlador, verbos } = armar();
    await expect(controlador.acceso('otro-cualquiera', cuerpo())).rejects.toThrow(
      UnauthorizedException,
    );
    expect(verbos).toEqual([]);
  });

  it('el acceso es de UN club: sin `ecoOrgId` se rechaza', async () => {
    const { controlador } = armar();
    await expect(
      controlador.acceso(SECRETO, cuerpo({ ecoOrgId: '' })),
    ).rejects.toThrow(BadRequestException);
  });

  /**
   * Hoy solo hay una app con interruptor de acceso, y una columna donde
   * apuntarlo. Un nombre desconocido tiene que rebotar en vez de acabar
   * escribiendo en la columna de otra: el día que haya dos, un error de dedo
   * apagaría a alguien en la aplicación equivocada.
   */
  it('una app que este portal no lleva se rechaza', async () => {
    const { controlador, verbos } = armar();
    await expect(
      controlador.acceso(SECRETO, cuerpo({ app: 'campeonatos' })),
    ).rejects.toThrow(BadRequestException);
    expect(verbos).toEqual([]);
  });

  it('`activo` tiene que venir, y como booleano', async () => {
    const { controlador } = armar();
    await expect(
      controlador.acceso(SECRETO, cuerpo({ activo: undefined })),
    ).rejects.toThrow(BadRequestException);
    await expect(
      controlador.acceso(SECRETO, cuerpo({ activo: 'no' as unknown as boolean })),
    ).rejects.toThrow(BadRequestException);
  });
});
