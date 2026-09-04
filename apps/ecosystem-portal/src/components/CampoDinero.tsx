'use client';

import { useLayoutEffect, useRef } from 'react';
import {
  SEPARADOR_DECIMAL,
  SEPARADOR_MILES,
  SIMBOLO_MONEDA,
} from '@/lib/formato';
import { LIM } from '@/lib/validacion';

/**
 * Campo para escribir dinero: con el símbolo delante y los miles separados
 * mientras se teclea.
 *
 * ── Por qué hacía falta aquí ──
 *
 * Este panel LEE los importes bien formateados —«$ 35.000» en todas las
 * tarjetas— y los ESCRIBÍA con un `<input>` pelado donde `35000` se ve igual
 * que `350000`. En la pantalla donde se registra el dinero de los clubes, un
 * cero de más no lo nota nadie hasta que hay que devolverlo. Membresías ya
 * tenía este campo desde el principio; el portal escribía a pelo.
 *
 * ── Cómo funciona ──
 *
 * Hacia fuera el valor SIEMPRE es el crudo que entiende la API (`"35000"`,
 * `"35000.50"`, con punto decimal); lo bonito solo se dibuja. Así ninguna
 * pantalla tiene que acordarse de limpiar el número antes de enviarlo — que es
 * exactamente el `replace(/[^0-9.]/g, '')` repetido en seis sitios que esto
 * sustituye.
 */

/** Escapa un carácter para meterlo dentro de una clase de expresión regular. */
function escapar(c: string): string {
  return c.replace(/[.*+?^${}()|[\]\-]/g, '\$&');
}

/**
 * Lo que se teclea → el valor crudo para la API.
 *
 * Solo el separador DECIMAL del idioma cuenta como decimal; el de miles se
 * descarta, porque lo pone este mismo componente. En es-CO eso significa que
 * teclear un punto no hace nada (ya se ponen solos) y la coma abre los
 * centavos, que es justo lo que espera quien escribe en español.
 */
export function aCrudo(texto: string): string {
  const dec = escapar(SEPARADOR_DECIMAL);
  const limpio = texto.replace(new RegExp(`[^\d${dec}]`, 'g'), '');
  const [enteros = '', ...resto] = limpio.split(SEPARADOR_DECIMAL);
  const cabeza = enteros.slice(0, LIM.dinero);
  if (resto.length === 0) return cabeza;
  // Varios separadores decimales: los de más se ignoran en vez de partir el
  // número en pedazos.
  return `${cabeza}.${resto.join('').slice(0, 2)}`;
}

/** El valor crudo → lo que se ve en el campo. */
export function aVisible(crudo: string): string {
  if (!crudo) return '';
  const [enteros, decimales] = crudo.split('.');
  const conMiles = enteros.replace(/\B(?=(\d{3})+(?!\d))/g, SEPARADOR_MILES);
  if (decimales === undefined) return conMiles;
  return `${conMiles}${SEPARADOR_DECIMAL}${decimales}`;
}

export function CampoDinero({
  valor,
  onChange,
  placeholder,
  disabled = false,
  ariaLabel,
  className = '',
}: {
  /** Valor crudo, con punto decimal: el que viaja a la API. */
  valor: string;
  onChange: (crudo: string) => void;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  /** Dígitos que había a la izquierda del cursor en el último tecleo. */
  const digitosAntes = useRef<number | null>(null);

  const visible = aVisible(valor);

  /**
   * Devolver el cursor a su sitio.
   *
   * Al insertar un punto de miles el texto se alarga y el cursor se iría al
   * final: escribir «35000» y corregir el primer dígito era imposible. Se
   * cuenta cuántos DÍGITOS quedaban a la izquierda y se recoloca tras esos
   * mismos dígitos, ignorando los separadores.
   */
  useLayoutEffect(() => {
    const objetivo = digitosAntes.current;
    const el = inputRef.current;
    digitosAntes.current = null;
    if (objetivo === null || !el) return;

    let i = 0;
    let contados = 0;
    while (i < visible.length && contados < objetivo) {
      if (/\d/.test(visible[i])) contados++;
      i++;
    }
    el.setSelectionRange(i, i);
  }, [visible]);

  return (
    <div className={`campo-dinero ${className}`.trim()}>
      <span className="campo-dinero-simbolo" aria-hidden="true">
        {SIMBOLO_MONEDA}
      </span>
      <input
        ref={inputRef}
        // `text` y no `number`: un `number` no admite separadores de miles y
        // además trae las flechitas de subir y bajar, que en un precio sobran.
        type="text"
        inputMode="decimal"
        autoComplete="off"
        disabled={disabled}
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={visible}
        onChange={(e) => {
          const caret = e.target.selectionStart ?? e.target.value.length;
          digitosAntes.current = e.target.value
            .slice(0, caret)
            .replace(/\D/g, '').length;
          onChange(aCrudo(e.target.value));
        }}
      />
    </div>
  );
}
