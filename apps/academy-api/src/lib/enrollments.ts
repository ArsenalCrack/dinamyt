import { and, asc, eq, lte } from 'drizzle-orm';
import { enrollments, grades, type Db } from '@dinamyt/academy-db';

/** UUID v4-ish: valida params de ruta para responder 400 en vez de 500. */
export function esUuid(v: string | undefined | null): v is string {
  return (
    !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  );
}

export type Matricula = typeof enrollments.$inferSelect;
export type Grado = typeof grades.$inferSelect;

/** Matrícula del estudiante en un arte, con su grado actual resuelto. */
export async function matriculaDe(
  db: Db,
  studentUserId: string,
  martialArtId: string,
): Promise<{ matricula: Matricula; gradoActual: Grado } | null> {
  const [matricula] = await db
    .select()
    .from(enrollments)
    .where(
      and(
        eq(enrollments.studentUserId, studentUserId),
        eq(enrollments.martialArtId, martialArtId),
      ),
    )
    .limit(1);
  if (!matricula) return null;

  const [gradoActual] = await db
    .select()
    .from(grades)
    .where(eq(grades.id, matricula.currentGradeId))
    .limit(1);
  if (!gradoActual) return null;
  return { matricula, gradoActual };
}

/**
 * Grados a los que el estudiante tiene acceso (RF-ACA-14): su grado actual y
 * los anteriores ya superados. Los superiores permanecen bloqueados.
 */
export async function gradosAccesibles(
  db: Db,
  martialArtId: string,
  ordenGradoActual: number,
): Promise<Grado[]> {
  return db
    .select()
    .from(grades)
    .where(
      and(
        eq(grades.martialArtId, martialArtId),
        lte(grades.orderIndex, ordenGradoActual),
      ),
    )
    .orderBy(asc(grades.orderIndex));
}
