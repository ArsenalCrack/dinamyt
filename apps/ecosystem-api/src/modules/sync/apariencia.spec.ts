/**
 * **El tema y el idioma se pueden cambiar desde CUALQUIERA de las cuatro apps.**
 *
 * ── El hueco que cierra ──
 *
 * La preferencia ya viajaba del portal a las demás dentro del pase (§4.21): se
 * elegía una vez en DINAMYT y se veía en las cuatro. Pero solo en ese sentido.
 * Quien cambiaba a modo claro **dentro de Membresías o de Campeonatos** lo
 * cambiaba solo ahí — `localStorage` es por origen, y esas apps no tienen forma
 * de escribir en `users`.
 *
 * Visto desde fuera eso es peor que no tener la función: el mismo botón, en la
 * misma cuenta, unas veces se recuerda en todas partes y otras no, según en qué
 * app lo pulsaste.
 *
 * ── Lo que estas pruebas defienden ──
 *
 * Que la ruta escribe **esas dos columnas y nada más**. Entra por un secreto
 * compartido, no por el pase de una persona, así que no puede tocar el rol, ni
 * el correo, ni la contraseña: quien tenga el secreto podría cambiarle el tema
 * a cualquiera —cosmético— pero no darse permisos.
 *
 * Y que marca `localeManual`, sin lo cual la elección duraría hasta el
 * siguiente inicio de sesión, que la pisaría con lo que diga `X-Idioma`.
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
const PERSONA = '11111111-1111-4111-8111-111111111111';

function armar(devuelve: unknown[] = [{ id: PERSONA }]) {
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

describe('POST /sync/apariencia · el tema y el idioma desde otra app', () => {
  let original: string | undefined;
  beforeEach(() => {
    original = process.env.ECOSYSTEM_SYNC_SECRET;
    process.env.ECOSYSTEM_SYNC_SECRET = SECRETO;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.ECOSYSTEM_SYNC_SECRET;
    else process.env.ECOSYSTEM_SYNC_SECRET = original;
  });

  it('guarda el tema', async () => {
    const { controlador, puestos, verbos } = armar();
    const r = await controlador.apariencia(SECRETO, {
      ecoSub: PERSONA,
      theme: 'claro',
    });
    expect(r).toEqual({ encontrada: true, aplicado: true });
    expect(puestos[0]).toMatchObject({ theme: 'claro' });
    expect(verbos).toEqual(['update']);
  });

  it('guarda el idioma Y lo marca como elegido a mano', async () => {
    // Sin `localeManual`, la elección dura hasta el siguiente inicio de sesión:
    // `anotarZona` la pisaría con lo que diga el navegador (§4.21).
    const { controlador, puestos } = armar();
    await controlador.apariencia(SECRETO, {
      ecoSub: PERSONA,
      locale: 'en-US',
    });
    expect(puestos[0]).toMatchObject({ locale: 'en-US', localeManual: true });
  });

  it('no escribe NADA más que esas columnas', async () => {
    // Entra por un secreto compartido, no por el pase de nadie: si además
    // pudiera tocar el rol, quien tuviera el secreto se daría permisos.
    const { controlador, puestos } = armar();
    await controlador.apariencia(SECRETO, {
      ecoSub: PERSONA,
      theme: 'oscuro',
      locale: 'es-CO',
    });
    expect(Object.keys(puestos[0]).sort()).toEqual([
      'locale',
      'localeManual',
      'theme',
      'updatedAt',
    ]);
  });

  it('dice que no encontró a nadie en vez de mentir', async () => {
    const { controlador } = armar([]);
    const r = await controlador.apariencia(SECRETO, {
      ecoSub: PERSONA,
      theme: 'claro',
    });
    expect(r).toEqual({ encontrada: false, aplicado: false });
  });

  // ── La puerta ────────────────────────────────────────────────────────────

  it('sin cabecera, 401', async () => {
    // ⚠️ El centinela tiene que ser `undefined` explícito y no omitirlo: pasar
    // el valor por defecto de un ayudante fue lo que hizo que una prueba
    // gemela pasara por el motivo contrario al que decía (§6.1).
    const { controlador, verbos } = armar();
    await expect(
      controlador.apariencia(undefined, { ecoSub: PERSONA, theme: 'claro' }),
    ).rejects.toThrow(UnauthorizedException);
    expect(verbos).toEqual([]);
  });

  it('con el secreto equivocado, 401', async () => {
    const { controlador, verbos } = armar();
    await expect(
      controlador.apariencia('otro', { ecoSub: PERSONA, theme: 'claro' }),
    ).rejects.toThrow(UnauthorizedException);
    expect(verbos).toEqual([]);
  });

  it('sin secreto configurado la ruta NO existe: 404, no 401', async () => {
    // Un 401 confirmaría que la ruta está ahí. Sin la variable no hay puerta
    // que forzar, y eso es lo que se responde.
    delete process.env.ECOSYSTEM_SYNC_SECRET;
    const { controlador } = armar();
    await expect(
      controlador.apariencia(SECRETO, { ecoSub: PERSONA, theme: 'claro' }),
    ).rejects.toThrow(NotFoundException);
  });

  // ── Lo que no vale ───────────────────────────────────────────────────────

  it('sin `ecoSub` no se escribe a ciegas', async () => {
    const { controlador, verbos } = armar();
    await expect(
      controlador.apariencia(SECRETO, { theme: 'claro' }),
    ).rejects.toThrow(BadRequestException);
    expect(verbos).toEqual([]);
  });

  it('un tema que no existe se rechaza', async () => {
    const { controlador } = armar();
    await expect(
      controlador.apariencia(SECRETO, { ecoSub: PERSONA, theme: 'azul' }),
    ).rejects.toThrow(/Tema inválido/);
  });

  it('un idioma con forma rara se rechaza', async () => {
    const { controlador } = armar();
    await expect(
      controlador.apariencia(SECRETO, { ecoSub: PERSONA, locale: 'español' }),
    ).rejects.toThrow(/Idioma inválido/);
  });

  it('una llamada vacía no gasta un UPDATE', async () => {
    const { controlador, verbos } = armar();
    await expect(
      controlador.apariencia(SECRETO, { ecoSub: PERSONA }),
    ).rejects.toThrow(BadRequestException);
    expect(verbos).toEqual([]);
  });
});
