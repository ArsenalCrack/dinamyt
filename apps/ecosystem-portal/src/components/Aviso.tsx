'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * El resultado de una acción, donde se pueda ver desde donde se pulsó.
 *
 * ── Por qué existe: «el botón de quitar no funciona» ──
 *
 * No estaba roto. El servidor contestaba —a veces que sí, a veces con el 409
 * de «es la única persona que manda en esta organización» (§4.7-bis)— y la
 * pantalla lo pintaba **arriba del todo**, en un párrafo debajo del título.
 * En `/mi-organizacion` y en `/admin` la lista de gente vive a dos o tres
 * pantallas de scroll de ahí: se pulsaba la ✕, se confirmaba, el diálogo se
 * cerraba… y no pasaba nada visible. La explicación estaba escrita y nadie la
 * leía nunca, porque estaba fuera de la pantalla.
 *
 * Un mensaje que aparece donde no se está mirando no es un mensaje: es una
 * pantalla que se queda callada. Y una pantalla callada después de pulsar algo
 * se lee como un botón roto — que es exactamente cómo se reportó.
 *
 * ── Las tres decisiones ──
 *
 * | | |
 * |---|---|
 * | **Va fijo, no en el flujo** | Se ve desde cualquier punto de la página. Es el único sitio que funciona igual con la lista arriba o abajo |
 * | **El error NO se va solo** | Los del servidor traen instrucciones («nombra antes a otro maestro»). Un aviso que se desvanece a los cinco segundos es un aviso que se lee a medias |
 * | **El «hecho» sí se va solo** | No lleva nada que memorizar, y dejarlo tapando la pantalla obliga a cerrarlo a mano después de cada acción |
 *
 * Va por debajo del diálogo de confirmar (`z-index` 80): si los dos coinciden,
 * el que hay que atender es la pregunta.
 */
export interface Mensaje {
  tipo: 'ok' | 'error';
  texto: string;
}

export function Aviso({
  msg,
  onCerrar,
}: {
  msg: Mensaje | null;
  onCerrar: () => void;
}) {
  const esError = msg?.tipo === 'error';

  // El «hecho» se retira solo; el error se queda hasta que lo cierren. El
  // temporizador se rearma con cada mensaje nuevo: dos acciones seguidas no
  // pueden dejar el primer contador borrando el segundo aviso.
  useEffect(() => {
    if (!msg || esError) return;
    const t = setTimeout(onCerrar, 5000);
    return () => clearTimeout(t);
  }, [msg, esError, onCerrar]);

  if (!msg || typeof document === 'undefined') return null;

  return createPortal(
    <div
      // `alert` para el error y `status` para el resto: el lector de pantalla
      // interrumpe lo que esté leyendo solo cuando algo salió mal.
      role={esError ? 'alert' : 'status'}
      aria-live={esError ? 'assertive' : 'polite'}
      style={{
        position: 'fixed',
        top: '1rem',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 70,
        maxWidth: 'min(36rem, calc(100vw - 2rem))',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.75rem',
        padding: '0.75rem 1rem',
        borderRadius: '0.75rem',
        border: `1px solid ${esError ? 'var(--danger)' : '#3ecf8e'}`,
        background: 'var(--bg-card)',
        color: esError ? 'var(--danger)' : '#3ecf8e',
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.35)',
        fontSize: '0.9rem',
        lineHeight: 1.45,
      }}
    >
      <span style={{ minWidth: 0 }}>{msg.texto}</span>
      <button
        type="button"
        onClick={onCerrar}
        aria-label="Cerrar el aviso"
        style={{
          flexShrink: 0,
          border: 'none',
          background: 'transparent',
          color: 'inherit',
          cursor: 'pointer',
          fontSize: '1rem',
          lineHeight: 1,
          padding: '0.15rem',
        }}
      >
        ✕
      </button>
    </div>,
    document.body,
  );
}
