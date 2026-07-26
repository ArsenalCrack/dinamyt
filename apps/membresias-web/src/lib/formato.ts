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
 * Moneda del club. El precio se guarda como texto decimal en la BD para no
 * perder centavos; aquí solo se formatea para leerlo.
 */
const MONEDA = process.env.NEXT_PUBLIC_MONEDA || 'COP';
const LOCALE_MONEDA = process.env.NEXT_PUBLIC_LOCALE_MONEDA || 'es-CO';

export function fmtMoneda(valor: number | string): string {
  const n = typeof valor === 'string' ? parseFloat(valor) : valor;
  if (!isFinite(n)) return '—';
  return n.toLocaleString(LOCALE_MONEDA, {
    style: 'currency',
    currency: MONEDA,
    maximumFractionDigits: 0,
  });
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
