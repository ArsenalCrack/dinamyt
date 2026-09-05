/**
 * La versión que se le enseña a la gente.
 *
 * ── Por qué CalVer y no SemVer ──
 *
 * DINAMYT no publica «versiones»: se despliega cuando algo está listo, a veces
 * varias veces al día, y no hay contrato de API pública que romper — las cuatro
 * webs y las tres APIs se despliegan juntas desde el mismo git. En ese mundo
 * SemVer no dice nada: nadie va a decidir «subo a la 2.0», y un `1.4.7` no
 * responde la única pregunta que se hace de verdad delante de un problema:
 *
 *     «¿esto que estoy viendo es de antes o de después del arreglo?»
 *
 * Una fecha sí la responde. Por eso la versión es **el día del despliegue**:
 *
 *     2026.09.05
 *
 * ── Y por qué además el commit ──
 *
 * Porque en un día puede haber tres despliegues, y entonces la fecha sola vuelve
 * a no distinguir. El hash corto lo cierra:
 *
 *     2026.09.05+8cacddf
 *
 * La fecha es para la persona («¿está al día mi app?») y el hash para quien
 * depura («¿exactamente qué código está corriendo?»). En pantalla se enseña la
 * fecha; el hash va en el `title` y en la etiqueta larga.
 *
 * ── Qué cuenta como «una actualización» ──
 *
 * Cualquier despliegue. No hay una lista de cambios que merezcan número y otros
 * que no: si el código que corre cambió, la versión cambia, porque el propósito
 * de este dato no es celebrar novedades — es poder decir qué está corriendo. Un
 * arreglo de una línea que nadie nota vale igual, y precisamente ese es el que
 * más falta hace identificar cuando alguien escribe «me sigue pasando».
 */

/** Lo que se guarda en el build. `AAAA.MM.DD+hash`, o solo la fecha. */
export interface Version {
  /** `2026.09.05` — lo que se enseña. */
  fecha: string;
  /** `8cacddf` — el commit exacto, o `null` si el build no lo supo. */
  commit: string | null;
  /** `2026.09.05+8cacddf` — para el `title` y los informes de fallo. */
  completa: string;
}

/**
 * Lee la versión de las variables que inyecta el build.
 *
 * `NEXT_PUBLIC_*` viven DENTRO del compilado (§1.3), que es justo lo que hace
 * falta: la versión tiene que ser la del código que se está ejecutando, no la
 * del servidor en el momento de preguntar.
 *
 * Sin ellas devuelve `dev`, que es lo correcto en local: ahí el código cambia
 * cada vez que se guarda un archivo y una versión fija mentiría.
 */
export function versionDeLaApp(env?: {
  fecha?: string;
  commit?: string;
}): Version {
  const fecha = (env?.fecha ?? '').trim();
  const commit = (env?.commit ?? '').trim();

  if (!fecha) {
    return { fecha: 'dev', commit: commit || null, completa: 'dev' };
  }
  return {
    fecha,
    commit: commit || null,
    completa: commit ? `${fecha}+${commit}` : fecha,
  };
}
