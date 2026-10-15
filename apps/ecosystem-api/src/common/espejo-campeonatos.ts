import { Logger } from '@nestjs/common';
import { secretoParaFirmar } from './secreto-sync';

/**
 * Lo que el ecosistema le PIDE a Campeonatos. Hasta octubre de 2026 no había
 * nada en ese sentido —Campeonatos pregunta (el pase, la apariencia) y avisa
 * (`/sync/alta`, `/sync/aviso-campeonato`), pero nadie le hablaba a él—, y lo
 * primero que lo necesitó fue borrar una cuenta.
 *
 * Hace falta `CAMPEONATOS_SYNC_URL` (el origen de campeonatos-api, sin barra
 * final) y el secreto de Campeonatos (`SYNC_SECRET_CAMPEONATOS`, o el
 * compartido mientras dure la transición).
 */

const log = new Logger('EspejoCampeonatos');
const TIMEOUT_MS = 8_000;

const destino = () => (process.env.CAMPEONATOS_SYNC_URL ?? '').replace(/\/+$/, '');

/**
 * Borrar lo de esta cuenta en Campeonatos, y ESPERAR la respuesta.
 *
 * `sin-espejo` = este despliegue no tiene el canal puesto: no se pudo pedir.
 * Quien llama decide si eso bloquea.
 */
export async function pedirSupresionACampeonatos(datos: {
  ecoSub: string;
  /** La llave entre un competidor y una persona (decisión 10). */
  documento: string | null;
}): Promise<'hecha' | 'sin-espejo' | 'fallo'> {
  const secreto = secretoParaFirmar('campeonatos');
  if (!destino() || !secreto) return 'sin-espejo';
  try {
    const res = await fetch(`${destino()}/api/sync/supresion`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dinamyt-sync': secreto },
      body: JSON.stringify(datos),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      log.warn(
        `/api/sync/supresion respondió ${res.status}.` +
          (res.status === 404 ? ' Campeonatos todavía no tiene esa ruta desplegada.' : ''),
      );
      return 'fallo';
    }
    return 'hecha';
  } catch (e) {
    log.warn(
      `/api/sync/supresion no llegó a Campeonatos (${e instanceof Error ? e.message : 'error'}).`,
    );
    return 'fallo';
  }
}
