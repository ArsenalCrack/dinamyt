import { and, eq, inArray } from 'drizzle-orm';
import {
  notifications,
  enrollments,
  teacherMartialArts,
  academyUsers,
  type Db,
} from '@dinamyt/academy-db';

export interface Aviso {
  type: string;
  title: string;
  /**
   * El cuerpo del aviso.
   *
   * Puede ser una función de la ZONA HORARIA de quien lo va a leer, y esa es
   * la única forma de escribir bien una hora en un texto que se genera en el
   * servidor: aquí no hay navegador que la ponga, y con un texto fijo «vence
   * el martes» le llega igual a quien está en Bogotá y a quien está en Madrid,
   * donde puede ser miércoles.
   */
  body?: string | null | ((zona: string | null) => string | null);
  link?: string | null;
}

/**
 * Crea la notificación in-app para varias personas (best-effort).
 *
 * Si `body` es una función, se llama una vez **por persona** con su zona
 * horaria, que Academy espeja del token del ecosystem (ver
 * `sincronizarUsuarioLocal`). Quien todavía no la tenga —no ha vuelto a entrar
 * desde el cambio— recibe `null` y el texto se escribe como antes, con la del
 * servidor.
 */
export async function notificar(db: Db, userIds: string[], aviso: Aviso) {
  const unicos = [...new Set(userIds)].filter(Boolean);
  if (unicos.length === 0) return;

  const zonas = new Map<string, string | null>();
  if (typeof aviso.body === 'function') {
    const filas = await db
      .select({ id: academyUsers.ecosystemUserId, tz: academyUsers.timezone })
      .from(academyUsers)
      .where(inArray(academyUsers.ecosystemUserId, unicos));
    for (const f of filas) zonas.set(f.id, f.tz);
  }

  await db.insert(notifications).values(
    unicos.map((userId) => ({
      userId,
      type: aviso.type,
      title: aviso.title,
      body:
        typeof aviso.body === 'function'
          ? (aviso.body(zonas.get(userId) ?? null) ?? null)
          : (aviso.body ?? null),
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
