import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { JwtPayload } from '../../modules/auth/jwt.service';

/**
 * Guard que restringe el acceso a super administradores.
 *
 * Verifica que request.user.is_super_admin === true.
 * IMPORTANTE: Debe usarse DESPUÉS de EcosystemJwtGuard para que
 * request.user ya esté poblado.
 *
 * Uso en controllers:
 *   @UseGuards(EcosystemJwtGuard, SuperAdminGuard)
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayload | undefined;

    // Si no hay usuario (guard JWT no se aplicó), denegar
    if (!user) {
      throw new ForbiddenException('Acceso denegado.');
    }

    // Verificar que es super admin
    if (!user.is_super_admin) {
      throw new ForbiddenException(
        'Solo los super administradores pueden realizar esta acción.',
      );
    }

    return true;
  }
}
