import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  academyUsers,
  activityLog,
  announcements,
  answers,
  attempts,
  contentViews,
  enrollments,
  figureAttempts,
  gradeAdvancements,
  notifications,
  questionBank,
  teacherMartialArts,
  teacherRequests,
  type Db,
} from '@dinamyt/academy-db';
import {
  ARCHIVO_DE_UNA_PERSONA,
  CARPETA_DE_RESULTADOS,
  carpetaResultados,
  enlaceRevision,
} from './rutas';

/** Lo que queda donde otro registro guardó el nombre de quien se fue. El
 *  mismo texto que deja el ecosistema (`borrar-de-la-base.ts`). */
export const NOMBRE_BORRADA = 'PERSONA ELIMINADA';

/**
 * Borra de Academy todo lo de una cuenta que se está borrando en el
 * ecosistema (`SupresionService`, OPERAR §4.15). Devuelve sus archivos y
 * carpetas en el almacén, para borrarlos DESPUÉS del commit: un archivo
 * borrado no vuelve si la transacción se deshace.
 *
 * ── Qué se borra ──
 *
 * Como alumno: intentos y respuestas, vistas, matrículas con su historial de
 * grados, figuras enviadas y el aviso que cada entrega le dejó al maestro
 * (lleva su nombre). Como maestro: sus asignaciones y su banco de preguntas.
 * De todos: avisos, actividad, solicitudes y su fila de `academy_users`.
 *
 * ── Qué se queda ──
 *
 * Lo que un maestro publicó para sus alumnos —contenidos, evaluaciones,
 * figuras de referencia y anuncios— sigue ahí, con el UUID y sin su nombre:
 * borrarlo dejaría a los alumnos sin el material y sin la historia de lo que
 * rindieron. Por lo mismo, en el avance de grado de otro alumno su nombre
 * pasa a `NOMBRE_BORRADA`.
 *
 * Idempotente: la segunda vez no encuentra nada y no falla.
 */
export interface LoSuyoEnDisco {
  archivos: string[];
  carpetas: string[];
}

export async function suprimirPersona(db: Db, ecoSub: string): Promise<LoSuyoEnDisco> {
  return db.transaction(async (tx) => {
    const archivos: string[] = [];
    const carpetas: string[] = [];

    const intentos = await tx
      .select({ id: attempts.id })
      .from(attempts)
      .where(eq(attempts.studentUserId, ecoSub));
    const idsIntentos = intentos.map((i) => i.id);
    if (idsIntentos.length > 0) {
      const evidencias = await tx
        .select({ url: answers.evidenceUrl })
        .from(answers)
        .where(and(inArray(answers.attemptId, idsIntentos), isNotNull(answers.evidenceUrl)));
      await tx.delete(answers).where(inArray(answers.attemptId, idsIntentos));
      await tx.delete(attempts).where(inArray(attempts.id, idsIntentos));
      // Un archivo que otra respuesta todavía nombra no es solo suyo.
      const suyas = [...new Set(evidencias.map((e) => e.url!))];
      const deOtros =
        suyas.length === 0
          ? []
          : await tx
              .select({ url: answers.evidenceUrl })
              .from(answers)
              .where(inArray(answers.evidenceUrl, suyas));
      const compartidas = new Set(deOtros.map((e) => e.url));
      archivos.push(...suyas.filter((u) => !compartidas.has(u)));
      // «📥 Fulano entregó…» en la campana de cada maestro del arte.
      await tx
        .delete(notifications)
        .where(inArray(notifications.link, idsIntentos.map(enlaceRevision)));
    }
    await tx.delete(contentViews).where(eq(contentViews.studentUserId, ecoSub));

    const matriculas = await tx
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(eq(enrollments.studentUserId, ecoSub));
    const idsMatriculas = matriculas.map((m) => m.id);
    if (idsMatriculas.length > 0) {
      const certificados = await tx
        .select({ url: gradeAdvancements.certificateUrl })
        .from(gradeAdvancements)
        .where(
          and(
            inArray(gradeAdvancements.enrollmentId, idsMatriculas),
            isNotNull(gradeAdvancements.certificateUrl),
          ),
        );
      archivos.push(...certificados.map((c) => c.url!));
      await tx.delete(gradeAdvancements).where(inArray(gradeAdvancements.enrollmentId, idsMatriculas));
      await tx.delete(enrollments).where(inArray(enrollments.id, idsMatriculas));
    }

    const figuras = await tx
      .select({ id: figureAttempts.id, video: figureAttempts.videoPath })
      .from(figureAttempts)
      .where(eq(figureAttempts.studentUserId, ecoSub));
    for (const f of figuras) {
      // El reporte y el video anotado viven dentro de su carpeta de resultados.
      archivos.push(f.video);
      carpetas.push(carpetaResultados(f.id));
    }
    await tx.delete(figureAttempts).where(eq(figureAttempts.studentUserId, ecoSub));

    await tx.delete(teacherMartialArts).where(eq(teacherMartialArts.teacherUserId, ecoSub));
    await tx
      .update(teacherMartialArts)
      .set({ assignedByUserId: null })
      .where(eq(teacherMartialArts.assignedByUserId, ecoSub));
    await tx.delete(questionBank).where(eq(questionBank.teacherUserId, ecoSub));
    await tx
      .update(announcements)
      .set({ createdByName: NOMBRE_BORRADA })
      .where(eq(announcements.createdByUserId, ecoSub));
    await tx
      .update(gradeAdvancements)
      .set({ approvedByName: NOMBRE_BORRADA })
      .where(eq(gradeAdvancements.approvedByUserId, ecoSub));

    await tx.delete(notifications).where(eq(notifications.userId, ecoSub));
    await tx.delete(activityLog).where(eq(activityLog.userId, ecoSub));
    await tx.delete(teacherRequests).where(eq(teacherRequests.userId, ecoSub));
    await tx.delete(academyUsers).where(eq(academyUsers.ecosystemUserId, ecoSub));

    return { archivos, carpetas };
  });
}

/**
 * Borra eso del almacén, y solo si tiene la forma exacta de lo que escribe
 * Academy: un archivo `<carpeta>/<uuid>.<ext>` (`ARCHIVO_DE_UNA_PERSONA`) o la
 * carpeta de resultados de un intento. Lo demás se salta: un enlace de
 * YouTube, una ruta con `..`, o «evidencias» a secas, que sería la carpeta de
 * todos. Solo las carpetas se borran con lo que tengan dentro. Lo que ya no
 * está, no falla.
 */
export async function borrarArchivos(almacen: string, { archivos, carpetas }: LoSuyoEnDisco) {
  const raiz = resolve(almacen);
  for (const ruta of new Set(archivos)) {
    if (ARCHIVO_DE_UNA_PERSONA.test(ruta)) {
      await rm(resolve(raiz, ruta), { force: true }).catch(() => undefined);
    }
  }
  for (const ruta of new Set(carpetas)) {
    if (CARPETA_DE_RESULTADOS.test(ruta)) {
      await rm(resolve(raiz, ruta), { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
