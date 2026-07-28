'use client';

import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import {
  SEPARADOR_DECIMAL,
  SEPARADOR_MILES,
  SIMBOLO_MONEDA,
} from '@/lib/formato';
import { LIM } from '@/lib/campos';

/**
 * Campo para escribir dinero: con el símbolo delante y los miles separados
 * mientras se teclea.
 *
 * Antes era un `<input>` pelado donde `35000` se veía igual que `350000`, y
 * pasarse un cero en el precio de un plan no lo notaba nadie hasta cobrarlo.
 *
 * Cómo funciona: hacia fuera el valor SIEMPRE es el crudo que entiende la API
 * (`"35000"`, `"35000.50"`, con punto decimal); lo bonito solo se dibuja. Así
 * ninguna pantalla tiene que acordarse de limpiar el número antes de enviarlo.
 *
 * El símbolo y los separadores salen del idioma configurado (ver
 * `NEXT_PUBLIC_MONEDA` y `NEXT_PUBLIC_LOCALE_MONEDA`), no de constantes
 * escritas a mano: en Colombia se ve `$ 35.000` y en Estados Unidos `$35,000`
 * sin tocar una línea de esto.
 */

/** Escapa un carácter para meterlo dentro de una clase de expresión regular. */
function escapar(c: string): string {
  return c.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
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
  const limpio = texto.replace(new RegExp(`[^\\d${dec}]`, 'g'), '');
  const [enteros = '', ...resto] = limpio.split(SEPARADOR_DECIMAL);
  const cabeza = enteros.slice(0, LIM.precioEnteros);
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
  id,
  required = false,
  disabled = false,
  ariaLabel,
  style,
}: {
  /** Valor crudo, con punto decimal: el que viaja a la API. */
  valor: string;
  onChange: (crudo: string) => void;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  style?: CSSProperties;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  /** Dígitos que había a la izquierda del cursor en el último tecleo. */
  const digitosAntes = useRef<number | null>(null);

  const visible = aVisible(valor);

  /**
   * Devolver el cursor a su sitio.
   *
   * Al insertar un punto de miles, el texto se alarga y el cursor se iría al
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
    <div className="campo-dinero" style={style}>
      <span className="campo-dinero-simbolo" aria-hidden="true">
        {SIMBOLO_MONEDA}
      </span>
      <input
        ref={inputRef}
        id={id}
        // `text` y no `number`: un `number` no admite separadores de miles y
        // además trae las flechitas de subir y bajar, que en un precio sobran.
        type="text"
        inputMode="decimal"
        autoComplete="off"
        required={required}
        disabled={disabled}
        aria-label={ariaLabel}
        value={visible}
        onChange={(e) => {
          const caret = e.target.selectionStart ?? e.target.value.length;
          digitosAntes.current = e.target.value.slice(0, caret).replace(/\D/g, '').length;
          onChange(aCrudo(e.target.value));
        }}
      />
    </div>
  );
}
