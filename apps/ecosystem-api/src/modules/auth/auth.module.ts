import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtTokenService } from './jwt.service';
import { MailerService } from './mailer.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [AuthService, JwtTokenService, MailerService],
  // MailerService se exporta para `organizations`: la invitación del maestro
  // (camino B) sale desde ahí, que es donde vive el permiso de gestor.
  exports: [JwtTokenService, MailerService],
})
export class AuthModule {}
