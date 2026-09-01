/**
 * Qué le puede pasar a una organización, y qué significa cada cosa.
 *
 * ── Por qué el catálogo vive aquí y no repartido ──
 *
 * Un aviso tiene tres partes que **tienen que decidirse juntas**: qué pasó, si
 * eso es una tarea o una noticia, y a dónde lleva al que lo lea. Repartidas se
 * separan enseguida — el sitio que escribe el aviso se acuerda de la frase y se
 * olvida del enlace, y sale una campana con avisos que no llevan a ninguna
 * parte, que es la mitad de lo que se venía a arreglar.
 *
 * ── Tarea o noticia ──
 *
 * `resoluble: true` significa que ese aviso **es trabajo pendiente** y deja de
 * existir cuando el trabajo está hecho, sin que nadie tenga que marcarlo. Hoy
 * solo lo es «alguien quiere entrar»: se resuelve al responder la solicitud, la
 * responda quien la responda. Los demás son noticias —entró alguien, se fue
 * alguien— y no piden nada: se leen y quedan.
 *
 * Es la misma regla que gobierna la campana de Membresías, escrita al otro lado
 * (`vigentes` en su `routes/notifications.ts`): **un aviso que ya no es verdad
 * no se enseña**. Sin eso, la campana acumula rojos por cosas ya hechas y la
 * gente deja de mirarla — y entonces tampoco ve la que sí importaba.
 */

export const AVISOS_ORG = {
  /**
   * Alguien tecleó el código del club y está esperando respuesta.
   *
   * El único que es una tarea. Se resuelve en `responderSolicitud`.
   */
  solicitud_entrada: {
    resoluble: true,
    /** La bandeja de solicitudes, que es donde se acepta o se rechaza. */
    href: '/mi-organizacion#solicitudes',
  },
  /** Entró alguien: aceptó su invitación, o su solicitud fue aceptada. */
  miembro_nuevo: {
    resoluble: false,
    /** Su ficha: lo primero que se hace con alguien nuevo es mirar quién es. */
    href: '/mi-organizacion/miembro/{subjectUserId}',
  },
  /** Alguien dijo que no a la invitación del club. */
  invitacion_rechazada: {
    resoluble: false,
    href: '/mi-organizacion',
  },
  /** Alguien salió del club (o lo sacaron). */
  miembro_baja: {
    resoluble: false,
    href: '/mi-organizacion',
  },
} as const;

export type TipoAvisoOrg = keyof typeof AVISOS_ORG;

/** Los tipos que se resuelven solos cuando su trabajo está hecho. */
export const AVISOS_RESOLUBLES = (
  Object.keys(AVISOS_ORG) as TipoAvisoOrg[]
).filter((k) => AVISOS_ORG[k].resoluble);

/**
 * A dónde lleva un aviso, con su hueco relleno.
 *
 * El enlace se arma **en el servidor** aunque las rutas sean del portal. La
 * alternativa —un `switch` en el componente de la campana— es la que deja
 * avisos sin destino: se añade un tipo en la API, nadie toca el componente, y
 * la línea nueva sale sin enlace o con el de otro. Aquí el tipo y su destino
 * nacen y mueren en la misma tabla de arriba.
 */
export function destinoDelAviso(
  kind: string,
  datos: { subjectUserId?: string | null },
): string {
  const def = AVISOS_ORG[kind as TipoAvisoOrg];
  if (!def) return '/mi-organizacion';
  return def.href.replace('{subjectUserId}', datos.subjectUserId ?? '');
}
