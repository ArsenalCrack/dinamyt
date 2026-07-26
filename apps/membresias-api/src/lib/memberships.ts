import { and, eq } from 'drizzle-orm';
import { memberships, users, type Db } from '@dinamyt/membresias-db';

/** El alumno no existe, no está activo, o es de otro club. */
export class AlumnoNoDelClub extends Error {
  constructor() {
    super('Alumno no encontrado en este club.');
    this.name = 'AlumnoNoDelClub';
  }
}

/**
 * Get-or-create del estado de membresía del alumno en este club.
 *
 * Comprueba SIEMPRE que el alumno pertenezca al club antes de crear nada. Sin
 * esa comprobación, escanear en el club B un carnet QR del club A daría de alta
 * una membresía fantasma: el carnet es un UUID y cualquier UUID valdría.
 */
export async function ensureMembership(db: Db, orgId: string, userId: string) {
  const [persona] = await db
    .select({ id: users.id, isActive: users.isActive })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.orgId, orgId)))
    .limit(1);
  if (!persona || !persona.isActive) throw new AlumnoNoDelClub();

  const [existing] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)))
    .limit(1);
  if (existing) return existing;

  const [row] = await db.insert(memberships).values({ orgId, userId }).returning();
  return row;
}
