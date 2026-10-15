/**
 * **Borrar mi cuenta: las reglas, y el orden.**
 *
 * La limpieza de la base se ensaya contra un PostgreSQL de verdad
 * (`supresion:ensayo`). Aquí va lo que la rodea, con la base simulada:
 *
 * · Pedirlo exige la contraseña y la palabra, no lo puede hacer un super
 *   administrador ni la única persona que administra un club, y al pedirlo se
 *   cierran todas las sesiones y se avisa al correo.
 * · Hacerlo va en orden: Membresías, Campeonatos y Academy primero. Si una no
 *   confirma, aquí no se borra nada y la cuenta espera a mañana entera.
 * · Vencido el plazo ya no se cancela, ni se vuelve a pedir: el barrido puede
 *   estar a medias.
 */

jest.mock('../../db', () => ({ db: {} }));
jest.mock('./pedir-a-las-apps', () => ({
  ...jest.requireActual('./pedir-a-las-apps'),
  pedirSupresion: jest.fn(),
}));
jest.mock('./borrar-de-la-base', () => ({ borrarDeLaBase: jest.fn() }));

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { db } from '../../db';
import { pedirSupresion, type AppQueBorra } from './pedir-a-las-apps';
import { borrarDeLaBase } from './borrar-de-la-base';
import { DIAS_DE_GRACIA, SupresionService } from './supresion.service';
import type { UsersService } from '../users/users.service';
import type { SessionsService } from '../auth/sessions.service';
import type { OrganizationsService } from '../organizations/organizations.service';
import type { MailerService } from '../auth/mailer.service';

const ANA = '11111111-1111-4111-8111-111111111111';

/** La base simulada: cada consulta que se espera devuelve la siguiente respuesta. */
function base(respuestas: unknown[][]) {
  const puestos: Record<string, unknown>[] = [];
  const cola = [...respuestas];
  const eslabon = (): Record<string, unknown> => {
    const e: Record<string, unknown> = {};
    for (const m of ['from', 'where', 'limit', 'returning', 'innerJoin', 'for']) e[m] = () => e;
    e.set = (v: Record<string, unknown>) => {
      puestos.push(v);
      return e;
    };
    e.then = (fn: (v: unknown) => unknown) => Promise.resolve(cola.shift() ?? []).then(fn);
    return e;
  };
  const fake = db as unknown as Record<string, unknown>;
  fake.select = () => eslabon();
  fake.update = () => eslabon();
  fake.transaction = (fn: (tx: unknown) => unknown) => fn(fake);
  return { puestos };
}

function armar({
  contrasenaBuena = true,
  sinMando = [] as string[],
} = {}) {
  const llamadas = { revocar: [] as unknown[][], correo: [] as unknown[] };
  const servicio = new SupresionService(
    { verifyPassword: async () => contrasenaBuena } as unknown as UsersService,
    {
      revocarTodas: async (...a: unknown[]) => {
        llamadas.revocar.push(a);
        return 2;
      },
    } as unknown as SessionsService,
    { dondeEsElUnicoGestor: async () => sinMando } as unknown as OrganizationsService,
    {
      avisarBorradoProgramado: async (d: unknown) => {
        llamadas.correo.push(d);
        return true;
      },
    } as unknown as MailerService,
  );
  return { servicio, llamadas };
}

const ana = (extra: Record<string, unknown> = {}) => ({
  id: ANA,
  email: 'ana@correo.com',
  fullName: 'ANA PÉREZ',
  passwordHash: 'hash',
  isSuperAdmin: false,
  timezone: 'America/Bogota',
  borradaEl: null,
  ...extra,
});

describe('SupresionService.pedir', () => {
  it('con contraseña y palabra: programa el borrado a 7 días, cierra las sesiones y avisa', async () => {
    const { puestos } = base([[ana()], []]);
    const { servicio, llamadas } = armar();
    const antes = Date.now();
    const { borrarEl } = await servicio.pedir(ANA, { contrasena: 'clave', confirmacion: 'borrar' });

    const dias = (borrarEl.getTime() - antes) / 86_400_000;
    expect(dias).toBeGreaterThan(DIAS_DE_GRACIA - 0.01);
    expect(dias).toBeLessThan(DIAS_DE_GRACIA + 0.01);
    expect(puestos[0].borrarEl).toEqual(borrarEl);
    expect(llamadas.revocar).toEqual([[ANA, 'borrado']]);
    await new Promise((r) => setImmediate(r));
    expect(llamadas.correo).toHaveLength(1);
  });

  it('sin la palabra, no', async () => {
    base([[ana()]]);
    const { servicio, llamadas } = armar();
    await expect(servicio.pedir(ANA, { contrasena: 'clave', confirmacion: 'si' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(llamadas.revocar).toEqual([]);
  });

  it('con la contraseña mal, no (y 400, no 401: el portal no te saca)', async () => {
    const { puestos } = base([[ana()]]);
    const { servicio, llamadas } = armar({ contrasenaBuena: false });
    await expect(servicio.pedir(ANA, { contrasena: 'otra', confirmacion: 'BORRAR' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(puestos).toEqual([]);
    expect(llamadas.revocar).toEqual([]);
  });

  it('un super administrador, no', async () => {
    base([[ana({ isSuperAdmin: true })]]);
    const { servicio } = armar();
    await expect(servicio.pedir(ANA, { contrasena: 'clave', confirmacion: 'BORRAR' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('la única persona que administra un club, no, y se le dice cuál', async () => {
    const { puestos } = base([[ana()]]);
    const { servicio } = armar({ sinMando: ['Club Tigres'] });
    await expect(servicio.pedir(ANA, { contrasena: 'clave', confirmacion: 'BORRAR' })).rejects.toThrow(
      /Club Tigres/,
    );
    expect(puestos).toEqual([]);
  });

  it('con el plazo vencido, no: el barrido puede estar a medias', async () => {
    base([[ana({ borrarEl: new Date(Date.now() - 1000) })]]);
    const { servicio, llamadas } = armar();
    await expect(
      servicio.pedir(ANA, { contrasena: 'clave', confirmacion: 'BORRAR' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(llamadas.revocar).toHaveLength(0);
  });

  it('lo que no es texto no revienta: 400', async () => {
    base([]);
    const { servicio } = armar();
    await expect(
      servicio.pedir(ANA, { contrasena: 1, confirmacion: ['BORRAR'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('una cuenta ya borrada no existe', async () => {
    base([[ana({ borradaEl: new Date() })]]);
    const { servicio } = armar();
    await expect(servicio.pedir(ANA, { contrasena: 'clave', confirmacion: 'BORRAR' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('SupresionService.cancelar', () => {
  it('quita la fecha', async () => {
    const { puestos } = base([[{ id: ANA }]]);
    const { servicio } = armar();
    await expect(servicio.cancelar(ANA)).resolves.toEqual({ borrarEl: null });
    expect(puestos[0].borrarEl).toBeNull();
  });

  it('sobre una cuenta ya borrada, no encuentra nada', async () => {
    base([[]]);
    const { servicio } = armar();
    await expect(servicio.cancelar(ANA)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('con el plazo vencido, no: 409', async () => {
    base([[], [{ borrarEl: new Date(Date.now() - 1000) }]]);
    const { servicio } = armar();
    await expect(servicio.cancelar(ANA)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('SupresionService.estado', () => {
  it('dice si ya está en curso', async () => {
    const antes = new Date(Date.now() - 1000);
    const despues = new Date(Date.now() + 60_000);
    base([[{ borrarEl: despues }], [{ borrarEl: antes }], []]);
    const { servicio } = armar();
    await expect(servicio.estado(ANA)).resolves.toEqual({ borrarEl: despues, enCurso: false });
    await expect(servicio.estado(ANA)).resolves.toEqual({ borrarEl: antes, enCurso: true });
    await expect(servicio.estado(ANA)).resolves.toEqual({ borrarEl: null, enCurso: false });
  });
});

describe('SupresionService.ejecutarVencidas', () => {
  const vencida = { id: ANA, email: 'ana@correo.com', avatarUrl: null };
  const pedir = pedirSupresion as jest.Mock;
  const borrar = borrarDeLaBase as jest.Mock;
  let respuestas: Record<string, string>;

  /** Las vencidas, y lo que devuelve el SELECT … FOR UPDATE antes de borrar. */
  const vencidas = (sigue = true) => base([[vencida], sigue ? [{ id: ANA }] : []]);
  const preguntadas = () =>
    pedir.mock.calls.map(([d, id]: [AppQueBorra, string]) => [d.app, id]);

  beforeEach(() => {
    respuestas = {};
    pedir.mockReset().mockImplementation(async (d: AppQueBorra) => respuestas[d.app] ?? 'hecha');
    borrar.mockReset();
  });

  it('Membresías, Campeonatos y Academy primero, solo con el id; después aquí', async () => {
    vencidas();
    const { servicio } = armar();
    await expect(servicio.ejecutarVencidas()).resolves.toEqual({ suprimidas: 1, pendientes: [] });
    expect(preguntadas()).toEqual([
      ['membresias', ANA],
      ['campeonatos', ANA],
      ['academy', ANA],
    ]);
    expect(borrar).toHaveBeenCalledTimes(1);
  });

  it.each(['membresias', 'campeonatos', 'academy'])(
    'si %s no confirma, aquí no se borra nada',
    async (app) => {
      vencidas();
      respuestas[app] = 'fallo';
      const { servicio } = armar();
      const r = await servicio.ejecutarVencidas();
      expect(r.suprimidas).toBe(0);
      expect(r.pendientes[0].motivo).toMatch(/no confirmó/);
      expect(borrar).not.toHaveBeenCalled();
    },
  );

  it('en producción, sin el canal a Membresías o a Campeonatos, espera', async () => {
    const entorno = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      for (const [app, variable] of [
        ['membresias', /MEMBRESIAS_SYNC_URL/],
        ['campeonatos', /CAMPEONATOS_SYNC_URL/],
      ] as const) {
        borrar.mockReset();
        respuestas = { [app]: 'sin-espejo' };
        vencidas();
        const { servicio } = armar();
        const r = await servicio.ejecutarVencidas();
        expect(r.pendientes[0].motivo).toMatch(variable);
        expect(borrar).not.toHaveBeenCalled();
      }
    } finally {
      process.env.NODE_ENV = entorno;
    }
  });

  it('en producción, Academy sin canal no espera: no está encendida', async () => {
    const entorno = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      vencidas();
      respuestas.academy = 'sin-espejo';
      const { servicio } = armar();
      await expect(servicio.ejecutarVencidas()).resolves.toEqual({ suprimidas: 1, pendientes: [] });
      expect(borrar).toHaveBeenCalledTimes(1);
    } finally {
      process.env.NODE_ENV = entorno;
    }
  });

  it('fuera de producción, sin canales configurados, sigue', async () => {
    vencidas();
    respuestas = { membresias: 'sin-espejo', campeonatos: 'sin-espejo', academy: 'sin-espejo' };
    const { servicio } = armar();
    await expect(servicio.ejecutarVencidas()).resolves.toEqual({ suprimidas: 1, pendientes: [] });
    expect(borrar).toHaveBeenCalledTimes(1);
  });

  it('si con la fila bloqueada ya no está pendiente, no la borra', async () => {
    vencidas(false);
    const { servicio } = armar();
    const r = await servicio.ejecutarVencidas();
    expect(r.pendientes[0].motivo).toMatch(/dejó de estar pendiente/);
    expect(borrar).not.toHaveBeenCalled();
  });

  it('si mientras tanto se quedó sola administrando un club, espera', async () => {
    vencidas();
    const { servicio } = armar({ sinMando: ['Club Tigres'] });
    const r = await servicio.ejecutarVencidas();
    expect(r.pendientes[0].motivo).toMatch(/Club Tigres/);
    expect(pedir).not.toHaveBeenCalled();
    expect(borrar).not.toHaveBeenCalled();
  });
});
