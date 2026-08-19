import type { FastifyInstance } from 'fastify';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  martialArts,
  grades,
  teacherMartialArts,
  academyUsers,
} from '@dinamyt/academy-db';
import { requireAcademy } from '../plugins/auth';
import { esUuid } from '../lib/enrollments';

interface ArteBody {
  name: string;
  description?: string | null;
  federation?: string | null;
  /** Sistema de grados en orden jerárquico (RF-ACA-06). */
  grados?: { name: string; groupName?: string | null }[];
}

/** Artes marciales y su sistema de grados (RF-ACA-06..09). */
export async function martialArtsRoutes(app: FastifyInstance) {
  // ── GET /martial-arts — catálogo con grados (todos los roles) ─────────────
  app.get('/martial-arts', { preHandler: requireAcademy() }, async (req) => {
    const db = req.server.db;
    const esStudent = req.academy!.rol === 'student';
    const artes = await db
      .select()
      .from(martialArts)
      .orderBy(asc(martialArts.name));
    // El estudiante solo ve artes habilitadas (RF-ACA-08).
    const visibles = esStudent ? artes.filter((a) => a.isActive) : artes;
    if (visibles.length === 0) return [];

    const gradosTodos = await db
      .select()
      .from(grades)
      .where(inArray(grades.martialArtId, visibles.map((a) => a.id)))
      .orderBy(asc(grades.orderIndex));

    // Para el maestro, marcar cuáles tiene asignadas (RF-ACA-09).
    const asignadas = new Set(
      req.academy!.rol === 'teacher'
        ? (
            await db
              .select({ id: teacherMartialArts.martialArtId })
              .from(teacherMartialArts)
              .where(eq(teacherMartialArts.teacherUserId, req.user!.sub))
          ).map((f) => f.id)
        : [],
    );

    return visibles.map((a) => ({
      ...a,
      grados: gradosTodos.filter((g) => g.martialArtId === a.id),
      asignada: req.academy!.rol === 'admin' ? true : asignadas.has(a.id),
    }));
  });

  // ── POST /martial-arts — registrar arte marcial (admin, RF-ACA-06) ────────
  app.post(
    '/martial-arts',
    { preHandler: requireAcademy(['admin']) },
    async (req, reply) => {
      const body = req.body as ArteBody;
      if (!body.name?.trim()) {
        return reply.code(422).send({ error: 'El arte marcial necesita un nombre.' });
      }
      if (!body.grados?.length) {
        return reply
          .code(422)
          .send({ error: 'Define al menos un grado (sistema de grados).' });
      }
      if (body.grados.some((g) => !g.name?.trim())) {
        return reply.code(422).send({ error: 'Cada grado necesita un nombre.' });
      }

      const db = req.server.db;
      const [duplicada] = await db
        .select({ id: martialArts.id })
        .from(martialArts)
        .where(eq(martialArts.name, body.name.trim()))
        .limit(1);
      if (duplicada) {
        return reply.code(409).send({ error: 'Ya existe un arte marcial con ese nombre.' });
      }

      const [arte] = await db
        .insert(martialArts)
        .values({
          name: body.name.trim(),
          description: body.description ?? null,
          federation: body.federation ?? null,
        })
        .returning();
      const gradosCreados = await db
        .insert(grades)
        .values(
          body.grados.map((g, i) => ({
            martialArtId: arte.id,
            name: g.name.trim(),
            groupName: g.groupName ?? null,
            orderIndex: i + 1,
          })),
        )
        .returning();
      return reply.code(201).send({ ...arte, grados: gradosCreados });
    },
  );

  // ── PATCH /martial-arts/:id — editar / habilitar-deshabilitar (RF-ACA-08) ─
  app.patch(
    '/martial-arts/:id',
    { preHandler: requireAcademy(['admin']) },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      if (!esUuid(id)) return reply.code(400).send({ error: 'Id inválido.' });
      const body = req.body as Partial<ArteBody> & { isActive?: boolean };
      const db = req.server.db;

      const [arte] = await db
        .update(martialArts)
        .set({
          ...(typeof body.name === 'string' &&
            body.name.trim() && { name: body.name.trim() }),
          ...(body.description !== undefined && { description: body.description }),
          ...(body.federation !== undefined && { federation: body.federation }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
          updatedAt: new Date(),
        })
        .where(eq(martialArts.id, id))
        .returning();
      if (!arte) return reply.code(404).send({ error: 'Arte marcial no encontrada.' });
      return arte;
    },
  );

  // ── GET /martial-arts/:id/teachers — maestros asignados (admin) ───────────
  app.get(
    '/martial-arts/:id/teachers',
    { preHandler: requireAcademy(['admin']) },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      if (!esUuid(id)) return reply.code(400).send({ error: 'Id inválido.' });
      const db = req.server.db;
      const filas = await db
        .select({
          id: teacherMartialArts.id,
          teacherUserId: teacherMartialArts.teacherUserId,
          createdAt: teacherMartialArts.createdAt,
          fullName: academyUsers.fullName,
          email: academyUsers.email,
          avatarUrl: academyUsers.avatarUrl,
        })
        .from(teacherMartialArts)
        .leftJoin(
          academyUsers,
          eq(academyUsers.ecosystemUserId, teacherMartialArts.teacherUserId),
        )
        .where(eq(teacherMartialArts.martialArtId, id));
      return filas;
    },
  );

  // ── POST /martial-arts/:id/teachers — asignar maestro (admin, RF-ACA-09) ──
  app.post(
    '/martial-arts/:id/teachers',
    { preHandler: requireAcademy(['admin']) },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      if (!esUuid(id)) return reply.code(400).send({ error: 'Id inválido.' });
      const body = req.body as { teacherUserId?: string; email?: string };
      const db = req.server.db;

      let teacherUserId = body.teacherUserId ?? null;
      if (!teacherUserId && body.email) {
        // El admin puede asignar por correo si la persona ya entró a Academy.
        const [u] = await db
          .select()
          .from(academyUsers)
          .where(sql`lower(${academyUsers.email}) = ${body.email.trim().toLowerCase()}`)
          .limit(1);
        if (!u) {
          return reply.code(404).send({
            error:
              'No hay ningún usuario de Academy con ese correo (debe iniciar sesión al menos una vez).',
          });
        }
        teacherUserId = u.ecosystemUserId;
      }
      if (!esUuid(teacherUserId)) {
        return reply.code(422).send({ error: 'Indica teacherUserId o email.' });
      }

      const [arte] = await db
        .select({ id: martialArts.id })
        .from(martialArts)
        .where(eq(martialArts.id, id))
        .limit(1);
      if (!arte) return reply.code(404).send({ error: 'Arte marcial no encontrada.' });

      const [ya] = await db
        .select({ id: teacherMartialArts.id })
        .from(teacherMartialArts)
        .where(
          and(
            eq(teacherMartialArts.teacherUserId, teacherUserId),
            eq(teacherMartialArts.martialArtId, id),
          ),
        )
        .limit(1);
      if (ya) return reply.code(409).send({ error: 'Ese maestro ya está asignado.' });

      const [fila] = await db
        .insert(teacherMartialArts)
        .values({
          teacherUserId,
          martialArtId: id,
          assignedByUserId: req.user!.sub,
        })
        .returning();

      // Si la persona aún no tiene rol local, la asignación la vuelve maestro.
      await db
        .update(academyUsers)
        .set({ localRole: 'teacher', updatedAt: new Date() })
        .where(
          and(
            eq(academyUsers.ecosystemUserId, teacherUserId),
            isNull(academyUsers.localRole),
          ),
        );
      return reply.code(201).send(fila);
    },
  );

  // ── DELETE /martial-arts/:id/teachers/:userId — retirar asignación ────────
  app.delete(
    '/martial-arts/:id/teachers/:userId',
    { preHandler: requireAcademy(['admin']) },
    async (req, reply) => {
      const { id, userId } = req.params as { id: string; userId: string };
      if (!esUuid(id) || !esUuid(userId)) {
        return reply.code(400).send({ error: 'Id inválido.' });
      }
      const borradas = await req.server.db
        .delete(teacherMartialArts)
        .where(
          and(
            eq(teacherMartialArts.martialArtId, id),
            eq(teacherMartialArts.teacherUserId, userId),
          ),
        )
        .returning();
      if (borradas.length === 0) {
        return reply.code(404).send({ error: 'Asignación no encontrada.' });
      }
      return { ok: true };
    },
  );
}
