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
  exports: [JwtTokenService],
})
export class AuthModule {}
