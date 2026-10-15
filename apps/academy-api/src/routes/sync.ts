import type { FastifyInstance } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { config } from '../config';
import { esUuid } from '../lib/enrollments';
import { borrarArchivos, suprimirPersona } from '../lib/suprimir-persona';

/**
 * El canal servidor-a-servidor con el ecosistema, el mismo que tienen
 * Membresías y Campeonatos: cabecera `x-dinamyt-sync` con el secreto que el
 * ecosistema tiene para Academy (`SYNC_SECRET_ACADEMY` allí, o el compartido),
 * que aquí se llama `ECOSYSTEM_SYNC_SECRET`.
 *
 * Sin secreto puesto la ruta no existe (404): una ruta que borra datos no se
 * deja abierta «por si acaso». Se lee en cada llamada, no al arrancar.
 */
function puerta(recibido: unknown): 'abierta' | 'apagada' | 'rechazada' {
  const secreto = process.env.ECOSYSTEM_SYNC_SECRET;
  if (!secreto) return 'apagada';
  if (typeof recibido !== 'string') return 'rechazada';
  const a = Buffer.from(recibido);
  const b = Buffer.from(secreto);
  return a.length === b.length && timingSafeEqual(a, b) ? 'abierta' : 'rechazada';
}

export async function syncRoutes(app: FastifyInstance) {
  // La pide el barrido diario de `SupresionService` al vencer los siete días
  // de una cuenta. El ecosistema solo borra lo suyo si esto contesta 2xx.
  app.post('/sync/supresion', async (req, reply) => {
    const estado = puerta(req.headers['x-dinamyt-sync']);
    if (estado === 'apagada') return reply.code(404).send({ error: 'Not Found' });
    if (estado === 'rechazada') return reply.code(401).send({ error: 'Unauthorized' });

    const ecoSub = (req.body as { ecoSub?: string } | null)?.ecoSub;
    if (!esUuid(ecoSub)) return reply.code(400).send({ error: 'ecoSub debe ser un UUID.' });

    const archivos = await suprimirPersona(req.server.db, ecoSub);
    await borrarArchivos(config.uploadsDir, archivos);
    return { ok: true };
  });
}
