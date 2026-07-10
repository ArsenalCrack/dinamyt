import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { join, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  referenceFigures,
  figureAttempts,
  grades,
  academyUsers,
} from '@dinamyt/academy-db';
import { requireAcademy } from '../plugins/auth';
import { esMaestroDe } from '../lib/users';
import { esUuid, matriculaDe, gradosAccesibles } from '../lib/enrollments';
import { notificar } from '../lib/notify';
import { registrarActividad } from '../lib/activity';
import { config } from '../config';

const VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm', '.avi', '.mkv']);

/** Lee un multipart: campos de texto + UN archivo de video guardado en disco.
 *  Devuelve los campos y la ruta RELATIVA del video dentro de uploads. */
async function recibirVideo(
  req: FastifyRequest,
  subcarpeta: string,
): Promise<{ campos: Record<string, string>; videoRel: string | null }> {
  const campos: Record<string, string> = {};
  let videoRel: string | null = null;
  for await (const parte of req.parts()) {
    if (parte.type === 'file') {
      const ext = extname(parte.filename ?? '').toLowerCase();
      if (!VIDEO_EXTS.has(ext)) {
        parte.file.resume(); // descartar el stream
        continue;
      }
      const rel = join(subcarpeta, `${randomUUID()}${ext}`);
      const abs = join(config.uploadsDir, rel);
      await mkdir(join(config.uploadsDir, subcarpeta), { recursive: true });
      await pipeline(parte.file, createWriteStream(abs));
      videoRel = rel.replaceAll('\\', '/');
    } else {
      campos[parte.fieldname] = String(parte.value ?? '');
    }
  }
  return { campos, videoRel };
}

/** Figuras con visión por computador (módulo dinamyt-figuras). */
export async function figurasRoutes(app: FastifyInstance) {
  // ── POST /figuras/references — subir referencia (maestro, por grado) ──────
  app.post(
    '/figuras/references',
    { preHandler: requireAcademy(['teacher', 'admin']) },
    async (req, reply) => {
      const { campos, videoRel } = await recibirVideo(req, 'figuras/referencias');
      const { martialArtId, gradeId, name, description } = campos;
      if (!esUuid(martialArtId) || !esUuid(gradeId)) {
        return reply.code(422).send({ error: 'martialArtId y gradeId son obligatorios.' });
      }
      if (!name?.trim()) {
        return reply.code(422).send({ error: 'La figura necesita un nombre.' });
      }
      if (!videoRel) {
        return reply.code(422).send({ error: 'Adjunta el video de la figura (mp4/webm).' });
      }
      const db = req.server.db;
      if (!(await esMaestroDe(db, req.academy!.rol, req.user!.sub, martialArtId))) {
        return reply.code(403).send({ error: 'No tienes asignada esta arte marcial.' });
      }
      const [grado] = await db
        .select()
        .from(grades)
        .where(eq(grades.id, gradeId))
        .limit(1);
      if (!grado || grado.martialArtId !== martialArtId) {
        return reply.code(422).send({ error: 'El grado no pertenece a esa arte marcial.' });
      }

      // Extraer pose/ángulos de la referencia (una sola vez, se reutilizan).
      const anglesRel = `${videoRel}.npz`;
      let detectionRate: number;
      try {
        const r = await req.server.figurasClient.extract(
          join(config.uploadsDir, videoRel),
          join(config.uploadsDir, anglesRel),
        );
        detectionRate = r.detectionRate;
      } catch (err) {
        req.log?.error?.(err);
        return reply.code(502).send({
          error:
            'El servicio de figuras no pudo procesar el video de referencia. ¿Está corriendo academy-figuras (:3009)?',
        });
      }

      const [figura] = await db
        .insert(referenceFigures)
        .values({
          martialArtId,
          gradeId,
          name: name.trim(),
          description: description || null,
          videoPath: videoRel,
          anglesPath: anglesRel,
          detectionRate: detectionRate.toFixed(1),
          uploadedByUserId: req.user!.sub,
        })
        .returning();
      return reply.code(201).send(figura);
    },
  );

  // ── GET /figuras/references?martialArtId= — catálogo según rol ────────────
  app.get('/figuras/references', { preHandler: requireAcademy() }, async (req, reply) => {
    const { martialArtId } = req.query as { martialArtId?: string };
    if (!esUuid(martialArtId)) {
      return reply.code(400).send({ error: 'martialArtId es obligatorio.' });
    }
    const db = req.server.db;
    const base = and(
      eq(referenceFigures.martialArtId, martialArtId),
      eq(referenceFigures.isDeleted, false),
    );

    if (req.academy!.rol === 'student') {
      const mat = await matriculaDe(db, req.user!.sub, martialArtId);
      if (!mat) {
        return reply.code(403).send({ error: 'No estás matriculado en esta arte marcial.' });
      }
      const accesibles = await gradosAccesibles(db, martialArtId, mat.gradoActual.orderIndex);
      const lista = accesibles.length
        ? await db
            .select()
            .from(referenceFigures)
            .where(and(base, inArray(referenceFigures.gradeId, accesibles.map((g) => g.id))))
            .orderBy(desc(referenceFigures.createdAt))
        : [];
      return lista;
    }

    if (!(await esMaestroDe(db, req.academy!.rol, req.user!.sub, martialArtId))) {
      return reply.code(403).send({ error: 'No tienes asignada esta arte marcial.' });
    }
    return db
      .select()
      .from(referenceFigures)
      .where(base)
      .orderBy(desc(referenceFigures.createdAt));
  });

  // ── DELETE /figuras/references/:id — soft delete ──────────────────────────
  app.delete(
    '/figuras/references/:id',
    { preHandler: requireAcademy(['teacher', 'admin']) },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      if (!esUuid(id)) return reply.code(400).send({ error: 'Id inválido.' });
      const db = req.server.db;
      const [fig] = await db
        .select()
        .from(referenceFigures)
        .where(and(eq(referenceFigures.id, id), eq(referenceFigures.isDeleted, false)))
        .limit(1);
      if (!fig) return reply.code(404).send({ error: 'Figura no encontrada.' });
      if (!(await esMaestroDe(db, req.academy!.rol, req.user!.sub, fig.martialArtId))) {
        return reply.code(403).send({ error: 'No tienes asignada esta arte marcial.' });
      }
      await db
        .update(referenceFigures)
        .set({ isDeleted: true })
        .where(eq(referenceFigures.id, id));
      return { ok: true };
    },
  );

  // ── POST /figuras/references/:id/attempts — el estudiante sube su figura ──
  app.post(
    '/figuras/references/:id/attempts',
    { preHandler: requireAcademy(['student']) },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      if (!esUuid(id)) return reply.code(400).send({ error: 'Id inválido.' });
      const db = req.server.db;
      const [fig] = await db
        .select()
        .from(referenceFigures)
        .where(and(eq(referenceFigures.id, id), eq(referenceFigures.isDeleted, false)))
        .limit(1);
      if (!fig) return reply.code(404).send({ error: 'Figura no encontrada.' });

      // Solo figuras de su grado o anteriores (mismo bloqueo del contenido).
      const mat = await matriculaDe(db, req.user!.sub, fig.martialArtId);
      if (!mat) return reply.code(403).send({ error: 'No estás matriculado.' });
      const accesibles = await gradosAccesibles(db, fig.martialArtId, mat.gradoActual.orderIndex);
      if (!accesibles.some((g) => g.id === fig.gradeId)) {
        return reply
          .code(403)
          .send({ error: 'Esta figura pertenece a un grado superior (bloqueada).' });
      }

      const { videoRel } = await recibirVideo(req, 'figuras/intentos');
      if (!videoRel) {
        return reply.code(422).send({ error: 'Adjunta el video de tu ejecución (mp4/webm).' });
      }

      const [intento] = await db
        .insert(figureAttempts)
        .values({
          referenceFigureId: fig.id,
          studentUserId: req.user!.sub,
          videoPath: videoRel,
          gradeNameSnapshot: mat.gradoActual.name,
        })
        .returning();

      // Bitácora: figura enviada al análisis.
      await registrarActividad(db, {
        userId: req.user!.sub,
        type: 'intento_figura',
        detail: `Envió su figura «${fig.name}» al análisis`,
        martialArtId: fig.martialArtId,
        refId: intento.id,
      });

      // Análisis en segundo plano: el estudiante consulta el estado por polling.
      const outDir = join('figuras/resultados', intento.id).replaceAll('\\', '/');
      void (async () => {
        try {
          const r = await req.server.figurasClient.compare({
            studentVideoPath: join(config.uploadsDir, videoRel),
            referenceVideoPath: join(config.uploadsDir, fig.videoPath),
            referenceAnglesPath: join(config.uploadsDir, fig.anglesPath ?? ''),
            outDir: join(config.uploadsDir, outDir),
          });
          await db
            .update(figureAttempts)
            .set({
              status: 'COMPLETADO',
              score: r.overallScore.toFixed(2),
              resultJson: r,
              reportImgPath: r.reportImg,
              annotatedVideoPath: r.annotatedVideo,
              completedAt: new Date(),
            })
            .where(eq(figureAttempts.id, intento.id));
          await notificar(db, [intento.studentUserId], {
            type: 'figura_lista',
            title: `🥋 Tu figura «${fig.name}» fue analizada: ${Math.round(r.overallScore)}/100`,
            link: '/figuras',
          });
        } catch (err) {
          await db
            .update(figureAttempts)
            .set({
              status: 'ERROR',
              errorMsg: err instanceof Error ? err.message.slice(0, 500) : 'Error de análisis',
              completedAt: new Date(),
            })
            .where(eq(figureAttempts.id, intento.id));
        }
      })();

      return reply.code(201).send(intento);
    },
  );

  // ── GET /figuras/attempts/:id — resultado (dueño o maestro del arte) ──────
  app.get('/figuras/attempts/:id', { preHandler: requireAcademy() }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!esUuid(id)) return reply.code(400).send({ error: 'Id inválido.' });
    const db = req.server.db;
    const [intento] = await db
      .select()
      .from(figureAttempts)
      .where(eq(figureAttempts.id, id))
      .limit(1);
    if (!intento) return reply.code(404).send({ error: 'Intento no encontrado.' });
    const [fig] = await db
      .select()
      .from(referenceFigures)
      .where(eq(referenceFigures.id, intento.referenceFigureId))
      .limit(1);
    const esPropio = intento.studentUserId === req.user!.sub;
    if (
      !esPropio &&
      (req.academy!.rol === 'student' ||
        !(await esMaestroDe(db, req.academy!.rol, req.user!.sub, fig.martialArtId)))
    ) {
      return reply.code(403).send({ error: 'No puedes ver este intento.' });
    }
    return { ...intento, figura: fig };
  });

  // ── GET /figuras/attempts?martialArtId=|mine=1 — historial ────────────────
  app.get('/figuras/attempts', { preHandler: requireAcademy() }, async (req, reply) => {
    const { martialArtId, mine } = req.query as { martialArtId?: string; mine?: string };
    const db = req.server.db;

    if (mine === '1' || req.academy!.rol === 'student') {
      return db
        .select({
          id: figureAttempts.id,
          status: figureAttempts.status,
          score: figureAttempts.score,
          gradeNameSnapshot: figureAttempts.gradeNameSnapshot,
          createdAt: figureAttempts.createdAt,
          nombre: referenceFigures.name,
          referenceFigureId: figureAttempts.referenceFigureId,
        })
        .from(figureAttempts)
        .innerJoin(referenceFigures, eq(referenceFigures.id, figureAttempts.referenceFigureId))
        .where(eq(figureAttempts.studentUserId, req.user!.sub))
        .orderBy(desc(figureAttempts.createdAt))
        .limit(30);
    }

    if (!esUuid(martialArtId)) {
      return reply.code(400).send({ error: 'martialArtId es obligatorio.' });
    }
    if (!(await esMaestroDe(db, req.academy!.rol, req.user!.sub, martialArtId))) {
      return reply.code(403).send({ error: 'No tienes asignada esta arte marcial.' });
    }
    return db
      .select({
        id: figureAttempts.id,
        status: figureAttempts.status,
        score: figureAttempts.score,
        gradeNameSnapshot: figureAttempts.gradeNameSnapshot,
        createdAt: figureAttempts.createdAt,
        nombre: referenceFigures.name,
        estudiante: academyUsers.fullName,
        email: academyUsers.email,
      })
      .from(figureAttempts)
      .innerJoin(referenceFigures, eq(referenceFigures.id, figureAttempts.referenceFigureId))
      .leftJoin(academyUsers, eq(academyUsers.ecosystemUserId, figureAttempts.studentUserId))
      .where(eq(referenceFigures.martialArtId, martialArtId))
      .orderBy(desc(figureAttempts.createdAt))
      .limit(50);
  });
}
