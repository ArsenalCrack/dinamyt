import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { config } from './config';
import { MockReader, type ReaderAdapter, type Candidato } from './adapters/reader';
import { DigitalPersonaReader } from './adapters/digitalpersona';

export interface BuildAgentDeps {
  reader?: ReaderAdapter;
}

/** Elige el adaptador del lector según READER_VENDOR (mock por defecto). */
function crearReader(): ReaderAdapter {
  if (config.vendor === 'digitalpersona') return new DigitalPersonaReader();
  return new MockReader();
}

/**
 * Agente del lector. Expone un contrato estable por localhost a la PWA:
 * - GET  /status   → ¿hay lector conectado?
 * - POST /enroll   → captura una huella y devuelve su plantilla (la PWA la sube a la API)
 * - POST /identify → 1:N contra las plantillas cacheadas → value del match
 * La web NUNCA depende de que el agente exista (degrada a QR/PIN/manual).
 */
export function buildAgent(deps: BuildAgentDeps = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const reader = deps.reader ?? crearReader();

  void app.register(cors, { origin: config.corsOrigins });

  app.get('/status', async () => ({
    readerConnected: reader.connected(),
    vendor: reader.vendor,
  }));

  app.post('/enroll', async (_req, reply) => {
    if (!reader.connected()) {
      return reply.code(503).send({ error: 'Lector no conectado.' });
    }
    const { template, format } = await reader.capture();
    return { template, format };
  });

  app.post('/identify', async (req, reply) => {
    if (!reader.connected()) {
      return reply.code(503).send({ error: 'Lector no conectado.' });
    }
    const { candidatos } = req.body as { candidatos: Candidato[] };
    const value = await reader.identify(candidatos ?? []);
    if (!value) return reply.code(404).send({ match: false });
    return { match: true, value };
  });

  return app;
}
