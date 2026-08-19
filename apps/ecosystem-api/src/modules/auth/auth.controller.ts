import {
  Controller,
  Post,
  Body,
  Get,
  Headers,
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
      dataConsent: boolean;
    },
  ) {
    return this.authService.register(body);
  }

  @Throttle({ global: { limit: 6, ttl: 60_000 } })
  @Post('verify-email')
  verifyEmail(@Body() body: { userId: string; code: string }) {
    return this.authService.verifyEmail(body.userId, body.code);
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
    @Body() body: { userId: string; code: string; newPassword: string },
  ) {
    return this.authService.resetPassword(
      body.userId,
      body.code,
      body.newPassword,
    );
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
