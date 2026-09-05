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
import { and, eq } from 'drizzle-orm';
import { db } from '../../db';
import { orgMembers, organizations, users } from '../../db/schema';
import { OrganizationsService } from '../organizations/organizations.service';
import { rolGeneralDesdeMembresias } from '../../common/roles-por-app';
import { validarTema, validarIdioma } from '../../common/validacion';

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

  // ── POST /sync/acceso — Membresías cortó (o devolvió) el acceso a alguien ──
  //
  // ── El hueco que cierra ──
  //
  // Era un hueco conocido: el maestro le quitaba el acceso a un alumno en
  // Membresías y **el portal no se enteraba**. Le seguía enseñando su tarjeta
  // de «Entrar a Membresías», que lo dejaba en un 403 sin una palabra de
  // explicación; y al maestro, que ve a su gente aquí, no se le decía a quién
  // había apagado. Cada uno de los dos sabía la mitad.
  //
  // ── Lo que NO hace ──
  //
  // **No lo saca de la organización.** Perder el acceso a una aplicación no es
  // irse del club: la persona sigue siendo del club para Campeonatos, para
  // Academy y para su propia cuenta. Lo que se guarda es lo que pasó, ni más ni
  // menos, y quien quiera darlo de baja de verdad lo hace aquí a propósito —y
  // eso sí viaja de vuelta (`espejarBaja`).
  //
  // ── La puerta ──
  //
  // El mismo `ECOSYSTEM_SYNC_SECRET` que `/sync/alta`, y sin él la ruta no
  // existe.
  @Post('acceso')
  async acceso(
    @Headers('x-dinamyt-sync') secreto: string | undefined,
    @Body()
    body: {
      /** Quién, con su id de AQUÍ (`users.eco_sub` allá). */
      ecoSub?: string;
      /** En qué club (`orgs.eco_org_id` allá). El acceso es por club. */
      ecoOrgId?: string;
      /** De qué aplicación. Hoy solo `membresias`; ver la migración 0013. */
      app?: string;
      activo?: boolean;
    },
  ) {
    const esperado = process.env.ECOSYSTEM_SYNC_SECRET;
    if (!esperado) throw new NotFoundException('No encontrado.');
    if (!SyncController.valido(secreto, esperado)) {
      throw new UnauthorizedException('Secreto inválido.');
    }

    const userId = (body.ecoSub ?? '').trim();
    const orgId = (body.ecoOrgId ?? '').trim();
    if (!userId || !orgId) {
      throw new BadRequestException('Faltan `ecoSub` y `ecoOrgId`.');
    }
    // Una app que este portal no conoce se rechaza en vez de guardarse en la
    // columna de otra: el día que haya dos, un typo escribiría en la que no es.
    if ((body.app ?? 'membresias') !== 'membresias') {
      throw new BadRequestException(
        `El portal no lleva el acceso de '${body.app}'. Hoy solo 'membresias'.`,
      );
    }
    if (typeof body.activo !== 'boolean') {
      throw new BadRequestException('`activo` tiene que ser true o false.');
    }

    // Sin pertenencia no hay dónde apuntarlo, y no es un error: esa persona
    // tiene ficha en un club de Membresías que aquí no la tiene de miembro.
    const filas = await db
      .update(orgMembers)
      .set({ membresiasActivo: body.activo })
      .where(and(eq(orgMembers.userId, userId), eq(orgMembers.orgId, orgId)))
      .returning({ id: orgMembers.id });

    return { encontrada: filas.length > 0, aplicado: filas.length > 0 };
  }
  // ── POST /sync/apariencia — el tema y el idioma, desde CUALQUIER app ──────
  //
  // ── Por qué hacía falta ──
  //
  // El tema y el idioma viajan del portal a las demás dentro del pase (§4.21),
  // y eso resolvía la mitad del problema: elegir una vez en DINAMYT y verlo en
  // las cuatro. La otra mitad no estaba. Quien cambiaba a modo claro **dentro
  // de Membresías o de Campeonatos** lo cambiaba solo ahí: `localStorage` es
  // por origen, y esas apps no tienen forma de escribir en `users`.
  //
  // Visto desde fuera es peor que no tener la función: el mismo botón, en la
  // misma cuenta, unas veces se recuerda en todas partes y otras no, según en
  // qué app lo pulsaste. Ahora cualquiera de las cuatro puede guardar la
  // preferencia, y la siguiente que abras ya la trae.
  //
  // ── Por qué por el secreto y no con el pase de la persona ──
  //
  // Porque Membresías y Campeonatos cambian el pase del ecosistema por su
  // propia sesión —una cookie httpOnly— en cuanto entras, y a partir de ahí no
  // lo tienen. Este es el mismo canal servidor-a-servidor de `/sync/acceso`,
  // que ya existe y ya está probado.
  //
  // ⚠️ Solo escribe estas dos columnas. Es a propósito: una ruta que entra por
  // un secreto compartido no puede tocar el rol, el correo ni la contraseña.
  @Post('apariencia')
  async apariencia(
    @Headers('x-dinamyt-sync') secreto: string | undefined,
    @Body()
    body: {
      /** El id de la persona AQUÍ (`users.eco_sub` allá). */
      ecoSub?: string;
      /** `sistema` | `claro` | `oscuro`. */
      theme?: string;
      /** `es-CO`, `en-US`… */
      locale?: string;
    },
  ) {
    const esperado = process.env.ECOSYSTEM_SYNC_SECRET;
    if (!esperado) throw new NotFoundException('No encontrado.');
    if (!SyncController.valido(secreto, esperado)) {
      throw new UnauthorizedException('Secreto inválido.');
    }

    const id = (body.ecoSub ?? '').trim();
    if (!id) throw new BadRequestException('Falta `ecoSub`.');

    const cambios: { theme?: string; locale?: string; localeManual?: boolean } =
      {};
    if (body.theme !== undefined) cambios.theme = validarTema(body.theme);
    if (body.locale !== undefined) {
      cambios.locale = validarIdioma(body.locale);
      // Elegirlo a mano lo protege de la detección del navegador, igual que
      // cuando se elige en el portal. Sin esta marca, el siguiente inicio de
      // sesión lo pisaría con lo que diga `X-Idioma` (§4.21).
      cambios.localeManual = true;
    }
    if (!Object.keys(cambios).length) {
      throw new BadRequestException('No hay nada que cambiar.');
    }

    const filas = await db
      .update(users)
      .set({ ...cambios, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning({ id: users.id });

    return { encontrada: filas.length > 0, aplicado: filas.length > 0 };
  }
}
