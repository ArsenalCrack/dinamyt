import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from '../../modules/auth/jwt.service';

/**
 * Decorador que extrae el usuario autenticado del request.
 *
 * Funciona en conjunto con EcosystemJwtGuard, que inyecta
 * el payload del JWT en request.user.
 *
 * Uso en controllers:
 *   @Get('profile')
 *   @UseGuards(EcosystemJwtGuard)
 *   getProfile(@CurrentUser() user: JwtPayload) {
 *     return user;
 *   }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as JwtPayload;
  },
);
