import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtTokenService, JwtPayload } from './jwt.service';
import { MailerService } from './mailer.service';
import { db } from '../../db';
import {
  users,
  orgMembers,
  subscriptions,
  subscriptionPlans,
  userSubscriptions,
} from '../../db/schema';
import { eq, and, gt, InferSelectModel } from 'drizzle-orm';

type User = InferSelectModel<typeof users>;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtTokenService,
    private readonly mailer: MailerService,
  ) {}

  // ── Registro ─────────────────────────────────────────────────────────────
  async register(data: {
    email: string;
    password: string;
    fullName: string;
    documentId: string;
    phone?: string;
    birthDate?: Date;
    dataConsent: boolean;
  }) {
    if (!data.dataConsent) {
      throw new BadRequestException(
        'Debes aceptar el tratamiento de datos personales.',
      );
    }

    const existing = await this.usersService.findByEmail(data.email);
    if (existing) {
      throw new BadRequestException('Ya existe una cuenta con ese correo.');
    }

    const user = await this.usersService.createUser(data);
    const code = await this.usersService.generateOtp(user.id, 'EMAIL_VERIFY');
    await this.mailer.sendOtp(user.email, code, 'EMAIL_VERIFY');

    return {
      message: 'Usuario registrado. Revisa tu correo para verificar tu cuenta.',
      userId: user.id,
    };
  }

  // ── Verificar OTP de email ────────────────────────────────────────────────
  async verifyEmail(userId: string, code: string) {
    const valid = await this.usersService.verifyOtp(
      userId,
      code,
      'EMAIL_VERIFY',
    );
    if (!valid) {
      throw new BadRequestException('Código inválido o expirado.');
    }
    await this.usersService.markEmailVerified(userId);
    return { message: 'Correo verificado correctamente.' };
  }

  // ── Login ─────────────────────────────────────────────────────────────────
  async login(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Credenciales incorrectas.');
    }

    const validPassword = await this.usersService.verifyPassword(
      password,
      user.passwordHash,
    );
    if (!validPassword) {
      throw new UnauthorizedException('Credenciales incorrectas.');
    }

    if (!user.isEmailVerified) {
      throw new UnauthorizedException(
        'Debes verificar tu correo antes de iniciar sesión.',
      );
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Tu cuenta está suspendida.');
    }

    const token = await this.buildToken(user);
    return { access_token: token };
  }

  // ── Información completa de la cuenta (para el perfil) ────────────────────
  async getCuenta(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('Usuario no encontrado.');
    // Solo campos seguros: nunca el hash de contraseña.
    return {
      email: user.email,
      fullName: user.fullName,
      documentId: user.documentId,
      phone: user.phone,
      birthDate: user.birthDate,
      isEmailVerified: user.isEmailVerified,
      createdAt: user.createdAt,
    };
  }

  // ── Cambiar contraseña (usuario autenticado, desde su perfil) ─────────────
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('Usuario no encontrado.');
    const ok = await this.usersService.verifyPassword(
      currentPassword,
      user.passwordHash,
    );
    if (!ok) throw new UnauthorizedException('La contraseña actual no es correcta.');
    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException('La nueva contraseña debe tener al menos 8 caracteres.');
    }
    await this.usersService.updatePassword(userId, newPassword);
    return { message: 'Contraseña actualizada.' };
  }

  // ── Recuperar contraseña ──────────────────────────────────────────────────
  async forgotPassword(email: string) {
    const user = await this.usersService.findByEmail(email);
    // Siempre responde igual para no revelar si el correo existe
    if (!user) {
      return { message: 'Si ese correo existe, recibirás un código.' };
    }

    const code = await this.usersService.generateOtp(user.id, 'PASSWORD_RESET');
    await this.mailer.sendOtp(user.email, code, 'PASSWORD_RESET');
    return {
      message: 'Si ese correo existe, recibirás un código.',
      userId: user.id,
    };
  }

  // ── Resetear contraseña ───────────────────────────────────────────────────
  async resetPassword(userId: string, code: string, newPassword: string) {
    const valid = await this.usersService.verifyOtp(
      userId,
      code,
      'PASSWORD_RESET',
    );
    if (!valid) {
      throw new BadRequestException('Código inválido o expirado.');
    }
    await this.usersService.updatePassword(userId, newPassword);
    return { message: 'Contraseña actualizada correctamente.' };
  }

  // ── Verificar token (lo consumen las otras apps) ──────────────────────────
  async verifyToken(token: string) {
    try {
      const payload = await this.jwtService.verifyToken(token);
      return { valid: true, payload };
    } catch {
      throw new UnauthorizedException('Token inválido o expirado.');
    }
  }

  // ── Construir el payload del token con scopes reales ──────────────────────
  //
  // Consulta las suscripciones activas del usuario (organizacionales y
  // personales), extrae los apps_included de cada plan, y construye el
  // payload JWT con:
  //   - app_scopes: array deduplicado de apps a las que tiene acceso
  //   - org_id: ID de la primera organización a la que pertenece
  //   - role_academy / role_campeonatos / role_membresias: rol del usuario en la org
  //
  private async buildToken(user: User): Promise<string> {
    const now = new Date();

    // ── 1. Suscripciones organizacionales activas del usuario ────────────
    // Join: org_members → subscriptions → subscription_plans
    // Filtra: subscriptions.status = 'ACTIVE' AND ends_at > NOW()
    const orgSubs = await db
      .select({
        orgId: orgMembers.orgId,
        role: orgMembers.role,
        appsIncluded: subscriptionPlans.appsIncluded,
      })
      .from(orgMembers)
      .innerJoin(subscriptions, eq(orgMembers.orgId, subscriptions.orgId))
      .innerJoin(
        subscriptionPlans,
        eq(subscriptions.planId, subscriptionPlans.id),
      )
      .where(
        and(
          eq(orgMembers.userId, user.id),
          eq(subscriptions.status, 'ACTIVE'),
          gt(subscriptions.endsAt, now),
        ),
      );

    // ── 2. Suscripciones personales activas del usuario ─────────────────
    // Join: user_subscriptions → subscription_plans
    // Filtra: status = 'ACTIVE' AND ends_at > NOW()
    const personalSubs = await db
      .select({
        appsIncluded: subscriptionPlans.appsIncluded,
      })
      .from(userSubscriptions)
      .innerJoin(
        subscriptionPlans,
        eq(userSubscriptions.planId, subscriptionPlans.id),
      )
      .where(
        and(
          eq(userSubscriptions.userId, user.id),
          eq(userSubscriptions.status, 'ACTIVE'),
          gt(userSubscriptions.endsAt, now),
        ),
      );

    // ── 3. Unir todos los apps_included y deduplicar ────────────────────
    const allScopes: string[] = [];

    for (const row of orgSubs) {
      if (row.appsIncluded) {
        allScopes.push(...row.appsIncluded);
      }
    }
    for (const row of personalSubs) {
      if (row.appsIncluded) {
        allScopes.push(...row.appsIncluded);
      }
    }

    const uniqueScopes = [...new Set(allScopes)];

    // ── 4. Determinar org_id y roles ────────────────────────────────────
    // Toma la primera organización con suscripción activa
    const firstOrg = orgSubs[0] ?? null;
    const orgId = firstOrg?.orgId ?? null;
    const orgRole = firstOrg?.role ?? null;

    // Mapear el rol de la org a los campos del JWT
    // Si el scope incluye la app, se asigna el rol de la org
    const roleAcademy =
      uniqueScopes.includes('academy') && orgRole ? orgRole : null;
    const roleCampeonatos =
      uniqueScopes.includes('campeonatos') && orgRole ? orgRole : null;
    const roleMembresias =
      uniqueScopes.includes('membresias') && orgRole ? orgRole : null;

    // ── 5. Construir y firmar el payload ────────────────────────────────
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      fullName: user.fullName,
      org_id: orgId,
      app_scopes: uniqueScopes,
      role_academy: roleAcademy,
      role_campeonatos: roleCampeonatos,
      role_membresias: roleMembresias,
      is_super_admin: user.isSuperAdmin ?? false,
    };

    return this.jwtService.signToken(payload);
  }
}
