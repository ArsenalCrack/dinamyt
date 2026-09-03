import { and, eq, gt, inArray } from 'drizzle-orm';
import { db } from '../db';
import { organizations, subscriptions, subscriptionPlans } from '../db/schema';
import { cadenasDeMando, MAX_SALTOS_JERARQUIA } from './jerarquia';

/**
 * Qué aplicaciones abre cada organización, HOY.
 *
 * ── Por qué existe como módulo aparte ──
 *
 * Esta cuenta vivía dentro de `AuthService.buildToken`, porque el único que la
 * necesitaba era el pase. Ahora la necesitan tres:
 *
 *   · el pase, que es donde estaba;
 *   · el aviso a Membresías de si un club puede operar (`espejarPlan`), que es
 *     lo que cierra el agujero del plan vencido — el portal filtraba por fecha
 *     y Membresías, que tiene login propio, no se enteraba;
 *   · saber qué clubes deben APARECER en cada app, que es lo que hacía que un
 *     club con plan de Membresías creado en el portal no saliera allí.
 *
 * Tenerla escrita tres veces es la forma de que las tres se separen: bastaría
 * con que una olvidara la herencia para que un club afiliado abriera Campeonatos
 * y no saliera en su listado, o al revés.
 *
 * ── La regla, que es la decisión 11 del plan maestro ──
 *
 * **La organización contrata y sus clubes heredan.** La herencia BAJA y nunca
 * sube: un club con su propio plan no se lo pasa a su federación ni a sus
 * hermanos, y lo suyo SE SUMA a lo heredado en vez de sustituirlo.
 */

/**
 * De quién cuelga cada organización, subiendo por niveles hasta la raíz.
 *
 * Se sube por niveles —una consulta por salto— y no con un `WITH RECURSIVE`
 * porque son dos o tres saltos como mucho y esto se lee sin saber SQL
 * recursivo. El tope convierte un `parent_id` en ciclo en una consulta que
 * termina, en vez de en un bucle; la otra mitad de esa defensa está en
 * `cadenasDeMando`.
 */
export async function padresDe(
  ids: string[],
): Promise<Map<string, string | null>> {
  const padreDe = new Map<string, string | null>();
  let frontera = [...new Set(ids)];

  for (let salto = 0; salto < MAX_SALTOS_JERARQUIA && frontera.length; salto++) {
    const filas = await db
      .select({ id: organizations.id, parentId: organizations.parentId })
      .from(organizations)
      .where(inArray(organizations.id, frontera));

    for (const fila of filas) padreDe.set(fila.id, fila.parentId);

    frontera = [
      ...new Set(
        filas.flatMap((f) =>
          f.parentId && !padreDe.has(f.parentId) ? [f.parentId] : [],
        ),
      ),
    ];
  }

  return padreDe;
}

/**
 * Las apps que abre cada una de `orgIds`, contando lo heredado.
 *
 * Devuelve una entrada por cada id pedido, aunque sea una lista vacía: quien
 * llama necesita distinguir «no abre nada» de «no pregunté por ella».
 */
export async function appsPorOrganizacion(
  orgIds: string[],
  ahora: Date = new Date(),
): Promise<Map<string, string[]>> {
  const propias = [...new Set(orgIds)];
  const resultado = new Map<string, string[]>(propias.map((id) => [id, []]));
  if (propias.length === 0) return resultado;

  const cadenas = cadenasDeMando(await padresDe(propias), propias);
  const conAncestros = [...new Set([...cadenas.values()].flat())];

  const filas = await db
    .select({
      orgId: subscriptions.orgId,
      appsIncluded: subscriptionPlans.appsIncluded,
    })
    .from(subscriptions)
    .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
    .where(
      and(
        inArray(subscriptions.orgId, conAncestros),
        eq(subscriptions.status, 'ACTIVE'),
        // La misma condición que el pase, y por el mismo motivo: el `status` se
        // queda en 'ACTIVE' hasta que alguien lo cambie a mano, así que lo que
        // de verdad hace que un plan caduque es la FECHA.
        gt(subscriptions.endsAt, ahora),
      ),
    );

  const abrePorOrg = new Map<string, string[]>();
  for (const fila of filas) {
    const previo = abrePorOrg.get(fila.orgId) ?? [];
    abrePorOrg.set(fila.orgId, [...previo, ...(fila.appsIncluded ?? [])]);
  }

  for (const orgId of propias) {
    const apps = (cadenas.get(orgId) ?? [orgId]).flatMap(
      (eslabon) => abrePorOrg.get(eslabon) ?? [],
    );
    resultado.set(orgId, [...new Set(apps)]);
  }

  return resultado;
}

/** ¿Esta organización abre esta app hoy? Atajo para una sola. */
export async function orgAbre(orgId: string, app: string): Promise<boolean> {
  const mapa = await appsPorOrganizacion([orgId]);
  return (mapa.get(orgId) ?? []).includes(app);
}

/**
 * Todas las organizaciones que abren una app, con su nombre.
 *
 * Es lo que contesta «qué clubes tienen Membresías», y la respuesta **no es**
 * «los que tienen una fila de suscripción»: un club afiliado a una federación
 * que paga abre la app sin tener ninguna fila propia. Preguntarlo por la tabla
 * de suscripciones es exactamente el fallo que dejaba fuera a esos clubes.
 */
export async function organizacionesQueAbren(
  app: string,
): Promise<{ id: string; name: string; type: string }[]> {
  const todas = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      type: organizations.type,
    })
    .from(organizations)
    .where(eq(organizations.isActive, true));

  const mapa = await appsPorOrganizacion(todas.map((o) => o.id));
  return todas.filter((o) => (mapa.get(o.id) ?? []).includes(app));
}
