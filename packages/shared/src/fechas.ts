/**
 * Fechas y horas del ecosistema DINAMYT.
 *
 * ── La distinción que este módulo existe para sostener ─────────────────────
 *
 * Hay dos cosas que parecen la misma y no lo son, y confundirlas es lo que
 * hacía que una suscripción que vence «el 31» se pintara como «el 30»:
 *
 *   · Una **fecha civil** es un día del calendario: un vencimiento, un
 *     cumpleaños, el día de un examen. **No tiene zona horaria.** El 31 de
 *     agosto es el 31 de agosto en Bogotá, en Madrid y en Tokio. Convertirla
 *     no la traduce: la estropea.
 *
 *   · Un **instante** es un punto en el tiempo: cuándo entró alguien, cuándo
 *     se registró un pago. Sí tiene zona, y hay que pintarlo en la de quien
 *     LEE, porque «las 3 de la tarde» significa cosas distintas según dónde
 *     esté esa persona.
 *
 * El error clásico —el que ya estaba en el código— es tratar una fecha civil
 * como un instante: `new Date('2026-08-31')` da la medianoche **UTC**, que en
 * Bogotá es el 30 a las 7 de la tarde. Se pinta el 30. Nadie tocó nada y la
 * fecha cambió sola. Por eso `fechaCivil` nunca convierte y `instante` siempre
 * pide la zona a la que convertir.
 *
 * Este módulo no depende de nada: corre igual en el navegador y en el
 * servidor, y las dos APIs y los dos frontales lo usan para no volver a tener
 * cuatro respuestas distintas a la misma pregunta.
 */

/** La zona de la casa. Se usa cuando no se sabe la de nadie. */
export const ZONA_POR_DEFECTO = 'America/Bogota';

/** Cómo se escriben las cosas cuando no se sabe de dónde es quien lee. */
export const IDIOMA_POR_DEFECTO = 'es-CO';

// ── Fechas civiles ─────────────────────────────────────────────────────────

/** Una fecha civil: `'YYYY-MM-DD'`, sin hora y sin zona. */
export type FechaCivil = string;

/**
 * Saca la fecha civil de lo que sea que venga de la base o del cuerpo de una
 * petición, **sin convertir nada**.
 *
 * Un `Date` que salió de una columna `timestamp` guarda el instante que se
 * escribió; si esa columna se está usando para una fecha civil, el día bueno
 * es el que se ve en UTC, que es como se escribió. Leerlo en la zona local del
 * servidor es exactamente lo que corre las fechas un día.
 */
export function comoFechaCivil(
  valor: Date | string | null | undefined,
): FechaCivil | null {
  if (!valor) return null;
  if (typeof valor === 'string') {
    const limpio = valor.trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(limpio) ? limpio : null;
  }
  if (Number.isNaN(valor.getTime())) return null;
  return valor.toISOString().slice(0, 10);
}

/**
 * Convierte una fecha civil en el `Date` que hay que guardar en una columna
 * `timestamp`.
 *
 * **Mediodía UTC, y no medianoche, a propósito.** Medianoche UTC se lee como
 * el día anterior en toda América, y las 23:59:59 se leen como el día
 * siguiente en Europa y Asia; las dos se usaban en el código, en rutas
 * distintas, y por eso la misma fecha salía distinta según por dónde hubiera
 * entrado. El mediodía es el único punto que cae dentro del mismo día civil en
 * todas las zonas habitadas (de UTC−12 a UTC+14), así que lea quien lea la
 * columna, y con la zona que sea, el día es el mismo.
 */
export function fechaCivilAInstante(fecha: FechaCivil): Date {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d, 12, 0, 0));
}

/**
 * Escribe una fecha civil para que la lea una persona.
 *
 * Fija `timeZone: 'UTC'` **siempre**, y ahí está todo el asunto: la fecha se
 * pinta tal cual está escrita, sin que el reloj de nadie la mueva.
 */
export function formatearFechaCivil(
  valor: Date | string | null | undefined,
  opciones: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
  idioma: string = IDIOMA_POR_DEFECTO,
): string {
  const fecha = comoFechaCivil(valor);
  if (!fecha) return '—';
  const [a, m, d] = fecha.split('-').map(Number);
  return new Intl.DateTimeFormat(idioma, { ...opciones, timeZone: 'UTC' }).format(
    new Date(Date.UTC(a, m - 1, d)),
  );
}

/** Hoy, como fecha civil, en la zona que se le diga. */
export function hoyEn(
  zona: string = ZONA_POR_DEFECTO,
  ahora: Date = new Date(),
): FechaCivil {
  // `en-CA` da 'YYYY-MM-DD' ya ordenado; es la forma más corta de preguntarle
  // a Intl «¿qué día es en ese sitio?» sin hacer aritmética de husos a mano.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zonaValida(zona) ? zona : ZONA_POR_DEFECTO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora);
}

// ── Instantes ──────────────────────────────────────────────────────────────

/**
 * Escribe un instante en la zona de quien lo lee.
 *
 * En el navegador la zona se puede omitir: el propio navegador pone la del
 * dispositivo, que es la correcta por definición. En el servidor **no se
 * puede**, y por eso el parámetro existe: un correo de vencimiento no se
 * escribe donde se lee, así que hay que decirle explícitamente a qué hora
 * pertenece la persona que lo va a abrir.
 */
export function formatearInstante(
  valor: Date | string | null | undefined,
  zona?: string | null,
  opciones: Intl.DateTimeFormatOptions = {
    dateStyle: 'medium',
    timeStyle: 'short',
  },
  idioma: string = IDIOMA_POR_DEFECTO,
): string {
  if (!valor) return '—';
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return '—';
  const tz = zona && zonaValida(zona) ? zona : undefined;
  return new Intl.DateTimeFormat(idioma, {
    ...opciones,
    ...(tz ? { timeZone: tz } : {}),
  }).format(d);
}

/**
 * «hace 5 minutos», «ayer», «el 3 de marzo».
 *
 * Para las listas donde lo que importa es cuánto hace, no la hora exacta —la
 * de dispositivos conectados, sin ir más lejos: nadie quiere leer una marca de
 * tiempo para saber cuál es el computador que dejó abierto esta mañana.
 */
export function haceCuanto(
  valor: Date | string | null | undefined,
  ahora: Date = new Date(),
  idioma: string = IDIOMA_POR_DEFECTO,
): string {
  if (!valor) return '—';
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return '—';
  const seg = Math.round((ahora.getTime() - d.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(idioma, { numeric: 'auto' });
  const tramos: [Intl.RelativeTimeFormatUnit, number][] = [
    ['second', 60],
    ['minute', 60],
    ['hour', 24],
    ['day', 7],
    ['week', 4.35],
    ['month', 12],
  ];
  let cantidad = seg;
  for (const [unidad, corte] of tramos) {
    if (Math.abs(cantidad) < corte) return rtf.format(-Math.round(cantidad), unidad);
    cantidad = cantidad / corte;
  }
  return rtf.format(-Math.round(cantidad), 'year');
}

// ── Zonas ──────────────────────────────────────────────────────────────────

/**
 * ¿Existe esta zona en este entorno?
 *
 * Se comprueba en vez de confiar porque el nombre llega del navegador de otra
 * persona, y un `timeZone` que Node no conoce no da un valor raro: lanza. Una
 * zona inventada en la cabecera de una petición no puede tumbar el envío de un
 * correo.
 */
export function zonaValida(zona: string | null | undefined): boolean {
  if (!zona || typeof zona !== 'string' || zona.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: zona });
    return true;
  } catch {
    return false;
  }
}

/** La zona del dispositivo. En el servidor devuelve `null`. */
export function zonaDelNavegador(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** El idioma del navegador (`navigator.language`). En el servidor, `null`. */
export function idiomaDelNavegador(): string | null {
  if (typeof navigator === 'undefined') return null;
  const l = navigator.language;
  return l && l.length <= 10 ? l : null;
}
