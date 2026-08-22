'use client';

import { useState } from 'react';

/**
 * Campo de contraseña con el «ojo» para verla.
 *
 * ── Por qué este componente y no el emoji que había ──
 *
 * El portal dibujaba 👁 / 🙈. Membresías y Campeonatos dibujan este SVG. Tres
 * apps del mismo ecosistema con tres ojos distintos es justo lo que delata que
 * son tres productos (ver `OPERAR.md`, §4.8). El emoji además se pinta
 * distinto —o no se pinta— según el sistema, y en Android sale de color.
 *
 * ── Por qué un botón propio y no el del navegador ──
 *
 * Solo Edge dibuja un ojo por su cuenta (`::-ms-reveal`), y únicamente en
 * escritorio: en Chrome, Firefox, Safari y en cualquier navegador de celular NO
 * existe. Quien entra desde el móvil escribía a ciegas.
 *
 * El de Edge se oculta en `globals.css`: sin eso, ese navegador enseñaría DOS
 * ojos, el suyo y el nuestro, uno encima del otro.
 *
 * Acepta las mismas props que un `<input>` para poder sustituir uno sin tocar
 * nada de alrededor.
 */

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  /**
   * Arranca visible. Para las contraseñas que se FIJAN (registro, poner
   * contraseña), donde el punto es poder releer lo que se está escribiendo; en
   * las que se COMPRUEBAN arranca oculta, como debe ser.
   */
  verInicial?: boolean;
};

export function CampoContrasena({
  verInicial = false,
  className = '',
  ...props
}: Props) {
  const [ver, setVer] = useState(verInicial);
  const etiqueta = ver ? 'Ocultar contraseña' : 'Ver contraseña';

  return (
    <span className="campo-pass">
      <input
        {...props}
        type={ver ? 'text' : 'password'}
        className={`w-full ${className}`.trim()}
      />
      <button
        type="button"
        className="campo-pass-ojo"
        // `tabIndex={-1}`: quien recorre el formulario con Tab espera pasar del
        // campo al botón de entrar, no a un interruptor de visibilidad.
        tabIndex={-1}
        aria-label={etiqueta}
        aria-pressed={ver}
        title={etiqueta}
        onClick={() => setVer((v) => !v)}
      >
        {/* El MISMO dibujo que Membresías y Campeonatos. */}
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path
            d="M1.5 12S5 5.5 12 5.5 22.5 12 22.5 12 19 18.5 12 18.5 1.5 12 1.5 12Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle
            cx="12"
            cy="12"
            r="3.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
          />
          {ver && (
            <path
              d="M4 20 20 4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          )}
        </svg>
      </button>

      <style>{`
        .campo-pass {
          position: relative;
          display: block;
          width: 100%;
        }
        /* \`block\` y no el inline-block por defecto del <input>: si no, el
           envoltorio se lleva la línea base de texto de propina (unos píxeles
           por debajo) y el ojo, centrado sobre él, queda descuadrado. */
        .campo-pass > input {
          display: block;
          width: 100%;
          padding-right: 2.6rem;
        }
        .campo-pass-ojo {
          position: absolute;
          top: 50%;
          right: 0.25rem;
          transform: translateY(-50%);
          width: 2.1rem;
          height: 2.1rem;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          background: transparent;
          border: none;
          border-radius: 0.4rem;
          color: var(--text-muted);
          cursor: pointer;
          transition: color 0.15s ease, background 0.15s ease;
        }
        .campo-pass-ojo:hover,
        .campo-pass-ojo:focus-visible {
          color: var(--gold);
          background: var(--gold-soft);
          outline: none;
        }
        .campo-pass-ojo[aria-pressed="true"] { color: var(--gold); }
      `}</style>
    </span>
  );
}
