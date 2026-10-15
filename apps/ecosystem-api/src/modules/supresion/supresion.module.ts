import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { UsersModule } from '../users/users.module';
import { SupresionController } from './supresion.controller';
import { SupresionService } from './supresion.service';

/**
 * Borrar una cuenta. Módulo propio porque cruza tres: la sesión (cerrarlas
 * todas), las organizaciones (no dejar un club sin quien mande) y el correo.
 * Lo exporta para el barrido diario de `SubscriptionsController`.
 */
@Module({
  imports: [AuthModule, UsersModule, OrganizationsModule],
  controllers: [SupresionController],
  providers: [SupresionService],
  exports: [SupresionService],
})
export class SupresionModule {}
