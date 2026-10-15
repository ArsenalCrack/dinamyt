import { Body, Controller, Delete, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { EcosystemJwtGuard } from '../../common/guards/ecosystem-jwt.guard';
import type { JwtPayload } from '../auth/jwt.service';
import { SupresionService } from './supresion.service';

/**
 * `/users/me/borrado` — borrar mi cuenta. Solo la propia: nadie borra la
 * cuenta de otro desde aquí (el soporte usa `scripts/suprimir-persona.mjs`).
 */
@Controller('users/me/borrado')
@UseGuards(EcosystemJwtGuard)
export class SupresionController {
  constructor(private readonly supresion: SupresionService) {}

  /** Si hay un borrado pendiente, y cuándo. La pantalla pinta el aviso con esto. */
  @Get()
  estado(@CurrentUser() user: JwtPayload) {
    return this.supresion.estado(user.sub);
  }

  /** Pedirlo, con la contraseña y la palabra. Cierra todas las sesiones. */
  @Post()
  @Throttle({ global: { limit: 5, ttl: 60_000 } })
  pedir(
    @CurrentUser() user: JwtPayload,
    @Body() body: { contrasena?: string; confirmacion?: string },
  ) {
    return this.supresion.pedir(user.sub, body ?? {});
  }

  /** Arrepentirse, mientras no haya pasado el plazo. */
  @Delete()
  cancelar(@CurrentUser() user: JwtPayload) {
    return this.supresion.cancelar(user.sub);
  }
}
