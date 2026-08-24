import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Headers,
  NotFoundException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { EcosystemJwtGuard } from '../../common/guards/ecosystem-jwt.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/jwt.service';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subsService: SubscriptionsService) {}

  // ── POST /subscriptions — crear suscripción org (solo super admin) ────────
  @Post()
  @UseGuards(EcosystemJwtGuard, SuperAdminGuard)
  create(
    @Body()
    body: {
      orgId: string;
      planId: string;
      startsAt: string;
      endsAt: string;
      totalAmount?: string;
    },
  ) {
    return this.subsService.create(body);
  }

  // ── POST /subscriptions/user — suscripción personal (solo super admin) ────
  @Post('user')
  @UseGuards(EcosystemJwtGuard, SuperAdminGuard)
  createForUser(
    @Body()
    body: {
      userEmail: string;
      planId: string;
      startsAt: string;
      endsAt: string;
    },
  ) {
    return this.subsService.createForUser(body);
  }

  // ── GET /subscriptions/user — listar personales (solo super admin) ────────
  @Get('user')
  @UseGuards(EcosystemJwtGuard, SuperAdminGuard)
  findAllPersonal() {
    return this.subsService.findAllPersonal();
  }

  // ── GET /subscriptions — listar todas (solo super admin) ──────────────────
  @Get()
  @UseGuards(EcosystemJwtGuard, SuperAdminGuard)
  findAll() {
    return this.subsService.findAll();
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  VENCIMIENTOS Y AVISOS
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⚠️ Estáticas y declaradas ANTES que las de `:id`. En Nest gana la primera
  // que coincide, y `avisos` encajaría en `:id` si fuera al revés.

  // ── GET /subscriptions/resumen — cuánto entró y cómo van los clubes ──────
  //
  // Una sola ruta y no cinco: las cinco preguntas se hacen a la vez, al abrir
  // el panel, y separarlas serían cinco viajes para pintar una pantalla.
  @Get('resumen')
  @UseGuards(EcosystemJwtGuard, SuperAdminGuard)
  resumen(@Query('mes') mes?: string, @Query('meses') meses?: string) {
    const n = Number(meses);
    return this.subsService.resumen({
      // 'YYYY-MM' o nada. Cualquier otra cosa se ignora en vez de reventar la
      // pantalla entera por un parámetro de la barra de direcciones.
      mes: /^\d{4}-\d{2}$/.test(mes ?? '') ? mes : undefined,
      meses: Number.isFinite(n) && n > 0 ? n : undefined,
    });
  }

  // ── GET /subscriptions/vencimientos — el recordatorio para el super-admin ─
  @Get('vencimientos')
  @UseGuards(EcosystemJwtGuard, SuperAdminGuard)
  vencimientos(@Query('dias') dias?: string) {
    const n = Number(dias);
    return this.subsService.vencimientos(Number.isFinite(n) && n > 0 ? n : 7);
  }

  // ── POST /subscriptions/avisos — mandar los correos AHORA ─────────────────
  // El botón del panel. `forzar=1` reenvía aunque ya se haya avisado esta
  // semana: sirve para probar que el correo sale.
  @Post('avisos')
  @UseGuards(EcosystemJwtGuard, SuperAdminGuard)
  avisar(@Body() body: { soloId?: string; forzar?: boolean }) {
    return this.subsService.avisarVencimientos({
      soloId: body?.soloId,
      forzar: body?.forzar === true,
    });
  }

  // ── POST /subscriptions/avisos/cron — el disparo diario ───────────────────
  //
  // Sin sesión: quien llama es una máquina y no tiene cuenta. La puerta es
  // `CRON_SECRET`, y **si esa variable no está definida la ruta no existe** —
  // una ruta sin autenticar que manda correo a todos los clubes no puede
  // quedarse abierta «por si acaso». Es el mismo criterio que usa Membresías
  // con su cron de avisos.
  @Post('avisos/cron')
  avisarPorCron(@Headers('x-cron-secret') secreto?: string) {
    const esperado = process.env.CRON_SECRET;
    if (!esperado) throw new NotFoundException('No encontrado.');
    if (secreto !== esperado) {
      throw new UnauthorizedException('Secreto de cron inválido.');
    }
    return this.subsService.avisarVencimientos();
  }

  // ── GET /subscriptions/org/:orgId — suscripciones de una org (autenticado)─
  @Get('org/:orgId')
  @UseGuards(EcosystemJwtGuard)
  findByOrg(@Param('orgId') orgId: string) {
    return this.subsService.findByOrg(orgId);
  }

  // ── PATCH /subscriptions/:id/payment — registrar abono (solo super admin) ─
  @Patch(':id/payment')
  @UseGuards(EcosystemJwtGuard, SuperAdminGuard)
  registerPayment(
    @Param('id') id: string,
    @Body() body: { paidAmount: string; notes?: string; method?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.subsService.registerPayment(id, {
      ...body,
      registeredByUserId: user.sub,
    });
  }

  // ── POST /subscriptions/:id/renovar — el mes siguiente, de un gesto ───────
  //
  // Esto es lo que sustituye a «crear otra suscripción cada mes». Extiende la
  // fecha, deja el pago escrito en el historial y reactiva la que estuviera
  // suspendida por no pagar — que es justo lo que acaba de dejar de ser cierto.
  @Post(':id/renovar')
  @UseGuards(EcosystemJwtGuard, SuperAdminGuard)
  renovar(
    @Param('id') id: string,
    @Body()
    body: {
      meses?: number;
      /** Lo que cuesta el periodo. Por defecto, el precio del plan. */
      precio?: string;
      /** Lo que entregó. Por defecto, el precio. */
      amount?: string;
      method?: string;
      notes?: string;
    },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.subsService.renovar(id, {
      ...body,
      registeredByUserId: user.sub,
    });
  }

  // ── GET /subscriptions/:id/pagos — el historial ───────────────────────────
  @Get(':id/pagos')
  @UseGuards(EcosystemJwtGuard, SuperAdminGuard)
  historial(@Param('id') id: string) {
    return this.subsService.historial(id);
  }

  // ── PATCH /subscriptions/:id/status — cambiar estado (solo super admin) ───
  @Patch(':id/status')
  @UseGuards(EcosystemJwtGuard, SuperAdminGuard)
  updateStatus(
    @Param('id') id: string,
    @Body()
    body: {
      status: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'PENDING_REVIEW';
    },
  ) {
    return this.subsService.updateStatus(id, body.status);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  CORREGIR, CANCELAR Y BORRAR
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⚠️ Las rutas de `user/…` van antes que las de `:id`: aunque hoy no chocan
  // por número de segmentos, declararlas después es cómo se cuelan los fallos
  // el día que alguien añada `@Delete(':id/algo')`.

  // ── PATCH /subscriptions/user/:id/status — activar/suspender personal ─────
  @Patch('user/:id/status')
  @UseGuards(EcosystemJwtGuard, SuperAdminGuard)
  updateStatusPersonal(
    @Param('id') id: string,
    @Body()
    body: { status: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'PENDING_REVIEW' },
  ) {
    return this.subsService.updateStatusPersonal(id, body.status);
  }

  // ── POST /subscriptions/user/:id/renovar — renovar una personal ──────────
  @Post('user/:id/renovar')
  @UseGuards(EcosystemJwtGuard, SuperAdminGuard)
  renovarPersonal(
    @Param('id') id: string,
    @Body()
    body: { meses?: number; amount?: string; method?: string; notes?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.subsService.renovarPersonal(id, {
      ...body,
      registeredByUserId: user.sub,
    });
  }

  // ── GET /subscriptions/user/:id/pagos — historial de una personal ────────
  @Get('user/:id/pagos')
  @UseGuards(EcosystemJwtGuard, SuperAdminGuard)
  historialPersonal(@Param('id') id: string) {
    return this.subsService.historial(id, true);
  }

  // ── DELETE /subscriptions/user/:id — borrar personal ──────────────────────
  @Delete('user/:id')
  @UseGuards(EcosystemJwtGuard, SuperAdminGuard)
  removePersonal(@Param('id') id: string) {
    return this.subsService.removePersonal(id);
  }

  // ── PATCH /subscriptions/:id — corregir plan, fechas, monto y notas ───────
  // El ESTADO no entra aquí a propósito: tiene su propia ruta, porque activar o
  // suspender es una decisión y corregir una fecha es un dedazo. Mezclarlas
  // haría que arreglar una fecha reactivara un club suspendido.
  @Patch(':id')
  @UseGuards(EcosystemJwtGuard, SuperAdminGuard)
  update(
    @Param('id') id: string,
    @Body()
    body: {
      planId?: string;
      startsAt?: string;
      endsAt?: string;
      totalAmount?: string | null;
      notes?: string | null;
    },
  ) {
    return this.subsService.update(id, body);
  }

  // ── DELETE /subscriptions/:id — borrar (solo si no tiene pagos) ───────────
  @Delete(':id')
  @UseGuards(EcosystemJwtGuard, SuperAdminGuard)
  remove(@Param('id') id: string) {
    return this.subsService.remove(id);
  }
}
