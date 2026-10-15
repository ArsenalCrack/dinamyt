import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { rm } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
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

/** Lo que queda donde otro registro guardó el nombre de quien se fue. El
 *  mismo texto que deja el ecosistema (`borrar-de-la-base.ts`). */
export const NOMBRE_BORRADA = 'PERSONA ELIMINADA';

/**
 * Borra de Academy todo lo de una cuenta que se está borrando en el
 * ecosistema (`SupresionService`, OPERAR §4.15). Devuelve las rutas de sus
 * archivos en el almacén, para borrarlos DESPUÉS del commit: un archivo
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
export async function suprimirPersona(db: Db, ecoSub: string): Promise<string[]> {
  return db.transaction(async (tx) => {
    const archivos: string[] = [];

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
      archivos.push(...evidencias.map((e) => e.url!));
      await tx.delete(answers).where(inArray(answers.attemptId, idsIntentos));
      await tx.delete(attempts).where(inArray(attempts.id, idsIntentos));
      // «📥 Fulano entregó…» en la campana de cada maestro del arte.
      await tx
        .delete(notifications)
        .where(inArray(notifications.link, idsIntentos.map((id) => `/maestro/revisar/${id}`)));
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
      .select({
        id: figureAttempts.id,
        video: figureAttempts.videoPath,
        reporte: figureAttempts.reportImgPath,
        anotado: figureAttempts.annotatedVideoPath,
      })
      .from(figureAttempts)
      .where(eq(figureAttempts.studentUserId, ecoSub));
    for (const f of figuras) {
      // La carpeta de resultados la nombra `routes/figuras.ts` con el id del intento.
      archivos.push(f.video, `figuras/resultados/${f.id}`);
      if (f.reporte) archivos.push(f.reporte);
      if (f.anotado) archivos.push(f.anotado);
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

    return archivos;
  });
}

/**
 * Borra esas rutas del almacén. Solo las que caen DENTRO de él: una evidencia
 * puede ser un enlace de YouTube, y una ruta con `..` no sale del almacén
 * aunque alguien la haya colado en la base. Lo que ya no está, no falla.
 */
export async function borrarArchivos(almacen: string, rutas: string[]): Promise<void> {
  for (const ruta of new Set(rutas)) {
    const abs = dentroDelAlmacen(almacen, ruta);
    if (abs) await rm(abs, { recursive: true, force: true }).catch(() => undefined);
  }
}

function dentroDelAlmacen(almacen: string, ruta: string): string | null {
  // `https:`, `blob:`… y también `C:` en Windows.
  if (/^[a-z][a-z0-9+.-]*:/i.test(ruta) || isAbsolute(ruta)) return null;
  const abs = resolve(almacen, ruta);
  const rel = relative(resolve(almacen), abs);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return null;
  return abs;
}
