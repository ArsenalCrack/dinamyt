'use client';

import { useI18n } from '@/lib/i18n';

/**
 * Cuánto le queda a un campo antes de llenarse.
 *
 * Los campos ya traían `maxLength`, así que el tope se respetaba; el problema
 * era que se respetaba EN SILENCIO. Quien escribe un nombre largo ve que el
 * teclado deja de responder y no sabe si se colgó la página. Con esto aparece
 * el número cuando la cosa se pone cerca, y un aviso cuando ya no cabe más.
 *
 * Solo se enseña a partir del 75 %: un contador permanente en cada campo es
 * ruido en un formulario que se rellena en veinte segundos.
 */
export function Contador({ valor, max }: { valor: string; max: number }) {
  const { t } = useI18n();
  if (valor.length < max * 0.75) return null;

  const lleno = valor.length >= max;
  return (
    <span
      className="mono"
      style={{
        display: 'block',
        marginTop: '0.15rem',
        fontSize: '0.68rem',
        color: lleno ? 'var(--gold)' : 'var(--text-muted)',
      }}
      // Al llenarse SÍ se anuncia: quien navega con lector de pantalla no ve
      // que el teclado dejó de escribir.
      aria-live={lleno ? 'polite' : 'off'}
    >
      {valor.length}/{max}
      {lleno ? ` · ${t('comun.tope')}` : ''}
    </span>
  );
}
