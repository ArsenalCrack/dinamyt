import { Logger } from '@nestjs/common';
import { secretoParaFirmar, type AppSync } from '../../common/secreto-sync';

/**
 * Antes de borrar aquí, el barrido le pide a cada app que borre lo suyo de
 * esa cuenta, y ESPERA la respuesta: al revés que el espejo, que avisa y se
 * olvida, un borrado no se da por hecho si allí no se hizo.
 *
 * Las tres rutas son idempotentes y reciben solo el `ecoSub`. Es la única
 * llave segura: un número de documento lo puede escribir cualquiera al
 * registrarse, y con él se borraría la ficha de otra persona (thermos, 15 oct
 * 2026).
 */
export interface AppQueBorra {
  app: AppSync;
  nombre: string;
  /** El origen de su API, sin barra final. */
  variable: string;
  ruta: string;
  /** En producción, sin canal se espera. Si no, se sigue sin ella. */
  obligatoria: boolean;
}

export const APPS_QUE_BORRAN: readonly AppQueBorra[] = [
  {
    app: 'membresias',
    nombre: 'Membresías',
    variable: 'MEMBRESIAS_SYNC_URL',
    ruta: '/sync/supresion',
    obligatoria: true,
  },
  {
    app: 'campeonatos',
    nombre: 'Campeonatos',
    variable: 'CAMPEONATOS_SYNC_URL',
    ruta: '/api/sync/supresion',
    obligatoria: true,
  },
  // Academy no está encendida (HOJA-DE-RUTA, «Encender Academy»): allí no hay
  // nada de nadie. `ACADEMY_SYNC_URL` se pone el día que se encienda
  // (MONTAR-VPS, Anexo B); un error suyo sí espera, como los de las otras.
  {
    app: 'academy',
    nombre: 'Academy',
    variable: 'ACADEMY_SYNC_URL',
    ruta: '/sync/supresion',
    obligatoria: false,
  },
];

const log = new Logger('Supresion');
const TIMEOUT_MS = 8_000;

/** `sin-espejo` = este despliegue no tiene el canal puesto: no se pudo pedir. */
export async function pedirSupresion(
  destino: AppQueBorra,
  ecoSub: string,
): Promise<'hecha' | 'sin-espejo' | 'fallo'> {
  const origen = (process.env[destino.variable] ?? '').replace(/\/+$/, '');
  const secreto = secretoParaFirmar(destino.app);
  if (!origen || !secreto) return 'sin-espejo';
  try {
    const res = await fetch(`${origen}${destino.ruta}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dinamyt-sync': secreto },
      body: JSON.stringify({ ecoSub }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) return 'hecha';
    log.warn(
      `${destino.nombre} respondió ${res.status} a ${destino.ruta}.` +
        (res.status === 404 ? ' No tiene la ruta desplegada, o le falta el secreto.' : ''),
    );
  } catch (e) {
    log.warn(
      `${destino.ruta} no llegó a ${destino.nombre} (${e instanceof Error ? e.message : 'error'}).`,
    );
  }
  return 'fallo';
}
