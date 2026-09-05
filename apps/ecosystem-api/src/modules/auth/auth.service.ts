import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtTokenService, JwtPayload } from './jwt.service';
import { MailerService } from './mailer.service';
import { SessionsService } from './sessions.service';
import { zonaValida } from '@dinamyt/shared';
import { db } from '../../db';
import {
  users,
  organizations,
  orgMembers,
  subscriptions,
  subscriptionPlans,
  userSubscriptions,
} from '../../db/schema';
import { eq, and, gt, inArray, InferSelectModel } from 'drizzle-orm';
import { cadenasDeMando } from '../../common/jerarquia';
import { padresDe } from '../../common/apps-de-la-org';
import { rolParaApp } from '../../common/roles-por-app';
import {
  validarNombreCompleto,
  validarDocumento,
  validarTelefono,
  validarFechaNacimiento,
  validarGenero,
  normalizarCorreo,
  validarCorreo,
  validarContrasena,
} from '../../common/validacion';

type User = InferSelectModel<typeof users>;

// Los catálogos y la traducción del rol general viven en `common/roles-por-app`
// desde que se descubrió que `maestro` no llegaba a Membresías: allí el
// catálogo no lo tiene, así que el rol se caía a `null` y la ficha nacía como
// alumno. El comentario largo de ese archivo cuenta el fallo entero.

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtTokenService,
    private readonly mailer: MailerService,
    private readonly sessions: SessionsService,
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
    const correoPedido = datos.email ? normalizarCorreo(datos.email) : null;

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
  async verifyEmail(
    datos: { email?: string; userId?: string; code: string },
    contexto?: ContextoPeticion,
  ) {
    const code = (datos.code ?? '').replace(/\D/g, '');
    if (code.length !== AuthService.CODIGO_DIGITOS) {
      throw new BadRequestException(
        `El código son ${AuthService.CODIGO_DIGITOS} dígitos.`,
      );
    }

    await this.usersService.purgarRegistrosPendientes();

    const email = datos.email ? normalizarCorreo(datos.email) : null;
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
        ...(await this.abrirSesion(usuario, contexto)),
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
        ...(await this.abrirSesion(
          { ...usuario, isEmailVerified: true },
          contexto,
        )),
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
    const email = normalizarCorreo(correo);
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

  /**
   * `recordar` es la casilla del login, y viaja hasta la fila de la sesión.
   *
   * Solo entra por aquí: el registro y el canje de invitación abren sesión sin
   * que nadie haya podido marcar nada, así que nacen sin recordar — que es el
   * lado seguro. Ver `sessions.recordada` en el esquema.
   */
  async login(
    email: string,
    password: string,
    contexto?: ContextoPeticion,
    recordar = false,
  ) {
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

    return this.abrirSesion(user, contexto, recordar);
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
   * guard, que además comprueba que la SESIÓN siga abierta) y devuelve otro
   * pase de la misma sesión. No alarga nada por su cuenta: los tres relojes
   * —inactividad, máximo absoluto y revocación— viven en `sessions`, y si
   * cualquiera de ellos dio la hora, el guard no deja llegar hasta aquí.
   *
   * ── Y ahora también es el latido ──
   *
   * Como el pase dura media hora, el navegador vuelve por aquí solo cada
   * poco. Eso es lo que hace que una sesión cerrada desde otro dispositivo se
   * apague en toda la federación —Academy incluida— sin que esas apps tengan
   * que preguntar nada a nadie: cuando les caduca el pase que llevan, el
   * siguiente no llega.
   */
  async refrescarSesion(userId: string, jti: string, contexto?: ContextoPeticion) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('Usuario no encontrado.');
    // Las mismas puertas que el login: una cuenta suspendida entre dos
    // refrescos no puede seguir renovándose sola.
    if (!user.isActive) {
      throw new UnauthorizedException('Tu cuenta está suspendida.');
    }
    const alDia = await this.anotarZona(user, contexto);
    // `0` en una sesión recordada: no tiene reloj de inactividad, y seguir
    // contestando «20» aquí sería mentirle al navegador sobre su propia sesión.
    const recordada = await this.sessions.esRecordada(jti);
    return {
      access_token: await this.buildToken(alDia, jti),
      sesion: {
        inactividadMinutos: recordada ? 0 : SessionsService.INACTIVIDAD_MINUTOS,
        recordada,
      },
    };
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
    jtiActual?: string,
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

    // ── Y se echa a todos los demás ──────────────────────────────────────
    //
    // Esto es la mitad del sentido de cambiar una contraseña, y hasta ahora no
    // pasaba: quien la cambiaba porque sospechaba que alguien estaba dentro de
    // su cuenta cambiaba la cerradura y dejaba al intruso adentro, con su
    // sesión abierta, hasta un día entero. La sesión desde la que se pide se
    // conserva —nadie quiere que le echen a mitad del formulario.
    const cerradas = await this.sessions.revocarTodas(
      userId,
      'cambio-contrasena',
      jtiActual,
    );
    return {
      message:
        cerradas > 0
          ? `Contraseña actualizada. Cerramos ${cerradas === 1 ? 'la otra sesión abierta' : `las otras ${cerradas} sesiones abiertas`}.`
          : 'Contraseña actualizada.',
      sesionesCerradas: cerradas,
    };
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

    const email = normalizarCorreo(correo);
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
    const email = datos.email ? normalizarCorreo(datos.email) : null;
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

    // ── Aquí no se salva NINGUNA ────────────────────────────────────────
    //
    // A diferencia de `changePassword`, quien llega por «olvidé mi
    // contraseña» normalmente no tiene ninguna sesión abierta que proteger, y
    // muchas veces está aquí precisamente porque cree que alguien más entró.
    // Dejar viva aunque sea una sería dejar la puerta que se vino a cerrar.
    const cerradas = await this.sessions.revocarTodas(user.id, 'recuperacion');
    return {
      message:
        cerradas > 0
          ? `Contraseña actualizada y ${cerradas === 1 ? 'la sesión que había abierta se cerró' : `las ${cerradas} sesiones que había abiertas se cerraron`}. Ya puedes iniciar sesión.`
          : 'Contraseña actualizada. Ya puedes iniciar sesión.',
      email: user.email,
      sesionesCerradas: cerradas,
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
  /**
   * Comprobar un pase desde otra app.
   *
   * Aquí **sí** se mira la sesión, a diferencia de las apps federadas, que
   * verifican la firma por su cuenta y no preguntan. Quien se molesta en
   * llamar a esta ruta está pidiendo la respuesta buena, y la respuesta buena
   * incluye si la persona cerró sesión hace un minuto.
   *
   * No renueva el reloj de inactividad (`tocar: false`): comprobar un token no
   * es que alguien esté usando la aplicación, y si lo renovara, cualquier
   * servicio que compruebe en bucle mantendría vivas para siempre sesiones que
   * nadie está tocando.
   */
  async verifyToken(token: string) {
    let payload;
    try {
      payload = await this.jwtService.verifyToken(token);
    } catch {
      throw new UnauthorizedException('Token inválido o expirado.');
    }
    if (!payload.jti) {
      throw new UnauthorizedException(
        'Ese token es de una versión anterior. Hay que volver a iniciar sesión.',
      );
    }
    const estado = await this.sessions.validar(payload.jti, false);
    if (!estado.viva) {
      throw new UnauthorizedException('Esa sesión ya está cerrada.');
    }
    return { valid: true, payload };
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
  //
  // `jti` es la sesión a la que pertenece el pase que se está firmando. No es
  // decorativo: es lo único que permite cerrar esta sesión después. Se pide
  // como parámetro —y no se genera aquí— porque una renovación tiene que
  // seguir siendo LA MISMA sesión: si cada refresco abriera una nueva, la
  // lista de dispositivos conectados de cualquiera tendría cincuenta filas al
  // final del día y cerrar la de ayer no serviría de nada.
  /**
   * De quién cuelga cada organización, subiendo por niveles hasta la raíz.
   *
   * **Vive en `common/apps-de-la-org.ts`**, no aquí. Era privado de este
   * servicio mientras el único que subía la jerarquía era el pase; ahora
   * también la suben el aviso del plan a Membresías y el listado de qué clubes
   * abren cada app. Tres copias de esta consulta es como se consigue que una
   * olvide la herencia y un club afiliado abra Campeonatos sin salir en su
   * listado.
   */
  private padresDe(ids: string[]): Promise<Map<string, string | null>> {
    return padresDe(ids);
  }

  private async buildToken(user: User, jti: string): Promise<string> {
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

    // ── 1. Suscripciones organizacionales activas — LAS SUYAS Y LAS DE ARRIBA
    //
    // Decisión 11 del plan maestro: **la organización contrata y sus clubes
    // heredan**. La federación paga el plan de Campeonatos y sus clubes
    // afiliados lo abren; hasta aquí el join era
    // `org_members.org_id = subscriptions.org_id` y el plan de la federación
    // no llegaba a nadie más que a quien fuera miembro de la federación misma.
    //
    // Lo que NO cambia: la herencia baja, nunca sube. Un club con su propio
    // plan no se lo pasa a su federación ni a sus clubes hermanos, y su plan
    // propio SE SUMA al heredado en vez de sustituirlo — un club afiliado que
    // además paga Membresías abre las dos cosas.
    const orgIdsPropias = [...new Set(pertenencias.map((p) => p.orgId))];
    const cadenas = cadenasDeMando(
      await this.padresDe(orgIdsPropias),
      orgIdsPropias,
    );
    const orgIdsConAncestros = [...new Set([...cadenas.values()].flat())];

    const subsPorOrg =
      orgIdsConAncestros.length === 0
        ? []
        : await db
            .select({
              orgId: subscriptions.orgId,
              appsIncluded: subscriptionPlans.appsIncluded,
            })
            .from(subscriptions)
            .innerJoin(
              subscriptionPlans,
              eq(subscriptions.planId, subscriptionPlans.id),
            )
            .where(
              and(
                inArray(subscriptions.orgId, orgIdsConAncestros),
                eq(subscriptions.status, 'ACTIVE'),
                gt(subscriptions.endsAt, now),
              ),
            );

    // Lo que abre cada organización de la cadena, para repartirlo después
    // entre los clubes que cuelgan de ella.
    const abrePorOrg = new Map<string, string[]>();
    for (const fila of subsPorOrg) {
      const previo = abrePorOrg.get(fila.orgId) ?? [];
      abrePorOrg.set(fila.orgId, [...previo, ...(fila.appsIncluded ?? [])]);
    }

    // Y lo que abre cada club DE LA PERSONA: lo suyo más lo de sus padres.
    const orgSubs = orgIdsPropias.map((orgId) => ({
      orgId,
      appsIncluded: (cadenas.get(orgId) ?? [orgId]).flatMap(
        (eslabon) => abrePorOrg.get(eslabon) ?? [],
      ),
    }));

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
    // suscripción activa, que es el que la persona va a poder abrir. Cuenta
    // igual la heredada de su federación: para quien mira la pantalla, un
    // club que abre Campeonatos porque su federación paga es exactamente tan
    // «abrible» como uno que lo paga él.
    //
    // El filtro por lista no vacía NO es de adorno: `orgSubs` trae ahora una
    // fila por cada club de la persona, tenga plan o no. Sin él, el primer
    // club de la lista ganaría siempre y `org_id` acabaría apuntando a uno
    // que no abre nada.
    const conSuscripcion = new Set(
      orgSubs.filter((s) => s.appsIncluded.length > 0).map((s) => s.orgId),
    );
    const principal =
      pertenencias.find((p) => conSuscripcion.has(p.orgId)) ??
      pertenencias[0] ??
      null;

    const orgId = principal?.orgId ?? null;

    // El rol por app sale de su columna; si está vacía —que es lo normal— se
    // TRADUCE el general al catálogo de esa app. Antes solo se copiaba cuando
    // el nombre coincidía, y por eso `maestro` llegaba a Campeonatos y se
    // perdía camino de Membresías, que llama `owner` a esa misma persona.
    const general = principal?.role ?? null;
    const roleAcademy = rolParaApp('academy', principal?.roleAcademy, general);
    const roleCampeonatos = rolParaApp(
      'campeonatos',
      principal?.roleCampeonatos,
      general,
    );
    const roleMembresias = rolParaApp(
      'membresias',
      principal?.roleMembresias,
      general,
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
      // Viaja en el token para que las apps federadas puedan pintar horas sin
      // preguntarle al ecosystem por cada pantalla. En el navegador no hace
      // falta —él ya sabe dónde está—, pero sí en cualquier cosa que se
      // genere fuera de él.
      timezone: user.timezone ?? null,
      // Y por el mismo motivo, cómo quiere ver DINAMYT. Es lo que hace que
      // elegir el modo claro en el portal lo aplique también Membresías,
      // Campeonatos y Academy — cuatro orígenes distintos, un solo pase.
      theme: user.theme ?? 'sistema',
      locale: user.locale ?? null,
    };

    return this.jwtService.signToken({ ...payload, jti });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SESIONES
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Abre una sesión y devuelve su primer pase.
   *
   * Es el único sitio por el que se entra: login, verificación del registro y
   * canje de invitación acaban todos aquí. Si mañana aparece otra puerta, que
   * pase por esta función y la sesión quedará registrada —y por tanto se podrá
   * cerrar— sin que nadie tenga que acordarse.
   */
  private async abrirSesion(
    user: User,
    contexto?: ContextoPeticion,
    recordar = false,
  ) {
    // La zona se aplica al usuario que se va a firmar, no solo a la base.
    //
    // Antes se guardaba y se firmaba el `user` de antes, así que el token del
    // PRIMER inicio de sesión salía sin zona y las apps federadas no la veían
    // hasta la primera renovación —media hora después—. Media hora es
    // exactamente el rato en el que alguien entra, mira su horario y se va.
    const alDia = await this.anotarZona(user, contexto);
    const sesion = await this.sessions.abrir({
      userId: user.id,
      userAgent: contexto?.userAgent,
      ip: contexto?.ip,
      recordada: recordar,
    });
    return {
      access_token: await this.buildToken(alDia, sesion.id),
      sesion: {
        expiraEl: sesion.expiresAt.toISOString(),
        // Recordada no tiene reloj de inactividad, y decirle al navegador que
        // sí lo tiene es lo que haría que el vigilante la cerrara por su
        // cuenta a los veinte minutos aunque el servidor la aceptara. `0`
        // significa «no lo vigiles»: ver `vigilarSesion` en el portal.
        inactividadMinutos: sesion.recordada
          ? 0
          : SessionsService.INACTIVIDAD_MINUTOS,
        recordada: sesion.recordada,
      },
    };
  }

  /**
   * Guarda dónde está la persona, si el navegador lo dijo y ella no lo ha
   * elegido a mano.
   *
   * Se hace al entrar y en cada renovación: quien se muda o viaja empieza a
   * recibir los correos en su hora sin tener que enterarse de que existe una
   * pantalla de preferencias. Quien sí entró a elegirla queda a salvo por
   * `timezoneManual` — ver el esquema.
   *
   * Devuelve el usuario **como queda**, para que quien vaya a firmar un token
   * ponga dentro la zona nueva y no la de la petición anterior.
   */
  private async anotarZona(
    user: User,
    contexto?: ContextoPeticion,
  ): Promise<User> {
    if (!contexto) return user;
    const zona = zonaValida(contexto.timezone) ? contexto.timezone! : null;
    const idioma =
      contexto.locale && contexto.locale.length <= 10 ? contexto.locale : null;

    const cambios: { timezone?: string; locale?: string } = {};
    if (zona && !user.timezoneManual && user.timezone !== zona) {
      cambios.timezone = zona;
    }
    // El idioma, con la MISMA protección que la zona.
    //
    // Hasta aquí se escribía siempre, y eso convertía la elección del perfil en
    // una preferencia que se borraba sola: quien pusiera «English» a mano volvía
    // a español en su siguiente inicio de sesión, porque su navegador manda
    // `X-Idioma: es-CO`. Una preferencia que no sobrevive a entrar no es una
    // preferencia — es la misma lección de `timezoneManual`, y se le pasó por
    // alto a la columna gemela.
    if (idioma && !user.localeManual && user.locale !== idioma) {
      cambios.locale = idioma;
    }
    if (!Object.keys(cambios).length) return user;

    // Sin `await` sobre el camino de la respuesta: que el reloj de alguien no
    // retrase su inicio de sesión. Si falla, el peor caso es que los correos
    // sigan saliendo en la zona anterior.
    void db
      .update(users)
      .set({ ...cambios, updatedAt: new Date() })
      .where(eq(users.id, user.id))
      .catch(() => undefined);

    return { ...user, ...cambios };
  }

  /** Cierra la sesión desde la que se pide. Es el «salir» de verdad. */
  async cerrarSesion(jti: string | undefined) {
    if (jti) await this.sessions.revocar(jti, 'salir');
    return { message: 'Sesión cerrada.' };
  }

  /**
   * Cierra la sesión que nombra un pase, **aunque el pase ya haya caducado**.
   *
   * ── Por qué no lo hace el guard ───────────────────────────────────────────
   *
   * Porque el guard exige un pase en fecha, y esta es la única ruta donde eso
   * es contraproducente. El pase dura media hora; la sesión, hasta doce. Quien
   * vuelve a una pestaña abierta después de comer y pulsa «Salir» tiene el pase
   * vencido y la sesión viva: con el guard delante recibía un 401, el navegador
   * se quedaba sin su copia y la fila seguía abierta —renovable, y todavía
   * válida en Academy y en Campeonatos hasta que la inactividad la cerrara—.
   * Es exactamente el «salir que no sale» que estas rutas vinieron a arreglar.
   *
   * ── Por qué es seguro contestar siempre lo mismo ──────────────────────────
   *
   * Un pase que no verifica no cierra nada, pero la respuesta no lo dice: quien
   * prueba tokens a ciegas no aprende de aquí si acertó. Y quien tiene uno de
   * verdad en la mano no gana nada usándolo aquí — lo único que consigue es
   * REVOCAR, que es quitar acceso, nunca darlo.
   */
  async cerrarSesionDelPase(token: string | null) {
    const cerrada = { message: 'Sesión cerrada.' };
    if (!token) return cerrada;
    try {
      const pase = await this.jwtService.verificarPaseParaCerrar(token);
      if (pase.jti) await this.sessions.revocar(pase.jti, 'salir');
    } catch {
      // Firma rota, emisor ajeno o pase de hace más de doce horas: no hay
      // ninguna fila que este token pueda nombrar. Salir no falla por eso.
    }
    return cerrada;
  }

  /**
   * Cierra todas las demás sesiones de la persona.
   *
   * La que pide se conserva a propósito: quien se acuerda del computador que
   * dejó abierto lo hace desde su celular, y echarle también del celular
   * convierte una medida de seguridad en un castigo.
   */
  async cerrarLasDemas(userId: string, jtiActual?: string) {
    const cerradas = await this.sessions.revocarTodas(
      userId,
      'salir-todas',
      jtiActual,
    );
    return {
      cerradas,
      message:
        cerradas === 0
          ? 'No había ninguna otra sesión abierta.'
          : cerradas === 1
            ? 'Se cerró la otra sesión abierta.'
            : `Se cerraron las otras ${cerradas} sesiones abiertas.`,
    };
  }

  /** Los dispositivos conectados, con la sesión actual marcada. */
  async sesionesAbiertas(userId: string, jtiActual?: string) {
    const abiertas = await this.sessions.listar(userId);
    return abiertas.map((s) => ({ ...s, actual: s.id === jtiActual }));
  }

  /** Cierra UNA sesión concreta de la lista. Solo las propias. */
  async cerrarUna(userId: string, jti: string) {
    if (!(await this.sessions.pertenece(jti, userId))) {
      // Mismo mensaje que si no existiera: decir «esa sesión es de otro»
      // convertiría este endpoint en una forma de comprobar identificadores
      // ajenos.
      throw new BadRequestException('Esa sesión ya no está abierta.');
    }
    await this.sessions.revocar(jti, 'salir-todas');
    return { message: 'Sesión cerrada.' };
  }
}

/**
 * Lo que se sabe del navegador que hace la petición.
 *
 * Los tres datos se leen de la petición en el controlador y viajan juntos: el
 * navegador y la IP para que la persona reconozca sus dispositivos, y la zona
 * horaria para escribirle los correos a su hora.
 */
export interface ContextoPeticion {
  userAgent?: string | null;
  ip?: string | null;
  timezone?: string | null;
  locale?: string | null;
}
