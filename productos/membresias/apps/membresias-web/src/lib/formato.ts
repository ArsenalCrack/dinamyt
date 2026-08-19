'use client';

import type { ClaveTexto, Idioma } from './i18n';

/** Clase del badge según el estado de la membresía. */
export function claseEstado(estado: string): string {
  if (estado === 'vencido') return 'badge badge-danger';
  if (estado === 'por_vencer') return 'badge badge-gold';
  if (estado === 'al_dia') return 'badge badge-ok';
  return 'badge';
}

/** Clave i18n del estado. Los valores vienen tal cual de la API. */
export function claveEstado(estado: string): ClaveTexto {
  switch (estado) {
    case 'al_dia':
      return 'estado.al_dia';
    case 'por_vencer':
      return 'estado.por_vencer';
    case 'vencido':
      return 'estado.vencido';
    default:
      return 'estado.sin_plan';
  }
}

/**
 * Moneda del club.
 *
 * `NEXT_PUBLIC_MONEDA` es el código ISO-4217 (COP, USD, EUR, MXN…) y decide el
 * SÍMBOLO. `NEXT_PUBLIC_LOCALE_MONEDA` decide la ORTOGRAFÍA del número: dónde
 * va el símbolo y qué separa los miles de los decimales — `$ 35.000` en
 * Colombia, `$35,000` en Estados Unidos, `35.000 €` en España.
 *
 * Se leen al CONSTRUIR, no al arrancar: llevan el prefijo `NEXT_PUBLIC_`, así
 * que Next las mete dentro del bundle. Cambiarlas en Vercel no surte efecto
 * hasta el siguiente despliegue.
 *
 * El precio se guarda como texto decimal en la BD para no perder centavos; esto
 * es solo la capa de presentación.
 */
export const MONEDA = process.env.NEXT_PUBLIC_MONEDA || 'COP';
export const LOCALE_MONEDA = process.env.NEXT_PUBLIC_LOCALE_MONEDA || 'es-CO';

const formatoMoneda = new Intl.NumberFormat(LOCALE_MONEDA, {
  style: 'currency',
  currency: MONEDA,
  maximumFractionDigits: 0,
});

export function fmtMoneda(valor: number | string): string {
  const n = typeof valor === 'string' ? parseFloat(valor) : valor;
  if (!isFinite(n)) return '—';
  return formatoMoneda.format(n);
}

/**
 * Las piezas sueltas de la moneda, sacadas del MISMO formateador que pinta los
 * importes: el símbolo y los dos separadores.
 *
 * Se sacan de `Intl` y no de una tabla propia porque cualquier tabla se queda
 * corta: hay monedas con el símbolo detrás, con espacio duro en medio y con
 * separadores que no son ni punto ni coma. Esto lo usa el campo de dinero para
 * que ESCRIBIR un precio se vea igual que leerlo.
 */
function piezaDe(tipo: Intl.NumberFormatPartTypes, muestra: number): string | null {
  return formatoMoneda.formatToParts(muestra).find((p) => p.type === tipo)?.value ?? null;
}

export const SIMBOLO_MONEDA = piezaDe('currency', 0) ?? '$';
/** Separador de miles: `.` en es-CO, `,` en en-US. */
export const SEPARADOR_MILES = piezaDe('group', 1_000_000) ?? '.';
/**
 * Separador decimal: `,` en es-CO, `.` en en-US.
 *
 * El formateador de arriba no lo enseña (los importes se pintan sin decimales),
 * así que se pregunta aparte por el mismo idioma.
 */
export const SEPARADOR_DECIMAL =
  new Intl.NumberFormat(LOCALE_MONEDA)
    .formatToParts(1.5)
    .find((p) => p.type === 'decimal')?.value ?? ',';

/**
 * Hoy en formato ISO corto (YYYY-MM-DD), en hora LOCAL.
 *
 * Nunca `new Date().toISOString()`: eso da el día en UTC, y en husos negativos
 * como el de Colombia (UTC−5) a partir de las siete de la tarde ya es el día
 * siguiente. Con eso, la lista de la clase salía vacía en pleno horario de
 * entrenamiento y el carnet se imprimía fechado mañana.
 *
 * Vive aquí y no repetida en cada pantalla porque estaba repetida en tres, y la
 * cuarta copia —la del carnet— era justo la que usaba UTC.
 */
export function hoyISO(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** Fecha ISO (YYYY-MM-DD) en el formato del idioma activo. */
export function fmtFecha(iso: string | null | undefined, idioma: Idioma): string {
  if (!iso) return '—';
  // Se parte la cadena en vez de usar new Date(iso): interpretarla como UTC
  // corre la fecha un día hacia atrás en husos negativos como el de Colombia.
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!a || !m || !d) return iso;
  return new Date(a, m - 1, d).toLocaleDateString(idioma === 'en' ? 'en-GB' : 'es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** Fecha y hora de un timestamp completo. */
export function fmtFechaHora(valor: string | null | undefined, idioma: Idioma): string {
  if (!valor) return '—';
  const d = new Date(valor);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString(idioma === 'en' ? 'en-GB' : 'es-CO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
