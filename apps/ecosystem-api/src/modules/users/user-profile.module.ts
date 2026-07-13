import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersModule } from './users.module';
import { AuthModule } from '../auth/auth.module';

/**
 * Expone el perfil de la persona por HTTP. Va en un módulo aparte (no en
 * UsersModule) para evitar la dependencia circular con AuthModule: AuthModule ya
 * importa UsersModule, así que UsersModule NO puede importar AuthModule. Aquí sí,
 * porque este módulo es una hoja del grafo.
 */
@Module({
  imports: [UsersModule, AuthModule],
  controllers: [UsersController],
})
export class UserProfileModule {}
