import { eq, and } from 'drizzle-orm';
import type { JwtPayload, AcademyRole } from '@dinamyt/shared';
import { academyUsers, teacherMartialArts, type Db } from '@dinamyt/academy-db';
import { config } from '../config';

// Foto de perfil: se refresca desde el ecosystem UNA vez por sesión (~30 min),
// con el token del propio usuario. Best-effort: si el ecosystem no responde,
// Academy sigue funcionando con la foto que tenga.
const VENTANA_AVATAR_MS = 30 * 60 * 1000;
const ultimoRefresco = new Map<string, number>();

export async function refrescarPerfilEcosystem(db: Db, sub: string, token: string) {
  const ahora = Date.now();
  const previo = ultimoRefresco.get(sub);
  if (previo && ahora - previo < VENTANA_AVATAR_MS) return;
  ultimoRefresco.set(sub, ahora);
  try {
    const res = await fetch(`${config.ecosystemApiUrl}/users/${sub}/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const perfil = (await res.json()) as { avatarUrl?: string | null };
    if (perfil.avatarUrl !== undefined) {
      await db
        .update(academyUsers)
        .set({ avatarUrl: perfil.avatarUrl ?? null, updatedAt: new Date() })
        .where(eq(academyUsers.ecosystemUserId, sub));
    }
  } catch {
    /* sin red hacia el ecosystem: se conserva la foto local */
  }
}

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
 * admin del ecosistema opera como admin de Academy. El ecosystem emite como
 * `role_academy` el rol de la MEMBRESÍA de la org (maestro/owner/student…),
 * así que aquí se normaliza al catálogo local (admin/teacher/student).
 */
export function rolEfectivo(payload: JwtPayload, usuario: UsuarioLocal): AcademyRole {
  if (payload.is_super_admin) return 'admin';
  if (usuario.localRole) return usuario.localRole;
  const delToken = (payload.role_academy ?? '').toLowerCase();
  if (delToken === 'admin' || delToken === 'owner') return 'admin';
  if (delToken === 'teacher' || delToken === 'maestro' || delToken === 'coach') {
    return 'teacher';
  }
  return ROLES_VALIDOS.includes(delToken as AcademyRole)
    ? (delToken as AcademyRole)
    : 'student';
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
