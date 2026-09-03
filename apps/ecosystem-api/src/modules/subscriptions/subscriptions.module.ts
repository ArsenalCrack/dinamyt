import { Module } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';
import { AuthModule } from '../auth/auth.module';
import { OrganizationsModule } from '../organizations/organizations.module';

@Module({
  // AuthModule exporta JwtTokenService, necesario para EcosystemJwtGuard.
  // OrganizationsModule exporta OrgNotificationsService: el aviso de que el
  // plan vence tiene que llegar a la CAMPANA del maestro, no solo a su correo.
  imports: [AuthModule, OrganizationsModule],
  controllers: [SubscriptionsController, PlansController],
  providers: [SubscriptionsService, PlansService],
  exports: [SubscriptionsService, PlansService],
})
export class SubscriptionsModule {}
