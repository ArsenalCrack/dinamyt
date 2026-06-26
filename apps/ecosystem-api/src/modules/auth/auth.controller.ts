import { Controller, Post, Body, Get, Headers } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtTokenService } from './jwt.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtTokenService,
  ) {}

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

  @Post('verify-email')
  verifyEmail(@Body() body: { userId: string; code: string }) {
    return this.authService.verifyEmail(body.userId, body.code);
  }

  @Post('login')
  login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body.email, body.password);
  }

  @Post('forgot-password')
  forgotPassword(@Body() body: { email: string }) {
    return this.authService.forgotPassword(body.email);
  }

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
