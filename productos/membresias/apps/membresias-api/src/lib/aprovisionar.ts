import { and, eq, isNull } from 'drizzle-orm';
import { orgs, users, type Db } from '@dinamyt/membresias-db';
import type { JwtPayload, MembresiasRole } from '../types/auth';
import { ROLES_VALIDOS } from '../types/auth';

/**
 * La ficha que nace sola cuando alguien llega del portal DINAMYT.
 *
 * ── El agujero que tapa ──
 *
 * Pertenecer a un club y tener ficha en esta app eran DOS altas, y nadie las
 * conectaba. El maestro agregaba al alumno en el portal —o el alumno entraba
 * con el código del club— y al pulsar «entrar a Membresías» se encontraba con
 * «tu cuenta todavía no está en ningún club: pídele a tu maestro que te
 * agregue». Se lo pedía al mismo maestro que ya lo había agregado, y no había
 * forma de salir de ahí sin que alguien lo diera de alta una segunda vez, a
 * mano, aquí.
 *
 * ── Por qué esto no es «dar de alta a cualquiera en silencio» ──
 *
 * Esa regla sigue en pie y es la que sostiene todo lo demás. Aquí no se cree
 * nada de lo que diga quien llama: para que nazca una ficha tienen que darse
 * las tres condiciones a la vez, y las tres las decide alguien más.
 *
 *   1. El token está firmado por el ecosistema (RS256, emisor comprobado). Eso
 *      lo garantiza `POST /auth/sso` antes de llamar aquí.
 *   2. El token trae un `org_id`, que el ecosistema solo pone cuando la persona
 *      ES miembro de esa organización — y a `org_members` se entra por
 *      invitación del maestro, por el código del club con su visto bueno, o por
 *      la reconciliación. Nunca por registrarse.
 *   3. Ese `org_id` coincide con el espejo de un club de aquí (`orgs.eco_org_id`)
 *      y ese club está activo. El espejo lo escribe la reconciliación; no hay
 *      ninguna pantalla que lo edite.
 *
 * Si falla cualquiera de las tres no pasa nada: se devuelve `null` y quien
 * llama responde lo de siempre. Un club que nunca se reconcilió con el
 * ecosistema no tiene espejo, así que por aquí no entra nadie — que es
 * exactamente el comportamiento de antes.
 *
 * ── El rol viene del ecosistema, a propósito ──
 *
 * Incluido `owner`. Quién gestiona un club es una decisión del portal, no de
 * esta app: si el maestro (o el super-admin) puso a alguien como `owner` de la
 * organización, degradarlo a alumno al cruzar la frontera sería inventarse una
 * respuesta distinta a la que ya se dio. Un rol que no esté en el catálogo cae
 * a `student`, que es el que no puede hacer daño.
 */

/** Un `sub` u `org_id` con forma de UUID; cualquier otra cosa no va a Postgres. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * El nombre en MAYÚSCULAS, como todo el roster (ver la migración 0011).
 *
 * Si entrara tal cual viene del portal, el listado del maestro tendría una fila
 * escrita de otra manera y ordenaría distinto que las demás.
 */
export function nombreDeRoster(nombre: string | null | undefined, correo: string): string {
  return (nombre || correo.split('@')[0])
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleUpperCase('es');
}

/** Un rol del catálogo, o `student`, que es el que no puede hacer daño. */
export function rolValido(rol: string | null | undefined): MembresiasRole {
  return rol && ROLES_VALIDOS.includes(rol as MembresiasRole)
    ? (rol as MembresiasRole)
    : 'student';
}

/**
 * La ficha de esta persona EN ESTE CLUB, exista ya o haya que crearla.
 *
 * ── Por qué está aparte, y por qué la usan DOS caminos ──
 *
 * Hasta ahora la ficha nacía en un solo sitio: cuando la persona abría
 * Membresías por primera vez desde el portal (`POST /auth/sso`). Eso dejaba un
 * hueco que el maestro veía todos los días — aceptaba a diez alumnos en el
 * portal, entraba a Membresías y **no había ninguno**, porque ninguno había
 * abierto la app todavía. No los podía cobrar, ni pasarles lista, ni saber si
 * de verdad habían entrado al club.
 *
 * Ahora entrar al club TAMBIÉN la crea, desde el aviso del portal
 * (`POST /sync/pertenencia`). Es la misma función, con las mismas reglas, para
 * que las dos puertas no se separen: el día que una cambie, cambian las dos.
 *
 * ── Los tres casos, y por qué son tres ──
 *
 *   1. **Ya tiene ficha enlazada aquí** → se le devuelve. Si estaba sin acceso
 *      se le devuelve el acceso: volver al club ES recuperar el acceso, y su
 *      historial entero le está esperando.
 *   2. **Tiene ficha con su correo pero SIN enlazar** → se ata. Es la del
 *      alumno que su maestro creó a mano aquí antes de que existiera el puente.
 *      Crear otra sería partir a una persona en dos, con sus pagos en una mitad.
 *   3. **No tiene ninguna** → nace, sin contraseña propia: la suya vive en el
 *      portal (ver la migración 0016, que es lo que hace posible esa línea).
 */
export async function asegurarFicha(
  db: Db,
  datos: {
    ecoSub: string;
    clubId: string;
    email: string;
    fullName?: string | null;
    role?: string | null;
  },
): Promise<{ ficha: typeof users.$inferSelect; creada: boolean; enlazada: boolean }> {
  const correo = datos.email.trim().toLowerCase();
  const role = rolValido(datos.role);

  // 1 · La suya, ya enlazada y en este club.
  const [mia] = await db
    .select()
    .from(users)
    .where(and(eq(users.ecoSub, datos.ecoSub), eq(users.orgId, datos.clubId)))
    .limit(1);
  if (mia) {
    // Volver al club devuelve el acceso. No se toca el ROL: aquí lo puede haber
    // cambiado el maestro después, y pisarlo con el del portal en cada aviso
    // convertiría este puente en una máquina de degradar gente en silencio.
    if (!mia.isActive) {
      const [viva] = await db
        .update(users)
        .set({ isActive: true, updatedAt: new Date() })
        .where(eq(users.id, mia.id))
        .returning();
      return { ficha: viva, creada: false, enlazada: false };
    }
    return { ficha: mia, creada: false, enlazada: false };
  }

  // 2 · La que ya existía con su correo y nunca se ató a una cuenta del portal.
  //     El `isNull` va en el WHERE y no en un `if`, para que dos avisos a la vez
  //     no se pisen — mismo criterio que `/sync/rol`.
  const [suelta] = await db
    .update(users)
    .set({ ecoSub: datos.ecoSub, isActive: true, orgId: datos.clubId, updatedAt: new Date() })
    .where(and(eq(users.email, correo), isNull(users.ecoSub)))
    .returning();
  if (suelta) return { ficha: suelta, creada: false, enlazada: true };

  // 3 · No hay ninguna: nace.
  const [nueva] = await db
    .insert(users)
    .values({
      email: correo,
      fullName: nombreDeRoster(datos.fullName, correo),
      passwordHash: null,
      role,
      orgId: datos.clubId,
      ecoSub: datos.ecoSub,
    })
    .returning();
  return { ficha: nueva, creada: true, enlazada: false };
}

export interface FichaAprovisionada {
  ficha: typeof users.$inferSelect;
  club: { id: string; name: string };
}

/**
 * Crea la ficha de quien llega con un token del ecosistema y todavía no la
 * tiene. Devuelve `null` —sin tocar nada— si no se cumplen las condiciones.
 *
 * Se llama DENTRO de `sinFiltroDeClub`: averiguar a qué club pertenece quien
 * llama es precisamente lo que se está haciendo, así que todavía no hay
 * contexto con el que filtrar.
 */
export async function aprovisionarFicha(
  db: Db,
  payload: JwtPayload,
): Promise<FichaAprovisionada | null> {
  const sub = typeof payload.sub === 'string' && UUID.test(payload.sub) ? payload.sub : null;
  const ecoOrgId =
    typeof payload.org_id === 'string' && UUID.test(payload.org_id) ? payload.org_id : null;
  const correo = (payload.email ?? '').trim().toLowerCase();
  if (!sub || !ecoOrgId || !correo) return null;

  const [club] = await db
    .select({ id: orgs.id, name: orgs.name })
    .from(orgs)
    .where(and(eq(orgs.ecoOrgId, ecoOrgId), eq(orgs.isActive, true)))
    .limit(1);
  if (!club) return null;

  // La misma función que usa el aviso del portal: si las dos puertas no
  // comparten las reglas, se separan a la primera que alguien cambie una.
  const { ficha } = await asegurarFicha(db, {
    ecoSub: sub,
    clubId: club.id,
    email: correo,
    fullName: payload.fullName,
    role: payload.role_membresias,
  });

  return { ficha, club };
}
