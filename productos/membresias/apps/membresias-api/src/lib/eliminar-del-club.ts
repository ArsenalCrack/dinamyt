import { eq, exists, inArray, or, sql } from 'drizzle-orm';
import {
  attendances,
  memberships,
  notifications,
  orgs,
  payments,
  pushSubscriptions,
  users,
  type Db,
} from '@dinamyt/membresias-db';
import { altaEnElEcosistema, pedirBajaAlEcosistema } from './alta-ecosistema';
import { enElEcosistema } from './ecosistema';
import { recordarEliminado } from './eliminados-recientes';

/** El nombre que queda en los pagos y asistencias de quien ya no está. */
export const NOMBRE_ELIMINADO = 'PERSONA ELIMINADA';

export type Eliminacion =
  | { ok: true; resultado: 'borrada' | 'anonimizada' }
  | { ok: false; status: 409 | 503; error: string };

/**
 * Sacar a alguien del club de verdad (`POST /users/:id/eliminar`).
 *
 * Desactivar guarda la ficha entera para quien vuelve, y por eso se queda para
 * siempre en «sin acceso». Esto es el segundo gesto, para el alta por error y
 * para quien no va a volver.
 *
 * ── El portal primero ──
 *
 * Si la persona también es del club en DINAMYT, se le pide al portal la baja
 * ANTES de tocar nada aquí, y si dice que no —o no contesta, o esta instalación
 * no puede preguntarle—, aquí no pasa nada. Al revés quedaría a medias:
 * borrada aquí y miembro allí, y la próxima alta del espejo le haría nacer una
 * ficha nueva. Por eso `eliminarDelClub` es la puerta del maestro.
 *
 * La otra, `suprimirFichaDeCuenta`, se salta esa regla a propósito: la llama
 * el propio portal (`/sync/supresion`) cuando la cuenta entera se borra, y
 * allí ya no queda pertenencia que pedir.
 *
 * ── Borrar o vaciar ──
 *
 * Sin historia —ni un pago, ni una asistencia, ni pagos que haya registrado o
 * que pague por otro— la ficha se borra entera. Con historia se VACÍA de todo
 * lo que dice quién era: sus pagos y su asistencia siguen sumando en la caja y
 * en las estadísticas, pero ya no dicen de quién son. Borrarlos cambiaría
 * hacia atrás los totales de meses ya cerrados.
 */
export async function eliminarDelClub(
  db: Db,
  datos: {
    persona: { id: string; ecoSub: string | null };
    orgId: string;
    porUserId: string;
    porSuperAdmin: boolean;
  },
): Promise<Eliminacion> {
  const portal = await bajaEnElPortal(db, datos);
  if (!portal.ok) return portal;
  const resultado = await vaciarOBorrar(db, datos.persona.id);
  if (portal.ecoOrgId && datos.persona.ecoSub) {
    recordarEliminado(datos.persona.ecoSub, portal.ecoOrgId);
  }
  return { ok: true, resultado };
}

/**
 * La mitad del portal. Al dar la baja, el portal le avisa de vuelta a esta app
 * (`POST /sync/pertenencia`) mientras esta petición sigue abierta. No estorba:
 * esa vuelta solo desactiva, y lo que viene después la deja igual o la borra.
 */
async function bajaEnElPortal(
  db: Db,
  {
    persona: { ecoSub },
    orgId,
    porUserId,
    porSuperAdmin,
  }: Parameters<typeof eliminarDelClub>[1],
): Promise<{ ok: true; ecoOrgId?: string } | Extract<Eliminacion, { ok: false }>> {
  // Sin cuenta DINAMYT, o Membresías sola: no hay nada que pedir allí.
  if (!ecoSub || !enElEcosistema(ecoSub)) return { ok: true };
  const [club] = await db
    .select({ ecoOrgId: orgs.ecoOrgId })
    .from(orgs)
    .where(eq(orgs.id, orgId))
    .limit(1);
  if (!club?.ecoOrgId) return { ok: true };

  const sacalaDesdeElPortal = (porque: string) => ({
    ok: false as const,
    status: 409 as const,
    error: `Esta persona también es del club en DINAMYT y ${porque}: sácala del club desde el portal.`,
  });
  if (!altaEnElEcosistema()) {
    return sacalaDesdeElPortal('esta instalación no puede pedírselo al portal');
  }
  // El superadmin no tiene ficha en ningún club, y sin ella no hay en nombre
  // de quién pedir la baja allí.
  if (porSuperAdmin) return sacalaDesdeElPortal('el superadmin no tiene cuenta en este club');
  const [yo] = await db
    .select({ ecoSub: users.ecoSub })
    .from(users)
    .where(eq(users.id, porUserId))
    .limit(1);
  if (!yo?.ecoSub) {
    return sacalaDesdeElPortal('tu cuenta de aquí no está enlazada con la del portal');
  }

  const r = await pedirBajaAlEcosistema({
    ecoSub,
    ecoOrgId: club.ecoOrgId,
    porEcoSub: yo.ecoSub,
  });
  return r.ok
    ? { ok: true, ecoOrgId: club.ecoOrgId }
    : { ok: false, status: r.portalCaido ? 503 : 409, error: r.error };
}

/**
 * Para cuando la cuenta entera se borró en DINAMYT (`POST /sync/supresion`):
 * el portal ya no la tiene, así que aquí no hay baja que pedirle. Es la misma
 * mitad local que la de «eliminar del club», con las mismas reglas.
 */
export async function suprimirFichaDeCuenta(
  db: Db,
  ficha: { id: string; ecoSub: string },
): Promise<'borrada' | 'anonimizada'> {
  const resultado = await vaciarOBorrar(db, ficha.id);
  recordarEliminado(ficha.ecoSub, '*');
  return resultado;
}

/** La mitad de aquí. Ver «Borrar o vaciar» arriba. */
async function vaciarOBorrar(db: Db, userId: string): Promise<'borrada' | 'anonimizada'> {
  const suyas = db
    .select({ id: memberships.id })
    .from(memberships)
    .where(eq(memberships.userId, userId));
  const uno = { uno: sql`1` };

  const [{ tieneHistoria }] = await db
    .select({
      tieneHistoria: sql<boolean>`${or(
        exists(
          db
            .select(uno)
            .from(payments)
            .where(or(inArray(payments.membershipId, suyas), eq(payments.registeredByUserId, userId))),
        ),
        exists(db.select(uno).from(attendances).where(inArray(attendances.membershipId, suyas))),
        exists(db.select(uno).from(memberships).where(eq(memberships.payerUserId, userId))),
      )}`,
    })
    .from(users)
    .where(eq(users.id, userId));

  // En los dos casos se van sus avisos y sus suscripciones al celular: son de
  // una persona que ya no está.
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  await db
    .delete(notifications)
    .where(or(eq(notifications.userId, userId), inArray(notifications.membershipId, suyas)));

  if (!tieneHistoria) {
    await db.delete(memberships).where(eq(memberships.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
    return 'borrada';
  }

  const ahora = new Date();
  await db
    .update(memberships)
    .set({
      checkinPin: null,
      // «La paga María Pérez» casi dice quién era.
      payerUserId: null,
      status: 'retirado',
      statusReason: 'Eliminado del club',
      updatedAt: ahora,
    })
    .where(eq(memberships.userId, userId));
  // Las notas de sus pagos son texto libre, y suelen llevar nombres.
  await db.update(payments).set({ notes: null }).where(inArray(payments.membershipId, suyas));
  await db
    .update(users)
    .set({
      fullName: NOMBRE_ELIMINADO,
      // La columna es única y obligatoria: el correo deja de ser de nadie y
      // queda libre para que esa persona vuelva algún día con el suyo.
      email: sql`'eliminado-' || ${users.id} || '@eliminado.invalid'`,
      passwordHash: null,
      phone: null,
      avatarUrl: null,
      belt: null,
      trainsSince: null,
      birthDate: null,
      bloodType: null,
      emergencyName: null,
      emergencyPhone: null,
      ecoSub: null,
      theme: null,
      locale: null,
      isActive: false,
      eliminadoEl: ahora,
      updatedAt: ahora,
    })
    .where(eq(users.id, userId));
  return 'anonimizada';
}
