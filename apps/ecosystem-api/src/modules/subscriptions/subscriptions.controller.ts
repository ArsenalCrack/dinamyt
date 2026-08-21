import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { EcosystemJwtGuard } from '../../common/guards/ecosystem-jwt.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';

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
    @Body() body: { paidAmount: string; notes?: string },
  ) {
    return this.subsService.registerPayment(id, body);
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
