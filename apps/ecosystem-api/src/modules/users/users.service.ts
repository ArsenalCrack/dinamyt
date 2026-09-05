import { Injectable } from '@nestjs/common';
import { db } from '../../db';
import {
  users,
  otpCodes,
  userDisciplines,
  userGuardians,
  orgMembers,
  organizations,
  pendingRegistrations,
} from '../../db/schema';
import { eq, and, gt, lt, inArray, isNull, sql } from 'drizzle-orm';
import { ROLES_GESTOR } from '../../common/roles';
import { normalizarCorreo } from '../../common/validacion';
import { encryptField, decryptField } from '../../common/crypto';
import { espejarPersona, espejarContrasena } from '../../common/espejo-membresias';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';

@Injectable()
export class UsersService {
  /**
   * Buscar usuario por correo, **sin que importen las mayúsculas**.
   *
   * La normalización va aquí y no en cada quien llama, y es a propósito: por
   * esta puerta entran el login, «olvidé mi contraseña», el reenvío del código
   * y la comprobación de disponibilidad del registro. Dejar que cada uno se
   * acuerde de bajar el correo a minúsculas es dejar que uno se olvide — que es
   * exactamente lo que pasaba con el login, el más usado de todos. Ver
   * `normalizarCorreo` en `common/validacion.ts`.
   */
  async findByEmail(email: string) {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizarCorreo(email)))
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

  /** Costo de bcrypt del ecosistema. Las apps importadas usan 10. */
  static readonly BCRYPT_ROUNDS = 12;

  /**
   * El hash, al costo del ecosistema.
   *
   * Existe suelto porque el registro pendiente guarda la contraseña YA hasheada
   * (§ `pending_registrations`): un registro que puede no llegar nunca a cuenta
   * no es motivo para tener una contraseña en claro en la base ni un minuto.
   */
  hashearContrasena(password: string): Promise<string> {
    return bcrypt.hash(password, UsersService.BCRYPT_ROUNDS);
  }

  // Crear usuario nuevo
  async createUser(data: {
    email: string;
    password: string;
    fullName: string;
    /** Opcional: las cuentas importadas (§2.4) no traen documento. */
    documentId?: string | null;
    phone?: string;
    birthDate?: Date;
    /** `MASCULINO` | `FEMENINO`. Lo pide el registro; Campeonatos lo consume. */
    gender?: string;
    origen?: string;
  }) {
    const passwordHash = await bcrypt.hash(
      data.password,
      UsersService.BCRYPT_ROUNDS,
    );

    const result = await db
      .insert(users)
      .values({
        // En minúsculas también al escribir: la búsqueda ya normaliza, pero si
        // la fila naciera con mayúsculas no la encontraría nadie. La regla vive
        // en los dos lados o no vive.
        email: normalizarCorreo(data.email),
        passwordHash: passwordHash,
        passwordOrigen: 'propio',
        fullName: data.fullName,
        documentId: data.documentId ?? null,
        phone: data.phone ?? null,
        birthDate: data.birthDate ?? null,
        gender: data.gender ?? null,
        origen: data.origen ?? 'registro',
      })
      .returning();

    return result[0];
  }

  /**
   * Cuenta creada por el maestro (camino B, §2.1): existe, pertenece a la
   * persona y **no tiene contraseña todavía**. Sin `password_hash` no se puede
   * iniciar sesión, así que la cuenta no es utilizable por nadie hasta que su
   * dueño abra el enlace de invitación y ponga una.
   *
   * Tampoco se da el correo por verificado: eso lo hace `ponerContrasena`, y
   * lo hace con razón — abrir el enlace ES la prueba de que la dirección existe.
   */
  async crearInvitado(data: {
    email: string;
    fullName: string;
    phone?: string | null;
  }) {
    const [fila] = await db
      .insert(users)
      .values({
        email: normalizarCorreo(data.email),
        fullName: data.fullName,
        phone: data.phone ?? null,
        passwordHash: null,
        origen: 'invitacion',
      })
      .returning();
    return fila;
  }

  /**
   * Canje del enlace de invitación: pone la contraseña y da el correo por
   * verificado **en el mismo acto**, porque el enlace llegó a esa dirección y
   * alguien lo abrió. Pedir después un código por correo sería preguntar dos
   * veces lo mismo.
   */
  async ponerContrasena(userId: string, password: string) {
    const passwordHash = await bcrypt.hash(
      password,
      UsersService.BCRYPT_ROUNDS,
    );
    await db
      .update(users)
      .set({
        passwordHash,
        passwordOrigen: 'propio',
        isEmailVerified: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
    espejarContrasena(userId, passwordHash);
  }

  /**
   * Verificar contraseña.
   *
   * El hash puede ser NULL (cuenta invitada que todavía no puso contraseña) y
   * puede venir de otra app: Membresías y Campeonatos hashean con bcrypt al
   * mismo costo, así que `compare` los acepta sin conversión. Quien decide qué
   * decirle a la persona cuando no hay hash es `AuthService.login`.
   */
  async verifyPassword(
    plainPassword: string,
    hash: string | null,
  ): Promise<boolean> {
    if (!hash) return false;
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

  /**
   * Actualizar contraseña. Sirve también para volver a hashear al costo del
   * ecosistema la contraseña heredada de otra app tras un login correcto: en
   * los dos casos, a partir de aquí la contraseña es `propio`.
   *
   * ── `espejar`, y por qué no siempre ──
   *
   * La contraseña es UNA para todo DINAMYT: al cambiarla aquí hay que copiarla a
   * Membresías, o quien la cambia se queda fuera de `club.dinamyt.org` con la
   * nueva y dentro con la vieja (ver `espejarContrasena`).
   *
   * La excepción es el rehash tras un login correcto: ahí la contraseña **no
   * cambió**, solo se guardó con otro costo. La copia de Membresías sigue siendo
   * un hash válido de esa misma contraseña, así que mandarla sería una llamada
   * HTTP por login para no cambiar nada.
   */
  async updatePassword(
    userId: string,
    newPassword: string,
    opciones: { espejar?: boolean } = {},
  ) {
    const passwordHash = await bcrypt.hash(
      newPassword,
      UsersService.BCRYPT_ROUNDS,
    );
    await db
      .update(users)
      .set({ passwordHash, passwordOrigen: 'propio' })
      .where(eq(users.id, userId));

    if (opciones.espejar !== false) espejarContrasena(userId, passwordHash);
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
  /**
   * Solo el tema y el idioma, tal como están AHORA en la cuenta.
   *
   * ── Por qué una ruta propia y no `getProfile` ──
   *
   * Porque la piden las CUATRO webs en cada carga, y `getProfile` trae el
   * perfil entero: disciplinas, acudientes y las notas médicas, que además hay
   * que descifrar. Pedir todo eso para saber de qué color pintar la pantalla es
   * caro y, con los datos sensibles de por medio, además es feo.
   *
   * ── Y por qué hace falta preguntarlo ──
   *
   * El tema y el idioma viajan dentro del pase (§4.21), y el pase se firma al
   * ENTRAR. Si alguien cambia a modo claro desde Membresías, el pase que tiene
   * abierto en el portal sigue diciendo «oscuro» hasta que se renueve —hasta
   * media hora—. Desde fuera eso es exactamente lo que se veía: «cambio el modo
   * en una app y en la otra tarda, o no cambia».
   *
   * El pase sigue siendo lo que pinta la primera pantalla, porque llega sin
   * pedir nada. Esto lo CORRIGE en cuanto se puede preguntar.
   */
  async aparienciaDe(id: string): Promise<{ theme: string; locale: string | null }> {
    const [fila] = await db
      .select({ theme: users.theme, locale: users.locale })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    // Sin fila no es un error que deba romper una pantalla: se responde lo de
    // por defecto y quien pregunte pinta como pintaría sin saber nada.
    return { theme: fila?.theme ?? 'sistema', locale: fila?.locale ?? null };
  }

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
      gender?: string | null;
      avatarUrl?: string | null;
      emergencyContactName?: string | null;
      emergencyContactPhone?: string | null;
      emergencyContactRelationship?: string | null;
      medicalNotes?: string | null;
      bloodType?: string | null;
      /** IANA. `null` devuelve a la detección automática del navegador. */
      timezone?: string | null;
      /** ¿La eligió la persona a mano? Ver el esquema de `users`. */
      timezoneManual?: boolean;
      /** `sistema` | `claro` | `oscuro`. Cómo quiere ver DINAMYT. */
      theme?: string;
      /** `es-CO`, `en-US`… El idioma de la interfaz y de sus correos. */
      locale?: string | null;
      /** ¿Lo eligió a mano? Sin esto, el navegador lo pisa al entrar. */
      localeManual?: boolean;
    },
  ) {
    const [row] = await db
      .update(users)
      .set({
        ...(data.timezone !== undefined && { timezone: data.timezone }),
        ...(data.timezoneManual !== undefined && {
          timezoneManual: data.timezoneManual,
        }),
        ...(data.theme !== undefined && { theme: data.theme }),
        ...(data.locale !== undefined && { locale: data.locale }),
        ...(data.localeManual !== undefined && {
          localeManual: data.localeManual,
        }),
        ...(data.fullName !== undefined && { fullName: data.fullName }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.birthDate !== undefined && { birthDate: data.birthDate }),
        ...(data.gender !== undefined && { gender: data.gender }),
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

    // La copia de Membresías, que es quien imprime el carnet. No se espera y no
    // puede fallar hacia aquí: ver `common/espejo-membresias.ts`. Las notas
    // médicas y el género no viajan — allí no existen.
    espejarPersona(id, {
      fullName: data.fullName,
      phone: data.phone,
      avatarUrl: data.avatarUrl,
      birthDate: data.birthDate,
      bloodType: data.bloodType,
      emergencyName: data.emergencyContactName,
      emergencyPhone: data.emergencyContactPhone,
    });

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
      // `undefined` es «no lo toques» y `null` es «bórralo»: con `??` los dos
      // significaban lo mismo y no había forma de quitar una fecha mal puesta.
      const [row] = await db
        .update(userDisciplines)
        .set({
          ...(data.currentGrade !== undefined && { currentGrade: data.currentGrade }),
          ...(data.since !== undefined && { since: data.since }),
          updatedAt: new Date(),
        })
        .where(eq(userDisciplines.id, existing[0].id))
        .returning();
      espejarPersona(userId, { belt: row.currentGrade, trainsSince: row.since });
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
    // El grado y la antigüedad van al carnet que imprime Membresías: cambiarlos
    // aquí y que allí siguieran los anteriores era justo lo que hacía dudar de
    // cuál de los dos era el bueno.
    espejarPersona(userId, { belt: row.currentGrade, trainsSince: row.since });
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

  /**
   * ¿El solicitante gestiona a esta persona?
   *
   * La gestiona cuando comparten una organización que él manda: su club, como
   * maestro, dueño o admin. Es lo que habilita al maestro a corregir el
   * apellido de su alumno, ponerle el cinturón o subirle la foto.
   *
   * ── Por qué también sube a la federación ──
   *
   * Porque la otra mitad del sistema ya lo hacía y las dos tenían que decir lo
   * mismo. `OrganizationsService.esGestorDe` cuenta como gestor de un club al
   * admin de la federación que lo tiene afiliado; esta regla se quedaba
   * mirando solo el club. Ese admin podía entonces quitar a un miembro y
   * cambiarle el rol, pero al abrir su ficha —en la misma pantalla y con la
   * misma sesión— recibía «No tienes permiso sobre este perfil».
   *
   * Se replica la profundidad de `esAdminDe`, que acepta al admin de la org o
   * al de su padre: club → liga → federación es todo lo que existe hoy.
   *
   * ── Y por qué el maestro NO sube ──
   *
   * Por encima del club solo cuenta `admin`. Un maestro manda en su club, no
   * en los demás clubes de su federación: si contara cualquier rol gestor, el
   * maestro de un club acabaría editando las fichas de los alumnos del club
   * vecino por el solo hecho de estar los dos afiliados a la misma liga.
   *
   * ⚠️ Ojo con lo que esto implica al dar de baja a alguien: la regla cuelga de
   * `org_members`, así que en el instante en que se quita a una persona del
   * club su maestro deja de poder tocar su ficha. Es correcto —el perfil es de
   * la persona en todo el ecosistema, no del club— pero es la explicación del
   * 403 que aparece si se intenta editar a alguien recién dado de baja.
   */
  async isOrgManagerOf(
    requesterId: string,
    targetUserId: string,
  ): Promise<boolean> {
    const targetOrgIds = (
      await db
        .select({ orgId: orgMembers.orgId })
        .from(orgMembers)
        .where(eq(orgMembers.userId, targetUserId))
    ).map((t) => t.orgId);
    if (targetOrgIds.length === 0) return false;

    const reqMemberships = await db
      .select({ orgId: orgMembers.orgId, role: orgMembers.role })
      .from(orgMembers)
      .where(eq(orgMembers.userId, requesterId));
    if (reqMemberships.length === 0) return false;

    // 1) Comparten organización y él la manda. El caso normal: el maestro y su
    //    alumno, los dos en el mismo club.
    const gestionadas = new Set(
      reqMemberships
        .filter((m) => ROLES_GESTOR.includes(m.role))
        .map((m) => m.orgId),
    );
    if (targetOrgIds.some((id) => gestionadas.has(id))) return true;

    // 2) O él manda la organización que tiene afiliado a ese club.
    const adminDe = new Set(
      reqMemberships.filter((m) => m.role === 'admin').map((m) => m.orgId),
    );
    if (adminDe.size === 0) return false;

    const padres = (
      await db
        .select({ parentId: organizations.parentId })
        .from(organizations)
        .where(inArray(organizations.id, targetOrgIds))
    )
      .map((o) => o.parentId)
      .filter((id): id is string => Boolean(id));
    if (padres.length === 0) return false;
    if (padres.some((id) => adminDe.has(id))) return true;

    // Un escalón más, que es hasta donde llega `esAdminDe`: el club cuelga de
    // una liga y la liga de una federación.
    const abuelos = await db
      .select({ parentId: organizations.parentId })
      .from(organizations)
      .where(inArray(organizations.id, padres));
    return abuelos.some((o) => o.parentId && adminDe.has(o.parentId));
  }

  // ── El documento, que es la SEGUNDA llave única de la persona ──────────────
  //
  // `users.document_id` es `unique` desde la primera migración, pero el registro
  // no lo comprobaba: la segunda persona que se registraba con el mismo
  // documento chocaba contra PostgreSQL y recibía un 500 sin explicación. Con
  // esto se comprueba antes y se le dice qué pasó.
  async findByDocument(documentId: string) {
    const filas = await db
      .select()
      .from(users)
      .where(eq(users.documentId, documentId))
      .limit(1);
    return filas[0] ?? null;
  }

  // ════════════════════════════════════════════════════════════════════════
  // REGISTRO PENDIENTE — la cuenta no existe hasta que el correo se verifica
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Lo que vive un registro sin confirmar, y por qué veinte minutos.
   *
   * Es el mismo plazo para el código y para el registro entero, a propósito:
   * dos relojes distintos («el código caducó pero tu registro sigue vivo») son
   * dos cosas que explicar en una pantalla donde la persona solo quiere entrar.
   * Veinte minutos alcanzan para abrir el correo en el celular —diez se quedan
   * cortos si el correo tarda en llegar— y no tanto como para que el documento
   * de alguien quede bloqueado media tarde por un dedazo.
   */
  static readonly REGISTRO_MINUTOS = 20;
  /** Códigos fallados antes de tirar el registro y hacer empezar de nuevo. */
  static readonly REGISTRO_MAX_INTENTOS = 6;
  /** Veces que se puede pedir el código, contando el primero. */
  static readonly REGISTRO_MAX_ENVIOS = 5;
  /** Espera entre reenvíos: sin ella el botón «reenviar» es un grifo abierto. */
  static readonly REGISTRO_ESPERA_REENVIO_SEG = 60;

  /** Seis dígitos, con el generador criptográfico y no con `Math.random`. */
  private static nuevoCodigo(): string {
    return randomInt(100_000, 1_000_000).toString();
  }

  private static caducidadRegistro(): Date {
    return new Date(Date.now() + UsersService.REGISTRO_MINUTOS * 60_000);
  }

  /**
   * Tira los registros que ya caducaron.
   *
   * Se llama al principio de cada registro y de cada verificación, y no desde un
   * cron: son dos consultas al día en el peor caso, y así el correo y el
   * documento de un registro abandonado vuelven a estar libres en el mismo
   * momento en que alguien los pide, sin depender de que un temporizador esté
   * vivo. Un cron que se cae deja el sistema bloqueando correos para siempre.
   */
  async purgarRegistrosPendientes() {
    await db
      .delete(pendingRegistrations)
      .where(lt(pendingRegistrations.expiresAt, new Date()));
  }

  /** Igual que `findByEmail`: el correo se busca en minúsculas, siempre. */
  async registroPendientePorCorreo(email: string) {
    const filas = await db
      .select()
      .from(pendingRegistrations)
      .where(eq(pendingRegistrations.email, normalizarCorreo(email)))
      .limit(1);
    return filas[0] ?? null;
  }

  async registroPendientePorDocumento(documentId: string) {
    const filas = await db
      .select()
      .from(pendingRegistrations)
      .where(eq(pendingRegistrations.documentId, documentId))
      .limit(1);
    return filas[0] ?? null;
  }

  /**
   * Guarda el registro a la espera de su código.
   *
   * La contraseña entra ya hasheada: un registro que no llega a cuenta no es
   * motivo para tener una contraseña en claro en la base de datos ni un minuto.
   *
   * Si ya había un pendiente para ese correo se REEMPLAZA. Es el caso normal:
   * la persona no recibió el código, volvió atrás y lo intentó otra vez, quizá
   * con otra contraseña. Guardar el segundo y dejar vivo el primero haría que
   * el código que llegue no sirva para los datos que se acaban de escribir.
   */
  async crearRegistroPendiente(data: {
    email: string;
    passwordHash: string;
    fullName: string;
    documentId: string;
    phone?: string | null;
    birthDate?: Date | null;
    gender?: string | null;
  }) {
    const code = UsersService.nuevoCodigo();
    const values = {
      email: normalizarCorreo(data.email),
      documentId: data.documentId,
      fullName: data.fullName,
      phone: data.phone ?? null,
      birthDate: data.birthDate ?? null,
      gender: data.gender ?? null,
      passwordHash: data.passwordHash,
      code,
      expiresAt: UsersService.caducidadRegistro(),
      attempts: 0,
      sends: 1,
      lastSentAt: new Date(),
    };

    const [fila] = await db
      .insert(pendingRegistrations)
      .values(values)
      .onConflictDoUpdate({
        target: pendingRegistrations.email,
        set: { ...values, createdAt: new Date() },
      })
      .returning();

    return { fila, code };
  }

  /** Otro código y otros veinte minutos, para el botón «reenviar». */
  async renovarCodigoPendiente(id: string) {
    const code = UsersService.nuevoCodigo();
    const [fila] = await db
      .update(pendingRegistrations)
      .set({
        code,
        expiresAt: UsersService.caducidadRegistro(),
        attempts: 0,
        lastSentAt: new Date(),
        sends: sql`${pendingRegistrations.sends} + 1`,
      })
      .where(eq(pendingRegistrations.id, id))
      .returning();
    return { fila, code };
  }

  /** Anota un código fallado y devuelve cuántos van. */
  async fallarCodigoPendiente(id: string, intentos: number) {
    await db
      .update(pendingRegistrations)
      .set({ attempts: intentos })
      .where(eq(pendingRegistrations.id, id));
  }

  async borrarRegistroPendiente(id: string) {
    await db.delete(pendingRegistrations).where(eq(pendingRegistrations.id, id));
  }

  /**
   * El código era el bueno: **aquí, y solo aquí, nace la cuenta.**
   *
   * El correo se da por verificado en el mismo acto —el código llegó a esa
   * dirección y alguien lo tecleó, que es toda la prueba que existe— y se sella
   * el consentimiento de datos (Ley 1581), que hasta ahora no se guardaba en
   * ningún sitio aunque el formulario lo exigiera.
   *
   * El pendiente se borra al final. Si la creación falla, la fila sigue ahí y
   * la persona puede reintentar con el mismo código.
   */
  async confirmarRegistroPendiente(fila: typeof pendingRegistrations.$inferSelect) {
    const [usuario] = await db
      .insert(users)
      .values({
        email: normalizarCorreo(fila.email),
        passwordHash: fila.passwordHash,
        passwordOrigen: 'propio',
        fullName: fila.fullName,
        documentId: fila.documentId,
        phone: fila.phone,
        birthDate: fila.birthDate,
        gender: fila.gender,
        origen: 'registro',
        isEmailVerified: true,
        dataConsentAt: new Date(),
      })
      .returning();

    await this.borrarRegistroPendiente(fila.id);
    // Por si su ficha de Membresías ya existía —un club que ya usaba la app y
    // cuya persona se registra ahora en el portal—: así entra a las dos con la
    // misma contraseña desde el primer día.
    espejarContrasena(usuario.id, fila.passwordHash);
    return usuario;
  }
}
