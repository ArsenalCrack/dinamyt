import type { ReactNode } from 'react';

/**
 * Los íconos del ecosistema: SVG de trazo, propios, del color de la letra.
 *
 * ── Por qué no emoji ──
 *
 * La campana 🔔, el escudo 🛡, el calendario 📅, el sobre ✉ y la alerta ⚠
 * hacían de íconos con función, y un emoji lo dibuja cada sistema a su manera:
 * en Windows sale un escudo azul, en Android uno gris, y ninguno cambia con el
 * tema ni hereda el color de la letra (auditoría 001, nº 13; DESIGN.md,
 * «Formas»). Estos son trazos en `currentColor`, de 1.8 de grosor y puntas
 * redondas, todos en la misma retícula de 24.
 *
 * ── Y la accesibilidad ──
 *
 * Por defecto van `aria-hidden`: el nombre lo pone el botón que los lleva
 * (`aria-label`) o el texto de al lado. Solo con `titulo` se anuncian solos.
 */
export type NombreIcono =
  | 'campana'
  | 'calendario'
  | 'correo'
  | 'escudo'
  | 'alerta'
  | 'cerrar'
  | 'lapiz';

const TRAZOS: Record<NombreIcono, ReactNode> = {
  campana: (
    <>
      <path d="M12 3a5 5 0 0 0-5 5v3.2c0 1-.4 2-1.1 2.7L5 15h14l-.9-1.1A3.9 3.9 0 0 1 17 11.2V8a5 5 0 0 0-5-5Z" />
      <path d="M10 18.5a2 2 0 0 0 4 0" />
    </>
  ),
  calendario: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </>
  ),
  correo: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  escudo: <path d="M12 3 5 6v5c0 4.4 3 8.3 7 10 4-1.7 7-5.6 7-10V6l-7-3Z" />,
  alerta: (
    <>
      <path d="M12 4 2.8 19.5a1 1 0 0 0 .9 1.5h16.6a1 1 0 0 0 .9-1.5L12 4Z" />
      <path d="M12 10v4M12 17.5h.01" />
    </>
  ),
  cerrar: <path d="M6 6l12 12M18 6 6 18" />,
  lapiz: (
    <>
      <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z" />
      <path d="m14.5 7.5 3 3" />
    </>
  ),
};

export function Icono({
  nombre,
  tamano = 16,
  titulo,
  className,
}: {
  nombre: NombreIcono;
  /** En píxeles; por defecto 16, el de un renglón de texto pequeño. */
  tamano?: number;
  /** Solo si el ícono va SOLO y tiene que anunciarse por sí mismo. */
  titulo?: string;
  className?: string;
}) {
  return (
    <svg
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...(titulo ? { role: 'img', 'aria-label': titulo } : { 'aria-hidden': true })}
      focusable="false"
    >
      {TRAZOS[nombre]}
    </svg>
  );
}
