import { Module } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  // AuthModule exporta JwtTokenService, necesario para EcosystemJwtGuard
  imports: [AuthModule],
  controllers: [SubscriptionsController, PlansController],
  providers: [SubscriptionsService, PlansService],
  exports: [SubscriptionsService, PlansService],
})
export class SubscriptionsModule {}
