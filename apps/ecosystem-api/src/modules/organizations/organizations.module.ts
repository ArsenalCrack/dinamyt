import { Module } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { OrgNotificationsService } from './org-notifications.service';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';

@Module({
  // AuthModule exporta JwtTokenService (para EcosystemJwtGuard y para firmar
  // el enlace de invitación) y MailerService. UsersModule, para crear la
  // cuenta sin contraseña de quien todavía no la tiene.
  imports: [AuthModule, UsersModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, OrgNotificationsService],
  exports: [OrganizationsService, OrgNotificationsService],
})
export class OrganizationsModule {}
