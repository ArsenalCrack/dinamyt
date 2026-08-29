/**
 * Los dos buzones del ecosistema. Son DOS a propósito, y no da igual cuál se
 * enseña:
 *
 * · `soporte@` — quien tiene un problema con su cuenta: no puede entrar, no le
 *   llega el código, quiere que le borren los datos. Es el que va en el pie,
 *   visible también en login y registro: quien no puede entrar es justamente
 *   quien no tiene ningún menú donde buscar ayuda.
 * · `admin@` — el contacto administrativo: planes, la cotización de un
 *   campeonato, facturación, reclamos de habeas data.
 *
 * Viven aquí y no sueltos en cada pantalla porque la dirección repartida por
 * tres archivos convierte cambiarla en una búsqueda —y ya lo estaba: `planes`
 * la leía de una variable y `privacidad` la tenía escrita a mano—.
 *
 * ⚠️ Las dos son `NEXT_PUBLIC_*`: viven dentro del build. Cambiarlas en el
 * servidor y solo reiniciar NO hace nada (OPERAR.md §1.3).
 */

export const CORREO_SOPORTE =
  process.env.NEXT_PUBLIC_SUPPORT_CONTACT_EMAIL || 'soporte@dinamyt.org';

export const CORREO_ADMIN =
  process.env.NEXT_PUBLIC_ADMIN_CONTACT_EMAIL || 'admin@dinamyt.org';
