import { Controller, Post, Get, Param, Body, UseGuards } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { EcosystemJwtGuard } from '../../common/guards/ecosystem-jwt.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/jwt.service';

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly orgsService: OrganizationsService) {}

  // ── POST /organizations — crear organización (solo super admin) ───────────
  @Post()
  @UseGuards(EcosystemJwtGuard, SuperAdminGuard)
  create(
    @Body()
    body: {
      name: string;
      type: 'FEDERATION' | 'LEAGUE' | 'CLUB' | 'ACADEMY';
      parentId?: string;
      email?: string;
      phone?: string;
      city?: string;
      country?: string;
    },
  ) {
    return this.orgsService.create(body);
  }

  // ── GET /organizations — listar todas (solo super admin) ──────────────────
  @Get()
  @UseGuards(EcosystemJwtGuard, SuperAdminGuard)
  findAll() {
    return this.orgsService.findAll();
  }

  // ── GET /organizations/:id — detalle de una organización (autenticado) ────
  @Get(':id')
  @UseGuards(EcosystemJwtGuard)
  findById(@Param('id') id: string) {
    return this.orgsService.findById(id);
  }

  // ── POST /organizations/:id/invite — invitar miembro (solo super admin) ───
  @Post(':id/invite')
  @UseGuards(EcosystemJwtGuard, SuperAdminGuard)
  inviteMember(
    @Param('id') orgId: string,
    @Body() body: { email: string; role?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.orgsService.inviteMember(
      orgId,
      body.email,
      body.role ?? 'member',
      user.sub, // el super admin que invita
    );
  }

  // ── GET /organizations/:id/members — listar miembros (autenticado) ────────
  @Get(':id/members')
  @UseGuards(EcosystemJwtGuard)
  getMembers(@Param('id') orgId: string) {
    return this.orgsService.getMembers(orgId);
  }
}
