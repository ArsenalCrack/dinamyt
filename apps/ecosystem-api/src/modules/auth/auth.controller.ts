import {
  Controller,
  Post,
  Body,
  Get,
  Delete,
  Param,
  Query,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { JwtTokenService } from './jwt.service';
import { EcosystemJwtGuard } from '../../common/guards/ecosystem-jwt.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from './jwt.service';
import type { ContextoPeticion } from './auth.service';

/**
 * Lo que se sabe del navegador que llama, sacado de la propia petición.
 *
 * El navegador y la IP acaban en la lista de dispositivos conectados, para que
 * alguien pueda reconocer «ese es el computador de la sala» y cerrarlo. La
 * zona horaria y el idioma llegan en cabeceras que ponen los clientes del
 * portal y de Academy, y sirven para escribirle los correos a su hora — el
 * navegador ya pinta bien lo suyo, pero el servidor no tiene forma de
 * adivinarlo.
 *
 * Todo esto lo escribe el cliente y **nada de ello autoriza nada**: se guarda
 * para enseñarlo y para dar formato, nunca para decidir quién entra.
 */
function contextoDe(req: Request): ContextoPeticion {
  const cabecera = (n: string) => {
    const v = req.headers[n];
    return typeof v === 'string' ? v : Array.isArray(v) ? v[0] : null;
  };
  return {
    userAgent: cabecera('user-agent'),
    // Detrás del Nginx del VPS, `req.ip` es el del propio proxy; el original
    // viaja en `X-Forwarded-For`, y el primero de la lista es el del cliente.
    ip: cabecera('x-forwarded-for')?.split(',')[0].trim() || req.ip || null,
    timezone: cabecera('x-zona-horaria'),
    locale: cabecera('x-idioma'),
  };
}

/**
 * El pase que trae la petición, sin comprobar nada.
 *
 * Lo usa `POST /auth/logout`, que ya no lleva guard. Se acepta también en el
 * cuerpo porque `navigator.sendBeacon` —lo que un día usará el cierre al cerrar
 * la pestaña— no sabe poner cabeceras.
 */
function paseDe(req: Request): string | null {
  const cabecera = req.headers['authorization'];
  if (typeof cabecera === 'string' && cabecera.startsWith('Bearer ')) {
    return cabecera.slice(7);
  }
  const body = req.body as { token?: unknown } | undefined;
  return typeof body?.token === 'string' && body.token ? body.token : null;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtTokenService,
  ) {}

  // Anti-fuerza-bruta: los endpoints con contraseña u OTP tienen límites
  // estrictos por IP (el guard global permite 120/min para el resto).
  @Throttle({ global: { limit: 5, ttl: 60_000 } })
  @Post('register')
  register(
    @Body()
    body: {
      email: string;
      password: string;
      fullName: string;
      documentId: string;
      phone?: string;
      /** ISO 'YYYY-MM-DD'. Campeonatos categoriza por edad; el club felicita. */
      birthDate?: string;
      /** `MASCULINO` | `FEMENINO`. Campeonatos categoriza por género. */
      gender?: string;
      dataConsent: boolean;
    },
  ) {
    // La fecha llega como texto y el servicio la valida como `Date`. Se
    // convierte aquí, en la frontera, y no dentro: un `new Date('')` da
    // `Invalid Date`, que pasa el `if (data.birthDate)` y revienta más
    // adentro con un mensaje que no explica nada.
    return this.authService.register({
      ...body,
      birthDate: body.birthDate ? new Date(body.birthDate) : undefined,
    });
  }

  // El código se canjea por CORREO. `userId` se sigue aceptando para las
  // cuentas creadas antes del registro en dos actos (ver AuthService).
  @Throttle({ global: { limit: 6, ttl: 60_000 } })
  @Post('verify-email')
  verifyEmail(
    @Body() body: { email?: string; userId?: string; code: string },
    @Req() req: Request,
  ) {
    return this.authService.verifyEmail(body, contextoDe(req));
  }

  // Reenviar el código del registro. El freno de verdad —la espera entre
  // envíos y el tope— está en el servicio; esto es el techo por IP.
  @Throttle({ global: { limit: 5, ttl: 60_000 } })
  @Post('resend-code')
  resendCode(@Body() body: { email: string }) {
    return this.authService.reenviarCodigo(body?.email);
  }

  // ¿Está libre este correo / este documento? Lo pregunta el formulario del
  // portal MIENTRAS se escribe, para no descubrir el choque al pulsar «crear
  // cuenta» con todo el formulario ya lleno. Límite generoso porque se llama
  // una vez por campo terminado, pero límite al fin: no es una lista.
  @Throttle({ global: { limit: 30, ttl: 60_000 } })
  @Get('disponibilidad')
  disponibilidad(
    @Query('email') email?: string,
    @Query('documentId') documentId?: string,
  ) {
    return this.authService.disponibilidad({ email, documentId });
  }

  @Throttle({ global: { limit: 10, ttl: 60_000 } })
  @Post('login')
  login(
    @Body() body: { email?: string; password?: string; recordar?: boolean },
    @Req() req: Request,
  ) {
    if (!body || !body.email || !body.password) {
      // `correo` y `contraseña`, no `email` y `password`: este mensaje se le
      // enseña tal cual a quien intenta entrar, y los nombres de los campos
      // del JSON no significan nada para quien está mirando un formulario.
      throw new BadRequestException('Faltan credenciales (correo y contraseña).');
    }
    // La casilla «mantener la sesión iniciada en este dispositivo». Sin ella
    // el servidor no se enteraba de nada y cerraba por inactividad a los
    // veinte minutos a quien había pedido justo lo contrario.
    return this.authService.login(
      body.email,
      body.password,
      contextoDe(req),
      Boolean(body.recordar),
    );
  }

  // ── POST /auth/refresh — volver a firmar el token con lo de AHORA ─────────
  //
  // Lo llama el portal al abrir el dashboard. Es lo que hace que al alumno que
  // su maestro acaba de aceptar le aparezcan su club y sus aplicaciones sin
  // tener que cerrar sesión — que era la única cura y no la adivinaba nadie.
  //
  // El tope por IP es generoso porque una recarga de pantalla lo dispara, pero
  // existe: firmar un token cuesta, y esta ruta la puede llamar cualquiera con
  // una sesión abierta.
  @Throttle({ global: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @UseGuards(EcosystemJwtGuard)
  refresh(@CurrentUser() user: JwtPayload, @Req() req: Request) {
    // `jti!` sin comprobar: el guard ya rechazó cualquier pase que no lo
    // lleve, así que aquí no puede faltar.
    return this.authService.refrescarSesion(
      user.sub,
      user.jti!,
      contextoDe(req),
    );
  }

  // ── GET /auth/me — información completa de la cuenta (autenticado) ────────
  @Get('me')
  @UseGuards(EcosystemJwtGuard)
  async me(@CurrentUser() user: JwtPayload) {
    return this.authService.getCuenta(user.sub);
  }

  // ── POST /auth/change-password — cambiar contraseña (autenticado) ─────────
  @Post('change-password')
  @UseGuards(EcosystemJwtGuard)
  changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    return this.authService.changePassword(
      user.sub,
      body.currentPassword,
      body.newPassword,
      user.jti,
    );
  }

  @Throttle({ global: { limit: 3, ttl: 60_000 } })
  @Post('forgot-password')
  forgotPassword(@Body() body: { email: string }) {
    return this.authService.forgotPassword(body.email);
  }

  @Throttle({ global: { limit: 6, ttl: 60_000 } })
  @Post('reset-password')
  resetPassword(
    @Body()
    body: {
      email?: string;
      userId?: string;
      code: string;
      newPassword: string;
    },
  ) {
    return this.authService.resetPassword(body);
  }

  // ── POST /auth/set-password — canjear el enlace de invitación ─────────────
  // Pública a propósito: quien la usa todavía no puede iniciar sesión. Lo que
  // la protege es el enlace firmado, y el límite por IP evita que alguien pruebe
  // enlaces a ciegas.
  @Throttle({ global: { limit: 6, ttl: 60_000 } })
  @Post('set-password')
  setPassword(@Body() body: { token: string; password: string }) {
    return this.authService.setPassword(body?.token, body?.password);
  }

  @Post('verify-token')
  verifyToken(@Body() body: { token: string }) {
    return this.authService.verifyToken(body.token);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SESIONES — salir de verdad, y ver desde dónde se está dentro
  //
  // Hasta aquí «salir» era borrar la copia del token en el navegador, y el
  // original seguía abriendo puertas hasta caducar solo. Estas cuatro rutas
  // son lo que convierte esa palabra en una acción.
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Cierra ESTA sesión. Lo llama `/salir` del portal antes de irse.
   *
   * **Sin guard, y eso es el arreglo.** Con `EcosystemJwtGuard` delante, salir
   * exigía un pase en fecha; pero el pase dura media hora y la sesión hasta
   * doce, así que quien volvía a una pestaña abierta un rato después recibía un
   * 401 al pulsar «Salir». El navegador se quedaba sin su copia —y la persona,
   * convencida de haber salido— mientras la fila seguía abierta y su pase
   * todavía entraba en Academy y en Campeonatos. La comprobación que sí hace
   * falta la hace el servicio: la firma. Ver `cerrarSesionDelPase`.
   *
   * El tope por IP está porque la ruta ya no la protege un guard: revocar es
   * barato, pero no gratis, y nadie necesita salir treinta veces por minuto.
   */
  @Throttle({ global: { limit: 30, ttl: 60_000 } })
  @Post('logout')
  logout(@Req() req: Request) {
    return this.authService.cerrarSesionDelPase(paseDe(req));
  }

  /**
   * Cierra todas las demás. Es el botón de «me dejé la sesión abierta en otro
   * lado», y la respuesta al susto del computador prestado.
   */
  @Post('logout-all')
  @UseGuards(EcosystemJwtGuard)
  logoutAll(@CurrentUser() user: JwtPayload) {
    return this.authService.cerrarLasDemas(user.sub, user.jti);
  }

  /** Los dispositivos conectados, para pintarlos en el perfil. */
  @Get('sesiones')
  @UseGuards(EcosystemJwtGuard)
  sesiones(@CurrentUser() user: JwtPayload) {
    return this.authService.sesionesAbiertas(user.sub, user.jti);
  }

  /** Cierra UNA de la lista. Solo las propias: lo comprueba el servicio. */
  @Delete('sesiones/:id')
  @UseGuards(EcosystemJwtGuard)
  cerrarSesionConcreta(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.authService.cerrarUna(user.sub, id);
  }

  @Get('jwks')
  getJwks() {
    return this.jwtService.getJwks();
  }
}
