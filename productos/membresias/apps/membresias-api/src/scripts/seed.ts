import { eq } from 'drizzle-orm';
import { users, type Db } from '@dinamyt/membresias-db';
import { config } from '../config';
import { hashPassword } from '../lib/auth/passwords';
import { sinFiltroDeClub } from '../lib/db-contexto';

/**
 * Siembra del superadmin.
 *
 * Es la única cuenta que nace sola: sin ella nadie podría crear el primer club
 * ni el primer maestro. Se ejecuta al arrancar la API y es idempotente — si la
 * cuenta ya existe no se toca, así que cambiar `SUPERADMIN_PASSWORD` en el
 * hosting NO reescribe una contraseña que el superadmin ya cambió a mano.
 *
 * Sin `SUPERADMIN_EMAIL` y `SUPERADMIN_PASSWORD` no se siembra nada.
 */
export async function seedSuperadmin(db: Db): Promise<'creado' | 'ya-existia' | 'omitido'> {
  const email = config.superadminEmail.trim().toLowerCase();
  const password = config.superadminPassword;
  if (!email || !password) return 'omitido';

  // El superadmin no pertenece a ningún club (org_id NULL), así que bajo el
  // filtro de RLS ninguna consulta con contexto podría verlo ni crearlo.
  return sinFiltroDeClub(db, async (tx) => {
    const [ya] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (ya) return 'ya-existia' as const;

    await tx.insert(users).values({
      email,
      fullName: config.superadminNombre,
      passwordHash: await hashPassword(password),
      role: 'owner', // el rol no aplica a quien atraviesa todos los clubes
      isSuperAdmin: true,
      orgId: null,
    });
    return 'creado' as const;
  });
}
