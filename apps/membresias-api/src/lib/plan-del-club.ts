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
 * Ata un club que YA existe aquí con su organización del portal.
 *
 * ── El agujero que cierra, y por qué es el que mas se ve ──
 *
 * Todos los avisos del espejo —la foto, el cinturon, el rol, la baja, el
 * escudo— buscan por `orgs.eco_org_id`. Un club creado en Membresias ANTES de
 * que existiera el ecosistema no tiene ese campo, y la reconciliacion de agosto
 * ato las CUENTAS (`users.eco_sub`) pero no los CLUBES. Resultado: ese club
 * queda sordo para siempre y ninguna pantalla lo dice — el maestro sube el
 * escudo en el portal, aqui no llega, y el registro solo guarda un
 * «no encontro a quien copiarle esto».
 *
 * Sin esto, el unico arreglo era crear el club otra vez desde el portal, y
 * entonces hay DOS clubes con el mismo nombre: el que tiene los pagos y el que
 * recibe los avisos. Peor que el problema.
 *
 * ── Por que por NOMBRE, y por que es seguro ──
 *
 * Porque no hay otra cosa en comun: son dos bases distintas y este club nacio
 * sin ninguna referencia al portal. Se compara el nombre normalizado (el mismo
 * `aSlug` que genera las direcciones), y se exige que **haya exactamente uno**
 * sin enlazar con ese nombre. Con dos candidatos no se elige: se deja sin atar
 * y se registra, porque atar el equivocado le daria los datos de un club a otro.
 *
 * Y solo lo llama `/sync/plan`, que es el aviso que dice «esta organizacion
 * tiene plan de Membresias»: esa es la autoridad para enlazar. `/sync/club`
 * —que copia el escudo— no ata nada; una vez atado aqui, ya funciona solo.
 */
export async function adoptarClub(
  db: Db,
  ecoOrgId: string,
  nombre: string,
): Promise<{ id: string; nombre: string } | null> {
  const buscado = aSlug((nombre ?? '').trim());
  if (!buscado) return null;

  const sueltos = await db
    .select({ id: orgs.id, name: orgs.name, slug: orgs.slug })
    .from(orgs)
    .where(isNull(orgs.ecoOrgId));

  const candidatos = sueltos.filter(
    (o) => o.slug === buscado || aSlug(o.name) === buscado,
  );
  if (candidatos.length !== 1) return null;

  const [atado] = await db
    .update(orgs)
    .set({ ecoOrgId, updatedAt: new Date() })
    .where(and(eq(orgs.id, candidatos[0].id), isNull(orgs.ecoOrgId)))
    .returning({ id: orgs.id, name: orgs.name });

  return atado ? { id: atado.id, nombre: atado.name } : null;
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
  datos: {
    name: string;
    city?: string | null;
    country?: string | null;
    /**
     * El escudo, ya validado por quien llama.
     *
     * ── Por qué nace CON él y no llega después ──
     *
     * Porque después no llegaba nunca. El escudo lo copia `POST /sync/club`,
     * que el portal dispara al GUARDAR la ficha del club; si el club se funda
     * con su escudo puesto y nadie vuelve a abrir esa pantalla, aquí no entra
     * jamás. Y como esta app esconde su propio botón de escudo cuando el club
     * es del ecosistema (ver `lib/ecosistema.ts`), el maestro tampoco podía
     * ponerlo desde este lado: el panel se quedaba con el logo de la
     * aplicación para siempre.
     */
    logoUrl?: string | null;
  },
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
      logoUrl: datos.logoUrl ?? null,
      ecoOrgId,
      isActive: true,
    })
    .returning({ id: orgs.id });

  return creado ? { id: creado.id, creado: true } : null;
}

/**
 * Le pone al club el escudo que dice el portal, si aquí todavía no tiene uno.
 *
 * ── Por qué solo si NO tiene ──
 *
 * Porque este aviso llega **todos los días** con el barrido de planes, y no es
 * el aviso de «cambió el escudo» —ése es `POST /sync/club`, que sí pisa—. Si
 * pisara también aquí, un club que llegó desde Membresías con su escudo y luego
 * se enlazó con el ecosistema perdería el suyo cada madrugada en cuanto la
 * ficha del portal estuviera vacía o fuera distinta.
 *
 * Lo que esto arregla es otro caso, y es el que se ve: el club que nació aquí
 * SIN escudo porque el alta no lo llevaba. Rellenar un hueco no es pisar nada.
 *
 * Devuelve `true` si escribió, que es lo único que merece una línea en el log:
 * un barrido que no cambia nada es ruido.
 */
export async function rellenarEscudo(
  db: Db,
  orgId: string,
  logoUrl: string | null,
): Promise<boolean> {
  if (!logoUrl) return false;
  const tocadas = await db
    .update(orgs)
    .set({ logoUrl, updatedAt: new Date() })
    .where(and(eq(orgs.id, orgId), isNull(orgs.logoUrl)))
    .returning({ id: orgs.id });
  return tocadas.length > 0;
}
