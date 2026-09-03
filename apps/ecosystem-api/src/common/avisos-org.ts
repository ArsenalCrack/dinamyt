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

  // ── El plan del club, que hasta ahora solo se avisaba por correo ──────────
  //
  // `avisarVencimientos` manda un correo a los gestores, y eso está bien para
  // el que lo lee. Pero **el maestro vive en la campana**: es donde ve que
  // alguien quiere entrar y que alguien se fue, y es lo que mira cada mañana.
  // Su propia suscripción era lo único que no aparecía ahí — o sea que la única
  // cosa que le puede cerrar la aplicación entera era la que menos se veía.
  //
  // Es el mismo trato que Membresías le da al alumno con su mensualidad: se le
  // avisa antes de que venza, y se le dice cuando ya venció.
  //
  // ── Por qué son RESOLUBLES ──
  //
  // Porque son trabajo pendiente y dejan de ser verdad al pagar, sin que nadie
  // los marque. Un «tu plan vence en 5 días» que sigue ahí una semana después
  // de haber pagado es exactamente lo que enseña a ignorar la campana.
  /** Su plan está por vencer. Se resuelve al renovar. */
  plan_por_vencer: {
    resoluble: true,
    href: '/mi-organizacion#plan',
  },
  /** Su plan venció y la aplicación puede quedarse cerrada. */
  plan_vencido: {
    resoluble: true,
    href: '/mi-organizacion#plan',
  },
  /** Se registró un pago suyo. Noticia, no tarea: ya está hecho. */
  plan_pagado: {
    resoluble: false,
    href: '/mi-organizacion#plan',
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


/**
 * La frase que se lee en la pantalla bloqueada del celular.
 *
 * ── Por qué se escribe aquí y no en la campana ──
 *
 * Porque el mismo aviso sale por dos sitios —la campana del portal y el push—
 * y tiene que decir lo mismo en los dos. Con la frase escrita solo en el
 * componente, el push habría acabado diciendo «Novedad en tu club» para todo,
 * que es la clase de aviso que se aprende a ignorar en dos días.
 *
 * ── Las reglas de una notificación que no molesta ──
 *
 * 1. **Dice quién.** «Alguien quiere entrar a tu club» no se puede decidir sin
 *    abrir la app; «Laura Restrepo quiere entrar» sí. Un aviso que obliga a
 *    abrir la app para saber de qué va es un aviso que no ahorró nada.
 * 2. **Cabe en una línea.** En Android se corta a unos 40 caracteres visibles
 *    con la pantalla bloqueada; lo importante va delante.
 * 3. **No lleva la nota que escribió la persona.** Esa nota es de quien la
 *    escribió y aparece en pantallas del club, no en la pantalla bloqueada de
 *    un celular que puede estar sobre una mesa. En la campana sí se lee entera.
 */
export function textoDelAviso(
  kind: string,
  datos: {
    quien?: string | null;
    club?: string | null;
    /** Los avisos del plan: cuántos días faltan, y cuánto se debe. */
    dias?: number | null;
    importe?: string | null;
  },
): { title: string; body: string } {
  const quien = (datos.quien ?? '').trim() || 'Alguien';
  // El club en el título: quien lleva dos no puede tener que adivinar cuál es.
  const title = datos.club ? `DINAMYT · ${datos.club}` : 'DINAMYT';

  switch (kind as TipoAvisoOrg) {
    case 'solicitud_entrada':
      return { title, body: `${quien} quiere entrar a tu club.` };
    case 'miembro_nuevo':
      return { title, body: `${quien} entró a tu club.` };
    case 'invitacion_rechazada':
      return { title, body: `${quien} rechazó tu invitación.` };
    case 'miembro_baja':
      return { title, body: `${quien} salió de tu club.` };

    // Los del plan no dicen «quién»: el sujeto es el club, no una persona. Lo
    // que va delante es el DATO que decide si hay que hacer algo hoy —cuántos
    // días quedan— porque es lo único que se lee con la pantalla bloqueada.
    case 'plan_por_vencer': {
      const d = datos.dias ?? 0;
      const cuando =
        d <= 0 ? 'hoy' : d === 1 ? 'mañana' : `en ${d} días`;
      return {
        title,
        body: `Tu plan vence ${cuando}${datos.importe ? ` · ${datos.importe}` : ''}.`,
      };
    }
    case 'plan_vencido':
      return {
        title,
        body: 'Tu plan venció. Renuévalo para no perder el acceso.',
      };
    case 'plan_pagado':
      return {
        title,
        body: `Recibimos tu pago${datos.importe ? ` de ${datos.importe}` : ''}. Gracias.`,
      };
    default:
      // Un tipo sin frase no se manda mudo, pero tampoco se calla: se dice lo
      // único que se sabe con certeza y se deja que la campana cuente el resto.
      return { title, body: 'Hay una novedad en tu club.' };
  }
}
