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

/** Propiedades de margen que se llevan al envoltorio en vez de al campo. */
const CLAVES_MARGEN = new Set([
  'margin',
  'marginTop',
  'marginBottom',
  'marginLeft',
  'marginRight',
  'marginBlock',
  'marginBlockStart',
  'marginBlockEnd',
  'marginInline',
  'marginInlineStart',
  'marginInlineEnd',
]);

/**
 * Reparte el estilo recibido: los márgenes al envoltorio, el resto al campo.
 *
 * Los márgenes tienen que ir fuera porque el ojo se centra respecto al
 * envoltorio, y un `marginBottom` dentro lo dejaría flotando por encima del
 * campo.
 *
 * ── Por qué se copian las claves una a una ──
 *
 * La primera versión desestructuraba (`const { margin, marginTop, … } = style`)
 * y volvía a montar el objeto con las once claves. Las que no venían quedaban
 * en `undefined`, y ahí está la trampa: al montar en el navegador, React aplica
 * las propiedades UNA A UNA sobre `node.style`, y a las que valen `undefined`
 * les hace `setProperty(nombre, '')` — o sea, las BORRA. Como `margin` es un
 * atajo que expande a las cuatro longhands, escribir el atajo y limpiar
 * `marginTop`/`marginBottom`/… justo después dejaba el margen en cero.
 *
 * En el servidor no se notaba —ahí el estilo se serializa a texto y los
 * `undefined` se omiten—, así que la pantalla salía bien al abrir /login
 * directamente y MAL al llegar por navegación interna: justo lo que pasaba al
 * cerrar sesión, con el botón «Ingresar» pegado al campo de contraseña.
 *
 * Copiando solo lo que de verdad viene, no hay ningún `undefined` que borre
 * nada.
 */
function repartirEstilo(style?: React.CSSProperties): {
  envoltorio: React.CSSProperties;
  campo: React.CSSProperties;
} {
  const envoltorio: Record<string, unknown> = {};
  const campo: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(style ?? {})) {
    if (CLAVES_MARGEN.has(clave)) envoltorio[clave] = valor;
    else campo[clave] = valor;
  }
  return { envoltorio, campo };
}

export function CampoContrasena({ verInicial = false, style, ...props }: Props) {
  const { t } = useI18n();
  const [ver, setVer] = useState(verInicial);

  const { envoltorio: estiloEnvoltorio, campo: estiloCampo } = repartirEstilo(style);

  return (
    <span className="campo-pass" style={estiloEnvoltorio}>
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
