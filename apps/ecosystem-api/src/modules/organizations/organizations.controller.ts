import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
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

  // ── GET /organizations/mias — las que administro, con sus clubes hijos ────
  @Get('mias')
  @UseGuards(EcosystemJwtGuard)
  findMias(@CurrentUser() user: JwtPayload) {
    return this.orgsService.findMias(user.sub);
  }

  // ── GET /organizations/usuarios — buscador para el panel de Accesos ───────
  @Get('usuarios')
  @UseGuards(EcosystemJwtGuard, SuperAdminGuard)
  buscarUsuarios(@Query('search') search?: string) {
    return this.orgsService.buscarUsuarios(search);
  }

  // ── GET /organizations/:id/hijas — clubes de una federación ───────────────
  @Get(':id/hijas')
  @UseGuards(EcosystemJwtGuard)
  findHijas(@Param('id') id: string) {
    return this.orgsService.findHijas(id);
  }

  // ── POST /organizations/:id/hijas — crear club hijo (admin del padre) ─────
  @Post(':id/hijas')
  @UseGuards(EcosystemJwtGuard)
  async crearHija(
    @Param('id') parentId: string,
    @Body()
    body: {
      name: string;
      type: 'FEDERATION' | 'LEAGUE' | 'CLUB' | 'ACADEMY';
      city?: string;
      country?: string;
    },
    @CurrentUser() user: JwtPayload,
  ) {
    await this.orgsService.exigirAdminDe(user.sub, parentId, user.is_super_admin);
    return this.orgsService.create({ ...body, parentId });
  }

  // ── PATCH /organizations/:id — activar/desactivar (admin del padre) ───────
  @Patch(':id')
  @UseGuards(EcosystemJwtGuard)
  async setActiva(
    @Param('id') id: string,
    @Body() body: { isActive: boolean },
    @CurrentUser() user: JwtPayload,
  ) {
    await this.orgsService.exigirAdminDe(user.sub, id, user.is_super_admin);
    return this.orgsService.setActiva(id, body.isActive === true);
  }

  // ── DELETE /organizations/:id — eliminar si está vacía (admin del padre) ──
  @Delete(':id')
  @UseGuards(EcosystemJwtGuard)
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.orgsService.exigirAdminDe(user.sub, id, user.is_super_admin);
    return this.orgsService.remove(id);
  }

  // ── POST /organizations/:id/grant-access — acceso rápido (super admin) ────
  @Post(':id/grant-access')
  @UseGuards(EcosystemJwtGuard, SuperAdminGuard)
  grantAccess(
    @Param('id') orgId: string,
    @Body() body: { email: string; role: string; app: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.orgsService.grantAccess(
      orgId,
      body.email,
      body.role ?? 'member',
      body.app ?? 'campeonatos',
      user.sub,
    );
  }

  // ── GET /organizations/:id — detalle de una organización (autenticado) ────
  @Get(':id')
  @UseGuards(EcosystemJwtGuard)
  findById(@Param('id') id: string) {
    return this.orgsService.findById(id);
  }

  // ── POST /organizations/:id/invite — invitar miembro ──────────────────────
  // Super admin O admin de la organización (o de su federación padre): así un
  // club administra a sus alumnos y una federación a sus clubes.
  @Post(':id/invite')
  @UseGuards(EcosystemJwtGuard)
  async inviteMember(
    @Param('id') orgId: string,
    @Body() body: { email: string; role?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    await this.orgsService.exigirAdminDe(user.sub, orgId, user.is_super_admin);
    return this.orgsService.inviteMember(
      orgId,
      body.email,
      body.role ?? 'member',
      user.sub,
    );
  }

  // ── PATCH /organizations/:id/members/:userId — cambiar rol ────────────────
  @Patch(':id/members/:userId')
  @UseGuards(EcosystemJwtGuard)
  async updateMemberRole(
    @Param('id') orgId: string,
    @Param('userId') userId: string,
    @Body() body: { role: string },
    @CurrentUser() user: JwtPayload,
  ) {
    await this.orgsService.exigirAdminDe(user.sub, orgId, user.is_super_admin);
    return this.orgsService.updateMemberRole(orgId, userId, body.role);
  }

  // ── DELETE /organizations/:id/members/:userId — quitar miembro ────────────
  @Delete(':id/members/:userId')
  @UseGuards(EcosystemJwtGuard)
  async removeMember(
    @Param('id') orgId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.orgsService.exigirAdminDe(user.sub, orgId, user.is_super_admin);
    return this.orgsService.removeMember(orgId, userId);
  }

  // ── GET /organizations/:id/members — listar miembros ──────────────────────
  // Datos personales (correo/teléfono): solo miembros de la org, sus admins
  // (o de la federación padre) o el super admin.
  @Get(':id/members')
  @UseGuards(EcosystemJwtGuard)
  async getMembers(@Param('id') orgId: string, @CurrentUser() user: JwtPayload) {
    await this.orgsService.exigirRelacionCon(user.sub, orgId, user.is_super_admin);
    return this.orgsService.getMembers(orgId);
  }
}
