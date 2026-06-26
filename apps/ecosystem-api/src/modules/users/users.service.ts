import { Injectable } from '@nestjs/common';
import { db } from '../../db';
import { users, otpCodes } from '../../db/schema';
import { eq, and, gt } from 'drizzle-orm';
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
}
