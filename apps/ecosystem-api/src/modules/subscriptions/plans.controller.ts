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
import { PlansService } from './plans.service';
import { EcosystemJwtGuard } from '../../common/guards/ecosystem-jwt.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';

@Controller('subscription-plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  // ── POST /subscription-plans — crear plan (solo super admin) ──────────────
  @Post()
  @UseGuards(EcosystemJwtGuard, SuperAdminGuard)
  create(
    @Body()
    body: {
      name: string;
      description?: string;
      appsIncluded: string[];
      maxUsers?: number;
      priceMonthly?: string;
      priceAnnual?: string;
      /** Precio por persona y mes: pone el plan en cobro por padrón. */
      pricePerUser?: string;
      /** Mínimo facturable. */
      minUsers?: number;
    },
  ) {
    return this.plansService.create(body);
  }

  // ── GET /subscription-plans — listar planes activos (público) ─────────────
  @Get()
  findAll() {
    return this.plansService.findAllActive();
  }

  // ── PATCH /subscription-plans/:id — actualizar plan (solo super admin) ────
  @Patch(':id')
  @UseGuards(EcosystemJwtGuard, SuperAdminGuard)
  update(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      description?: string;
      appsIncluded?: string[];
      maxUsers?: number;
      priceMonthly?: string;
      priceAnnual?: string;
      pricePerUser?: string | null;
      minUsers?: number | null;
    },
  ) {
    return this.plansService.update(id, body);
  }

  // ── DELETE /subscription-plans/:id — desactivar plan (solo super admin) ───
  @Delete(':id')
  @UseGuards(EcosystemJwtGuard, SuperAdminGuard)
  remove(@Param('id') id: string) {
    return this.plansService.softDelete(id);
  }
}
