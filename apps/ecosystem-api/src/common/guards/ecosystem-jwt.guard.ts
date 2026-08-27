import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  JwtTokenService,
  type JwtPayload,
} from '../../modules/auth/jwt.service';
import {
  SessionsService,
  type MotivoCierre,
} from '../../modules/auth/sessions.service';

/**
 * Guard que protege rutas verificando el JWT del ecosistema.
 *
 * Flujo:
 * 1. Extrae el Bearer token del header Authorization
 * 2. Verifica la firma RS256 usando JwtTokenService (jose)
 * 3. Comprueba que la SESIÓN a la que pertenece siga abierta
 * 4. Si todo va bien, inyecta el payload en request.user
 * 5. Si no, retorna HTTP 401 diciendo POR QUÉ
 *
 * ── Por qué no basta con la firma ─────────────────────────────────────────
 *
 * Una firma válida solo dice «esto lo emitimos nosotros y todavía no ha
 * caducado». No dice si la persona cerró sesión, si cambió la contraseña
 * porque le robaron la cuenta, o si dejó el computador de un amigo abierto y
 * se fue. Antes no se comprobaba nada más, y por eso «cerrar sesión» solo
 * borraba la copia del navegador: el token seguía entrando. El paso 3 es lo
 * que le da sentido a la palabra.
 *
 * Uso en controllers:
 *   @UseGuards(EcosystemJwtGuard)
 */
@Injectable()
export class EcosystemJwtGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtTokenService,
    private readonly sessions: SessionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Tipado: `getRequest()` devuelve `any`, y con `any` el compilador deja de
    // avisar de todo lo que pasa después — incluido leer un `jti` que no
    // existe, que es de lo que depende que esta puerta se pueda cerrar.
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload }>();

    // Extraer token del header "Authorization: Bearer <token>"
    const authHeader = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token de autenticación requerido.');
    }

    const token = authHeader.slice(7); // quitar "Bearer "

    let payload: JwtPayload;
    try {
      // Verificar firma RS256 y decodificar payload
      payload = await this.jwtService.verifyToken(token);
    } catch {
      throw new UnauthorizedException('Token inválido o expirado.');
    }

    // Un pase sin `jti` es de antes de que existieran las sesiones: está
    // firmado y en fecha, pero no hay ninguna fila que se pueda cerrar, así
    // que no hay forma de echar a quien lo lleve. Se rechazan, y el mensaje
    // dice qué hacer en vez de dejar a alguien mirando un «no autorizado».
    if (!payload.jti) {
      throw new UnauthorizedException(
        'Tu sesión es de una versión anterior. Vuelve a iniciar sesión.',
      );
    }

    const estado = await this.sessions.validar(payload.jti);
    if (!estado.viva) {
      throw new UnauthorizedException(explicar(estado.motivo));
    }

    // Inyectar el payload en el request para uso posterior
    request.user = payload;
    return true;
  }
}

/**
 * Por qué se acabó la sesión, dicho para quien lo lee.
 *
 * Devolver siempre «no autorizado» es lo que hace que la gente crea que la
 * aplicación está rota: se sale sin haber hecho nada y no hay pista de qué
 * pasó. Estos mensajes viajan hasta la pantalla de login del portal, que los
 * enseña tal cual (ver `extraerError`).
 */
function explicar(motivo: MotivoCierre): string {
  switch (motivo) {
    case 'inactividad':
      return `Tu sesión se cerró sola tras ${SessionsService.INACTIVIDAD_MINUTOS} minutos sin actividad. Vuelve a entrar.`;
    case 'caducada':
      return 'Tu sesión llegó a su límite de tiempo. Vuelve a entrar.';
    case 'cambio-contrasena':
      return 'Cerramos las demás sesiones porque cambiaste tu contraseña. Entra con la nueva.';
    case 'recuperacion':
      return 'Cerramos todas las sesiones al recuperar tu contraseña. Entra con la nueva.';
    case 'salir-todas':
      return 'Esta sesión se cerró desde otro dispositivo.';
    case 'admin':
      return 'Un administrador cerró esta sesión.';
    case 'reloj-torcido':
      // No se le cuenta el detalle técnico: para quien lo lee, lo único
      // accionable es volver a entrar. El motivo queda escrito en la fila
      // para quien mire la tabla.
      return 'Tuvimos que cerrar las sesiones abiertas por una corrección del sistema. Vuelve a entrar.';
    default:
      return 'Tu sesión ya está cerrada. Vuelve a entrar.';
  }
}
