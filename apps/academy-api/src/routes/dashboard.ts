import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import {
  martialArts,
  grades,
  enrollments,
  contents,
  contentViews,
  evaluations,
  attempts,
  academyUsers,
  announcements,
  teacherRequests,
  teacherMartialArts,
  figureAttempts,
  referenceFigures,
} from '@dinamyt/academy-db';
import { requireAcademy } from '../plugins/auth';
import { gradosAccesibles } from '../lib/enrollments';

/**
 * Bandeja de pendientes por rol:
 * - Estudiante: tareas/cuestionarios sin entregar (con vencimiento), material
 *   sin ver, intentos en revisión y anuncios recientes.
 * - Maestro: intentos por calificar en sus artes, tareas próximas a vencer y
 *   figuras recientes de sus estudiantes.
 * - Admin: solicitudes pendientes.
 */
export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/dashboard', { preHandler: requireAcademy() }, async (req) => {
    const db = req.server.db;
    const rol = req.academy!.rol;
    const sub = req.user!.sub;
    const ahora = new Date();

    if (rol === 'student') {
      const mats = await db.select().from(enrollments).where(eq(enrollments.studentUserId, sub));
      const pendientes: unknown[] = [];
      const enRevision: unknown[] = [];
      let materialSinVer = 0;
      const anuncios: unknown[] = [];

      for (const m of mats) {
        const [arte] = await db
          .select()
          .from(martialArts)
          .where(eq(martialArts.id, m.martialArtId))
          .limit(1);
        const [gradoActual] = await db
          .select()
          .from(grades)
          .where(eq(grades.id, m.currentGradeId))
          .limit(1);
        const accesibles = await gradosAccesibles(db, m.martialArtId, gradoActual.orderIndex);
        const idsAcc = accesibles.map((g) => g.id);

        // Evaluaciones disponibles aún no agotadas.
        const evals = idsAcc.length
          ? await db
              .select()
              .from(evaluations)
              .where(
                and(
                  eq(evaluations.martialArtId, m.martialArtId),
                  inArray(evaluations.gradeId, idsAcc),
                  eq(evaluations.isDeleted, false),
                ),
              )
              .orderBy(asc(evaluations.dueAt))
          : [];
        const misIntentos = evals.length
          ? await db
              .select()
              .from(attempts)
              .where(
                and(
                  eq(attempts.studentUserId, sub),
                  inArray(attempts.evaluationId, evals.map((e) => e.id)),
                ),
              )
          : [];
        for (const e of evals) {
          const propios = misIntentos.filter((a) => a.evaluationId === e.id);
          if (propios.some((a) => a.status === 'ENVIADO')) {
            enRevision.push({ id: e.id, title: e.title, kind: e.kind, arte: arte.name });
            continue;
          }
          const disponible = !e.availableFrom || new Date(e.availableFrom) <= ahora;
          const vencida = !!e.dueAt && new Date(e.dueAt) < ahora;
          if (disponible && propios.length < e.maxAttempts && !vencida) {
            pendientes.push({
              id: e.id,
              title: e.title,
              kind: e.kind,
              dueAt: e.dueAt,
              arte: arte.name,
              grado: accesibles.find((g) => g.id === e.gradeId)?.name ?? null,
            });
          }
        }

        // Material del grado actual sin ver.
        const unidades = await db
          .select({ id: contents.id })
          .from(contents)
          .where(
            and(
              eq(contents.martialArtId, m.martialArtId),
              eq(contents.gradeId, m.currentGradeId),
              eq(contents.isDeleted, false),
            ),
          );
        if (unidades.length) {
          const vistas = await db
            .select({ id: contentViews.id })
            .from(contentViews)
            .where(
              and(
                eq(contentViews.studentUserId, sub),
                inArray(contentViews.contentId, unidades.map((u) => u.id)),
              ),
            );
          materialSinVer += unidades.length - vistas.length;
        }

        // Anuncios visibles.
        const avisos = await db
          .select()
          .from(announcements)
          .where(
            and(
              eq(announcements.martialArtId, m.martialArtId),
              eq(announcements.isDeleted, false),
            ),
          )
          .orderBy(desc(announcements.createdAt))
          .limit(5);
        anuncios.push(
          ...avisos
            .filter((a) => !a.gradeId || idsAcc.includes(a.gradeId))
            .map((a) => ({ ...a, arte: arte.name })),
        );
      }

      // Figuras propias recién analizadas.
      const figuras = await db
        .select({
          id: figureAttempts.id,
          status: figureAttempts.status,
          score: figureAttempts.score,
          createdAt: figureAttempts.createdAt,
          nombre: referenceFigures.name,
        })
        .from(figureAttempts)
        .innerJoin(referenceFigures, eq(referenceFigures.id, figureAttempts.referenceFigureId))
        .where(eq(figureAttempts.studentUserId, sub))
        .orderBy(desc(figureAttempts.createdAt))
        .limit(5);

      return { rol, pendientes, enRevision, materialSinVer, anuncios, figuras };
    }

    if (rol === 'teacher' || rol === 'admin') {
      // Artes del maestro (admin: todas).
      const artes =
        rol === 'admin'
          ? await db.select().from(martialArts)
          : await db
              .select({ id: martialArts.id, name: martialArts.name })
              .from(teacherMartialArts)
              .innerJoin(martialArts, eq(martialArts.id, teacherMartialArts.martialArtId))
              .where(eq(teacherMartialArts.teacherUserId, sub));
      const arteIds = artes.map((a) => a.id);

      const porCalificar = arteIds.length
        ? await db
            .select({
              attemptId: attempts.id,
              submittedAt: attempts.submittedAt,
              evaluacion: evaluations.title,
              kind: evaluations.kind,
              martialArtId: evaluations.martialArtId,
              estudiante: academyUsers.fullName,
              email: academyUsers.email,
              avatarUrl: academyUsers.avatarUrl,
            })
            .from(attempts)
            .innerJoin(evaluations, eq(evaluations.id, attempts.evaluationId))
            .leftJoin(academyUsers, eq(academyUsers.ecosystemUserId, attempts.studentUserId))
            .where(
              and(eq(attempts.status, 'ENVIADO'), inArray(evaluations.martialArtId, arteIds)),
            )
            .orderBy(asc(attempts.submittedAt))
        : [];

      const proximasAVencer = arteIds.length
        ? (
            await db
              .select()
              .from(evaluations)
              .where(
                and(inArray(evaluations.martialArtId, arteIds), eq(evaluations.isDeleted, false)),
              )
              .orderBy(asc(evaluations.dueAt))
          ).filter((e) => e.dueAt && new Date(e.dueAt) > ahora)
        : [];

      const solicitudes =
        rol === 'admin'
          ? await db
              .select()
              .from(teacherRequests)
              .where(eq(teacherRequests.status, 'PENDIENTE'))
          : [];

      const figuras = arteIds.length
        ? await db
            .select({
              id: figureAttempts.id,
              status: figureAttempts.status,
              score: figureAttempts.score,
              createdAt: figureAttempts.createdAt,
              nombre: referenceFigures.name,
              estudiante: academyUsers.fullName,
            })
            .from(figureAttempts)
            .innerJoin(referenceFigures, eq(referenceFigures.id, figureAttempts.referenceFigureId))
            .leftJoin(academyUsers, eq(academyUsers.ecosystemUserId, figureAttempts.studentUserId))
            .where(inArray(referenceFigures.martialArtId, arteIds))
            .orderBy(desc(figureAttempts.createdAt))
            .limit(8)
        : [];

      return {
        rol,
        porCalificar,
        proximasAVencer: proximasAVencer.slice(0, 8),
        solicitudesPendientes: solicitudes.length,
        figuras,
      };
    }

    return { rol };
  });
}
