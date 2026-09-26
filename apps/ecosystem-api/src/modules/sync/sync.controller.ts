import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { and, asc, eq, inArray, ne } from 'drizzle-orm';
import { db } from '../../db';
import { orgMembers, organizations, users } from '../../db/schema';
import { OrganizationsService } from '../organizations/organizations.service';
import { OrgNotificationsService } from '../organizations/org-notifications.service';
import {
  propiosDeCampeonatos,
  rolGeneralDesdeCampeonatos,
  rolGeneralDesdeMembresias,
  rolesParaApp,
} from '../../common/roles-por-app';
import { validarTema, validarIdioma } from '../../common/validacion';
import { AppSync, identificarLlamada } from '../../common/secreto-sync';

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
 * Un secreto POR APP en la cabecera `x-dinamyt-sync` (`common/secreto-sync.ts`):
 * cada ruta dice qué apps pueden llamarla, y el secreto dice cuál llama. **Sin
 * secreto para ninguna de ellas la ruta no existe** (404): una ruta sin
 * autenticar que crea cuentas y las mete en clubes no puede quedarse abierta
 * «por si acaso». Es el mismo criterio de `CRON_SECRET` y el de las rutas
 * gemelas al otro lado.
 */
@Controller('sync')
export class SyncController {
  constructor(
    private readonly orgsService: OrganizationsService,
    // Opcional solo para las pruebas que no lo usan; Nest lo inyecta siempre
    // (lo exporta `OrganizationsModule`).
    private readonly avisos?: OrgNotificationsService,
  ) {}

  /**
   * La puerta de todas las rutas: 404 si ninguna de las apps permitidas tiene
   * secreto aquí, 401 si el que llega no es el de una de ellas. Devuelve quién
   * llama (`compartido` mientras dure la transición al secreto por app).
   */
  private static puerta(recibido: string | undefined, ...permitidas: AppSync[]) {
    const quien = identificarLlamada(recibido, permitidas);
    if (quien === 'apagada') throw new NotFoundException('No encontrado.');
    if (quien === 'rechazada') throw new UnauthorizedException('Secreto inválido.');
    return quien;
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
      /**
       * El rol en el idioma de quien pide el alta. Membresías: `student`,
       * `staff` o `guardian`. Campeonatos: solo `juez`.
       */
      role?: string;
      /** Quién pide el alta. Sin él, Membresías (el único que la pedía antes). */
      app?: 'membresias' | 'campeonatos';
      /** El `eco_sub` del maestro que lo inscribe, para la trazabilidad. */
      invitadoPor?: string | null;
    },
  ) {
    const quien = SyncController.puerta(secreto, 'membresias', 'campeonatos');
    // Con el secreto de una app, el alta es de ESA app: con el de Membresías no
    // se crea un juez de Campeonatos, ni al revés. Con el compartido de antes
    // no se sabe quién llama y manda el campo, como siempre.
    const app = quien === 'compartido' ? (body.app ?? 'membresias') : quien;
    if (quien !== 'compartido' && body.app && body.app !== quien) {
      throw new UnauthorizedException(
        `Ese secreto es de ${quien}: no puede pedir altas de ${body.app}.`,
      );
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

    // El rol viaja en el idioma de la app que pide el alta y aquí se traduce
    // al general, que es el que esta base entiende. Ver
    // `common/roles-por-app.ts`: de Campeonatos solo entra el juez.
    const desdeCampeonatos = app === 'campeonatos';
    const rol = desdeCampeonatos
      ? rolGeneralDesdeCampeonatos(body.role ?? '')
      : rolGeneralDesdeMembresias(body.role ?? 'student');
    if (!rol) {
      throw new BadRequestException(
        desdeCampeonatos
          ? 'Desde Campeonatos solo se dan de alta jueces. Los maestros entran con su cuenta de DINAMYT desde su club, y los administradores se crean en DINAMYT.'
          : `El rol '${body.role}' no tiene equivalente en DINAMYT.`,
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

    // Lo que la app necesita para nacer enlazada: sin esto la ficha volvería a
    // quedar suelta y todo el espejo seguiría sin alcanzarla. Una respuesta
    // con forma de éxito y sin `ecoSub` es exactamente cómo nace una ficha
    // suelta (ya pasó: el reenvío de una invitación sin abrir la devolvía
    // vacía), así que eso es un error, no un 200.
    const ecoSub = r.miembro?.userId;
    if (!ecoSub) {
      throw new InternalServerErrorException(
        'El alta se hizo pero DINAMYT no devolvió la cuenta. Vuelve a intentarlo.',
      );
    }
    return {
      ecoSub,
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
  // Solo Membresías: el acceso que se guarda aquí es el suyo.
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
    SyncController.puerta(secreto, 'membresias');

    const userId = (body.ecoSub ?? '').trim();
    const orgId = (body.ecoOrgId ?? '').trim();
    if (!userId || !orgId) {
      throw new BadRequestException('Faltan `ecoSub` y `ecoOrgId`.');
    }
    // Las dos columnas son `uuid`: otra cosa revienta la consulta (un 500).
    if (!SyncController.esUuid(userId) || !SyncController.esUuid(orgId)) {
      throw new BadRequestException('`ecoSub` y `ecoOrgId` son ids de DINAMYT.');
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
  // ── GET /sync/apariencia/:ecoSub — y la vuelta: qué tema tiene hoy ───────
  //
  // ── El hueco que quedaba abierto ──
  //
  // `POST /sync/apariencia` cerró el sentido de IDA: cambiar el modo claro en
  // Membresías o en Campeonatos ya se guarda en la cuenta. Pero la VUELTA
  // seguía dependiendo del pase, y el pase se firma al ENTRAR.
  //
  // O sea que quien cambiaba el tema en el portal y saltaba a Membresías —donde
  // ya tenía la sesión abierta desde ayer— no veía nada: su cookie de allá no
  // sabe nada de esto, y el pase que trajo el primer día decía otra cosa. Es la
  // otra mitad exacta de «unas veces se recuerda y otras no».
  //
  // Con esto, cada app puede PREGUNTAR al cargar. Sigue pintando primero con lo
  // que tenga —el pase, la copia local— y corrige después: preguntar no puede
  // costar el fogonazo que tanto trabajo costó quitar.
  //
  // ⚠️ Solo LEE, y solo estas dos columnas: quien tenga el secreto de
  // Membresías o de Campeonatos podría saber de qué color ve alguien su
  // pantalla —cosmético— y nada más.
  @Get('apariencia/:ecoSub')
  async leerApariencia(
    @Headers('x-dinamyt-sync') secreto: string | undefined,
    @Param('ecoSub') ecoSub: string,
  ) {
    SyncController.puerta(secreto, 'membresias', 'campeonatos');

    const id = (ecoSub ?? '').trim();
    if (!id) throw new BadRequestException('Falta `ecoSub`.');
    // `users.id` es `uuid`: otra cosa revienta la consulta (un 500).
    if (!SyncController.esUuid(id)) {
      throw new BadRequestException('`ecoSub` es un id de DINAMYT.');
    }

    const [fila] = await db
      .select({ theme: users.theme, locale: users.locale })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    // Sin fila se responde lo de por defecto y no un 404: la app que pregunta
    // solo quiere saber de qué color pintar, y una persona que aquí no existe
    // —el alumno de carnet QR— pinta como pintaría sin preguntar.
    return {
      encontrada: !!fila,
      theme: fila?.theme ?? 'sistema',
      locale: fila?.locale ?? null,
    };
  }

  // ── GET /sync/clubes — el directorio de clubes, para invitar (F5) ─────────
  //
  // Campeonatos invita CLUBES a un campeonato (F5 de PLAN-CAMPEONATOS), y el
  // administrador tiene que poder buscarlos. Los clubes viven aquí, y
  // Campeonatos ya no tiene el pase de esa persona —lo canjeó por su cookie al
  // entrar—, así que pregunta por el mismo canal servidor-a-servidor que la
  // apariencia.
  //
  // Con `federacion`, los clubes afiliados a ella salen primero y marcados:
  // son a los que una federación invita casi siempre.
  //
  // ⚠️ Solo LEE, y solo lo que el portal ya enseña a cualquiera con sesión en
  // su buscador (`GET /organizations/clubes`): id, nombre y ciudad de los
  // clubes activos. Ni miembros, ni contactos.
  @Get('clubes')
  async clubes(
    @Headers('x-dinamyt-sync') secreto: string | undefined,
    @Query('search') search?: string,
    @Query('federacion') federacion?: string,
  ) {
    SyncController.puerta(secreto, 'campeonatos');

    const fed = (federacion ?? '').trim();
    const lista = await this.orgsService.listarClubes(search);
    return lista
      .map((c) => ({
        id: c.id,
        name: c.name,
        city: c.city ?? null,
        afiliado: !!fed && c.parentId === fed,
      }))
      .sort(
        (a, b) =>
          Number(b.afiliado) - Number(a.afiliado) || a.name.localeCompare(b.name, 'es'),
      );
  }

  // ── GET /sync/miembros — la gente del club del maestro, para inscribirla ──
  //
  // El maestro inscribe en Campeonatos a los alumnos de su club (punto 2 de lo
  // que quedaba del plan de Campeonatos, 25 sep 2026). Hasta aquí elegía entre
  // SUS fichas de Campeonatos, y la ficha de alguien nuevo nacía sin enlace a
  // su cuenta de DINAMYT: el alumno tenía que reclamarla después. Ahora la
  // elige de la gente de su club, y la ficha nace enlazada y rellena.
  //
  // ── A quién se le contesta ──
  //
  // A `maestro` (un `sub`) solo le salen los CLUBES donde es maestro o coach
  // EN CAMPEONATOS —los mismos papeles que su pase le da allí—. Nadie más:
  // ni el dueño a secas, ni el juez, ni un alumno. Campeonatos entra con el
  // secreto, pero la regla se comprueba AQUÍ: un Campeonatos con un fallo no
  // puede sacar la gente de un club que no es de ese maestro.
  //
  // ── Qué se da, y qué no ──
  //
  // Lo que la ficha necesita y DINAMYT ya sabe: nombre, fecha de nacimiento,
  // género y documento. Ni correo ni teléfono. Los acudientes (`guardian`)
  // no salen: no compiten. `persona` acota a una sola cuenta, que es como
  // Campeonatos lo vuelve a comprobar al inscribir.
  @Get('miembros')
  async miembros(
    @Headers('x-dinamyt-sync') secreto: string | undefined,
    @Query('maestro') maestro?: string,
    @Query('persona') persona?: string,
  ) {
    SyncController.puerta(secreto, 'campeonatos');

    const quien = (maestro ?? '').trim();
    const una = (persona ?? '').trim();
    // Un id que no es un uuid revienta la consulta en PostgreSQL (un 500):
    // se para aquí con un 400.
    if (!SyncController.esUuid(quien) || (una && !SyncController.esUuid(una))) {
      throw new BadRequestException('`maestro` y `persona` son ids de DINAMYT.');
    }

    const suyas = await db
      .select({
        orgId: orgMembers.orgId,
        role: orgMembers.role,
        roleCampeonatos: orgMembers.roleCampeonatos,
        rolesCampeonatos: orgMembers.rolesCampeonatos,
        type: organizations.type,
        name: organizations.name,
      })
      .from(orgMembers)
      .innerJoin(organizations, eq(orgMembers.orgId, organizations.id))
      .where(eq(orgMembers.userId, quien));
    const clubes = suyas.filter(
      (p) =>
        p.type === 'CLUB' &&
        rolesParaApp('campeonatos', propiosDeCampeonatos(p), p.role).some(
          (r) => r === 'maestro' || r === 'coach',
        ),
    );
    if (clubes.length === 0) return [];
    const nombreDe = new Map(clubes.map((c) => [c.orgId, c.name]));

    const filas = await db
      .select({
        sub: users.id,
        fullName: users.fullName,
        birthDate: users.birthDate,
        gender: users.gender,
        documentId: users.documentId,
        isActive: users.isActive,
        orgId: orgMembers.orgId,
        role: orgMembers.role,
        membresiasActivo: orgMembers.membresiasActivo,
      })
      .from(orgMembers)
      .innerJoin(users, eq(orgMembers.userId, users.id))
      .where(
        and(
          inArray(
            orgMembers.orgId,
            clubes.map((c) => c.orgId),
          ),
          ne(orgMembers.role, 'guardian'),
          ...(una ? [eq(users.id, una)] : []),
        ),
      )
      .orderBy(asc(users.fullName))
      // Un club tiene decenas o cientos; el tope es para que ninguno pueda
      // devolver la base entera por esta puerta.
      .limit(2000);

    return filas
      .filter((f) => f.isActive !== false)
      .map((f) => ({
        sub: f.sub,
        fullName: f.fullName,
        // Fecha CIVIL: el día, sin hora ni zona (ver la cabecera del esquema).
        birthDate: f.birthDate ? f.birthDate.toISOString().slice(0, 10) : null,
        gender: f.gender ?? null,
        documentId: f.documentId ?? null,
        club: { id: f.orgId, name: nombreDe.get(f.orgId) ?? '' },
        // Membresías le cortó el acceso en ese club. No se esconde: inscribir
        // o no lo decide el maestro, pero tiene que saberlo.
        sinAcceso: f.membresiasActivo === false,
      }));
  }

  private static esUuid(valor: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor);
  }

  // ── POST /sync/aviso-campeonato — invitaron a un club a un campeonato ──────
  //
  // Campeonatos lo llama al invitar a un club del directorio (F5). El aviso
  // llega a la campana del club —y al celular de sus gestores, si tienen el
  // push— como los demás de `common/avisos-org.ts`.
  //
  // ⚠️ Solo avisa: no invita, no crea nada más ni toca pertenencias. Solo a
  // CLUBES que existen aquí. Los textos se recortan: vienen de otra app y
  // acaban en la pantalla bloqueada de un celular.
  @Post('aviso-campeonato')
  async avisoCampeonato(
    @Headers('x-dinamyt-sync') secreto: string | undefined,
    @Body() body: { orgId?: string; campeonato?: string; organiza?: string },
  ) {
    SyncController.puerta(secreto, 'campeonatos');

    const orgId = (body.orgId ?? '').trim();
    if (!SyncController.esUuid(orgId)) {
      throw new BadRequestException('`orgId` es el id de un club de DINAMYT.');
    }
    const campeonato = String(body.campeonato ?? '').trim().slice(0, 120);
    if (!campeonato) throw new BadRequestException('Falta el nombre del campeonato.');
    const organiza = String(body.organiza ?? '').trim().slice(0, 120) || null;

    const [org] = await db
      .select({ id: organizations.id, type: organizations.type })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    if (!org || org.type !== 'CLUB') {
      throw new NotFoundException('Ese club no existe en DINAMYT.');
    }

    await this.avisos?.avisar({
      orgId,
      kind: 'campeonato_invitacion',
      data: { campeonato, organiza },
    });
    return { avisado: true };
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
  // un secreto de servidor no puede tocar el rol, el correo ni la contraseña.
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
    SyncController.puerta(secreto, 'membresias', 'campeonatos');

    const id = (body.ecoSub ?? '').trim();
    if (!id) throw new BadRequestException('Falta `ecoSub`.');
    // `users.id` es `uuid`: otra cosa revienta la consulta (un 500).
    if (!SyncController.esUuid(id)) {
      throw new BadRequestException('`ecoSub` es un id de DINAMYT.');
    }

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
