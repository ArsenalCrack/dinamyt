import {
  Controller,
  Get,
  Patch,
  Put,
  Post,
  Param,
  Body,
  UseGuards,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { EcosystemJwtGuard } from '../../common/guards/ecosystem-jwt.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/jwt.service';
import {
  validarNombre,
  validarTelefono,
  validarFechaNacimiento,
  validarAvatar,
  validarTipoSangre,
} from '../../common/validacion';

/**
 * Perfil de la persona (transversal). El maestro edita el perfil de sus alumnos
 * desde aquí (RF-02/RF-03 de PLAN_MEMBRESIAS): estos datos son de la persona en
 * TODO el ecosistema, no de una app concreta.
 */
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ── GET /users/:id/profile — perfil + disciplinas + acudientes ────────────
  @Get(':id/profile')
  @UseGuards(EcosystemJwtGuard)
  async getProfile(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    await this.assertCanManage(user, id);
    const profile = await this.usersService.getProfile(id);
    if (!profile) throw new NotFoundException('Usuario no encontrado.');
    return profile;
  }

  // ── PATCH /users/:id/profile — editar campos de la persona ────────────────
  @Patch(':id/profile')
  @UseGuards(EcosystemJwtGuard)
  async updateProfile(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      fullName?: string;
      phone?: string | null;
      birthDate?: string | null;
      avatarUrl?: string | null;
      emergencyContactName?: string | null;
      emergencyContactPhone?: string | null;
      emergencyContactRelationship?: string | null;
      medicalNotes?: string | null;
      bloodType?: string | null;
    },
  ) {
    await this.assertCanManage(user, id);

    // ── Campos PROTEGIDOS: identidad de la persona ─────────────────────────
    // El nombre y la fecha de nacimiento solo los corrige el maestro del club
    // o un administrador. El propio usuario fija su fecha UNA sola vez (la
    // primera), y su nombre nunca (viene del registro). El tipo de sangre
    // también es del editor del staff.
    const esGestor =
      user.is_super_admin ||
      (user.sub !== id
        ? true // assertCanManage ya validó que gestiona al usuario objetivo
        : await this.usersService.isOrgManagerOf(user.sub, id));
    if (!esGestor) {
      const actual = await this.usersService.findById(id);
      if (
        body.fullName !== undefined &&
        body.fullName.trim().toLocaleUpperCase('es') !==
          (actual?.fullName ?? '').toLocaleUpperCase('es')
      ) {
        throw new ForbiddenException(
          'Tu nombre solo lo puede corregir el maestro de tu club o un administrador.',
        );
      }
      delete body.fullName;
      if (body.birthDate !== undefined && actual?.birthDate) {
        const nueva = body.birthDate
          ? new Date(body.birthDate).toISOString().slice(0, 10)
          : null;
        const vigente = new Date(actual.birthDate).toISOString().slice(0, 10);
        if (nueva !== vigente) {
          throw new ForbiddenException(
            'Tu fecha de nacimiento ya quedó registrada: solo el maestro de tu club o un administrador puede corregirla.',
          );
        }
        delete body.birthDate;
      }
      if (body.bloodType !== undefined) {
        throw new ForbiddenException(
          'El tipo de sangre lo registra el maestro de tu club o un administrador.',
        );
      }
    }

    // Validación de datos de la persona (el front también valida, pero la
    // última palabra la tiene el servidor).
    if (body.fullName !== undefined) {
      body.fullName = validarNombre(body.fullName, 'nombre completo')
        .toLocaleUpperCase('es');
    }
    if (body.bloodType) body.bloodType = validarTipoSangre(body.bloodType);
    if (body.phone) body.phone = validarTelefono(body.phone);
    if (body.emergencyContactName) {
      body.emergencyContactName = validarNombre(
        body.emergencyContactName,
        'nombre del contacto de emergencia',
      );
    }
    if (body.emergencyContactPhone) {
      body.emergencyContactPhone = validarTelefono(
        body.emergencyContactPhone,
        'teléfono del contacto de emergencia',
      );
    }
    if (body.avatarUrl) body.avatarUrl = validarAvatar(body.avatarUrl);

    return this.usersService.updateProfile(id, {
      ...body,
      birthDate:
        body.birthDate === undefined
          ? undefined
          : body.birthDate === null
            ? null
            : validarFechaNacimiento(new Date(body.birthDate)),
    });
  }

  // ── GET /users/bloqueados — cuentas bloqueadas por intentos (super admin) ──
  @Get('bloqueados')
  @UseGuards(EcosystemJwtGuard, SuperAdminGuard)
  listarBloqueadas() {
    return this.usersService.listarBloqueadas();
  }

  // ── POST /users/:id/desbloquear — desbloquear cuenta (super admin) ─────────
  @Post(':id/desbloquear')
  @UseGuards(EcosystemJwtGuard, SuperAdminGuard)
  async desbloquear(@Param('id') id: string) {
    await this.usersService.desbloquearCuenta(id);
    return { ok: true, message: 'Cuenta desbloqueada.' };
  }

  // ── PUT /users/:id/disciplines — fijar disciplina/grado (solo maestro) ────
  @Put(':id/disciplines')
  @UseGuards(EcosystemJwtGuard)
  async setDiscipline(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body()
    body: { discipline: string; currentGrade?: string | null; since?: string | null },
  ) {
    await this.assertIsStaff(user, id);
    return this.usersService.setDiscipline(id, body);
  }

  // ── POST /users/:id/guardians — vincular acudiente ────────────────────────
  @Post(':id/guardians')
  @UseGuards(EcosystemJwtGuard)
  async addGuardian(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: { guardianUserId: string; relationship?: string | null },
  ) {
    await this.assertCanManage(user, id);
    return this.usersService.addGuardian(id, body);
  }

  // ── Autorización ──────────────────────────────────────────────────────────

  // Puede gestionar el perfil: el propio usuario, un super admin, o el
  // maestro/administrador de un club al que pertenece el usuario.
  private async assertCanManage(user: JwtPayload, targetId: string) {
    if (user.is_super_admin || user.sub === targetId) return;
    if (await this.usersService.isOrgManagerOf(user.sub, targetId)) return;
    throw new ForbiddenException('No tienes permiso sobre este perfil.');
  }

  // El grado (promoción) solo lo cambia el maestro/administrador o un super admin.
  private async assertIsStaff(user: JwtPayload, targetId: string) {
    if (user.is_super_admin) return;
    if (await this.usersService.isOrgManagerOf(user.sub, targetId)) return;
    throw new ForbiddenException(
      'Solo el maestro/administrador del club puede cambiar el grado.',
    );
  }
}
