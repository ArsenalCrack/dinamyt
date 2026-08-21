import { and, eq } from 'drizzle-orm';
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

  const rolDelToken = payload.role_membresias as MembresiasRole | null;
  const role: MembresiasRole =
    rolDelToken && ROLES_VALIDOS.includes(rolDelToken) ? rolDelToken : 'student';

  // El nombre en MAYÚSCULAS como en todo el roster (ver la migración 0011): si
  // entrara tal cual viene del portal, el listado del maestro tendría una fila
  // escrita de otra manera y ordenaría distinto que las demás.
  const nombre = (payload.fullName ?? correo.split('@')[0])
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleUpperCase('es');

  const [ficha] = await db
    .insert(users)
    .values({
      email: correo,
      fullName: nombre,
      // Sin contraseña propia: la suya vive en el portal. Ver la migración
      // 0016, que es lo que hace posible esta línea.
      passwordHash: null,
      role,
      orgId: club.id,
      ecoSub: sub,
    })
    .returning();

  return { ficha, club };
}
