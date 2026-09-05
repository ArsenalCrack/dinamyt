import {
  Controller,
  Get,
  Patch,
  Put,
  Post,
  Param,
  Body,
  UseGuards,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { EcosystemJwtGuard } from '../../common/guards/ecosystem-jwt.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/jwt.service';
import { zonaValida } from '@dinamyt/shared';
import {
  validarNombre,
  validarNombreCompleto,
  validarTelefono,
  validarFechaNacimiento,
  validarAvatar,
  validarTipoSangre,
  validarGenero,
  validarTema,
  validarIdioma,
} from '../../common/validacion';
import { guardarImagen } from '../../common/almacen-imagenes';

/**
 * Perfil de la persona (transversal). El maestro edita el perfil de sus alumnos
 * desde aquí (RF-02/RF-03 de PLAN_MEMBRESIAS): estos datos son de la persona en
 * TODO el ecosistema, no de una app concreta.
 */
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ── GET /users/me/apariencia — el tema y el idioma, tal como están hoy ────
  //
  // La piden las cuatro webs al cargar. Es de UNO MISMO y solo de uno mismo:
  // no lleva `:id` a propósito, porque el tema no es un dato que el maestro
  // consulte de su alumno —igual que no le elige el color de la pantalla— y
  // una ruta con id habría que defenderla de eso.
  //
  // Ver `UsersService.aparienciaDe` para por qué hace falta preguntarlo
  // teniendo el pase.
  @Get('me/apariencia')
  @UseGuards(EcosystemJwtGuard)
  async miApariencia(@CurrentUser() user: JwtPayload) {
    return this.usersService.aparienciaDe(user.sub);
  }

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
      gender?: string | null;
      avatarUrl?: string | null;
      emergencyContactName?: string | null;
      emergencyContactPhone?: string | null;
      emergencyContactRelationship?: string | null;
      medicalNotes?: string | null;
      bloodType?: string | null;
      /**
       * Zona horaria IANA, elegida a mano.
       *
       * Distinta de la que detecta el navegador en cada inicio de sesión: esa
       * se sobreescribe sola cuando la persona viaja, y debe hacerlo. Elegirla
       * aquí es decir «escríbeme siempre a esta hora», y por eso marca
       * `timezoneManual` — una preferencia que se borra sola no es una
       * preferencia. `null` vuelve a la detección automática.
       */
      timezone?: string | null;
      /** `sistema` | `claro` | `oscuro`. Ver `users.theme` en el esquema. */
      theme?: string;
      /** `es-CO`, `en-US`… `null` devuelve a la detección del navegador. */
      locale?: string | null;
    },
  ) {
    await this.assertCanManage(user, id);

    // La zona la elige cada quien para SÍ MISMO. Un gestor puede corregir el
    // nombre o el tipo de sangre de un alumno —son datos del club—, pero la
    // hora a la que se le escribe a alguien no es cosa de otro.
    if (body.timezone !== undefined && user.sub !== id) {
      throw new BadRequestException(
        'La zona horaria solo la puede cambiar la propia persona.',
      );
    }
    if (body.timezone && !zonaValida(body.timezone)) {
      throw new BadRequestException('Esa zona horaria no existe.');
    }

    // El tema y el idioma, la MISMA regla y por el mismo motivo: son «cómo
    // quiero ver DINAMYT», no datos del club. El maestro corrige la ficha de su
    // alumno; no le elige el color de la pantalla ni el idioma en que lee.
    if ((body.theme !== undefined || body.locale !== undefined) && user.sub !== id) {
      throw new BadRequestException(
        'El tema y el idioma solo los puede cambiar la propia persona.',
      );
    }
    if (body.theme !== undefined) body.theme = validarTema(body.theme);
    if (body.locale) body.locale = validarIdioma(body.locale);

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
      /**
       * El tipo de sangre: la MISMA regla que la fecha de nacimiento.
       *
       * Antes se rechazaba siempre, incluso estando vacío, así que la persona
       * veía «Por registrar» en su perfil y no tenía forma de registrarlo: la
       * única salida era pedírselo al maestro, para un dato que ella sabe
       * mejor que nadie y que va impreso en su propio carnet. Y no es un dato
       * que dé permisos ni que mueva una categoría: se protege de que lo
       * CAMBIEN a la ligera, no de que exista.
       */
      if (body.bloodType !== undefined && actual?.bloodType) {
        const nuevo = (body.bloodType ?? '').trim().toUpperCase();
        if (nuevo !== actual.bloodType) {
          throw new ForbiddenException(
            'Tu tipo de sangre ya quedó registrado: solo el maestro de tu club o un administrador puede corregirlo.',
          );
        }
        delete body.bloodType;
      }
    }

    // Validación de datos de la persona (el front también valida, pero la
    // última palabra la tiene el servidor).
    // El nombre, COMPLETO: la misma regla que el registro. Sin ella, editar el
    // perfil era la puerta de atrás para dejarlo en una letra.
    if (body.fullName !== undefined) {
      body.fullName = validarNombreCompleto(body.fullName).toLocaleUpperCase(
        'es',
      );
    }
    if (body.bloodType) body.bloodType = validarTipoSangre(body.bloodType);
    if (body.gender) body.gender = validarGenero(body.gender);
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
    // La foto: primero se valida la forma, y solo después va al disco. El
    // orden importa — `guardarImagen` decodifica y escribe, y no tiene por qué
    // hacer ninguna de las dos cosas con algo que ya sabemos que no vale.
    if (body.avatarUrl) {
      body.avatarUrl = validarAvatar(body.avatarUrl);
      body.avatarUrl = (await guardarImagen(body.avatarUrl)) ?? null;
    }

    return this.usersService.updateProfile(id, {
      ...body,
      // Elegirla a mano la protege de la detección automática; quitarla
      // devuelve a la persona al comportamiento por defecto.
      ...(body.timezone !== undefined && { timezoneManual: !!body.timezone }),
      // El idioma, igual: sin esta marca el navegador lo pisa en el siguiente
      // inicio de sesión y la elección del perfil no dura ni una entrada.
      ...(body.locale !== undefined && { localeManual: !!body.locale }),
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
