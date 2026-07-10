import { and, eq } from 'drizzle-orm';
import {
  notifications,
  enrollments,
  teacherMartialArts,
  type Db,
} from '@dinamyt/academy-db';

export interface Aviso {
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
}

/** Crea la misma notificación in-app para varias personas (best-effort). */
export async function notificar(db: Db, userIds: string[], aviso: Aviso) {
  const unicos = [...new Set(userIds)].filter(Boolean);
  if (unicos.length === 0) return;
  await db.insert(notifications).values(
    unicos.map((userId) => ({
      userId,
      type: aviso.type,
      title: aviso.title,
      body: aviso.body ?? null,
      link: aviso.link ?? null,
    })),
  );
}

/** Estudiantes matriculados en un arte (opcionalmente solo de un grado). */
export async function estudiantesDe(
  db: Db,
  martialArtId: string,
  gradeId?: string | null,
): Promise<string[]> {
  const cond = gradeId
    ? and(
        eq(enrollments.martialArtId, martialArtId),
        eq(enrollments.currentGradeId, gradeId),
      )
    : eq(enrollments.martialArtId, martialArtId);
  const filas = await db
    .select({ id: enrollments.studentUserId })
    .from(enrollments)
    .where(cond);
  return filas.map((f) => f.id);
}

/** Maestros asignados a un arte marcial. */
export async function maestrosDe(db: Db, martialArtId: string): Promise<string[]> {
  const filas = await db
    .select({ id: teacherMartialArts.teacherUserId })
    .from(teacherMartialArts)
    .where(eq(teacherMartialArts.martialArtId, martialArtId));
  return filas.map((f) => f.id);
}
