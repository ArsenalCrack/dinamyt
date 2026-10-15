import { eq, or, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from '../../db/schema';
import {
  auditAuth,
  orgInvitations,
  orgJoinRequests,
  orgMemberBajas,
  orgMembers,
  orgNotifications,
  otpCodes,
  pendingRegistrations,
  pushSubscriptions,
  sessions,
  userDisciplines,
  userGuardians,
  users,
} from '../../db/schema';

/** El nombre que queda en lo que el club o DINAMYT tienen que conservar. */
export const NOMBRE_BORRADA = 'PERSONA ELIMINADA';

/** Lo que hace falta de la base: vale `db` o la `tx` de una transacción. */
export type Escritor = Pick<PostgresJsDatabase<typeof schema>, 'select' | 'update' | 'delete'>;

/**
 * La mitad del ecosistema de «borrar mi cuenta». Membresías y Campeonatos ya
 * borraron lo suyo antes (ver `SupresionService.suprimir`): aquí la fila de
 * `users` todavía es la de esa persona.
 *
 * ── Qué se borra ──
 *
 * Todo lo que solo existe porque esa persona existe: sus sesiones, códigos,
 * suscripciones al celular, pertenencias a clubes (y la copia de las bajas),
 * vínculos de acudiente, disciplinas, invitaciones y solicitudes, sus avisos y
 * los avisos que hablan de ella, y un registro a medias si lo había.
 *
 * ── Qué se queda, y vaciado ──
 *
 * La fila de `users`, con el mismo id, sin nada que diga quién era. Se queda
 * porque de ella cuelgan las suscripciones y los pagos que DINAMYT tiene que
 * conservar, y porque es la constancia de que la supresión se hizo
 * (`borrada_el`). Borrarla obligaría a reescribir esas tablas o a perderlas.
 *
 * Idempotente: correrla dos veces deja lo mismo.
 */
export async function borrarDeLaBase(
  db: Escritor,
  persona: { id: string; email: string },
): Promise<void> {
  const { id } = persona;
  const correo = persona.email.trim().toLowerCase();

  await db.delete(sessions).where(eq(sessions.userId, id));
  await db.delete(otpCodes).where(eq(otpCodes.userId, id));
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, id));
  await db.delete(auditAuth).where(eq(auditAuth.userId, id));
  await db.delete(userDisciplines).where(eq(userDisciplines.userId, id));
  await db
    .delete(userGuardians)
    .where(or(eq(userGuardians.minorUserId, id), eq(userGuardians.guardianUserId, id)));

  await db.delete(orgMembers).where(eq(orgMembers.userId, id));
  await db.delete(orgMemberBajas).where(eq(orgMemberBajas.userId, id));
  await db
    .update(orgMemberBajas)
    .set({ removedByUserId: null })
    .where(eq(orgMemberBajas.removedByUserId, id));

  await db.delete(orgJoinRequests).where(eq(orgJoinRequests.userId, id));
  await db
    .delete(orgInvitations)
    .where(or(eq(orgInvitations.userId, id), sql`lower(${orgInvitations.email}) = ${correo}`));
  await db
    .delete(pendingRegistrations)
    .where(sql`lower(${pendingRegistrations.email}) = ${correo}`);

  // Los avisos que recibía, y los que hablan de ella: llevan su nombre copiado
  // en `data` a propósito (para que la frase no dependa de que siga existiendo),
  // y por eso mismo no basta con vaciar la fila de `users`.
  await db
    .delete(orgNotifications)
    .where(or(eq(orgNotifications.userId, id), eq(orgNotifications.subjectUserId, id)));
  await db
    .update(orgNotifications)
    .set({ actorUserId: null })
    .where(eq(orgNotifications.actorUserId, id));

  const ahora = new Date();
  await db
    .update(users)
    .set({
      fullName: NOMBRE_BORRADA,
      // Única y obligatoria: el correo queda libre por si vuelve algún día.
      email: sql`'eliminado-' || ${users.id} || '@eliminado.invalid'`,
      documentId: null,
      phone: null,
      birthDate: null,
      gender: null,
      avatarUrl: null,
      passwordHash: null,
      passwordOrigen: null,
      isEmailVerified: false,
      isActive: false,
      dataConsentAt: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
      emergencyContactName: null,
      emergencyContactPhone: null,
      emergencyContactRelationship: null,
      bloodType: null,
      medicalNotes: null,
      timezone: null,
      locale: null,
      borrarEl: null,
      borradaEl: ahora,
      updatedAt: ahora,
    })
    .where(eq(users.id, id));
}
