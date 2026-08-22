'use client';

import { useEffect, useRef } from 'react';
import { CODIGO_DIGITOS } from '@/lib/validacion';

/**
 * El código del correo, en casillas.
 *
 * ── Por qué seis casillas y no un `<input>` ──
 *
 * Un campo de texto vacío que se llama «Código» no dice **cuántos dígitos son
 * ni de qué son**. Antes había que explicarlo con una frase encima que nadie
 * lee, y aun así se tecleaban espacios, guiones o el código con la palabra
 * «código» delante. Seis casillas dicen las dos cosas sin una sola palabra: la
 * forma ES la instrucción.
 *
 * ── Lo que hace por dentro, y por qué ──
 *
 * · **Solo dígitos.** `inputMode="numeric"` abre el teclado numérico del
 *   celular; el filtro impide lo demás, porque en escritorio no hay tal
 *   teclado.
 * · **Pegar funciona.** Es lo que hace todo el mundo: copiar el código del
 *   correo y pegarlo. Sin esto, pegar seis dígitos en una casilla de uno
 *   dejaría solo el primero. Se reparte por casillas y se lee el `autocomplete`
 *   del sistema (`one-time-code`), que en iOS y Android ofrece el código del
 *   SMS o del correo encima del teclado.
 * · **Borrar retrocede.** Si la casilla está vacía, `Backspace` salta a la
 *   anterior y la borra: sin eso hay que ir tocando casilla por casilla.
 * · **Se envía solo al completar.** Cuando entra el sexto dígito ya no hay nada
 *   más que decidir; pedir además que se pulse un botón es un paso de más.
 */
export function CampoCodigo({
  valor,
  onChange,
  onCompleto,
  error = false,
  autoFocus = false,
  disabled = false,
}: {
  /** El código completo, como texto de hasta seis dígitos. */
  valor: string;
  onChange: (v: string) => void;
  /** Se llama con el código cuando entra el último dígito. */
  onCompleto?: (v: string) => void;
  error?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  const casillas = useRef<(HTMLInputElement | null)[]>([]);
  const digitos = valor.padEnd(CODIGO_DIGITOS, ' ').slice(0, CODIGO_DIGITOS).split('');

  useEffect(() => {
    if (autoFocus) casillas.current[0]?.focus();
  }, [autoFocus]);

  function poner(indice: number, texto: string) {
    const limpio = texto.replace(/\D/g, '');
    if (!limpio) return;

    // Se escribe desde la casilla tocada hacia adelante: así, pegar el código
    // entero en cualquiera de ellas lo reparte igual que teclearlo.
    const actual = valor.padEnd(CODIGO_DIGITOS, ' ').split('');
    for (let i = 0; i < limpio.length && indice + i < CODIGO_DIGITOS; i++) {
      actual[indice + i] = limpio[i];
    }
    const nuevo = actual.join('').replace(/\s+$/, '');
    onChange(nuevo);

    const siguiente = Math.min(indice + limpio.length, CODIGO_DIGITOS - 1);
    casillas.current[siguiente]?.focus();

    if (nuevo.replace(/\D/g, '').length === CODIGO_DIGITOS) {
      onCompleto?.(nuevo);
    }
  }

  function alTeclear(indice: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const actual = valor.padEnd(CODIGO_DIGITOS, ' ').split('');
      if (actual[indice] !== ' ' && actual[indice] !== undefined) {
        actual[indice] = ' ';
        onChange(actual.join('').replace(/\s+$/, ''));
        return;
      }
      if (indice > 0) {
        actual[indice - 1] = ' ';
        onChange(actual.join('').replace(/\s+$/, ''));
        casillas.current[indice - 1]?.focus();
      }
      return;
    }
    if (e.key === 'ArrowLeft' && indice > 0) {
      e.preventDefault();
      casillas.current[indice - 1]?.focus();
    }
    if (e.key === 'ArrowRight' && indice < CODIGO_DIGITOS - 1) {
      e.preventDefault();
      casillas.current[indice + 1]?.focus();
    }
  }

  return (
    <div className="codigo" data-error={error}>
      {digitos.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            casillas.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          // Solo la primera lo anuncia: repetirlo en las seis hace que algunos
          // gestores de contraseñas ofrezcan el código seis veces.
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={CODIGO_DIGITOS}
          disabled={disabled}
          value={d.trim()}
          data-lleno={d.trim() !== ''}
          aria-label={`Dígito ${i + 1} de ${CODIGO_DIGITOS}`}
          onChange={(e) => poner(i, e.target.value)}
          onKeyDown={(e) => alTeclear(i, e)}
          onPaste={(e) => {
            e.preventDefault();
            poner(0, e.clipboardData.getData('text'));
          }}
          onFocus={(e) => e.currentTarget.select()}
        />
      ))}
    </div>
  );
}
