import type { FastifyInstance } from 'fastify';
import { requireAcademy } from '../plugins/auth';
import { guardarArchivoSeguro, ErrorSubida } from '../lib/uploads';

/** Subidas sueltas: la evidencia de una tarea (video, imagen o PDF) que el
 *  estudiante adjunta desde su equipo o celular. Devuelve la ruta relativa
 *  que luego viaja como `evidenceUrl` al entregar. */
export async function uploadsRoutes(app: FastifyInstance) {
  app.post(
    '/uploads/evidencia',
    { preHandler: requireAcademy(['student']) },
    async (req, reply) => {
      for await (const parte of req.parts()) {
        if (parte.type !== 'file') continue;
        try {
          const { rel } = await guardarArchivoSeguro(parte, 'evidencias', [
            'video',
            'imagen',
            'documento',
          ]);
          return reply.code(201).send({ url: rel });
        } catch (err) {
          if (err instanceof ErrorSubida) {
            return reply.code(422).send({ error: err.message });
          }
          throw err;
        }
      }
      return reply.code(422).send({ error: 'Adjunta un archivo.' });
    },
  );
}
