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
import { OrgNotificationsService } from './org-notifications.service';
import { EcosystemJwtGuard } from '../../common/guards/ecosystem-jwt.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/jwt.service';
import { validarLogo } from '../../common/validacion';
import { guardarImagen } from '../../common/almacen-imagenes';

/**
 * El escudo del club: se comprueba la forma y se manda al disco.
 *
 * Las tres rutas que lo escriben —crear una organización, fundar mi club y
 * editar la información— pasan por aquí. **Ninguna validaba nada** hasta el 4
 * de septiembre de 2026: este controlador no llamaba a un solo `validar*`, así
 * que el escudo entraba a la fila tal cual llegara. Ver `validarLogo`.
 */
async function prepararLogo(logo: string): Promise<string> {
  return (await guardarImagen(validarLogo(logo))) as string;
}

@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly orgsService: OrganizationsService,
    private readonly avisos: OrgNotificationsService,
  ) {}

  // ── GET /organizations/avisos — la campana de quien lleva un club ─────────
  //
  // No lleva `:id` a propósito: quien gestiona dos clubes tiene UNA campana,
  // no dos. La consulta va por destinatario (`user_id`), así que cada quien ve
  // lo suyo y nada más — no hay nada que comprobar aparte de tener sesión.
  //
  // Devuelve además `sinLeer`, que es el número rojo. Va en la misma respuesta
  // porque se pinta a la vez y pedirlo aparte sería un viaje por un entero.
  @Get('avisos')
  @UseGuards(EcosystemJwtGuard)
  async avisosMios(@CurrentUser() user: JwtPayload) {
    const [items, sinLeer] = await Promise.all([
      this.avisos.mios(user.sub),
      this.avisos.sinLeer(user.sub),
    ]);
    return { items, sinLeer };
  }

  // ── POST /organizations/avisos/leidos — marcar TODOS como leídos ──────────
  // Ya no lo llama la campana al abrirse: es el botón «marcar todo».
  @Post('avisos/leidos')
  @UseGuards(EcosystemJwtGuard)
  marcarAvisosLeidos(@CurrentUser() user: JwtPayload) {
    return this.avisos.marcarLeidos(user.sub);
  }

  // ── POST /organizations/avisos/:id/leido — éste, el que acabo de abrir ────
  //
  // Va DESPUÉS de `avisos/leidos` a propósito: Nest resuelve las rutas en el
  // orden en que se declaran, y un `:id` declarado antes se tragaría la palabra
  // «leidos» como si fuera un identificador.
  @Post('avisos/:id/leido')
  @UseGuards(EcosystemJwtGuard)
  marcarAvisoLeido(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.avisos.marcarLeido(user.sub, id);
  }

  // ── POST /organizations — crear organización (solo super admin) ───────────
  @Post()
  @UseGuards(EcosystemJwtGuard, SuperAdminGuard)
  async create(
    @Body()
    body: {
      name: string;
      type: 'FEDERATION' | 'LEAGUE' | 'CLUB' | 'ACADEMY';
      parentId?: string;
      email?: string;
      phone?: string;
      city?: string;
      country?: string;
      address?: string;
      /** La delegación a la que responde el club, y el país de ESA delegación. */
      delegation?: string;
      delegationCountry?: string;
      description?: string;
      logoUrl?: string;
    },
  ) {
    if (body.logoUrl) body.logoUrl = await prepararLogo(body.logoUrl);
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
  async crearMiClub(
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
    if (body.logoUrl) body.logoUrl = await prepararLogo(body.logoUrl);
    return this.orgsService.crearMiClub(user.sub, body);
  }

  // ── GET /organizations/clubes — clubes/academias del sistema (buscador) ───
  // `?libres=1` deja fuera a los que ya cuelgan de una federación: es lo que
  // piden los buscadores de afiliar e invitar, donde un club afiliado solo
  // sirve para ofrecer un botón que el servidor va a rechazar.
  @Get('clubes')
  @UseGuards(EcosystemJwtGuard)
  listarClubes(
    @Query('search') search?: string,
    @Query('libres') libres?: string,
  ) {
    return this.orgsService.listarClubes(search, libres === '1');
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

  // ══════════════════════════════════════════════════════════════════════════
  //  ENTRAR AL CLUB POR CÓDIGO
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⚠️ Las rutas ESTÁTICAS van antes que `:id/…`, y aquí no es cosmética:
  // `GET /organizations/solicitudes/mias` y `GET /organizations/:id/solicitudes`
  // tienen los mismos dos segmentos, así que la que se declare primero gana. Al
  // revés, «mis solicitudes» acabaría preguntando por el club llamado
  // `solicitudes`.

  // ── POST /organizations/join — pedir entrar con el código del club ────────
  @Post('join')
  @UseGuards(EcosystemJwtGuard)
  solicitarEntrada(
    @Body() body: { code: string; note?: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.orgsService.solicitarEntrada(user.sub, body.code, body.note);
  }

  // ── GET /organizations/solicitudes/mias — qué he pedido yo ────────────────
  @Get('solicitudes/mias')
  @UseGuards(EcosystemJwtGuard)
  misSolicitudes(@CurrentUser() user: JwtPayload) {
    return this.orgsService.misSolicitudes(user.sub);
  }

  // ── POST /organizations/solicitudes/:id/responder — el maestro decide ─────
  @Post('solicitudes/:id/responder')
  @UseGuards(EcosystemJwtGuard)
  responderSolicitud(
    @Param('id') id: string,
    @Body()
    body: {
      aceptar: boolean;
      role?: string;
      roleMembresias?: string;
      roleCampeonatos?: string;
      roleAcademy?: string;
    },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.orgsService.responderSolicitud(
      id,
      user.sub,
      user.is_super_admin,
      { ...body, aceptar: body.aceptar === true },
    );
  }

  // ── GET /organizations/invitaciones/mias — las que ME esperan ────────────
  // Estática y ANTES de `:id/…`, por lo mismo que `solicitudes/mias`.
  @Get('invitaciones/mias')
  @UseGuards(EcosystemJwtGuard)
  misInvitaciones(@CurrentUser() user: JwtPayload) {
    return this.orgsService.misInvitaciones(user.sub);
  }

  // ── POST /organizations/invitaciones/:id/responder — decide la persona ────
  //
  // Sin `exigirGestorDe`: quien responde es justo la persona invitada, que por
  // definición todavía no gestiona nada. Lo que protege esta ruta es que el
  // servicio comprueba que la invitación sea SUYA.
  @Post('invitaciones/:id/responder')
  @UseGuards(EcosystemJwtGuard)
  responderInvitacion(
    @Param('id') id: string,
    @Body() body: { aceptar: boolean },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.orgsService.responderInvitacion(
      id,
      user.sub,
      body?.aceptar === true,
    );
  }

  // ── DELETE /organizations/invitaciones/:id — el maestro la retira ─────────
  @Delete('invitaciones/:id')
  @UseGuards(EcosystemJwtGuard)
  cancelarInvitacion(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.orgsService.cancelarInvitacion(
      id,
      user.sub,
      user.is_super_admin,
    );
  }

  // ── GET /organizations/usuarios — buscador para el panel de Accesos ───────
  @Get('usuarios')
  @UseGuards(EcosystemJwtGuard, SuperAdminGuard)
  buscarUsuarios(@Query('search') search?: string) {
    return this.orgsService.buscarUsuarios(search);
  }

  // ── GET /organizations/:id/codigo — el código del club (su gestor) ────────
  // Lo crea la primera vez que se pide: un club que nunca lo mira nunca lo
  // tiene, que es la postura segura por defecto.
  @Get(':id/codigo')
  @UseGuards(EcosystemJwtGuard)
  async verCodigo(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.orgsService.exigirGestorDe(user.sub, id, user.is_super_admin);
    return this.orgsService.obtenerCodigo(id);
  }

  // ── POST /organizations/:id/codigo — generar uno nuevo ────────────────────
  @Post(':id/codigo')
  @UseGuards(EcosystemJwtGuard)
  async rotarCodigo(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.orgsService.exigirGestorDe(user.sub, id, user.is_super_admin);
    return this.orgsService.rotarCodigo(id);
  }

  // ── DELETE /organizations/:id/codigo — cerrar la entrada por código ───────
  @Delete(':id/codigo')
  @UseGuards(EcosystemJwtGuard)
  async quitarCodigo(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.orgsService.exigirGestorDe(user.sub, id, user.is_super_admin);
    return this.orgsService.quitarCodigo(id);
  }

  // ── GET /organizations/:id/solicitudes — la bandeja del maestro ───────────
  @Get(':id/solicitudes')
  @UseGuards(EcosystemJwtGuard)
  async listarSolicitudes(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Query('todas') todas?: string,
  ) {
    await this.orgsService.exigirGestorDe(user.sub, id, user.is_super_admin);
    return this.orgsService.listarSolicitudes(id, todas === '1');
  }

  // ── POST /organizations/:id/invitaciones — invitar a alguien al club ─────
  //
  // Es lo que sustituye al «+ Añadir» del panel del maestro. La diferencia no
  // es de nombre: aquí NO nace ninguna pertenencia. Nace cuando la persona
  // acepta (ver `invitarPersona`).
  @Post(':id/invitaciones')
  @UseGuards(EcosystemJwtGuard)
  async invitarPersona(
    @Param('id') id: string,
    @Body()
    body: {
      email: string;
      role?: string;
      roleMembresias?: string;
      roleCampeonatos?: string;
      roleAcademy?: string;
      note?: string;
      /** Obligatorio si esa persona todavía no tiene cuenta. */
      fullName?: string;
      phone?: string;
    },
    @CurrentUser() user: JwtPayload,
  ) {
    await this.orgsService.exigirGestorDe(user.sub, id, user.is_super_admin);
    return this.orgsService.invitarPersona(id, user.sub, body);
  }

  // ── GET /organizations/:id/invitaciones — las que el club tiene en el aire ─
  @Get(':id/invitaciones')
  @UseGuards(EcosystemJwtGuard)
  async invitacionesDelClub(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Query('todas') todas?: string,
  ) {
    await this.orgsService.exigirGestorDe(user.sub, id, user.is_super_admin);
    return this.orgsService.invitacionesDelClub(id, todas === '1');
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
    await this.orgsService.exigirAdminDe(
      user.sub,
      parentId,
      user.is_super_admin,
    );
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
      delegation?: string | null;
      delegationCountry?: string | null;
      isPublic?: boolean;
    },
    @CurrentUser() user: JwtPayload,
  ) {
    const { isActive, ...info } = body;
    if (info.logoUrl) info.logoUrl = await prepararLogo(info.logoUrl);
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

  // ── POST /organizations/:id/afiliar-club — el super-admin, a dedo ─────────
  // Sin invitación y sin preguntarle al maestro: ver el comentario largo del
  // servicio. La federación sigue teniendo que invitar (`invitar-club`).
  @Post(':id/afiliar-club')
  @UseGuards(EcosystemJwtGuard, SuperAdminGuard)
  afiliarClub(@Param('id') orgId: string, @Body() body: { clubId: string }) {
    return this.orgsService.afiliarClubDirecto(orgId, body.clubId);
  }

  // ── DELETE /organizations/:id/clubes/:clubId — sacarlo de la federación ───
  // El deshacer del de arriba, y por eso lleva el mismo guardia.
  @Delete(':id/clubes/:clubId')
  @UseGuards(EcosystemJwtGuard, SuperAdminGuard)
  desafiliarClub(
    @Param('id') orgId: string,
    @Param('clubId') clubId: string,
  ) {
    return this.orgsService.desafiliarClub(orgId, clubId);
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
    @Body()
    body: {
      email: string;
      role?: string;
      /** Obligatorio si esa persona todavía no tiene cuenta. */
      fullName?: string;
      phone?: string;
      roleMembresias?: string;
      roleCampeonatos?: string;
      roleAcademy?: string;
    },
    @CurrentUser() user: JwtPayload,
  ) {
    await this.orgsService.exigirGestorDe(user.sub, orgId, user.is_super_admin);
    return this.orgsService.inviteMember(
      orgId,
      body.email,
      body.role ?? 'member',
      user.sub,
      {
        fullName: body.fullName,
        phone: body.phone,
        roleMembresias: body.roleMembresias,
        roleCampeonatos: body.roleCampeonatos,
        roleAcademy: body.roleAcademy,
      },
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
    return this.orgsService.updateMemberRole(
      orgId,
      userId,
      body.role,
      user.sub,
    );
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
    return this.orgsService.removeMember(orgId, userId, user.sub);
  }

  // ── GET /organizations/:id/bajas — quién salió del club ───────────────────
  //
  // Hasta ahora la baja borraba la fila y la persona desaparecía sin fecha y
  // sin rastro: no había forma de saber a quién le pasó ni de deshacerlo. Esto
  // es la memoria de esas bajas, y solo la ve quien gestiona el club — dice
  // nombres, correos y quién dio de baja a quién.
  @Get(':id/bajas')
  @UseGuards(EcosystemJwtGuard)
  async bajas(@Param('id') orgId: string, @CurrentUser() user: JwtPayload) {
    await this.orgsService.exigirGestorDe(user.sub, orgId, user.is_super_admin);
    return this.orgsService.bajas(orgId);
  }

  // ── POST /organizations/:id/bajas/:userId/readmitir — devolverle el club ──
  // Vuelve con lo que tenía: sus cuatro roles y su fecha de entrada. Ver
  // `readmitirMiembro`.
  @Post(':id/bajas/:userId/readmitir')
  @UseGuards(EcosystemJwtGuard)
  async readmitir(
    @Param('id') orgId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.orgsService.exigirGestorDe(user.sub, orgId, user.is_super_admin);
    return this.orgsService.readmitirMiembro(orgId, userId, user.sub);
  }

  // ── DELETE /organizations/:id/bajas/:userId — olvidar la baja ─────────────
  // Solo borra el recuerdo: la persona sigue fuera del club igual que antes.
  // Existe porque una bandeja con las bajas de hace dos años deja de leerse.
  @Delete(':id/bajas/:userId')
  @UseGuards(EcosystemJwtGuard)
  async olvidarBaja(
    @Param('id') orgId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.orgsService.exigirGestorDe(user.sub, orgId, user.is_super_admin);
    return this.orgsService.olvidarBaja(orgId, userId);
  }

  // ── GET /organizations/:id/members — listar miembros ──────────────────────
  // Datos personales (correo/teléfono): solo miembros de la org, sus admins
  // (o de la federación padre) o el super admin.
  @Get(':id/members')
  @UseGuards(EcosystemJwtGuard)
  async getMembers(
    @Param('id') orgId: string,
    @CurrentUser() user: JwtPayload,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    /** `1` para ver también a quien perdió el acceso a Membresías. */
    @Query('incluirSinAcceso') incluirSinAcceso?: string,
  ) {
    await this.orgsService.exigirRelacionCon(
      user.sub,
      orgId,
      user.is_super_admin,
    );
    // `Number('')` da 0 y `Number('abc')` da NaN: los dos acabarían pidiendo
    // cero filas o reventando la consulta. Se filtran aquí.
    const aNumero = (v?: string) => {
      const n = Number(v);
      return v && Number.isFinite(n) ? n : undefined;
    };
    return this.orgsService.getMembers(orgId, {
      search,
      limit: aNumero(limit),
      offset: aNumero(offset),
      incluirSinAcceso: incluirSinAcceso === '1',
    });
  }
}
