'use client';

import { useState } from 'react';
import { useI18n } from '@/lib/i18n';

/**
 * Campo de contraseña con el «ojo» para verla.
 *
 * ── Por qué un botón propio y no el del navegador ──
 *
 * Solo Edge dibuja un ojo por su cuenta (`::-ms-reveal`), y únicamente en
 * escritorio: en Chrome, Firefox, Safari y en cualquier navegador de celular NO
 * existe. El alumno que entra desde el móvil escribía a ciegas y no tenía forma
 * de comprobar lo que tecleó — solo de fallar y volver a empezar.
 *
 * El de Edge se oculta en `globals.css`: sin eso, ese navegador enseñaría DOS
 * ojos, el suyo y el nuestro, uno encima del otro.
 *
 * Acepta las mismas props que un `<input>` para poder sustituir uno sin tocar
 * nada de alrededor.
 */

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  /**
   * Arranca visible. Para las contraseñas que se FIJAN —el superadmin nombrando
   * a un maestro— donde el punto es poder leer en voz alta lo que se está
   * poniendo; en las que se COMPRUEBAN arranca oculta, como debe ser.
   */
  verInicial?: boolean;
};

export function CampoContrasena({ verInicial = false, style, ...props }: Props) {
  const { t } = useI18n();
  const [ver, setVer] = useState(verInicial);

  // Los márgenes que traiga quien lo use van al envoltorio, no al campo: el ojo
  // se centra respecto al envoltorio, y un `marginBottom` dentro lo dejaría
  // flotando por encima del campo. El resto del estilo sí es del input.
  const {
    margin,
    marginTop,
    marginBottom,
    marginLeft,
    marginRight,
    marginBlock,
    marginBlockStart,
    marginBlockEnd,
    marginInline,
    marginInlineStart,
    marginInlineEnd,
    ...estiloCampo
  } = style ?? {};

  return (
    <span
      className="campo-pass"
      style={{
        margin,
        marginTop,
        marginBottom,
        marginLeft,
        marginRight,
        marginBlock,
        marginBlockStart,
        marginBlockEnd,
        marginInline,
        marginInlineStart,
        marginInlineEnd,
      }}
    >
      <input
        {...props}
        type={ver ? 'text' : 'password'}
        style={{ ...estiloCampo, margin: 0, paddingRight: '2.6rem' }}
      />
      <button
        type="button"
        className="campo-pass-ojo"
        // `tabIndex={-1}`: quien recorre el formulario con Tab espera pasar del
        // campo al botón de entrar, no a un interruptor de visibilidad.
        tabIndex={-1}
        aria-label={ver ? t('campo.ocultarContrasena') : t('campo.verContrasena')}
        aria-pressed={ver}
        title={ver ? t('campo.ocultarContrasena') : t('campo.verContrasena')}
        onClick={() => setVer((v) => !v)}
      >
        {/* SVG y no un emoji: 👁 se dibuja distinto (o no se dibuja) según el
            sistema, y en Android sale de color. Esto se ve igual en todos. */}
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path
            d="M1.5 12S5 5.5 12 5.5 22.5 12 22.5 12 19 18.5 12 18.5 1.5 12 1.5 12Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
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
