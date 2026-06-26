import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db, campeonatos } from '@dinamyt/campeonatos-db';
import { requireScope } from '../plugins/auth';

export async function campeonatosRoutes(app: FastifyInstance) {
  // ── Público (pantalla de resultados): campeonatos en curso, solo lectura ──
  app.get('/campeonatos/publico', async () => {
    return db
      .select({
        id: campeonatos.id,
        nombre: campeonatos.nombre,
        estado: campeonatos.estado,
        fechaInicio: campeonatos.fechaInicio,
        fechaFin: campeonatos.fechaFin,
      })
      .from(campeonatos)
      .where(eq(campeonatos.estado, 'EN_CURSO'));
  });

  // ── Protegido: requiere scope "campeonatos" ──────────────────────────────
  app.get(
    '/campeonatos',
    { preHandler: requireScope('campeonatos') },
    async () => db.select().from(campeonatos),
  );

  // ── Identidad del token (útil para el frontend) ──────────────────────────
  app.get('/me', { preHandler: requireScope('campeonatos') }, async (req) => {
    return req.user;
  });
}
