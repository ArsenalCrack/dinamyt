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

  // ── GET /organizations/mias — las que gestiono, con sus clubes hijos ──────
  @Get('mias')
  @UseGuards(EcosystemJwtGuard)
  findMias(@CurrentUser() user: JwtPayload) {
    return this.orgsService.findMias(user.sub);
  }

  // ── GET /organizations/mi-club — info del club al que pertenezco ──────────
  @Get('mi-club')
  @UseGuards(EcosystemJwtGuard)
  miClub(@CurrentUser() user: JwtPayload) {
    return this.orgsService.miClub(user.sub);
  }

  // ── POST /organizations/mi-club — fundar mi propio club (maestro) ─────────
  @Post('mi-club')
  @UseGuards(EcosystemJwtGuard)
  crearMiClub(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      name: string;
      city?: string;
      country?: string;
      description?: string;
      phone?: string;
      logoUrl?: string;
      socialLinks?: string[];
    },
  ) {
    return this.orgsService.crearMiClub(user.sub, body);
  }

  // ── GET /organizations/clubes — clubes/academias del sistema (buscador) ───
  @Get('clubes')
  @UseGuards(EcosystemJwtGuard)
  listarClubes(@Query('search') search?: string) {
    return this.orgsService.listarClubes(search);
  }

  // ── GET /organizations/invitaciones-club/mias — pendientes de mis clubes ──
  @Get('invitaciones-club/mias')
  @UseGuards(EcosystemJwtGuard)
  misInvitacionesClub(@CurrentUser() user: JwtPayload) {
    return this.orgsService.misInvitacionesClub(user.sub);
  }

  // ── POST /organizations/invitaciones-club/:id/responder ───────────────────
  @Post('invitaciones-club/:id/responder')
  @UseGuards(EcosystemJwtGuard)
  responderInvitacionClub(
    @Param('id') id: string,
    @Body() body: { aceptar: boolean },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.orgsService.responderInvitacionClub(
      id,
      user.sub,
      user.is_super_admin,
      body.aceptar === true,
    );
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

  // ── PATCH /organizations/:id — activar/desactivar o editar la ficha ───────
  // isActive: solo el admin (o del padre). La ficha (descripción, dirección,
  // horarios, contacto): cualquier gestor del club (maestro/owner/admin).
  @Patch(':id')
  @UseGuards(EcosystemJwtGuard)
  async patchOrganizacion(
    @Param('id') id: string,
    @Body()
    body: {
      isActive?: boolean;
      name?: string;
      description?: string | null;
      address?: string | null;
      schedule?: string | null;
      phone?: string | null;
      email?: string | null;
      city?: string | null;
      country?: string | null;
      logoUrl?: string | null;
      socialLinks?: string[] | null;
    },
    @CurrentUser() user: JwtPayload,
  ) {
    const { isActive, ...info } = body;
    if (isActive !== undefined) {
      await this.orgsService.exigirAdminDe(user.sub, id, user.is_super_admin);
      await this.orgsService.setActiva(id, isActive === true);
    }
    if (Object.keys(info).length > 0) {
      await this.orgsService.exigirGestorDe(user.sub, id, user.is_super_admin);
      return this.orgsService.actualizarInfo(id, info);
    }
    return this.orgsService.findById(id);
  }

  // ── POST /organizations/:id/invitar-club — federación/liga invita un club ─
  @Post(':id/invitar-club')
  @UseGuards(EcosystemJwtGuard)
  async invitarClub(
    @Param('id') orgId: string,
    @Body() body: { clubId: string },
    @CurrentUser() user: JwtPayload,
  ) {
    await this.orgsService.exigirAdminDe(user.sub, orgId, user.is_super_admin);
    return this.orgsService.invitarClub(orgId, body.clubId, user.sub);
  }

  // ── GET /organizations/:id/invitaciones-club — enviadas por la org ────────
  @Get(':id/invitaciones-club')
  @UseGuards(EcosystemJwtGuard)
  async invitacionesClubEnviadas(
    @Param('id') orgId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.orgsService.exigirAdminDe(user.sub, orgId, user.is_super_admin);
    return this.orgsService.invitacionesClubEnviadas(orgId);
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
    await this.orgsService.exigirGestorDe(user.sub, orgId, user.is_super_admin);
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
    await this.orgsService.exigirGestorDe(user.sub, orgId, user.is_super_admin);
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
    await this.orgsService.exigirGestorDe(user.sub, orgId, user.is_super_admin);
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
