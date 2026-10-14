import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { users } from '@dinamyt/membresias-db';
import { orgDelRequest, requireRole } from '../plugins/auth';
import { deEsteClub } from '../lib/filtros';
import { eliminarDelClub } from '../lib/eliminar-del-club';

/**
 * `POST /users/:id/eliminar` — sacar a alguien del club de verdad.
 *
 * Qué se borra, qué se queda y por qué el portal va primero:
 * `lib/eliminar-del-club.ts`. Aquí solo quién puede y a quién.
 *
 * No elimina a un maestro: primero se le quita el rol, que es donde vive la
 * regla de no dejar un club sin quien cobre (OPERAR §4.7-bis).
 */
export async function eliminarDelClubRoutes(app: FastifyInstance) {
  app.post(
    '/users/:id/eliminar',
    { preHandler: requireRole(['owner']) },
    async (req, reply) => {
      const orgId = orgDelRequest(req);
      if (!orgId) return reply.code(400).send({ error: 'Sin club seleccionado.' });
      const { id } = req.params as { id: string };
      if (id === req.user!.sub) {
        return reply.code(400).send({ error: 'No puedes eliminarte a ti mismo del club.' });
      }

      const [persona] = await req.db
        .select({
          id: users.id,
          role: users.role,
          ecoSub: users.ecoSub,
          isSuperAdmin: users.isSuperAdmin,
        })
        .from(users)
        .where(and(eq(users.id, id), deEsteClub(orgId)))
        .limit(1);
      if (!persona || persona.isSuperAdmin) {
        return reply.code(404).send({ error: 'No encontrado.' });
      }
      if (persona.role === 'owner') {
        return reply.code(409).send({
          error: 'Para eliminar a un maestro del club, primero quítale el rol de maestro.',
        });
      }

      const r = await eliminarDelClub(req.db, {
        persona,
        orgId,
        porUserId: req.user!.sub,
        porSuperAdmin: req.user!.is_super_admin === true,
      });
      if (!r.ok) return reply.code(r.status).send({ error: r.error });
      req.log.warn({ usuario: id, por: req.user!.sub, resultado: r.resultado }, 'eliminado del club');
      return { ok: true, resultado: r.resultado };
    },
  );
}
