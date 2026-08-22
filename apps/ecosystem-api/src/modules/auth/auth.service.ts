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
  validarNombreCompleto,
  validarDocumento,
  validarTelefono,
  validarFechaNacimiento,
  validarGenero,
  validarCorreo,
  validarContrasena,
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

  // ════════════════════════════════════════════════════════════════════════
  // REGISTRO — en dos actos, porque la cuenta la crea el CÓDIGO
  //
  // Antes esto insertaba la fila en `users` y la dejaba sin verificar. La
  // cuenta existía sin que nadie hubiera demostrado que el correo era suyo, y
  // con ella quedaban ocupados para siempre el correo Y el documento: quien
  // tecleó mal su correo —el caso normal— no podía volver a registrarse con el
  // bueno, porque su documento ya estaba cogido por la cuenta fantasma. La
  // única salida era el super-admin.
  //
  // Ahora `register` guarda un REGISTRO PENDIENTE con fecha de caducidad
  // (`pending_registrations`, ver el esquema) y `verifyEmail` es quien crea la
  // cuenta. Si el código no se usa a tiempo, la fila se borra sola y el correo
  // y el documento vuelven a estar libres.
  // ════════════════════════════════════════════════════════════════════════
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

    // Validación + normalización. El correo se comprueba entero —dominio
    // incluido—, el nombre tiene que ir completo y la contraseña tiene que ser
    // una contraseña; el portal aplica LAS MISMAS reglas mientras se teclea,
    // así que llegar aquí con algo inválido es cosa de quien llama a la API sin
    // pasar por la web. El nombre se guarda SIEMPRE en mayúsculas (así aparece
    // igual en carnets, llaves y planillas de las tres apps).
    const email = validarCorreo(data.email);
    const fullName = validarNombreCompleto(data.fullName).toLocaleUpperCase(
      'es',
    );
    const documentId = validarDocumento(data.documentId);
    const phone = data.phone ? validarTelefono(data.phone) : null;
    if (data.birthDate) validarFechaNacimiento(data.birthDate);
    const gender = data.gender ? validarGenero(data.gender) : null;
    // El contexto es lo que acaba de teclear: su contraseña no puede ser su
    // propio nombre ni su documento, que es justo lo que la gente elige.
    validarContrasena(data.password, [email, fullName, documentId]);

    // Lo primero, tirar lo caducado: así el correo y el documento de un
    // registro abandonado quedan libres en el mismo momento en que alguien los
    // pide, sin depender de ningún temporizador.
    await this.usersService.purgarRegistrosPendientes();

    await this.comprobarQueEstanLibres(email, documentId);

    const passwordHash = await this.usersService.hashearContrasena(
      data.password,
    );
    const { fila, code } = await this.usersService.crearRegistroPendiente({
      email,
      passwordHash,
      fullName,
      documentId,
      phone,
      birthDate: data.birthDate ?? null,
      gender,
    });

    const enviado = await this.mailer.sendOtp(
      email,
      code,
      'EMAIL_VERIFY',
      fullName,
    );

    return {
      message: `Te enviamos un código de ${AuthService.CODIGO_DIGITOS} dígitos a ${email}.`,
      // El correo, y NO un id de usuario: no hay usuario todavía, y la pantalla
      // siguiente lo que necesita enseñar es a dónde va a llegar el código.
      email,
      expiresAt: fila.expiresAt,
      codigoDigitos: AuthService.CODIGO_DIGITOS,
      /** `false` = no hay proveedor de correo configurado (ver MailerService). */
      enviado,
    };
  }

  /** Los dígitos del código. Uno solo aquí y el portal lo pinta con esto. */
  static readonly CODIGO_DIGITOS = 6;

  /**
   * ¿Están libres el correo y el documento? Los dos, y en este orden.
   *
   * El documento no se comprobaba: `users.document_id` es `unique` desde la
   * primera migración, así que la segunda persona con el mismo documento
   * chocaba contra PostgreSQL y recibía un 500 sin explicación.
   */
  private async comprobarQueEstanLibres(email: string, documentId: string) {
    const cuenta = await this.usersService.findByEmail(email);
    if (cuenta) {
      throw new BadRequestException(AuthService.mensajeCuentaExistente(cuenta));
    }

    const conDocumento = await this.usersService.findByDocument(documentId);
    if (conDocumento) {
      throw new BadRequestException(
        'Ya hay una cuenta de DINAMYT con ese documento. Si es tuya, inicia sesión con su correo o usa «¿Olvidaste tu contraseña?»; si crees que es un error, escríbele a tu club.',
      );
    }

    // Un pendiente de OTRO correo con el mismo documento: alguien se está
    // registrando con ese documento y aún no ha confirmado. No se le quita el
    // sitio, pero tampoco se bloquea para siempre — caduca solo.
    const pendiente =
      await this.usersService.registroPendientePorDocumento(documentId);
    if (pendiente && pendiente.email !== email) {
      throw new BadRequestException(
        'Hay un registro sin confirmar con ese documento. Si eres tú, termina de confirmarlo con el código que te llegó; si no, vuelve a intentarlo en unos minutos.',
      );
    }
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
        return 'Ya existe una cuenta con ese correo. Inicia sesión, o usa «¿Olvidaste tu contraseña?» si no la recuerdas.';
    }
  }

  /**
   * ¿Está libre este correo / este documento? Lo pregunta el formulario del
   * portal mientras se escribe, para no descubrir el choque al pulsar «crear
   * cuenta» —que era lo que pasaba, con todo el formulario ya lleno—.
   *
   * **No revela nada que el login no diga ya**: `login` responde «no existe una
   * cuenta con ese correo» desde siempre, y es una decisión de producto
   * consciente. Aun así va con su propio límite por IP en el controlador, para
   * que no se pueda usar como lista.
   */
  async disponibilidad(datos: { email?: string; documentId?: string }) {
    await this.usersService.purgarRegistrosPendientes();
    const salida: {
      email?: { libre: boolean; motivo?: string };
      documentId?: { libre: boolean; motivo?: string };
    } = {};

    // El correo tal y como lo tecleó quien pregunta. Sirve para dos cosas: para
    // buscarlo, y para reconocer sus propios datos más abajo.
    const correoPedido = datos.email ? datos.email.trim().toLowerCase() : null;

    if (correoPedido) {
      let email: string;
      try {
        email = validarCorreo(correoPedido);
      } catch {
        // Un correo a medio escribir no es «ocupado»: es que todavía no se
        // puede preguntar. La forma la valida el propio formulario.
        return salida;
      }
      const cuenta = await this.usersService.findByEmail(email);
      salida.email = cuenta
        ? { libre: false, motivo: AuthService.mensajeCuentaExistente(cuenta) }
        : { libre: true };
    }

    if (datos.documentId) {
      const doc = datos.documentId.trim();
      if (!/^[0-9]{4,20}$/.test(doc)) return salida;

      const cuenta = await this.usersService.findByDocument(doc);
      const pendiente =
        await this.usersService.registroPendientePorDocumento(doc);

      // Un pendiente CON EL MISMO CORREO es el de quien está preguntando: se
      // registró, no le llegó el código y está volviendo a intentarlo con sus
      // mismos datos. Decirle que su documento está ocupado —por él— dejaría el
      // formulario bloqueado sin salida, y `register` sí lo deja pasar.
      const esSuyo = Boolean(pendiente && pendiente.email === correoPedido);

      salida.documentId = cuenta
        ? {
            libre: false,
            motivo:
              'Ya hay una cuenta de DINAMYT con ese documento. Si es tuya, inicia sesión.',
          }
        : pendiente && !esSuyo
          ? {
              libre: false,
              motivo:
                'Hay un registro sin confirmar con ese documento. Si eres tú, confírmalo con el código que te llegó.',
            }
          : { libre: true };
    }

    return salida;
  }

  // ── Verificar el correo: AQUÍ nace la cuenta ──────────────────────────────
  //
  // Se identifica por CORREO y no por id de usuario. El id era lo que había
  // —la pantalla llegaba a pedirlo, escrito, a la persona— y además ya no
  // existe: mientras no se verifique el correo no hay usuario al que apuntar.
  //
  // `userId` se sigue aceptando por el camino heredado: las cuentas creadas
  // antes de este cambio están en `users` sin verificar y tienen que poder
  // terminar de confirmarse.
  async verifyEmail(datos: { email?: string; userId?: string; code: string }) {
    const code = (datos.code ?? '').replace(/\D/g, '');
    if (code.length !== AuthService.CODIGO_DIGITOS) {
      throw new BadRequestException(
        `El código son ${AuthService.CODIGO_DIGITOS} dígitos.`,
      );
    }

    await this.usersService.purgarRegistrosPendientes();

    const email = datos.email ? datos.email.trim().toLowerCase() : null;
    const pendiente = email
      ? await this.usersService.registroPendientePorCorreo(email)
      : null;

    if (pendiente) {
      if (pendiente.code !== code) {
        const intentos = pendiente.attempts + 1;
        if (intentos >= UsersService.REGISTRO_MAX_INTENTOS) {
          // Se tira el registro entero: quien prueba seis códigos no es quien
          // recibió el correo. El correo y el documento quedan libres.
          await this.usersService.borrarRegistroPendiente(pendiente.id);
          throw new BadRequestException(
            'Demasiados códigos incorrectos. El registro se canceló: vuelve a empezar cuando quieras.',
          );
        }
        await this.usersService.fallarCodigoPendiente(pendiente.id, intentos);
        const quedan = UsersService.REGISTRO_MAX_INTENTOS - intentos;
        throw new BadRequestException(
          `Ese código no es. Te queda${quedan === 1 ? '' : 'n'} ${quedan} intento${quedan === 1 ? '' : 's'}.`,
        );
      }

      const usuario =
        await this.usersService.confirmarRegistroPendiente(pendiente);
      // Se entra directo. El código llegó a ese correo y alguien lo tecleó:
      // esa es toda la prueba que existe de que la dirección es suya, y pedirle
      // ahora la contraseña que acaba de elegir es preguntar dos veces.
      return {
        message: 'Cuenta creada y correo verificado.',
        email: usuario.email,
        access_token: await this.buildToken(usuario),
      };
    }

    // ── Camino heredado: cuenta ya creada, sin verificar ────────────────────
    const usuario = email
      ? await this.usersService.findByEmail(email)
      : datos.userId
        ? await this.usersService.findById(datos.userId)
        : null;

    if (usuario?.isEmailVerified) {
      throw new BadRequestException(
        'Ese correo ya está verificado. Inicia sesión.',
      );
    }
    if (usuario) {
      const valido = await this.usersService.verifyOtp(
        usuario.id,
        code,
        'EMAIL_VERIFY',
      );
      if (!valido) throw new BadRequestException('Código inválido o expirado.');
      await this.usersService.markEmailVerified(usuario.id);
      return {
        message: 'Correo verificado correctamente.',
        email: usuario.email,
        access_token: await this.buildToken({
          ...usuario,
          isEmailVerified: true,
        }),
      };
    }

    throw new BadRequestException(
      'No hay ningún registro esperando confirmación para ese correo. Puede que haya caducado: vuelve a registrarte.',
    );
  }

  /**
   * Otro código para el mismo registro.
   *
   * Con dos frenos, y los dos hacen falta: una espera entre envíos (sin ella el
   * botón «reenviar» es un grifo abierto contra la cuota diaria de correo) y un
   * tope de envíos (sin él, el grifo solo va más despacio).
   */
  async reenviarCodigo(correo: string) {
    await this.usersService.purgarRegistrosPendientes();
    const email = (correo ?? '').trim().toLowerCase();
    const pendiente = email
      ? await this.usersService.registroPendientePorCorreo(email)
      : null;

    if (!pendiente) {
      throw new BadRequestException(
        'No hay ningún registro esperando confirmación para ese correo. Puede que haya caducado: vuelve a registrarte.',
      );
    }
    if (pendiente.sends >= UsersService.REGISTRO_MAX_ENVIOS) {
      throw new BadRequestException(
        'Ya te enviamos el código varias veces. Revisa la carpeta de correo no deseado, o vuelve a registrarte más tarde.',
      );
    }

    const desde = pendiente.lastSentAt?.getTime() ?? 0;
    const espera = Math.ceil(
      (desde + UsersService.REGISTRO_ESPERA_REENVIO_SEG * 1000 - Date.now()) /
        1000,
    );
    if (espera > 0) {
      throw new BadRequestException(
        `Espera ${espera} segundo${espera === 1 ? '' : 's'} antes de pedir otro código.`,
      );
    }

    const { fila, code } = await this.usersService.renovarCodigoPendiente(
      pendiente.id,
    );
    const enviado = await this.mailer.sendOtp(
      email,
      code,
      'EMAIL_VERIFY',
      pendiente.fullName,
    );

    return {
      message: `Te enviamos un código nuevo a ${email}.`,
      email,
      expiresAt: fila.expiresAt,
      codigoDigitos: AuthService.CODIGO_DIGITOS,
      enviado,
    };
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
      // Sin espejo: la contraseña NO cambió, solo el costo con que se guarda.
      // La copia de Membresías sigue siendo un hash válido de esta misma
      // contraseña, así que copiarla sería una llamada HTTP por login para
      // dejar todo igual.
      await this.usersService.updatePassword(user.id, password, {
        espejar: false,
      });
    }

    const token = await this.buildToken(user);
    return { access_token: token };
  }

  /**
   * Vuelve a firmar el token de quien ya tiene sesión, con lo que la base dice
   * AHORA.
   *
   * ── El agujero que tapa ──
   *
   * El token se firma al iniciar sesión y ahí dentro van el club, los roles por
   * app y `app_scopes` (ver `buildToken`). Todo eso lo cambia OTRA persona: el
   * maestro que acepta una solicitud, el admin que activa la suscripción del
   * club. Quien tenía la sesión abierta seguía llevando el token de antes, así
   * que el alumno recién aceptado entraba a DINAMYT y no veía ni su club ni sus
   * aplicaciones — y peor, Membresías tampoco le creaba la ficha, porque eso
   * también depende del `org_id` del token (`lib/aprovisionar.ts`).
   *
   * La única cura era cerrar sesión y volver a entrar, y eso no lo adivina
   * nadie: desde fuera se ve como «la aplicación no me deja».
   *
   * ── Por qué no es un token de refresco de verdad ──
   *
   * Porque no hace falta ninguno: esto exige un token VIGENTE (lo comprueba el
   * guard) y devuelve otro igual de vigente con los datos al día. No alarga la
   * sesión más allá de lo que ya duraba el token que se presenta, así que un
   * token robado no se convierte aquí en acceso perpetuo.
   */
  async refrescarSesion(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('Usuario no encontrado.');
    // Las mismas puertas que el login: una cuenta suspendida entre dos
    // refrescos no puede seguir renovándose sola.
    if (!user.isActive) {
      throw new UnauthorizedException('Tu cuenta está suspendida.');
    }
    return { access_token: await this.buildToken(user) };
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
    if (!ok)
      throw new UnauthorizedException('La contraseña actual no es correcta.');
    validarContrasena(newPassword, [
      user.email,
      user.fullName,
      user.documentId,
    ]);
    if (newPassword === currentPassword) {
      throw new BadRequestException(
        'La contraseña nueva tiene que ser distinta de la actual.',
      );
    }
    await this.usersService.updatePassword(userId, newPassword);
    return { message: 'Contraseña actualizada.' };
  }

  // ── Recuperar contraseña ──────────────────────────────────────────────────
  //
  // La respuesta es SIEMPRE la misma, exista o no el correo. Antes lo decía y
  // luego se desdecía: cuando el correo existía, la respuesta traía además el
  // `userId`. Con eso, probar correos ajenos contra este endpoint contestaba a
  // la pregunta que el mensaje decía no contestar — y encima entregaba el
  // identificador interno de esa persona.
  //
  // El código se canjea por CORREO (ver `resetPassword`), así que no hace falta
  // devolver nada más que el mensaje.
  async forgotPassword(correo: string) {
    const respuesta = {
      message:
        'Si ese correo tiene una cuenta de DINAMYT, te acabamos de enviar un código.',
      codigoDigitos: AuthService.CODIGO_DIGITOS,
    };

    const email = (correo ?? '').trim().toLowerCase();
    if (!email) return respuesta;

    const user = await this.usersService.findByEmail(email);
    if (!user) return respuesta;

    const code = await this.usersService.generateOtp(user.id, 'PASSWORD_RESET');
    await this.mailer.sendOtp(
      user.email,
      code,
      'PASSWORD_RESET',
      user.fullName,
    );
    return respuesta;
  }

  // ── Resetear contraseña ───────────────────────────────────────────────────
  //
  // Por correo, igual que la verificación: quien llega aquí viene de teclear un
  // código que le llegó a su buzón, no de una pantalla que le pidiera su id.
  // `userId` se sigue aceptando por si alguna app vieja lo manda.
  async resetPassword(datos: {
    email?: string;
    userId?: string;
    code: string;
    newPassword: string;
  }) {
    const email = datos.email ? datos.email.trim().toLowerCase() : null;
    const user = email
      ? await this.usersService.findByEmail(email)
      : datos.userId
        ? await this.usersService.findById(datos.userId)
        : null;

    // Mismo mensaje que un código malo: si dijera «ese correo no existe», este
    // endpoint sería la lista de correos que `forgot-password` se niega a dar.
    if (!user) throw new BadRequestException('Código inválido o expirado.');

    validarContrasena(datos.newPassword, [
      user.email,
      user.fullName,
      user.documentId,
    ]);

    const valid = await this.usersService.verifyOtp(
      user.id,
      (datos.code ?? '').replace(/\D/g, ''),
      'PASSWORD_RESET',
    );
    if (!valid) throw new BadRequestException('Código inválido o expirado.');

    await this.usersService.updatePassword(user.id, datos.newPassword);
    // Quien recupera su contraseña ha demostrado que el correo es suyo: si la
    // cuenta estaba bloqueada por intentos fallidos —el motivo más común para
    // acabar aquí—, dejarla bloqueada la manda a esperar quince minutos por
    // nada. Y el correo queda verificado por la misma razón.
    await this.usersService.desbloquearCuenta(user.id);
    if (!user.isEmailVerified) {
      await this.usersService.markEmailVerified(user.id);
    }
    return {
      message: 'Contraseña actualizada. Ya puedes iniciar sesión.',
      email: user.email,
    };
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

    // Después de comprobar el enlace y no antes: quien llega con un enlace
    // caducado tiene que enterarse de eso, no de que su contraseña es corta.
    validarContrasena(newPassword, [
      user.email,
      user.fullName,
      user.documentId,
    ]);

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
