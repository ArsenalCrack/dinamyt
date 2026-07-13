import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { UserProfileModule } from './modules/users/user-profile.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Rate limiting global (por IP): generoso para el uso normal de las webs;
    // los endpoints sensibles de /auth declaran límites mucho más estrictos
    // con @Throttle (fuerza bruta de contraseñas y OTP).
    ThrottlerModule.forRoot([{ name: 'global', ttl: 60_000, limit: 120 }]),
    AuthModule,
    UsersModule,
    UserProfileModule,
    OrganizationsModule,
    SubscriptionsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
