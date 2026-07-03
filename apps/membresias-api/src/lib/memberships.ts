import { and, eq } from 'drizzle-orm';
import { memberships, type Db } from '@dinamyt/membresias-db';

/** Get-or-create del estado de membresía del alumno en este club. */
export async function ensureMembership(db: Db, orgId: string, userId: string) {
  const [existing] = await db
    .select()
    .from(memberships)
    .where(
      and(eq(memberships.orgId, orgId), eq(memberships.ecosystemUserId, userId)),
    )
    .limit(1);
  if (existing) return existing;
  const [row] = await db
    .insert(memberships)
    .values({ orgId, ecosystemUserId: userId })
    .returning();
  return row;
}
