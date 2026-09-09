/**
 * Qué pantallas del portal son PÚBLICAS, y por tanto no llevan barra.
 *
 * ── Por qué esto vive en un solo sitio ──────────────────────────────────────
 *
 * Porque dos componentes toman la misma decisión con signos opuestos y tienen
 * que coincidir siempre:
 *
 *   · `BarraPortal` se pinta donde HAY sesión y navegación.
 *   · `ControlesApariencia` —el globo 🌐 de tema e idioma— se pinta justo donde
 *     NO la hay, porque ahí no existe el menú desde el que cambiarlos.
 *
 * Cuando cada uno llevaba su propia lista, cualquier pantalla que se le
 * escapara a los dos se quedaba sin ninguna forma de cambiar el modo — y eso es
 * exactamente lo que se reportó: «el globo no aparece en muchas páginas, solo
 * en algunas». Con una sola lista, la regla es total por construcción: o barra,
 * o globo, nunca ninguno.
 *
 * ── Y por qué se listan las PÚBLICAS y no las privadas ──────────────────────
 *
 * Porque una pantalla nueva del área con sesión nace queriendo la barra. Si a
 * alguien se le olvida apuntarla, lo peor que pasa es que la tenga; al revés,
 * una pantalla pública nueva saldría con una barra que no puede rellenar.
 */
const PUBLICAS = [
  '/',
  '/login',
  '/registro',
  '/recuperar',
  '/verificar',
  '/poner-contrasena',
  '/salir',
  '/planes',
  '/privacidad',
] as const;

/** ¿Esta ruta se ve sin haber entrado? */
export function esPublica(pathname: string): boolean {
  return PUBLICAS.some((r) => pathname === r);
}

/**
 * ¿Esta pantalla lleva la barra del portal?
 *
 * Hace falta ADEMÁS que haya sesión, y eso lo comprueba `BarraPortal`: una ruta
 * privada abierta sin pase enseña su propio aviso y se va al login, y mientras
 * tanto una barra vacía sería peor que ninguna.
 */
export function tieneBarra(pathname: string): boolean {
  return !esPublica(pathname);
}
