import { eq, and } from 'drizzle-orm';
import type { JwtPayload, AcademyRole } from '@dinamyt/shared';
import { academyUsers, teacherMartialArts, type Db } from '@dinamyt/academy-db';

export type UsuarioLocal = typeof academyUsers.$inferSelect;

const ROLES_VALIDOS: AcademyRole[] = ['admin', 'teacher', 'student'];

/**
 * Espejo local del usuario (RF-ACA-05): crea la fila en `academy_users` la
 * primera vez y mantiene nombre/correo sincronizados con el token, sin duplicar
 * la identidad (la cuenta vive en el ecosystem).
 */
export async function sincronizarUsuarioLocal(
  db: Db,
  payload: JwtPayload,
): Promise<UsuarioLocal> {
  const [existente] = await db
    .select()
    .from(academyUsers)
    .where(eq(academyUsers.ecosystemUserId, payload.sub))
    .limit(1);

  if (!existente) {
    const [creado] = await db
      .insert(academyUsers)
      .values({
        ecosystemUserId: payload.sub,
        fullName: payload.fullName ?? null,
        email: payload.email ?? null,
      })
      .returning();
    return creado;
  }

  if (
    (payload.fullName && payload.fullName !== existente.fullName) ||
    (payload.email && payload.email !== existente.email)
  ) {
    const [actualizado] = await db
      .update(academyUsers)
      .set({
        fullName: payload.fullName ?? existente.fullName,
        email: payload.email ?? existente.email,
        updatedAt: new Date(),
      })
      .where(eq(academyUsers.id, existente.id))
      .returning();
    return actualizado;
  }

  return existente;
}

/**
 * Rol efectivo en Academy: el rol LOCAL asignado por el admin prevalece sobre
 * el `role_academy` del token; sin ninguno, se asume estudiante. El super
 * admin del ecosistema opera como admin de Academy.
 */
export function rolEfectivo(payload: JwtPayload, usuario: UsuarioLocal): AcademyRole {
  if (payload.is_super_admin) return 'admin';
  if (usuario.localRole) return usuario.localRole;
  const delToken = payload.role_academy as AcademyRole | null;
  return delToken && ROLES_VALIDOS.includes(delToken) ? delToken : 'student';
}

/**
 * ¿El maestro está asignado a este arte marcial (RF-ACA-09)? Los admin
 * gestionan todas las artes sin asignación explícita.
 */
export async function esMaestroDe(
  db: Db,
  rol: AcademyRole,
  userId: string,
  martialArtId: string,
): Promise<boolean> {
  if (rol === 'admin') return true;
  if (rol !== 'teacher') return false;
  const [fila] = await db
    .select({ id: teacherMartialArts.id })
    .from(teacherMartialArts)
    .where(
      and(
        eq(teacherMartialArts.teacherUserId, userId),
        eq(teacherMartialArts.martialArtId, martialArtId),
      ),
    )
    .limit(1);
  return !!fila;
}
