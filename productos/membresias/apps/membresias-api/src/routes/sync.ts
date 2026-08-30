import { timingSafeEqual } from 'crypto';
import type { FastifyInstance } from 'fastify';
import { and, eq, ne } from 'drizzle-orm';
import { orgs, users, type Db } from '@dinamyt/membresias-db';
import { sinFiltroDeClub } from '../lib/db-contexto';
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
  // Busca por `eco_sub`. La ficha sin cuenta del ecosistema —el alumno sin
  // correo, que entra por carnet QR o PIN— no lo tiene, y su rol sigue siendo
  // asunto de su club.
  app.post('/sync/rol', async (req, reply) => {
    const puerta = abrir(req as never);
    if (puerta === 404) return reply.code(404).send({ error: 'No encontrado.' });
    if (puerta === 401) return reply.code(401).send({ error: 'Secreto inválido.' });

    const body = (req.body ?? {}) as { ecoSub?: string; role?: string };

    const ecoSub = typeof body.ecoSub === 'string' && UUID.test(body.ecoSub) ? body.ecoSub : null;
    if (!ecoSub) return reply.code(422).send({ error: 'Falta `ecoSub`.' });

    const rol = ROLES.find((r) => r === body.role) as Rol | undefined;
    if (!rol) {
      return reply
        .code(422)
        .send({ error: `\`role\` tiene que ser uno de: ${ROLES.join(', ')}.` });
    }

    // Cruza clubes a propósito, igual que las otras dos: quien llama es el
    // ecosistema y no pertenece a ninguno. El filtro real es `eco_sub`.
    return sinFiltroDeClub(req.server.db, async (db: Db) => {
      const [u] = await db
        .select({
          id: users.id,
          orgId: users.orgId,
          role: users.role,
          isSuperAdmin: users.isSuperAdmin,
        })
        .from(users)
        .where(eq(users.ecoSub, ecoSub))
        .limit(1);

      // Sin ficha no es un error: esa persona pertenece a un club del portal
      // que todavía no usa Membresías.
      if (!u) return { encontrada: false, aplicado: false };

      // El superadmin de esta instalación no cambia de rol desde fuera. Su
      // cuenta atraviesa todos los clubes y no cuelga de ninguna organización
      // del portal: quien la toque, que la toque aquí y mirando.
      if (u.isSuperAdmin) {
        return {
          encontrada: true,
          aplicado: false,
          motivo: 'Es el superadmin de Membresías: su rol no se cambia desde el portal.',
        };
      }

      if (u.role === rol) return { encontrada: true, aplicado: false, motivo: 'Ya lo tenía.' };

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
      return { encontrada: true, aplicado: true, de: u.role, a: rol };
    });
  });
}
