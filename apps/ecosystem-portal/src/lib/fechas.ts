/**
 * Fechas y horas, escritas para quien las lee.
 *
 * ── La distinción que este módulo existe para sostener ─────────────────────
 *
 * Hay dos cosas que parecen la misma y no lo son, y confundirlas es lo que
 * hacía que una suscripción que vence «el 31» se pintara como «el 30»:
 *
 *   · Una **fecha civil** es un día del calendario: un vencimiento, un
 *     cumpleaños. **No tiene zona horaria.** El 31 de agosto es el 31 de
 *     agosto en Bogotá, en Madrid y en Tokio. Convertirla no la traduce: la
 *     estropea.
 *
 *   · Un **instante** es un punto en el tiempo: cuándo se registró un pago,
 *     cuándo entró alguien. Sí tiene zona, y va pintado en la de quien LEE.
 *
 * El error que había: `new Date('2026-08-31').toLocaleDateString()` da la
 * medianoche **UTC**, que en Bogotá es el 30 a las siete de la tarde. Se
 * pintaba el 30. Nadie tocó nada y la fecha cambió sola. `fechaCivil` fija
 * `timeZone: 'UTC'` siempre, así que la fecha se pinta tal cual está escrita.
 *
 * ── Por qué esto es una copia y no un import ──
 *
 * La versión de referencia vive en `packages/shared/src/fechas.ts`, que es lo
 * que usan las dos APIs. Este paquete se compila a CommonJS y las apps de Next
 * no lo consumen hoy; añadir la dependencia ataría el arranque del portal al
 * orden de compilación del monorepo a cambio de cincuenta líneas. Se copia lo
 * que hace falta —solo el formato— y se anota de dónde viene. Es la misma
 * decisión que ya está tomada en `common/ciclo.ts` del ecosystem, y por el
 * mismo motivo.
 */

/** Cómo se escriben las cosas si el navegador no dice otra cosa. */
const IDIOMA = 'es-CO';

/**
 * El idioma de quien mira.
 *
 * En el servidor —el primer render de Next— no hay `navigator`, así que se cae
 * al de casa. Da igual: lo que se pinta en ese render se vuelve a pintar en el
 * navegador, y ahí ya es el bueno.
 */
function idioma(): string {
  if (typeof navigator === 'undefined') return IDIOMA;
  return navigator.language || IDIOMA;
}

/**
 * Una FECHA CIVIL, pintada tal cual está escrita.
 *
 * `timeZone: 'UTC'` no es un detalle de implementación: es lo que impide que
 * el reloj de quien mira mueva un vencimiento un día arriba o abajo.
 */
export function fechaCivil(
  valor: string | Date | null | undefined,
  opciones: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  const iso = comoIso(valor);
  if (!iso) return '—';
  const [a, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat(idioma(), {
    ...opciones,
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(a, m - 1, d)));
}

/**
 * Un INSTANTE, pintado en la zona de quien mira.
 *
 * No se pasa `timeZone`: sin él, `Intl` usa la del dispositivo, que es la
 * correcta por definición — la persona está donde está. Aquí no hace falta
 * guardar ni preguntar nada; eso solo lo necesita el servidor, que escribe
 * correos cuando nadie está delante.
 */
export function instante(
  valor: string | Date | null | undefined,
  opciones: Intl.DateTimeFormatOptions = {
    dateStyle: 'medium',
    timeStyle: 'short',
  },
): string {
  if (!valor) return '—';
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(idioma(), opciones).format(d);
}

/**
 * «hace 3 minutos», «ayer».
 *
 * Para las listas donde lo que importa es cuánto hace, no la hora exacta — la
 * de dispositivos conectados, sin ir más lejos: nadie lee una marca de tiempo
 * para saber cuál es el computador que dejó abierto esta mañana.
 */
export function haceCuanto(
  valor: string | Date | null | undefined,
  ahora: Date = new Date(),
): string {
  if (!valor) return '—';
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return '—';
  const rtf = new Intl.RelativeTimeFormat(idioma(), { numeric: 'auto' });
  const tramos: [Intl.RelativeTimeFormatUnit, number][] = [
    ['second', 60],
    ['minute', 60],
    ['hour', 24],
    ['day', 7],
    ['week', 4.35],
    ['month', 12],
  ];
  let cantidad = (ahora.getTime() - d.getTime()) / 1000;
  for (const [unidad, corte] of tramos) {
    if (Math.abs(cantidad) < corte) {
      return rtf.format(-Math.round(cantidad), unidad);
    }
    cantidad = cantidad / corte;
  }
  return rtf.format(-Math.round(cantidad), 'year');
}

/**
 * Lo que venga, como 'YYYY-MM-DD', **sin convertir nada**.
 *
 * Un `Date` que salió de una columna `timestamp` usada como fecha civil guarda
 * el día que se escribió, y ese día se lee en UTC. Leerlo con el reloj local
 * es exactamente lo que corre las fechas un día.
 */
function comoIso(valor: string | Date | null | undefined): string | null {
  if (!valor) return null;
  if (typeof valor === 'string') {
    const limpio = valor.trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(limpio) ? limpio : null;
  }
  return Number.isNaN(valor.getTime()) ? null : valor.toISOString().slice(0, 10);
}

/** La zona del dispositivo (`America/Bogota`), o `null`. */
export function zonaDelNavegador(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/**
 * «América/Bogotá (UTC−5)» — la zona escrita para que se reconozca.
 *
 * El identificador IANA a secas no le dice nada a casi nadie; el desfase sí,
 * porque es lo que la gente comprueba («¿me van a escribir a mi hora?»).
 */
export function nombreDeZona(zona: string | null | undefined): string {
  if (!zona) return 'Sin definir';
  try {
    const partes = new Intl.DateTimeFormat(idioma(), {
      timeZone: zona,
      timeZoneName: 'shortOffset',
    }).formatToParts(new Date());
    const desfase = partes.find((p) => p.type === 'timeZoneName')?.value;
    const legible = zona.split('/').pop()?.replace(/_/g, ' ') ?? zona;
    return desfase ? `${legible} (${desfase})` : legible;
  } catch {
    return zona;
  }
}
