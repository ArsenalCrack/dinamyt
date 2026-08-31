import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  NotFoundException,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { organizations } from '../../db/schema';
import { OrganizationsService } from '../organizations/organizations.service';
import { rolGeneralDesdeMembresias } from '../../common/roles-por-app';

/**
 * La puerta de ENTRADA del espejo: Membresías llamando al ecosistema.
 *
 * ── Por qué existe ──
 *
 * Hasta ahora el canal iba en un solo sentido: el portal avisaba a Membresías
 * de la foto, el escudo, la contraseña y el rol. Pero el alta de un alumno
 * empieza en el otro lado —el maestro lo inscribe en su app, con el alumno
 * delante— y ahí Membresías creaba una cuenta **suya**, con su propia
 * contraseña, invisible para DINAMYT. Dos identidades para una persona, y una
 * ficha sin `eco_sub` que ninguno de los cuatro avisos del espejo alcanza:
 * no le llega ni la foto, ni el cinturón, ni la contraseña, ni el rol.
 *
 * Contradecía además la regla que sostiene todo esto: **las cuentas nacen en
 * el ecosistema** (§4.4). Ahora el gesto del maestro sigue siendo uno solo, y
 * lo que nace es una cuenta de DINAMYT con su pertenencia al club; la ficha de
 * Membresías se crea enlazada a ella.
 *
 * ── Qué NO hace ──
 *
 * No pone contraseñas y no da por buena ninguna. Crea la cuenta **sin** ella y
 * devuelve el enlace para que la persona ponga la suya, que es exactamente lo
 * que hace el maestro desde el portal (`POST /organizations/:id/invite`). Esta
 * ruta es esa misma, con otra puerta.
 *
 * ── La puerta ──
 *
 * `ECOSYSTEM_SYNC_SECRET`, el mismo secreto compartido de los avisos de ida, en
 * la cabecera `x-dinamyt-sync`. **Sin esa variable la ruta no existe** (404):
 * una ruta sin autenticar que crea cuentas y las mete en clubes no puede
 * quedarse abierta «por si acaso». Es el mismo criterio de `CRON_SECRET` y el
 * de las tres rutas gemelas al otro lado.
 */
@Controller('sync')
export class SyncController {
  constructor(private readonly orgsService: OrganizationsService) {}

  /** Comparación en tiempo constante; la diferencia de largo ya la delata el 401. */
  private static valido(recibido: string | undefined, esperado: string) {
    if (!recibido) return false;
    const a = Buffer.from(recibido);
    const b = Buffer.from(esperado);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  // ── POST /sync/alta — Membresías inscribe a alguien en su club ────────────
  @Post('alta')
  async alta(
    @Headers('x-dinamyt-sync') secreto: string | undefined,
    @Body()
    body: {
      /** El id de la organización AQUÍ (`orgs.eco_org_id` allá). */
      ecoOrgId?: string;
      email?: string;
      fullName?: string;
      phone?: string | null;
      /** El rol de Membresías: `student`, `staff` o `guardian`. */
      role?: string;
      /** El `eco_sub` del maestro que lo inscribe, para la trazabilidad. */
      invitadoPor?: string | null;
    },
  ) {
    const esperado = process.env.ECOSYSTEM_SYNC_SECRET;
    if (!esperado) throw new NotFoundException('No encontrado.');
    if (!SyncController.valido(secreto, esperado)) {
      throw new UnauthorizedException('Secreto inválido.');
    }

    const orgId = (body.ecoOrgId ?? '').trim();
    if (!orgId) throw new BadRequestException('Falta `ecoOrgId`.');
    const [org] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    // El club de Membresías no tiene espejo aquí: no hay organización a la que
    // sumar a nadie, y crearla a ciegas desde un alta sería peor.
    if (!org) {
      throw new NotFoundException(
        'Ese club no existe en DINAMYT. Enlázalo antes de dar de alta a su gente.',
      );
    }

    // El rol viaja en el idioma de Membresías y aquí se traduce al general,
    // que es el que esta base entiende. Ver `common/roles-por-app.ts`.
    const rol = rolGeneralDesdeMembresias(body.role ?? 'student');
    if (!rol) {
      throw new BadRequestException(
        `El rol '${body.role}' no tiene equivalente en DINAMYT.`,
      );
    }

    // Y a partir de aquí es exactamente la invitación del maestro: misma
    // función, mismas reglas, mismo enlace de «poner contraseña». Lo que
    // cambia es quién la pide.
    const r = await this.orgsService.inviteMember(
      orgId,
      body.email ?? '',
      rol,
      body.invitadoPor ?? undefined,
      { fullName: body.fullName, phone: body.phone ?? undefined },
    );

    return {
      // Lo que Membresías necesita para nacer enlazada: sin esto la ficha
      // volvería a quedar suelta y todo el espejo seguiría sin alcanzarla.
      ecoSub: r.miembro.userId,
      cuenta: r.cuenta,
      invitacion: r.invitacion,
    };
  }
}
