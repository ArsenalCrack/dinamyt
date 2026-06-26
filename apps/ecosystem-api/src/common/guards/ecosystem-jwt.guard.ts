import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtTokenService } from '../../modules/auth/jwt.service';

/**
 * Guard que protege rutas verificando el JWT del ecosistema.
 *
 * Flujo:
 * 1. Extrae el Bearer token del header Authorization
 * 2. Verifica la firma RS256 usando JwtTokenService (jose)
 * 3. Si es válido, inyecta el payload en request.user
 * 4. Si es inválido o ausente, retorna HTTP 401
 *
 * Uso en controllers:
 *   @UseGuards(EcosystemJwtGuard)
 */
@Injectable()
export class EcosystemJwtGuard implements CanActivate {
  constructor(private readonly jwtService: JwtTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // Extraer token del header "Authorization: Bearer <token>"
    const authHeader = request.headers['authorization'] as string | undefined;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token de autenticación requerido.');
    }

    const token = authHeader.slice(7); // quitar "Bearer "

    try {
      // Verificar firma RS256 y decodificar payload
      const payload = await this.jwtService.verifyToken(token);

      // Inyectar el payload en el request para uso posterior
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Token inválido o expirado.');
    }
  }
}
