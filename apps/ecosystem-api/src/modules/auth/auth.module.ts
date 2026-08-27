import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtTokenService } from './jwt.service';
import { MailerService } from './mailer.service';
import { SessionsService } from './sessions.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [AuthService, JwtTokenService, MailerService, SessionsService],
  // MailerService se exporta para `organizations`: la invitación del maestro
  // (camino B) sale desde ahí, que es donde vive el permiso de gestor.
  //
  // SessionsService se exporta porque lo necesita `EcosystemJwtGuard`, que se
  // usa en todos los módulos: sin él el guard comprobaría la firma y nada más,
  // que es justo el agujero que esto vino a cerrar.
  exports: [JwtTokenService, MailerService, SessionsService],
})
export class AuthModule {}
