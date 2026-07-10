import type { FastifyInstance } from 'fastify';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { contents, contentViews, grades } from '@dinamyt/academy-db';
import { requireAcademy } from '../plugins/auth';
import { esMaestroDe } from '../lib/users';
import { esUuid, matriculaDe, gradosAccesibles } from '../lib/enrollments';
import { notificar, estudiantesDe } from '../lib/notify';

const TIPOS = ['documento', 'video', 'imagen', 'texto'] as const;
type TipoContenido = (typeof TIPOS)[number];

interface ContenidoBody {
  martialArtId: string;
  gradeId: string;
  title: string;
  description?: string | null;
  type: TipoContenido;
  url?: string | null;
  body?: string | null;
  orderIndex?: number;
}

/** Contenidos por grado (RF-ACA-10..15). */
export async function contentsRoutes(app: FastifyInstance) {
  // ── GET /contents?martialArtId= — según el rol ─────────────────────────────
  // Estudiante: SOLO su grado actual y los anteriores, con flag `visto`
  // (RF-ACA-14/15). Maestro/admin: todo el contenido del arte (gestión).
  app.get('/contents', { preHandler: requireAcademy() }, async (req, reply) => {
    const { martialArtId, gradeId } = req.query as {
      martialArtId?: string;
      gradeId?: string;
    };
    if (!esUuid(martialArtId)) {
      return reply.code(400).send({ error: 'martialArtId es obligatorio.' });
    }
    const db = req.server.db;
    const rol = req.academy!.rol;

    if (rol === 'student') {
      const mat = await matriculaDe(db, req.user!.sub, martialArtId);
      if (!mat) {
        return reply.code(403).send({
          error: 'No estás matriculado en esta arte marcial. Pide a tu maestro que te matricule.',
        });
      }
      const accesibles = await gradosAccesibles(
        db,
        martialArtId,
        mat.gradoActual.orderIndex,
      );
      const idsAccesibles = accesibles.map((g) => g.id);
      const unidades = idsAccesibles.length
        ? await db
            .select()
            .from(contents)
            .where(
              and(
                eq(contents.martialArtId, martialArtId),
                inArray(contents.gradeId, idsAccesibles),
                eq(contents.isDeleted, false),
              ),
            )
            .orderBy(asc(contents.orderIndex), asc(contents.createdAt))
        : [];

      const vistas = unidades.length
        ? await db
            .select({ contentId: contentViews.contentId })
            .from(contentViews)
            .where(
              and(
                eq(contentViews.studentUserId, req.user!.sub),
                inArray(
                  contentViews.contentId,
                  unidades.map((u) => u.id),
                ),
              ),
            )
        : [];
      const vistoSet = new Set(vistas.map((v) => v.contentId));

      return {
        gradoActual: mat.gradoActual,
        gradosAccesibles: accesibles,
        contenidos: unidades.map((u) => ({ ...u, visto: vistoSet.has(u.id) })),
      };
    }

    // Maestro: solo artes asignadas (RF-ACA-09). Admin: todas.
    if (!(await esMaestroDe(db, rol, req.user!.sub, martialArtId))) {
      return reply
        .code(403)
        .send({ error: 'No tienes asignada esta arte marcial.' });
    }
    const condiciones = [
      eq(contents.martialArtId, martialArtId),
      eq(contents.isDeleted, false),
    ];
    if (gradeId) {
      if (!esUuid(gradeId)) return reply.code(400).send({ error: 'gradeId inválido.' });
      condiciones.push(eq(contents.gradeId, gradeId));
    }
    const unidades = await db
      .select()
      .from(contents)
      .where(and(...condiciones))
      .orderBy(asc(contents.orderIndex), asc(contents.createdAt));
    return { contenidos: unidades };
  });

  // ── POST /contents — crear unidad (maestro del arte / admin, RF-ACA-10/12) ─
  app.post(
    '/contents',
    { preHandler: requireAcademy(['teacher', 'admin']) },
    async (req, reply) => {
      const body = req.body as ContenidoBody;
      if (!esUuid(body.martialArtId) || !esUuid(body.gradeId)) {
        return reply.code(422).send({ error: 'martialArtId y gradeId son obligatorios.' });
      }
      if (!body.title?.trim()) {
        return reply.code(422).send({ error: 'La unidad necesita un título.' });
      }
      if (!TIPOS.includes(body.type)) {
        return reply.code(422).send({ error: 'Tipo de contenido inválido.' });
      }
      if (body.type === 'texto' && !body.body?.trim()) {
        return reply.code(422).send({ error: 'El contenido de texto necesita un cuerpo.' });
      }
      if (body.type !== 'texto' && !body.url?.trim()) {
        return reply
          .code(422)
          .send({ error: 'Documento, video e imagen necesitan una URL (RF-ACA-11/12).' });
      }

      const db = req.server.db;
      if (!(await esMaestroDe(db, req.academy!.rol, req.user!.sub, body.martialArtId))) {
        return reply
          .code(403)
          .send({ error: 'Solo puedes publicar en las artes marciales asignadas.' });
      }
      const [grado] = await db
        .select({ id: grades.id, martialArtId: grades.martialArtId })
        .from(grades)
        .where(eq(grades.id, body.gradeId))
        .limit(1);
      if (!grado || grado.martialArtId !== body.martialArtId) {
        return reply.code(422).send({ error: 'El grado no pertenece a esa arte marcial.' });
      }

      const [unidad] = await db
        .insert(contents)
        .values({
          martialArtId: body.martialArtId,
          gradeId: body.gradeId,
          title: body.title.trim(),
          description: body.description ?? null,
          type: body.type,
          url: body.url ?? null,
          body: body.body ?? null,
          orderIndex: body.orderIndex ?? 0,
          createdByUserId: req.user!.sub,
        })
        .returning();

      // Aviso a los estudiantes del grado: material nuevo.
      await notificar(db, await estudiantesDe(db, body.martialArtId, body.gradeId), {
        type: 'material_nuevo',
        title: `📚 Material nuevo: ${unidad.title}`,
        link: '/aprender',
      });
      return reply.code(201).send(unidad);
    },
  );

  // ── PATCH /contents/:id — editar/ordenar (RF-ACA-13) ──────────────────────
  app.patch(
    '/contents/:id',
    { preHandler: requireAcademy(['teacher', 'admin']) },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      if (!esUuid(id)) return reply.code(400).send({ error: 'Id inválido.' });
      const body = req.body as Partial<ContenidoBody>;
      const db = req.server.db;

      const [existente] = await db
        .select()
        .from(contents)
        .where(and(eq(contents.id, id), eq(contents.isDeleted, false)))
        .limit(1);
      if (!existente) return reply.code(404).send({ error: 'Unidad no encontrada.' });
      if (
        !(await esMaestroDe(db, req.academy!.rol, req.user!.sub, existente.martialArtId))
      ) {
        return reply
          .code(403)
          .send({ error: 'Solo puedes editar contenido de tus artes marciales.' });
      }

      const [unidad] = await db
        .update(contents)
        .set({
          ...(body.title !== undefined && { title: body.title.trim() }),
          ...(body.description !== undefined && { description: body.description }),
          ...(body.url !== undefined && { url: body.url }),
          ...(body.body !== undefined && { body: body.body }),
          ...(body.orderIndex !== undefined && { orderIndex: body.orderIndex }),
          ...(body.gradeId !== undefined && esUuid(body.gradeId) && { gradeId: body.gradeId }),
          updatedAt: new Date(),
        })
        .where(eq(contents.id, id))
        .returning();
      return unidad;
    },
  );

  // ── DELETE /contents/:id — soft delete: NO toca evaluaciones (RF-ACA-13) ──
  app.delete(
    '/contents/:id',
    { preHandler: requireAcademy(['teacher', 'admin']) },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      if (!esUuid(id)) return reply.code(400).send({ error: 'Id inválido.' });
      const db = req.server.db;
      const [existente] = await db
        .select()
        .from(contents)
        .where(and(eq(contents.id, id), eq(contents.isDeleted, false)))
        .limit(1);
      if (!existente) return reply.code(404).send({ error: 'Unidad no encontrada.' });
      if (
        !(await esMaestroDe(db, req.academy!.rol, req.user!.sub, existente.martialArtId))
      ) {
        return reply
          .code(403)
          .send({ error: 'Solo puedes eliminar contenido de tus artes marciales.' });
      }
      await db
        .update(contents)
        .set({ isDeleted: true, updatedAt: new Date() })
        .where(eq(contents.id, id));
      return { ok: true };
    },
  );

  // ── POST /contents/:id/view — marcar visto la primera vez (RF-ACA-15) ─────
  app.post(
    '/contents/:id/view',
    { preHandler: requireAcademy(['student']) },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      if (!esUuid(id)) return reply.code(400).send({ error: 'Id inválido.' });
      const db = req.server.db;

      const [unidad] = await db
        .select()
        .from(contents)
        .where(and(eq(contents.id, id), eq(contents.isDeleted, false)))
        .limit(1);
      if (!unidad) return reply.code(404).send({ error: 'Unidad no encontrada.' });

      // El contenido debe estar desbloqueado para su grado (RF-ACA-14).
      const mat = await matriculaDe(db, req.user!.sub, unidad.martialArtId);
      if (!mat) return reply.code(403).send({ error: 'No estás matriculado.' });
      const [gradoUnidad] = await db
        .select()
        .from(grades)
        .where(eq(grades.id, unidad.gradeId))
        .limit(1);
      if (!gradoUnidad || gradoUnidad.orderIndex > mat.gradoActual.orderIndex) {
        return reply
          .code(403)
          .send({ error: 'Este contenido pertenece a un grado superior (bloqueado).' });
      }

      // Idempotente: la restricción única ignora vistas repetidas.
      await db
        .insert(contentViews)
        .values({ contentId: id, studentUserId: req.user!.sub })
        .onConflictDoNothing();
      return { ok: true };
    },
  );
}
