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
import {
  validarNombre,
  validarDocumento,
  validarTelefono,
  validarFechaNacimiento,
  validarGenero,
} from '../../common/validacion';

type User = InferSelectModel<typeof users>;

// Catálogos de roles por app. Los tipos viven en `@dinamyt/shared`, pero son
// tipos: no existen en tiempo de ejecución y aquí hay que comprobar valores.
const ROLES_MEMBRESIAS = ['owner', 'staff', 'guardian', 'student'] as const;
const ROLES_CAMPEONATOS = [
  'admin',
  'maestro',
  'coach',
  'competitor',
  'judge',
] as const;
const ROLES_ACADEMY = ['admin', 'teacher', 'student'] as const;

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
    gender?: string;
    dataConsent: boolean;
  }) {
    if (!data.dataConsent) {
      throw new BadRequestException(
        'Debes aceptar el tratamiento de datos personales.',
      );
    }

    // Validación + normalización: el nombre se guarda SIEMPRE en mayúsculas
    // (así aparece igual en carnets, llaves y planillas de todas las apps).
    data.fullName = validarNombre(data.fullName, 'nombre completo')
      .toLocaleUpperCase('es');
    data.documentId = validarDocumento(data.documentId);
    if (data.phone) data.phone = validarTelefono(data.phone);
    if (data.birthDate) validarFechaNacimiento(data.birthDate);
    if (data.gender) data.gender = validarGenero(data.gender);

    const existing = await this.usersService.findByEmail(data.email);
    if (existing) {
      throw new BadRequestException(
        AuthService.mensajeCuentaExistente(existing),
      );
    }

    const user = await this.usersService.createUser(data);
    const code = await this.usersService.generateOtp(user.id, 'EMAIL_VERIFY');
    await this.mailer.sendOtp(user.email, code, 'EMAIL_VERIFY');

    return {
      message: 'Usuario registrado. Revisa tu correo para verificar tu cuenta.',
      userId: user.id,
    };
  }

  /**
   * Qué se le dice a quien intenta registrarse con un correo que ya está.
   *
   * Importa el matiz: para casi todo el club la cuenta NO la crearon ellos —la
   * trajo la reconciliación (§2.4) desde Membresías o Campeonatos—, así que
   * «ya existe una cuenta con ese correo» se lee como un error ajeno. Lo que
   * necesitan saber es que la cuenta es suya y que ya tiene contraseña.
   *
   * **Lo que NO se dice: de qué app viene.** Decir «entra con la contraseña que
   * usas en Membresías» le entrega a cualquiera que pruebe correos ajenos dos
   * datos por el precio de uno: que esa persona existe y en qué aplicación
   * buscarla. Para el dueño de la cuenta no aporta nada —su contraseña es la
   * misma en las dos— y para quien va de pesca es un mapa. Desde fuera, DINAMYT
   * es un solo sitio; el origen de la cuenta es asunto interno y se queda en
   * `users.origen`.
   */
  static mensajeCuentaExistente(user: Pick<User, 'origen'>): string {
    switch (user.origen) {
      case 'importado-membresias':
      case 'importado-campeonatos':
      case 'importado-ambas':
        return 'Ya tienes una cuenta de DINAMYT con ese correo. Inicia sesión con tu contraseña de siempre; si no la recuerdas, usa «¿Olvidaste tu contraseña?».';
      case 'invitacion':
        return 'Ya hay una cuenta con ese correo, todavía sin contraseña. Abre el enlace que te enviamos para ponerla.';
      default:
        return 'Ya existe una cuenta con ese correo.';
    }
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
  // Mensajes específicos (decisión de producto: se le dice al usuario si el
  // correo no existe o si la contraseña es incorrecta) + bloqueo temporal de
  // la cuenta tras MAX_INTENTOS fallidos. El super-admin puede desbloquear
  // desde el panel del portal sin esperar a que venza el bloqueo.
  static readonly MAX_INTENTOS = 5;
  static readonly BLOQUEO_MINUTOS = 15;

  async login(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException(
        'No existe una cuenta con ese correo. Revísalo o regístrate.',
      );
    }

    // ¿Cuenta bloqueada por intentos fallidos?
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutos = Math.max(
        1,
        Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000),
      );
      throw new UnauthorizedException(
        `Cuenta bloqueada por demasiados intentos fallidos. Inténtalo en ${minutos} min o pide a un administrador que la desbloquee.`,
      );
    }

    // Cuenta invitada que todavía no tiene contraseña (camino B, §2.1). Se
    // dice tal cual: fingir «contraseña incorrecta» manda a la persona a
    // probar veinte veces una contraseña que no existe.
    if (!user.passwordHash) {
      throw new UnauthorizedException(
        'Tu cuenta existe pero todavía no tiene contraseña. Abre el enlace que te enviamos por correo para ponerla.',
      );
    }

    const validPassword = await this.usersService.verifyPassword(
      password,
      user.passwordHash,
    );
    if (!validPassword) {
      const intentos = (user.failedLoginAttempts ?? 0) + 1;
      if (intentos >= AuthService.MAX_INTENTOS) {
        await this.usersService.registrarIntentoFallido(
          user.id,
          intentos,
          new Date(Date.now() + AuthService.BLOQUEO_MINUTOS * 60_000),
        );
        throw new UnauthorizedException(
          `Contraseña incorrecta. Por seguridad la cuenta quedó bloqueada ${AuthService.BLOQUEO_MINUTOS} minutos.`,
        );
      }
      await this.usersService.registrarIntentoFallido(user.id, intentos, null);
      const restantes = AuthService.MAX_INTENTOS - intentos;
      throw new UnauthorizedException(
        `Contraseña incorrecta. Te queda${restantes === 1 ? '' : 'n'} ${restantes} intento${restantes === 1 ? '' : 's'} antes de que la cuenta se bloquee.`,
      );
    }

    if (!user.isEmailVerified) {
      throw new UnauthorizedException(
        'Debes verificar tu correo antes de iniciar sesión.',
      );
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Tu cuenta está suspendida.');
    }

    // Login correcto: limpia el contador de intentos y cualquier bloqueo vencido.
    if ((user.failedLoginAttempts ?? 0) > 0 || user.lockedUntil) {
      await this.usersService.desbloquearCuenta(user.id);
    }

    // Contraseña heredada de otra app (§2.4): se acaba de comprobar que es la
    // correcta, así que aquí —y solo aquí— se puede volver a hashear al costo
    // del ecosistema. Del segundo login en adelante la cuenta ya no depende
    // del hash que trajo la importación. La persona no nota nada.
    if (user.passwordOrigen && user.passwordOrigen !== 'propio') {
      await this.usersService.updatePassword(user.id, password);
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

  // ── Poner la contraseña desde el enlace de invitación ─────────────────────
  //
  // Solo funciona mientras la cuenta NO tenga contraseña. Eso es lo que hace
  // que el enlace sea de un solo uso sin llevar una lista de enlaces gastados:
  // en cuanto alguien la pone, el mismo enlace deja de abrir nada. Y si el
  // enlace se filtró después, tampoco sirve para robar la cuenta — para eso
  // está «olvidé mi contraseña», que exige entrar al correo.
  async setPassword(token: string, newPassword: string) {
    if (!token) throw new BadRequestException('Falta el enlace de invitación.');
    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException(
        'La contraseña debe tener al menos 8 caracteres.',
      );
    }

    let userId: string;
    try {
      userId = await this.jwtService.verificarInvitacion(token);
    } catch {
      throw new BadRequestException(
        'Este enlace ya no es válido. Pídele a tu club que te invite otra vez.',
      );
    }

    const user = await this.usersService.findById(userId);
    if (!user || !user.isActive) {
      throw new BadRequestException('Esta cuenta ya no está disponible.');
    }
    if (user.passwordHash) {
      throw new BadRequestException(
        'Esta cuenta ya tiene contraseña. Inicia sesión, o usa «¿Olvidaste tu contraseña?».',
      );
    }

    await this.usersService.ponerContrasena(userId, newPassword);
    return {
      message: 'Contraseña guardada. Ya puedes iniciar sesión.',
      email: user.email,
    };
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

  // ── Construir el payload del token ────────────────────────────────────────
  //
  // Son dos preguntas distintas, y antes se contestaban con una sola consulta:
  //
  //   QUIÉN ERES  → `org_members`: a qué club perteneces y con qué rol en cada
  //                 app. Es identidad, y no se apaga porque nadie haya pagado.
  //   QUÉ ABRES   → `subscriptions`: qué apps habilita el plan del club (o el
  //                 personal). Eso sí es comercial.
  //
  // Mezclarlas dejaba `org_id` y los roles en `null` para todo club sin
  // suscripción activa — es decir, para TODOS los clubes recién reconciliados
  // (§2.4): la gente entraría al portal sin club y las apps no sabrían quién
  // es. Ahora la pertenencia manda; la suscripción solo llena `app_scopes`.
  private async buildToken(user: User): Promise<string> {
    const now = new Date();

    // ── 0. Pertenencias del usuario (identidad) ──────────────────────────
    const pertenencias = await db
      .select({
        orgId: orgMembers.orgId,
        role: orgMembers.role,
        roleMembresias: orgMembers.roleMembresias,
        roleCampeonatos: orgMembers.roleCampeonatos,
        roleAcademy: orgMembers.roleAcademy,
      })
      .from(orgMembers)
      .where(eq(orgMembers.userId, user.id));

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
    // El club es el de la pertenencia; entre varios gana el que tenga
    // suscripción activa, que es el que la persona va a poder abrir.
    const conSuscripcion = new Set(orgSubs.map((s) => s.orgId));
    const principal =
      pertenencias.find((p) => conSuscripcion.has(p.orgId)) ??
      pertenencias[0] ??
      null;

    const orgId = principal?.orgId ?? null;

    // El rol por app sale de su columna. Si está vacía se cae al rol general,
    // pero solo cuando ese valor pertenece al catálogo de esa app: las filas
    // viejas traen 'member' o 'admin', y colar 'member' como rol de Membresías
    // sería inventarse un permiso que la app no sabe interpretar.
    const rolDeApp = (
      propio: string | null | undefined,
      catalogo: readonly string[],
    ): string | null => {
      if (propio) return propio;
      const general = principal?.role ?? null;
      return general && catalogo.includes(general) ? general : null;
    };

    const roleAcademy = rolDeApp(principal?.roleAcademy, ROLES_ACADEMY);
    const roleCampeonatos = rolDeApp(
      principal?.roleCampeonatos,
      ROLES_CAMPEONATOS,
    );
    const roleMembresias = rolDeApp(
      principal?.roleMembresias,
      ROLES_MEMBRESIAS,
    );

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
