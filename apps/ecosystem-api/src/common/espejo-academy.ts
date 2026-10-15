import { Logger } from '@nestjs/common';
import { secretoParaFirmar } from './secreto-sync';

/**
 * Lo que el ecosistema le PIDE a Academy. Por ahora, una sola cosa: borrar lo
 * de una cuenta que se está borrando (OPERAR §4.15).
 *
 * Hace falta `ACADEMY_SYNC_URL` (academy-api; en la VPS es la misma máquina,
 * `http://127.0.0.1:3007`, sin pasar por Caddy) y el secreto de Academy
 * (`SYNC_SECRET_ACADEMY`, o el compartido).
 */

const log = new Logger('EspejoAcademy');
const TIMEOUT_MS = 8_000;

const destino = () => (process.env.ACADEMY_SYNC_URL ?? '').replace(/\/+$/, '');

/**
 * Borrar lo de esta cuenta en Academy, y ESPERAR la respuesta.
 *
 * `sin-espejo` = este despliegue no tiene el canal puesto. Quien llama decide
 * si eso bloquea.
 */
export async function pedirSupresionAAcademy(
  ecoSub: string,
): Promise<'hecha' | 'sin-espejo' | 'fallo'> {
  const secreto = secretoParaFirmar('academy');
  if (!destino() || !secreto) return 'sin-espejo';
  try {
    const res = await fetch(`${destino()}/sync/supresion`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dinamyt-sync': secreto },
      body: JSON.stringify({ ecoSub }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      log.warn(
        `/sync/supresion respondió ${res.status}.` +
          (res.status === 404 ? ' Academy no tiene ECOSYSTEM_SYNC_SECRET puesto.' : ''),
      );
      return 'fallo';
    }
    return 'hecha';
  } catch (e) {
    log.warn(`/sync/supresion no llegó a Academy (${e instanceof Error ? e.message : 'error'}).`);
    return 'fallo';
  }
}
