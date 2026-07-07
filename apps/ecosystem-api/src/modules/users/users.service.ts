import { Injectable } from '@nestjs/common';
import { db } from '../../db';
import {
  users,
  otpCodes,
  userDisciplines,
  userGuardians,
  orgMembers,
} from '../../db/schema';
import { eq, and, gt, isNull } from 'drizzle-orm';
import { encryptField, decryptField } from '../../common/crypto';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';

@Injectable()
export class UsersService {
  // Buscar usuario por email
  async findByEmail(email: string) {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return result[0] ?? null;
  }

  // Buscar usuario por ID
  async findById(id: string) {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return result[0] ?? null;
  }

  // Crear usuario nuevo
  async createUser(data: {
    email: string;
    password: string;
    fullName: string;
    documentId: string;
    phone?: string;
    birthDate?: Date;
  }) {
    const passwordHash = await bcrypt.hash(data.password, 12);

    const result = await db
      .insert(users)
      .values({
        email: data.email,
        passwordHash: passwordHash,
        fullName: data.fullName,
        documentId: data.documentId,
        phone: data.phone ?? null,
        birthDate: data.birthDate ?? null,
      })
      .returning();

    return result[0];
  }

  // Verificar contraseña
  async verifyPassword(plainPassword: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, hash);
  }

  // Generar y guardar OTP
  async generateOtp(userId: string, type: 'EMAIL_VERIFY' | 'PASSWORD_RESET') {
    // Genera código de 6 dígitos
    const code = randomInt(100000, 999999).toString();

    // Expira en 10 minutos
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db.insert(otpCodes).values({
      userId,
      code,
      type,
      expiresAt,
    });

    return code;
  }

  // Verificar OTP
  async verifyOtp(
    userId: string,
    code: string,
    type: string,
  ): Promise<boolean> {
    const result = await db
      .select()
      .from(otpCodes)
      .where(
        and(
          eq(otpCodes.userId, userId),
          eq(otpCodes.code, code),
          eq(otpCodes.type, type),
          gt(otpCodes.expiresAt, new Date()),
          isNull(otpCodes.usedAt), // un código solo se puede usar una vez

        ),
      )
      .limit(1);

    if (!result[0]) return false;

    // Marcar como usado
    await db
      .update(otpCodes)
      .set({ usedAt: new Date() })
      .where(eq(otpCodes.id, result[0].id));

    return true;
  }

  // Marcar email como verificado
  async markEmailVerified(userId: string) {
    await db
      .update(users)
      .set({ isEmailVerified: true })
      .where(eq(users.id, userId));
  }

  // Actualizar contraseña
  async updatePassword(userId: string, newPassword: string) {
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
  }

  // ── Bloqueo por intentos fallidos (anti fuerza-bruta) ──────────────────────

  // Registra un intento fallido; si lockedUntil viene, bloquea la cuenta.
  async registrarIntentoFallido(
    userId: string,
    intentos: number,
    lockedUntil: Date | null,
  ) {
    await db
      .update(users)
      .set({ failedLoginAttempts: intentos, lockedUntil })
      .where(eq(users.id, userId));
  }

  // Limpia contador y bloqueo (login correcto o desbloqueo del admin).
  async desbloquearCuenta(userId: string) {
    await db
      .update(users)
      .set({ failedLoginAttempts: 0, lockedUntil: null })
      .where(eq(users.id, userId));
  }

  // Cuentas actualmente bloqueadas (para el panel del super-admin).
  async listarBloqueadas() {
    const filas = await db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        failedLoginAttempts: users.failedLoginAttempts,
        lockedUntil: users.lockedUntil,
      })
      .from(users)
      .where(gt(users.lockedUntil, new Date()));
    return filas;
  }

  // ── Perfil de la persona (transversal; lo consume Membresías) ───────────────

  // Quita el hash de contraseña antes de exponer un usuario.
  private strip(row: typeof users.$inferSelect | undefined) {
    if (!row) return null;
    const rest = { ...row } as { passwordHash?: string };
    delete rest.passwordHash;
    return rest;
  }

  // Perfil completo: datos de la persona + disciplinas (grado) + acudientes.
  async getProfile(id: string) {
    const user = await this.findById(id);
    if (!user) return null;
    const disciplines = await db
      .select()
      .from(userDisciplines)
      .where(eq(userDisciplines.userId, id));
    const guardians = await db
      .select()
      .from(userGuardians)
      .where(eq(userGuardians.minorUserId, id));
    const safe = this.strip(user) as Record<string, unknown> | null;
    if (safe) safe.medicalNotes = decryptField(user.medicalNotes);
    return { ...safe, disciplines, guardians };
  }

  // Actualiza los campos editables del perfil (nunca email/documento/contraseña).
  // medicalNotes es dato sensible: se cifra en esta capa (AES-256-GCM) antes de persistir.
  async updateProfile(
    id: string,
    data: {
      fullName?: string;
      phone?: string | null;
      birthDate?: Date | null;
      avatarUrl?: string | null;
      emergencyContactName?: string | null;
      emergencyContactPhone?: string | null;
      emergencyContactRelationship?: string | null;
      medicalNotes?: string | null;
      bloodType?: string | null;
    },
  ) {
    const [row] = await db
      .update(users)
      .set({
        ...(data.fullName !== undefined && { fullName: data.fullName }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.birthDate !== undefined && { birthDate: data.birthDate }),
        ...(data.avatarUrl !== undefined && { avatarUrl: data.avatarUrl }),
        ...(data.emergencyContactName !== undefined && {
          emergencyContactName: data.emergencyContactName,
        }),
        ...(data.emergencyContactPhone !== undefined && {
          emergencyContactPhone: data.emergencyContactPhone,
        }),
        ...(data.emergencyContactRelationship !== undefined && {
          emergencyContactRelationship: data.emergencyContactRelationship,
        }),
        ...(data.medicalNotes !== undefined && {
          medicalNotes: encryptField(data.medicalNotes),
        }),
        ...(data.bloodType !== undefined && { bloodType: data.bloodType }),
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return this.strip(row);
  }

  // Upsert de la disciplina y su grado (una por (usuario, disciplina)). El grado
  // lo cambia el maestro (promociones); el modelo ya soporta varias disciplinas.
  async setDiscipline(
    userId: string,
    data: { discipline: string; currentGrade?: string | null; since?: string | null },
  ) {
    const existing = await db
      .select()
      .from(userDisciplines)
      .where(
        and(
          eq(userDisciplines.userId, userId),
          eq(userDisciplines.discipline, data.discipline),
        ),
      )
      .limit(1);

    if (existing[0]) {
      const [row] = await db
        .update(userDisciplines)
        .set({
          currentGrade: data.currentGrade ?? existing[0].currentGrade,
          since: data.since ?? existing[0].since,
          updatedAt: new Date(),
        })
        .where(eq(userDisciplines.id, existing[0].id))
        .returning();
      return row;
    }

    const [row] = await db
      .insert(userDisciplines)
      .values({
        userId,
        discipline: data.discipline,
        currentGrade: data.currentGrade ?? null,
        since: data.since ?? null,
      })
      .returning();
    return row;
  }

  // Vincula un acudiente a un menor (idempotente).
  async addGuardian(
    minorUserId: string,
    data: { guardianUserId: string; relationship?: string | null },
  ) {
    const existing = await db
      .select()
      .from(userGuardians)
      .where(
        and(
          eq(userGuardians.minorUserId, minorUserId),
          eq(userGuardians.guardianUserId, data.guardianUserId),
        ),
      )
      .limit(1);
    if (existing[0]) return existing[0];

    const [row] = await db
      .insert(userGuardians)
      .values({
        minorUserId,
        guardianUserId: data.guardianUserId,
        relationship: data.relationship ?? null,
      })
      .returning();
    return row;
  }

  // ¿El solicitante es admin/owner/maestro de alguna org a la que pertenece el
  // usuario objetivo? Habilita al maestro a gestionar el perfil de sus alumnos.
  async isOrgManagerOf(requesterId: string, targetUserId: string): Promise<boolean> {
    const managerRoles = ['admin', 'owner', 'maestro'];
    const reqMemberships = await db
      .select({ orgId: orgMembers.orgId, role: orgMembers.role })
      .from(orgMembers)
      .where(eq(orgMembers.userId, requesterId));
    const managedOrgIds = reqMemberships
      .filter((m) => managerRoles.includes(m.role))
      .map((m) => m.orgId);
    if (managedOrgIds.length === 0) return false;

    const targetMemberships = await db
      .select({ orgId: orgMembers.orgId })
      .from(orgMembers)
      .where(eq(orgMembers.userId, targetUserId));
    return targetMemberships.some((t) => managedOrgIds.includes(t.orgId));
  }
}
