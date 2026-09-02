import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { PushService } from './push.service';
import { EcosystemJwtGuard } from '../../common/guards/ecosystem-jwt.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/jwt.service';

/**
 * Encender y apagar los avisos al celular, desde el navegador que los recibe.
 *
 * Las dos rutas piden sesión: una suscripción sin dueño no se le puede mandar a
 * nadie, y aceptar `user_id` en el cuerpo dejaría que cualquiera se apuntara a
 * los avisos de otro.
 */
@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  // ── POST /push/subscribe — «sí, avísenme en este aparato» ─────────────────
  @Post('subscribe')
  @UseGuards(EcosystemJwtGuard)
  suscribir(
    @CurrentUser() user: JwtPayload,
    @Body() body: { endpoint?: string; keys?: { p256dh?: string; auth?: string } },
    @Req() req: Request,
  ) {
    // El `User-Agent` se guarda para el día en que alguien diga «no me llegan»:
    // lo primero que se pregunta es desde qué aparato los activó.
    return this.push.suscribir(user.sub, {
      ...body,
      userAgent: req.headers['user-agent'],
    });
  }

  // ── POST /push/unsubscribe — «en este aparato ya no» ──────────────────────
  @Post('unsubscribe')
  @UseGuards(EcosystemJwtGuard)
  desuscribir(@CurrentUser() user: JwtPayload, @Body() body: { endpoint?: string }) {
    return this.push.desuscribir(user.sub, body?.endpoint);
  }
}
