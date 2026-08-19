import type { FastifyInstance } from 'fastify';
import { requireSuperAdmin } from '../plugins/auth';
import { esSuperAdminDelRequest, estado, fijar } from '../lib/mantenimiento';

/**
 * Modo mantenimiento (solo el superadmin lo cambia).
 *
 *     GET  /maintenance  — público: ¿está cerrado? ¿desde cuándo?
 *     PUT  /maintenance  — superadmin: encenderlo o apagarlo.
 *
 * El GET es público a propósito: es lo que consulta la pantalla de aviso, y esa
 * la ve gente SIN sesión (un alumno cuyo token caducó, el kiosco del club).
 * Exigir token ahí dejaría al usuario mirando un error de conexión sin saber
 * que hay un mantenimiento en curso.
 *
 * Ambas rutas están en `SIN_CONTEXTO` (ver `plugins/rls.ts`): el ajuste no
 * pertenece a ningún club, así que abren su propio acceso sin filtro en vez de
 * heredar el contexto de uno.
 */

/** Tope del aviso: es una frase para una pantalla, no un comunicado. */
const MENSAJE_MAX = 300;

export async function maintenanceRoutes(app: FastifyInstance) {
  app.get('/maintenance', async (req) => {
    const [actual, exento] = await Promise.all([
      estado(app.db),
      esSuperAdminDelRequest(app, req),
    ]);
    // `exento`: si QUIEN PREGUNTA puede seguir usando la aplicación pese al
    // mantenimiento. Lo decide el servidor y no el navegador — el perfil
    // cacheado del cliente puede ser de un login viejo y no traer el dato.
    return { ...actual, exento };
  });

  app.put('/maintenance', { preHandler: requireSuperAdmin() }, async (req, reply) => {
    const body = (req.body ?? {}) as { activo?: unknown; mensaje?: unknown };
    if (typeof body.activo !== 'boolean') {
      return reply.code(422).send({ error: 'Falta el campo «activo» (true o false).' });
    }
    if (body.mensaje !== undefined && body.mensaje !== null) {
      if (typeof body.mensaje !== 'string') {
        return reply.code(422).send({ error: 'El aviso debe ser texto.' });
      }
      if (body.mensaje.trim().length > MENSAJE_MAX) {
        return reply
          .code(422)
          .send({ error: `El aviso no puede pasar de ${MENSAJE_MAX} caracteres.` });
      }
    }

    const actual = await fijar(
      app.db,
      body.activo,
      (body.mensaje as string | null | undefined) ?? null,
      req.user!.sub,
    );
    return { ...actual, exento: true };
  });
}
