import { timingSafeEqual } from 'crypto';
import type { FastifyInstance } from 'fastify';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { orgs, users, type Db } from '@dinamyt/membresias-db';
import { sinFiltroDeClub } from '../lib/db-contexto';
import { asegurarFicha } from '../lib/aprovisionar';
import { asegurarClub, fijarPlan, rellenarEscudo } from '../lib/plan-del-club';
import { syncSecret } from '../config';
import { cinturon } from '../lib/cinturones';
import { imagenGuardada } from '../lib/imagenes';
import { todayStr } from '../lib/billing';
import {
  LIMITES,
  fecha,
  fechaNacimiento,
  nombreCompleto,
  telefono,
  textoOpcional,
  tipoSangre,
  mayusculas,
  type Campo,
} from '../lib/validacion';

/**
 * El espejo: lo que el portal DINAMYT escribe y aquí se copia.
 *
 * ── Por qué hace falta ──
 *
 * Los datos de la persona —su nombre, su foto, su cinturón— se editan en el
 * portal y solo ahí (ver `lib/ecosistema.ts`). Pero quien los IMPRIME es esta
 * app: el carnet sale de `membresias.users`, no del ecosistema. Sin esta ruta,
 * el maestro subía la foto en el portal y el carnet seguía saliendo con las
 * iniciales para siempre — que es exactamente el problema que se quería cerrar,
 * solo que al revés.
 *
 * ── Por qué un aviso y no una consulta ──
 *
 * Se pensó en pedirle el perfil al portal cuando la persona entra por SSO, y no
 * sirve para el caso que importa: el maestro sube la foto y va a imprimir el
 * carnet AHORA, sin que el alumno vuelva a entrar a nada. El aviso llega en el
 * momento del guardado.
 *
 * ── Quién puede llamarla ──
 *
 * Nadie tiene sesión aquí: quien llama es el otro servidor. La puerta es
 * `ECOSYSTEM_SYNC_SECRET`, y si esa variable no está definida la ruta responde
 * 404 — una ruta sin autenticar que reescribe fichas no puede quedarse abierta
 * «por si acaso». Es el mismo trato que `POST /notifications/cron`.
 *
 * ── Por qué no falla entera ──
 *
 * Cada campo se valida por su cuenta y lo que no pasa se devuelve en
 * `rechazados` en vez de tumbar el aviso completo. Los catálogos de las dos
 * apps son el mismo hoy (los cinturones, sin ir más lejos), pero el día que uno
 * se adelante al otro es preferible que llegue la foto y se quede el grado
 * viejo, a que no llegue nada y nadie se entere. El portal registra en su log
 * lo que se rechazó.
 */

/** Un `eco_sub` / `eco_org_id` con forma de UUID; otra cosa no va a Postgres. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** El enum `rol_usuario` de la base. Un valor de fuera reventaría el INSERT. */
const ROLES = ['owner', 'staff', 'guardian', 'student'] as const;
type Rol = (typeof ROLES)[number];

/** Comparación del secreto en tiempo constante. */
function secretoValido(recibido: unknown, esperado: string): boolean {
  if (typeof recibido !== 'string') return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  // `timingSafeEqual` exige el mismo largo: la diferencia de longitud ya se
  // filtra aquí, y eso no delata nada que no delate el propio 401.
  return a.length === b.length && timingSafeEqual(a, b);
}

interface Rechazo {
  campo: string;
  motivo: string;
}

/**
 * Pasa un campo por su validador y lo apunta en `cambios` o en `rechazados`.
 * `undefined` no se toca: el aviso manda solo lo que cambió.
 */
function aplicar(
  campo: string,
  valor: unknown,
  validar: (v: never) => Campo<unknown>,
  cambios: Record<string, unknown>,
  rechazados: Rechazo[],
) {
  if (valor === undefined) return;
  const r = validar(valor as never);
  if (r.ok) cambios[campo] = r.valor;
  else rechazados.push({ campo, motivo: r.error });
}

export async function syncRoutes(app: FastifyInstance) {
  /** Puerta común de las dos rutas. `null` = ya se contestó. */
  function abrir(req: { headers: Record<string, unknown> }): 'ok' | 404 | 401 {
    const esperado = syncSecret();
    if (!esperado) return 404;
    return secretoValido(req.headers['x-dinamyt-sync'], esperado) ? 'ok' : 401;
  }

  // ── POST /sync/persona — el portal guardó una ficha ───────────────────────
  app.post('/sync/persona', async (req, reply) => {
    const puerta = abrir(req as never);
    if (puerta === 404) return reply.code(404).send({ error: 'No encontrado.' });
    if (puerta === 401) return reply.code(401).send({ error: 'Secreto inválido.' });

    const body = (req.body ?? {}) as {
      ecoSub?: string;
      fullName?: string;
      phone?: string | null;
      avatarUrl?: string | null;
      belt?: string | null;
      trainsSince?: string | null;
      birthDate?: string | null;
      bloodType?: string | null;
      emergencyName?: string | null;
      emergencyPhone?: string | null;
    };

    const ecoSub = typeof body.ecoSub === 'string' && UUID.test(body.ecoSub) ? body.ecoSub : null;
    if (!ecoSub) return reply.code(422).send({ error: 'Falta `ecoSub`.' });

    const cambios: Record<string, unknown> = {};
    const rechazados: Rechazo[] = [];

    aplicar('fullName', body.fullName, nombreCompleto, cambios, rechazados);
    aplicar('phone', body.phone, (v) => telefono(v), cambios, rechazados);
    aplicar('avatarUrl', body.avatarUrl, (v) => imagenGuardada(v, 'La foto'), cambios, rechazados);
    aplicar('belt', body.belt, (v) => cinturon(v), cambios, rechazados);
    // Sin tope por arriba en el pasado —hay maestros con alumnos de los
    // noventa— y el futuro cortado hoy: nadie empezó a entrenar mañana.
    aplicar(
      'trainsSince',
      body.trainsSince,
      (v) => fecha(v, 'La fecha de inicio', { max: todayStr() }),
      cambios,
      rechazados,
    );
    aplicar('birthDate', body.birthDate, (v) => fechaNacimiento(v), cambios, rechazados);
    aplicar('bloodType', body.bloodType, (v) => tipoSangre(v), cambios, rechazados);
    aplicar(
      'emergencyName',
      body.emergencyName,
      (v) => {
        const r = textoOpcional(v, LIMITES.nombrePersona, 'El contacto de emergencia');
        // Igual que en el alta: va impreso en el carnet junto al nombre del
        // alumno, y uno en minúsculas al lado de otro en mayúsculas canta.
        return r.ok ? { ok: true, valor: mayusculas(r.valor) } : r;
      },
      cambios,
      rechazados,
    );
    aplicar(
      'emergencyPhone',
      body.emergencyPhone,
      (v) => telefono(v, 'El teléfono de emergencia'),
      cambios,
      rechazados,
    );

    if (Object.keys(cambios).length === 0) {
      return { encontrada: false, aplicados: [], rechazados };
    }

    // Cruza clubes a propósito: quien llama es el ecosistema y no pertenece a
    // ninguno. El filtro real es `eco_sub`, que solo escribe la reconciliación.
    return sinFiltroDeClub(req.server.db, async (db: Db) => {
      const filas = await db
        .update(users)
        .set({ ...cambios, updatedAt: new Date() })
        .where(eq(users.ecoSub, ecoSub))
        .returning({ id: users.id });

      // Sin ficha aquí no es un error: esa persona pertenece a un club del
      // portal que todavía no usa Membresías. Su ficha nacerá con los datos ya
      // buenos la primera vez que entre (ver `lib/aprovisionar.ts`).
      return {
        encontrada: filas.length > 0,
        aplicados: Object.keys(cambios),
        rechazados,
      };
    });
  });

  // ── POST /sync/plan — el ecosistema dice si el club puede operar ──────────
  //
  // ── El agujero que cierra ──
  //
  // El portal filtra los `app_scopes` por `status = 'ACTIVE' AND ends_at > now()`
  // al firmar el pase, así que un plan vencido deja de abrir Membresías **desde
  // el portal**. Pero Membresías tiene login propio: quien ya tiene ficha aquí
  // entra por el formulario de siempre y no pasa por el ecosistema nunca más.
  //
  // El resultado era que el plan vencía, la tarjeta de «Entrar a Membresías»
  // desaparecía del portal, y el club seguía cobrando, pasando lista e
  // imprimiendo carnets indefinidamente. Esta ruta es la cerradura de la otra
  // puerta.
  //
  // ── Por qué lo EMPUJA el ecosistema y no lo pregunta Membresías ──
  //
  // Porque vencer es un no-evento: nadie llama a nadie cuando pasa una fecha.
  // Preguntar desde aquí obligaría a Membresías a conocer el modelo de
  // suscripciones del ecosistema y a depender de su red en cada petición — y
  // Membresías se vende sola, en el servidor de un club que no tiene ecosistema
  // ninguno. Ahí esta ruta no la llama nadie, la columna se queda en NULL, y
  // para ese club esto no existe.
  //
  // ── Idempotente a propósito ──
  //
  // El barrido del ecosistema corre a diario y vuelve a avisar de lo mismo cada
  // mañana. Bloquear dos veces no reinicia la fecha (ver `fijarPlan`), porque
  // «desde cuándo» es justo el dato que dice si el aviso se perdió por el
  // camino.
  app.post('/sync/plan', async (req, reply) => {
    const puerta = abrir(req as never);
    if (puerta === 404) return reply.code(404).send({ error: 'No encontrado.' });
    if (puerta === 401) return reply.code(401).send({ error: 'Secreto inválido.' });

    const body = (req.body ?? {}) as {
      ecoOrgId?: string;
      alDia?: boolean;
      /**
       * Datos del club, para CREARLO si aquí todavía no existe. Solo se usan
       * con `alDia: true`: un club que nunca llegó a existir no necesita nacer
       * bloqueado, necesita no nacer.
       */
      name?: string;
      city?: string | null;
      country?: string | null;
      /**
       * El escudo del club, tal y como está en el portal.
       *
       * Sirve para dos cosas y las dos son la misma queja: que el maestro pone
       * el escudo en DINAMYT y el panel de aquí sigue enseñando el logo de la
       * aplicación. Un club creado por este aviso nace CON su escudo, y a uno
       * que ya existía sin ninguno se le rellena (ver `rellenarEscudo`).
       * Cambiarlo sigue siendo cosa de `POST /sync/club`.
       */
      logoUrl?: string | null;
    };

    const ecoOrgId =
      typeof body.ecoOrgId === 'string' && UUID.test(body.ecoOrgId) ? body.ecoOrgId : null;
    if (!ecoOrgId) return reply.code(422).send({ error: 'Falta `ecoOrgId`.' });

    // El escudo pasa por el mismo validador que en `/sync/club`. Lo que no
    // pase se ignora: un escudo demasiado grande no puede impedir que un club
    // con el plan al día vuelva a operar, que es lo que este aviso vino a
    // decir. Queda escrito en el registro, que es donde se busca.
    let escudo: string | null = null;
    if (body.logoUrl !== undefined && body.logoUrl !== null) {
      const r = imagenGuardada(body.logoUrl, 'El escudo');
      if (r.ok) escudo = r.valor;
      else req.log.warn({ ecoOrgId, motivo: r.error }, 'escudo rechazado en /sync/plan');
    }

    // `alDia` tiene que venir explícito. Un valor ausente que cayera a `true`
    // desbloquearía clubes por un aviso mal formado, y a `false` los cerraría:
    // los dos silencios son peores que un 422.
    if (typeof body.alDia !== 'boolean') {
      return reply.code(422).send({ error: '`alDia` tiene que ser `true` o `false`.' });
    }

    return sinFiltroDeClub(req.server.db, async (db: Db) => {
      const [club] = await db
        .select({ id: orgs.id })
        .from(orgs)
        .where(eq(orgs.ecoOrgId, ecoOrgId))
        .limit(1);

      // ── El club que tiene plan y aquí no existe ──
      //
      // Éste era el otro agujero, y se veía todos los días: en Membresías solo
      // aparecían los clubes CREADOS en Membresías. Una organización nacida en
      // el portal y con plan contratado no llegaba nunca — todos los avisos del
      // espejo buscan por `eco_org_id`, no encontraban fila, contestaban «no
      // encontrado» y se quedaban tan tranquilos. El club estaba pagado y no
      // existía.
      if (!club && body.alDia && body.name) {
        const nuevo = await asegurarClub(db, ecoOrgId, {
          name: body.name,
          city: body.city,
          country: body.country,
          logoUrl: escudo,
        });
        if (nuevo) {
          req.log.info(
            { club: nuevo.id, ecoOrgId },
            'club creado desde el ecosistema: tiene plan de Membresías',
          );
          return { encontrado: true, aplicado: true, creado: true, bloqueado: false, desde: null };
        }
      }

      // Sin club aquí no es un error: esa organización del portal no usa
      // Membresías. Contestar 404 haría que el otro lado lo registrara como
      // aviso fallido, y no lo es.
      if (!club) return { encontrado: false, aplicado: false };

      // El club que ya estaba y nunca recibió el escudo. Son los que se
      // crearon con este mismo aviso antes de que llevara el logo: sin esto
      // habría que tocarlos uno a uno, y no hay pantalla desde donde hacerlo.
      if (await rellenarEscudo(db, club.id, escudo)) {
        req.log.info({ club: club.id, ecoOrgId }, 'escudo del club puesto desde el ecosistema');
      }

      const r = await fijarPlan(db, club.id, body.alDia as boolean);
      if (r.cambio) {
        req.log.info(
          { club: club.id, alDia: body.alDia },
          body.alDia
            ? 'plan al día: el club vuelve a operar'
            : 'plan vencido: el club queda en pausa',
        );
      }
      return { encontrado: true, aplicado: r.cambio, bloqueado: r.bloqueado, desde: r.desde };
    });
  });

  // ── POST /sync/club — el portal guardó la ficha de un club ────────────────
  app.post('/sync/club', async (req, reply) => {
    const puerta = abrir(req as never);
    if (puerta === 404) return reply.code(404).send({ error: 'No encontrado.' });
    if (puerta === 401) return reply.code(401).send({ error: 'Secreto inválido.' });

    const body = (req.body ?? {}) as {
      ecoOrgId?: string;
      name?: string;
      city?: string | null;
      logoUrl?: string | null;
    };

    const ecoOrgId =
      typeof body.ecoOrgId === 'string' && UUID.test(body.ecoOrgId) ? body.ecoOrgId : null;
    if (!ecoOrgId) return reply.code(422).send({ error: 'Falta `ecoOrgId`.' });

    const cambios: Record<string, unknown> = {};
    const rechazados: Rechazo[] = [];

    aplicar(
      'name',
      body.name,
      (v) => textoOpcional(v, LIMITES.orgNombre, 'El nombre del club'),
      cambios,
      rechazados,
    );
    aplicar('city', body.city, (v) => textoOpcional(v, LIMITES.ciudad, 'La ciudad'), cambios, rechazados);
    aplicar('logoUrl', body.logoUrl, (v) => imagenGuardada(v, 'El escudo'), cambios, rechazados);
    // Un club sin nombre no existe: mejor quedarse con el que había.
    if (cambios.name === null) delete cambios.name;

    if (Object.keys(cambios).length === 0) {
      return { encontrado: false, aplicados: [], rechazados };
    }

    return sinFiltroDeClub(req.server.db, async (db: Db) => {
      const filas = await db
        .update(orgs)
        .set({ ...cambios, updatedAt: new Date() })
        .where(eq(orgs.ecoOrgId, ecoOrgId))
        .returning({ id: orgs.id });

      return {
        encontrado: filas.length > 0,
        aplicados: Object.keys(cambios),
        rechazados,
      };
    });
  });

  // ── POST /sync/contrasena — el portal cambió una contraseña ───────────────
  //
  // **La contraseña es UNA para todo DINAMYT, y se fija en el ecosistema.**
  //
  // ── Qué se rompía sin esto ──
  //
  // La reconciliación trajo las cuentas de aquí al portal con su hash puesto,
  // así que la misma contraseña abría las dos apps. Pero solo el primer día:
  // quien la cambiaba en el portal —o la recuperaba con «¿olvidaste tu
  // contraseña?»— seguía teniendo aquí la VIEJA. Dos contraseñas para una sola
  // cuenta, y ninguna pantalla que lo dijera. El alumno solo veía que en el
  // club no entraba.
  //
  // ── Llega el hash, y se guarda tal cual ──
  //
  // No llega la contraseña en claro, y no hace falta: bcrypt lleva su propio
  // costo dentro del hash, así que `verificarPassword` acepta igual el de 12
  // rondas del ecosistema y el de 10 de aquí. Tampoco se rehashea al recibirlo
  // —eso es lo que hace `necesitaRehash` tras el primer login correcto, cuando
  // sí hay contraseña en claro con la que hacerlo.
  //
  // ── A quién NO toca ──
  //
  // Busca por `eco_sub`. Una ficha sin cuenta del ecosistema —el alumno sin
  // correo, que entra por carnet QR o PIN— no lo tiene, y su contraseña sigue
  // siendo asunto de su club: la pone y la cambia su maestro, como siempre.
  app.post('/sync/contrasena', async (req, reply) => {
    const puerta = abrir(req as never);
    if (puerta === 404) return reply.code(404).send({ error: 'No encontrado.' });
    if (puerta === 401) return reply.code(401).send({ error: 'Secreto inválido.' });

    const body = (req.body ?? {}) as { ecoSub?: string; passwordHash?: string };

    const ecoSub = typeof body.ecoSub === 'string' && UUID.test(body.ecoSub) ? body.ecoSub : null;
    if (!ecoSub) return reply.code(422).send({ error: 'Falta `ecoSub`.' });

    // Que tenga forma de bcrypt no es paranoia de más: esta columna es la que
    // decide quién entra, y un valor que no sea un hash la dejaría comparando
    // contra basura. Con `$2y$` incluido, que es lo que emite PHP y lo que
    // podría traer una importación futura.
    const hash = typeof body.passwordHash === 'string' ? body.passwordHash : '';
    if (!/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash)) {
      return reply.code(422).send({ error: '`passwordHash` no es un hash de bcrypt.' });
    }

    // Cruza clubes a propósito, igual que `/sync/persona`: quien llama es el
    // ecosistema y no pertenece a ninguno. El filtro real es `eco_sub`.
    return sinFiltroDeClub(req.server.db, async (db: Db) => {
      const filas = await db
        .update(users)
        .set({ passwordHash: hash, updatedAt: new Date() })
        .where(eq(users.ecoSub, ecoSub))
        .returning({ id: users.id });

      // Sin ficha aquí no es un error: esa persona pertenece a un club del
      // portal que todavía no usa Membresías.
      return { encontrada: filas.length > 0, aplicados: filas.length ? ['passwordHash'] : [] };
    });
  });

  // ── POST /sync/rol — el portal cambió el rol de alguien ───────────────────
  //
  // **Es el único dato de PERTENENCIA que el portal escribe aquí, y es una
  // decisión, no una excepción olvidada.**
  //
  // ── Qué se rompía sin esto ──
  //
  // Se le ponía `maestro` a alguien en el portal y aquí seguía siendo alumno
  // para siempre. El rol del pase solo se lee al CREAR la ficha
  // (`lib/aprovisionar.ts`), así que a quien ya la tenía no le llegaba nunca.
  // Quien administra el ecosistema tenía el botón y no tenía el efecto — y en
  // las pantallas de aquí no hay un sitio evidente donde corregirlo.
  //
  // ── Por qué esto NO contradice la regla del espejo ──
  //
  // La regla es que el portal **no pisa en silencio** lo que decide esta app:
  // sacar a alguien de un club allá no le borra sus pagos, su asistencia ni su
  // historial de aquí, y eso sigue igual. Lo que llega por esta ruta no es un
  // efecto secundario: alguien con permiso abrió el panel, eligió una persona
  // y le cambió el rol a propósito. Eso manda.
  //
  // ── A quién NO toca ──
  //
  // Busca por `eco_sub` y, si no lo encuentra, por CORREO sobre una ficha sin
  // enlazar —a la que ata de paso, igual que hace `POST /auth/sso`—. La ficha
  // sin correo, la del alumno que entra por carnet QR o PIN, no la alcanza por
  // ninguno de los dos caminos: su rol sigue siendo asunto de su club.
  //
  // El `is_super_admin` de esta instalación **no se toca nunca** por aquí: es
  // el que atraviesa todos los clubes y se concede a mano, mirando. Su `role`
  // sí se cambia como el de cualquiera — es lo que se imprime en el carnet.
  app.post('/sync/rol', async (req, reply) => {
    const puerta = abrir(req as never);
    if (puerta === 404) return reply.code(404).send({ error: 'No encontrado.' });
    if (puerta === 401) return reply.code(401).send({ error: 'Secreto inválido.' });

    const body = (req.body ?? {}) as { ecoSub?: string; role?: string; email?: string };

    const ecoSub = typeof body.ecoSub === 'string' && UUID.test(body.ecoSub) ? body.ecoSub : null;
    if (!ecoSub) return reply.code(422).send({ error: 'Falta `ecoSub`.' });
    const correo = (body.email ?? '').trim().toLowerCase();

    const rol = ROLES.find((r) => r === body.role) as Rol | undefined;
    if (!rol) {
      return reply
        .code(422)
        .send({ error: `\`role\` tiene que ser uno de: ${ROLES.join(', ')}.` });
    }

    // Cruza clubes a propósito, igual que las otras dos: quien llama es el
    // ecosistema y no pertenece a ninguno. El filtro real es `eco_sub`.
    return sinFiltroDeClub(req.server.db, async (db: Db) => {
      const columnas = {
        id: users.id,
        orgId: users.orgId,
        role: users.role,
        ecoSub: users.ecoSub,
      };

      let [u] = await db
        .select(columnas)
        .from(users)
        .where(eq(users.ecoSub, ecoSub))
        .limit(1);

      // ── El enlace que faltaba, y por el que esto no hacía nada ──
      //
      // Todo el espejo —la foto, el escudo, la contraseña y ahora el rol—
      // busca por `eco_sub`. Una ficha creada por su club y nunca enlazada con
      // el ecosistema **no la encuentra ninguno de los cuatro**, y como el
      // aviso contestaba 200 sin más, no había forma de enterarse: se cambiaba
      // el rol en el portal, aquí no pasaba nada, y ningún registro lo decía.
      //
      // Se enlaza igual que en `POST /auth/sso`: por el correo, que es único a
      // los dos lados, y solo sobre una ficha que **todavía no tiene enlace**
      // —el `isNull` en el WHERE, no en el `if`, para que dos avisos a la vez
      // no se pisen—. A partir de aquí esa persona queda enlazada y los otros
      // tres avisos también empiezan a llegarle.
      let enlazada = false;
      if (!u && correo) {
        const [porCorreo] = await db
          .select(columnas)
          .from(users)
          .where(and(eq(users.email, correo), isNull(users.ecoSub)))
          .limit(1);
        if (porCorreo) {
          const [atada] = await db
            .update(users)
            .set({ ecoSub, updatedAt: new Date() })
            .where(and(eq(users.id, porCorreo.id), isNull(users.ecoSub)))
            .returning(columnas);
          if (atada) {
            u = atada;
            enlazada = true;
            req.log.info(
              { usuario: atada.id, ecoSub },
              'ficha enlazada con su cuenta del ecosistema desde /sync/rol',
            );
          }
        }
      }

      // Sin ficha no es un error: esa persona pertenece a un club del portal
      // que todavía no usa Membresías.
      if (!u) return { encontrada: false, aplicado: false, enlazada };

      if (u.role === rol) {
        return { encontrada: true, aplicado: false, enlazada, motivo: 'Ya lo tenía.' };
      }

      // ── El club no se queda sin dueño ──
      //
      // Es la misma regla que el portal aplica a los suyos: al último que manda
      // no se le quita el mando, porque de `owner` cuelgan el cobro, el alta de
      // alumnos y la propia pantalla de gente. Aquí hace falta otra vez y no
      // basta con la de allá: allá se mira `org_members`, que es otra tabla, y
      // el rol de un club puede quedarse sin dueño mientras la organización del
      // portal sigue teniendo tres administradores.
      if (u.role === 'owner' && rol !== 'owner' && u.orgId) {
        const [otro] = await db
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              eq(users.orgId, u.orgId),
              eq(users.role, 'owner'),
              eq(users.isActive, true),
              ne(users.id, u.id),
            ),
          )
          .limit(1);
        if (!otro) {
          return {
            encontrada: true,
            aplicado: false,
            enlazada,
            motivo:
              'Es el único dueño de su club en Membresías: nadie podría cobrar ' +
              'ni dar de alta. Nombra otro dueño antes de bajarle el rol.',
          };
        }
      }

      await db
        .update(users)
        .set({ role: rol, updatedAt: new Date() })
        .where(eq(users.id, u.id));

      req.log.info({ usuario: u.id, de: u.role, a: rol }, 'rol cambiado desde el portal');
      return { encontrada: true, aplicado: true, enlazada, de: u.role, a: rol };
    });
  });

  // ── POST /sync/pertenencia — alguien entró o salió de su club ─────────────
  //
  // **La pertenencia al club, en los dos sentidos.**
  //
  // ── El hueco que faltaba: el ALTA ──
  //
  // La baja viajaba y el alta no, y eso se veía todos los días. El maestro
  // aceptaba a diez alumnos en el portal, entraba a Membresías y **no había
  // ninguno**: la ficha solo nacía cuando cada uno de ellos abría esta app por
  // su cuenta (`POST /auth/sso`), y casi nadie lo hace el primer día. Mientras
  // tanto el maestro no los podía cobrar, ni pasarles lista, ni saber si de
  // verdad habían entrado — la gente estaba en un sitio y no en el otro, y el
  // único remedio a mano era volver a asignarles el rol para forzar el aviso.
  //
  // Ahora entrar al club basta. `activo: true` crea la ficha (o ata la que ya
  // hubiera con ese correo, o le devuelve el acceso a quien vuelve) con las
  // mismas reglas del SSO — es literalmente la misma función, `asegurarFicha`.
  //
  // ── Qué se rompía sin esto ──
  //
  // El maestro quitaba a un alumno de su organización en el portal y aquí no
  // pasaba nada: seguía en el listado, seguía contando en el resumen del club
  // y seguía pudiendo entrar. Desde fuera se veía como que la aplicación no
  // hace caso —«lo eliminé y sigue ahí»—, y el remedio a mano (desactivarlo
  // también aquí) obligaba a hacer el mismo gesto dos veces, en dos sitios, y
  // a acordarse de los dos para siempre.
  //
  // ── Por qué DESACTIVA y no borra ──
  //
  // Porque aquí es lo que significa una baja. `DELETE /users/:id` de esta misma
  // API tampoco borra: apaga el acceso y conserva la ficha, porque de ella
  // cuelgan los pagos y las asistencias, que son la contabilidad del club y no
  // se van con la persona. Quien vuelve —y vuelven— recupera su historial
  // entero en vez de estrenar una ficha en blanco.
  //
  // Es exactamente la regla de §4.7 leída en su sentido bueno: el portal no
  // pisa en silencio lo que decide esta app, pero sacar a alguien de un club es
  // una decisión deliberada de quien tiene permiso, y ésa manda.
  //
  // ── A quién NO toca ──
  //
  // A la ficha sin `eco_sub` —el alumno sin correo, que entra por carnet QR o
  // PIN—, porque no es de nadie del portal. Y al ÚLTIMO maestro con acceso de
  // un club: sin él nadie puede cobrar ni dar de alta, y un club sin dueño no
  // se arregla desde ninguna de las dos pantallas. Se contesta con el motivo,
  // que el portal registra.
  app.post('/sync/pertenencia', async (req, reply) => {
    const puerta = abrir(req as never);
    if (puerta === 404) return reply.code(404).send({ error: 'No encontrado.' });
    if (puerta === 401) return reply.code(401).send({ error: 'Secreto inválido.' });

    const body = (req.body ?? {}) as {
      ecoSub?: string;
      ecoOrgId?: string;
      /** `true` = entró al club. Ausente = salió, que es como nació esta ruta. */
      activo?: boolean;
      /** Solo para el alta: con qué nace la ficha si no existe. */
      email?: string;
      fullName?: string;
      role?: string;
    };
    const ecoSub =
      typeof body.ecoSub === 'string' && UUID.test(body.ecoSub) ? body.ecoSub : null;
    if (!ecoSub) return reply.code(422).send({ error: 'Falta `ecoSub`.' });
    const ecoOrgId =
      typeof body.ecoOrgId === 'string' && UUID.test(body.ecoOrgId) ? body.ecoOrgId : null;
    if (!ecoOrgId) return reply.code(422).send({ error: 'Falta `ecoOrgId`.' });
    const esAlta = body.activo === true;

    /**
     * El correo del alta se exige AQUÍ, antes de mirar el club.
     *
     * No es cosmético: es lo que hace que se pueda saber, desde fuera, que esta
     * versión entiende el alta. El repaso del portal (`espejo:sembrar`) manda
     * una sonda con `activo: true` y sin correo justo para eso — la versión
     * vieja no mira `activo`, busca una ficha que no existe y contesta sin
     * motivo; ésta contesta que falta el correo.
     *
     * Esa diferencia es el cerrojo que impide correr el repaso contra un
     * servidor sin actualizar, donde el mismo aviso significaría lo contrario
     * («salió del club») y daría de baja a todo el mundo.
     *
     * Con la comprobación después del club, la respuesta dependía de si ESE
     * club tenía espejo, y un club sin espejo hacía saltar el cerrojo contra un
     * despliegue perfectamente correcto.
     */
    if (esAlta && !(body.email ?? '').trim()) {
      return { encontrada: false, aplicado: false, motivo: 'Falta el correo.' };
    }

    // Cruza clubes a propósito, como el resto del espejo: quien llama es el
    // ecosistema y no pertenece a ninguno.
    return sinFiltroDeClub(req.server.db, async (db: Db) => {
      // El club, por su espejo. Sin espejo no hay nada que hacer: esa
      // organización del portal no usa Membresías.
      const [club] = await db
        .select({ id: orgs.id })
        .from(orgs)
        .where(eq(orgs.ecoOrgId, ecoOrgId))
        .limit(1);
      if (!club) return { encontrada: false, aplicado: false, motivo: 'Club sin espejo.' };

      // ── El ALTA: entró al club ──────────────────────────────────────────
      //
      // Sin correo no hay ficha que crear ni que atar: es la clave con la que
      // se reconoce a quien ya estaba aquí. Se contesta y no se revienta, que
      // es lo que hace el resto del espejo con lo que no puede aplicar.
      if (esAlta) {
        const correo = (body.email ?? '').trim().toLowerCase();
        const r = await asegurarFicha(db, {
          ecoSub,
          clubId: club.id,
          email: correo,
          fullName: body.fullName,
          role: body.role,
        });
        req.log.info(
          { usuario: r.ficha.id, club: club.id, creada: r.creada, enlazada: r.enlazada },
          'alta desde el portal: entró al club',
        );
        return {
          encontrada: true,
          aplicado: true,
          creada: r.creada,
          enlazada: r.enlazada,
        };
      }

      // La ficha, en ESE club. El filtro por club no sobra: la misma persona
      // puede tener ficha en dos clubes distintos, y la baja es de uno.
      const [u] = await db
        .select({
          id: users.id,
          role: users.role,
          isActive: users.isActive,
          isSuperAdmin: users.isSuperAdmin,
        })
        .from(users)
        .where(and(eq(users.ecoSub, ecoSub), eq(users.orgId, club.id)))
        .limit(1);
      if (!u) return { encontrada: false, aplicado: false };

      if (u.isSuperAdmin) {
        return {
          encontrada: true,
          aplicado: false,
          motivo: 'Es el superadmin de esta instalación: su acceso no lo decide un club.',
        };
      }
      if (!u.isActive) {
        return { encontrada: true, aplicado: false, motivo: 'Ya estaba sin acceso.' };
      }

      // El club no se queda sin dueño. Misma regla que `/sync/rol`, y hace
      // falta otra vez: allá se mira `org_members`, que es otra tabla.
      if (u.role === 'owner') {
        const [otro] = await db
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              eq(users.orgId, club.id),
              eq(users.role, 'owner'),
              eq(users.isActive, true),
              ne(users.id, u.id),
            ),
          )
          .limit(1);
        if (!otro) {
          return {
            encontrada: true,
            aplicado: false,
            motivo:
              'Es el único maestro con acceso a su club en Membresías: nadie ' +
              'podría cobrar ni dar de alta. Nombra otro maestro antes de darlo de baja.',
          };
        }
      }

      await db
        .update(users)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(users.id, u.id));

      req.log.info(
        { usuario: u.id, club: club.id },
        'acceso retirado desde el portal: salió del club',
      );
      return { encontrada: true, aplicado: true };
    });
  });
}
