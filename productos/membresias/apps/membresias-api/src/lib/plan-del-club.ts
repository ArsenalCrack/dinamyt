import { and, eq, isNull } from 'drizzle-orm';
import { orgs, type Db } from '@dinamyt/membresias-db';

/**
 * El plan del club, tal y como lo cuenta el ecosistema.
 *
 * ── El agujero que tapa ──
 *
 * El portal DINAMYT calcula bien los `app_scopes` —los filtra por
 * `status = 'ACTIVE' AND ends_at > now()` al firmar el pase—, pero eso solo
 * gobierna a quien entra POR EL PORTAL. Membresías tiene login propio: una vez
 * que alguien tiene ficha aquí, entra por el formulario de siempre y no vuelve
 * a pasar por el ecosistema nunca.
 *
 * Así que el plan vencía, el portal dejaba de ofrecer la tarjeta de «Entrar a
 * Membresías», y el club seguía cobrando, pasando lista e imprimiendo carnets
 * con normalidad. El candado estaba en una puerta y la otra no tenía cerradura.
 *
 * ── Dónde se APLICA, que no es aquí ──
 *
 * En `plugins/auth.ts`, dentro de `requireAuth`, junto al cerrojo de club
 * inactivo que ya existía: es el único punto por el que pasan todas las rutas
 * autenticadas, y ya consultaba la fila del club. Este módulo solo lo ESCRIBE.
 *
 * ── Por qué no se reutilizó `is_active` ──
 *
 * Porque son dos cosas que se veían igual: aquel es «el superadmin apagó este
 * club» —una decisión que solo él deshace— y esto es «su plan venció», un hecho
 * con fecha que se deshace solo en cuanto alguien pague. Juntarlos haría que
 * una renovación resucitara un club apagado a propósito.
 */

export interface EstadoPlan {
  /** `true` si este club no puede operar por su plan. */
  bloqueado: boolean;
  /** ISO-8601 de cuándo empezó el bloqueo, o `null`. */
  desde: string | null;
}

/**
 * Escribe lo que dice el ecosistema sobre el plan de un club.
 *
 * Devuelve el estado resultante y si CAMBIÓ algo, que es lo que el otro lado
 * registra: un aviso que no cambia nada es ruido, y uno que sí cambia algo es
 * lo único que hay que mirar cuando un club se queja.
 */
export async function fijarPlan(
  db: Db,
  orgId: string,
  alDia: boolean,
): Promise<EstadoPlan & { cambio: boolean }> {
  if (alDia) {
    // Se lee antes para poder decir si esto DESBLOQUEÓ algo o si el club ya
    // estaba al día. Los dos casos escriben lo mismo; solo uno es noticia.
    const [antes] = await db
      .select({ desde: orgs.planBloqueadoDesde })
      .from(orgs)
      .where(eq(orgs.id, orgId))
      .limit(1);

    const tocadas = await db
      .update(orgs)
      .set({ planBloqueadoDesde: null, updatedAt: new Date() })
      .where(eq(orgs.id, orgId))
      .returning({ id: orgs.id });

    return {
      bloqueado: false,
      desde: null,
      cambio: tocadas.length > 0 && Boolean(antes?.desde),
    };
  }

  // ── Bloquear dos veces no reinicia el reloj ──
  //
  // `desde` es cuándo empezó ESTA vez. El barrido del ecosistema corre a diario
  // y vuelve a avisar de lo mismo cada mañana; sin el `IS NULL` en el WHERE, la
  // fecha se pisaría cada día y la pantalla diría «desde hoy» de algo que lleva
  // tres semanas — que es justo el dato que hace falta para saber si el aviso
  // se perdió por el camino.
  const desde = new Date();
  const tocadas = await db
    .update(orgs)
    .set({ planBloqueadoDesde: desde, updatedAt: new Date() })
    .where(and(eq(orgs.id, orgId), isNull(orgs.planBloqueadoDesde)))
    .returning({ desde: orgs.planBloqueadoDesde });

  if (tocadas.length > 0) {
    return { bloqueado: true, desde: desde.toISOString(), cambio: true };
  }

  // No se tocó ninguna: o ya estaba bloqueado, o el club no existe aquí.
  const [club] = await db
    .select({ desde: orgs.planBloqueadoDesde })
    .from(orgs)
    .where(eq(orgs.id, orgId))
    .limit(1);
  return {
    bloqueado: Boolean(club?.desde),
    desde: club?.desde ? new Date(club.desde).toISOString() : null,
    cambio: false,
  };
}

/** Convierte un nombre de club en un slug usable en URLs. */
function aSlug(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * Crea aquí el club que el ecosistema dice que tiene plan de Membresías.
 *
 * ── El agujero que cierra ──
 *
 * En Membresías solo aparecían los clubes **creados en Membresías**. Una
 * organización nacida en el portal DINAMYT y con plan de Membresías contratado
 * no llegaba nunca: `/sync/persona`, `/sync/club` y los demás avisos buscan por
 * `eco_org_id`, y sin fila que encontrar todos contestaban «no encontrado» y se
 * quedaban tan tranquilos. El club estaba pagado y no existía.
 *
 * El apaño a mano era crearlo aquí con el mismo nombre — y entonces había DOS
 * clubes que se llamaban igual y no eran el mismo, porque el creado a mano nace
 * sin `eco_org_id` y sigue sin recibir nada.
 *
 * ── Por qué cuelga de `/sync/plan` y no de `/sync/club` ──
 *
 * Porque el hecho que lo justifica es «esta organización tiene plan de
 * Membresías», y ése es exactamente el que manda `/sync/plan`. `/sync/club`
 * copia el NOMBRE y el ESCUDO de un club que ya existe, y hacer que además lo
 * cree convertiría un cambio de escudo en un alta.
 *
 * ── Lo que NO hace ──
 *
 * No crea nada cuando el plan está vencido: un club que nunca llegó a existir
 * aquí no necesita nacer bloqueado, necesita no nacer. Y no le inventa maestro:
 * la gente llega por `/sync/pertenencia`, que es su puerta.
 */
export async function asegurarClub(
  db: Db,
  ecoOrgId: string,
  datos: { name: string; city?: string | null; country?: string | null },
): Promise<{ id: string; creado: boolean } | null> {
  const [ya] = await db
    .select({ id: orgs.id })
    .from(orgs)
    .where(eq(orgs.ecoOrgId, ecoOrgId))
    .limit(1);
  if (ya) return { id: ya.id, creado: false };

  const nombre = (datos.name ?? '').trim();
  if (!nombre) return null;

  // El slug es único. Dos clubes que se llamen «Dinamyt» en dos ciudades son
  // un caso normal, así que si choca se le pega un sufijo del `eco_org_id` en
  // vez de fallar: un alta que se cae por un nombre repetido deja al club
  // pagado y sin existir, que es justo lo que esto vino a arreglar.
  const base = aSlug(nombre) || 'club';
  let slug = base;
  const [chocado] = await db
    .select({ id: orgs.id })
    .from(orgs)
    .where(eq(orgs.slug, slug))
    .limit(1);
  if (chocado) slug = `${base.slice(0, 51)}-${ecoOrgId.slice(0, 8)}`;

  const [creado] = await db
    .insert(orgs)
    .values({
      name: nombre.slice(0, 120),
      slug,
      city: datos.city?.trim()?.slice(0, 80) || null,
      country: datos.country?.trim()?.slice(0, 80) || null,
      ecoOrgId,
      isActive: true,
    })
    .returning({ id: orgs.id });

  return creado ? { id: creado.id, creado: true } : null;
}
