'use client';

import type { ReactNode } from 'react';

/**
 * Un campo de formulario que dice lo que le pasa, y lo dice EN EL MOMENTO.
 *
 * ── El problema que resuelve ──
 *
 * El registro no avisaba de nada mientras se escribía. Se llenaban siete campos,
 * se pulsaba «Crear cuenta», y el servidor contestaba UN error —el primero que
 * encontraba— en un texto rojo al final del formulario, lejos del campo que lo
 * causaba. Con siete campos eso son, en el peor caso, siete viajes de ida y
 * vuelta para descubrir de uno en uno lo que se podía haber dicho todo junto.
 *
 * ── Las tres reglas de cuándo se avisa ──
 *
 * 1. **Mientras se escribe por primera vez, no.** Nadie quiere que le digan
 *    «el correo está mal» cuando lleva tecleada la primera letra.
 * 2. **Al salir del campo, sí** (`tocado`). Ahí es cuando la persona ha
 *    terminado de escribir y está mirando ese sitio de la pantalla.
 * 3. **Una vez que ha fallado, en cada tecla.** Si ya se le dijo que estaba
 *    mal, el aviso tiene que desaparecer en cuanto lo arregle — si no, parece
 *    que sigue mal.
 *
 * El estado va en el BORDE y no solo en el texto: en un formulario largo, el
 * borde es lo que se ve de un vistazo. Verde solo cuando de verdad hace falta
 * confirmar algo (que el correo está libre, que las contraseñas coinciden); un
 * formulario entero en verde no informa de nada.
 */
export function Campo({
  etiqueta,
  pista,
  error,
  ok,
  info,
  children,
  htmlFor,
}: {
  etiqueta: string;
  /** A la derecha de la etiqueta: el formato, el ejemplo, «opcional». */
  pista?: ReactNode;
  /** El texto del fallo, o `null` si el campo está bien o aún no toca decirlo. */
  error?: string | null;
  /** Confirmación en verde («correo disponible»). Se ignora si hay error. */
  ok?: string | null;
  /** Aviso que no bloquea: la sugerencia de dominio, por ejemplo. */
  info?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}) {
  const estado = error ? 'error' : ok ? 'ok' : 'neutro';

  return (
    <div className="campo" data-estado={estado}>
      <label className="campo-etiqueta" htmlFor={htmlFor}>
        <span>{etiqueta}</span>
        {pista && <span className="campo-pista">{pista}</span>}
      </label>
      {children}
      {/* `aria-live`: quien usa lector de pantalla se entera del error sin
          tener que volver a recorrer el formulario buscándolo. */}
      {error ? (
        <p className="campo-aviso" data-tono="error" aria-live="polite">
          <span aria-hidden="true">✕</span>
          <span>{error}</span>
        </p>
      ) : ok ? (
        <p className="campo-aviso" data-tono="ok" aria-live="polite">
          <span aria-hidden="true">✓</span>
          <span>{ok}</span>
        </p>
      ) : info ? (
        <p className="campo-aviso" data-tono="info">
          <span>{info}</span>
        </p>
      ) : null}
    </div>
  );
}
