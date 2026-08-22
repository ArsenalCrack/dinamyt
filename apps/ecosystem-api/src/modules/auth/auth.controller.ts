import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { JwtTokenService } from './jwt.service';
import { EcosystemJwtGuard } from '../../common/guards/ecosystem-jwt.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from './jwt.service';

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
  verifyEmail(@Body() body: { email?: string; userId?: string; code: string }) {
    return this.authService.verifyEmail(body);
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
  login(@Body() body: { email?: string; password?: string }) {
    if (!body || !body.email || !body.password) {
      throw new BadRequestException('Faltan credenciales (email y password).');
    }
    return this.authService.login(body.email, body.password);
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
    body: { email?: string; userId?: string; code: string; newPassword: string },
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

  @Get('jwks')
  getJwks() {
    return this.jwtService.getJwks();
  }
}
