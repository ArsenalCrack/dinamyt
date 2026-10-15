/**
 * A quién se eliminó del club hace menos de lo que dura un pase.
 *
 * ── El hueco que cierra ──
 *
 * Eliminar deja la fila sin `eco_sub` (o la borra), así que el canje del SSO
 * (`POST /auth/sso`) ya no la encuentra y llama a `aprovisionarFicha`, que se
 * fía del club que trae el pase. El pase del ecosistema dura 30 minutos y esta
 * app no pregunta si se revocó: quien tuviera una pestaña abierta con uno de
 * antes de la baja volvía a nacer en el club, con una ficha nueva y activa,
 * mientras en el portal ya no era miembro.
 *
 * La baja de siempre no tenía este problema porque conserva `eco_sub` y la
 * ficha inactiva responde 403.
 *
 * ── Por qué en memoria ──
 *
 * Solo hace falta mientras viva un pase emitido antes de la baja, y la API es
 * un solo proceso. Si se reinicia dentro de esa media hora, la marca se pierde
 * y queda ese hueco, que es estrecho: un pase viejo, de esa persona, en esa
 * media hora.
 */

const VIDA_DEL_PASE_MS = 35 * 60 * 1000;
const recientes = new Map<string, number>();

/** `*` = la cuenta entera se borró (`/sync/supresion`): ningún club la recupera. */
const clave = (ecoSub: string, ecoOrgId: string | '*') => `${ecoSub}|${ecoOrgId}`;

function olvidarLosViejos(ahora: number) {
  for (const [k, cuando] of recientes) {
    if (ahora - cuando > VIDA_DEL_PASE_MS) recientes.delete(k);
  }
}

export function recordarEliminado(ecoSub: string, ecoOrgId: string | '*'): void {
  const ahora = Date.now();
  olvidarLosViejos(ahora);
  recientes.set(clave(ecoSub, ecoOrgId), ahora);
}

/** ¿Este pase se emitió antes de que a esta persona la sacaran de este club? */
export function paseDeAntesDeLaBaja(
  ecoSub: string,
  ecoOrgId: string,
  emitidoEnSegundos: number | undefined,
): boolean {
  olvidarLosViejos(Date.now());
  // La más reciente de las dos: una baja vieja de este club no puede tapar el
  // borrado de la cuenta, que llegó después.
  const marcas = [recientes.get(clave(ecoSub, ecoOrgId)), recientes.get(clave(ecoSub, '*'))];
  const cuando = Math.max(...marcas.map((m) => m ?? -Infinity));
  if (cuando === -Infinity) return false;
  // Sin `iat` no se puede saber: se trata como viejo.
  return emitidoEnSegundos === undefined || emitidoEnSegundos * 1000 <= cuando;
}

/** Solo para las pruebas. */
export function olvidarEliminadosRecientes(): void {
  recientes.clear();
}
