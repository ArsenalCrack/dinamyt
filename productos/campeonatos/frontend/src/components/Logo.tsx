"use client";

/**
 * Logo de DINAMYT: imagen + marca de texto.
 * - inline (default): imagen a la izquierda del texto, escala con `fontSize`.
 * - stacked: imagen EN GRANDE arriba y "DINAMYT" centrado debajo (pantallas
 *   públicas y portadas).
 * - soloImagen: solo la imagen (para espacios reducidos donde la marca de
 *   texto ya aparece en otro lugar de la pantalla).
 * El alto de la imagen va en `em`, así que todo escala con el fontSize
 * (incluido clamp()) sin romper los layouts existentes.
 */
export default function Logo({
  fontSize = "2rem",
  stacked = false,
  soloImagen = false,
  className = "",
  style,
}: {
  fontSize?: string | number;
  stacked?: boolean;
  soloImagen?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={`logo ${className}`.trim()}
      style={{
        fontSize,
        display: "inline-flex",
        flexDirection: stacked ? "column" : "row",
        alignItems: "center",
        justifyContent: "center",
        gap: stacked ? "0.18em" : "0.26em",
        lineHeight: 1,
        ...style,
      }}
    >
      {/* La imagen ya es la D con fondo transparente: sin bordes ni
          redondeos para que se acople directamente al fondo.

          `logo.png` tiene que seguir siendo de 512x512. Estuvo en 256 y se
          veía pastoso: acordarse de que aquí 1rem = 17px (globals.css fija
          `html { font-size: 106.25% }`), así que el `stacked` de la pantalla
          de carga —2.1em sobre 2.2rem— pide ~78 px de CSS, que en un celular
          de densidad 3.5x son 275 px reales. Con la imagen de 256 el
          navegador tenía que estirarla. Y en el marcador del tatami se pide
          hasta 1.08em sobre 10.5rem, o sea ~193 px de CSS.

          El archivo es el mismo dibujo y el mismo encuadre que `icon-512.png`
          (comprobado: superpuestos difieren menos que el ruido de reescalar),
          así que se puede regenerar desde ahí sin mover nada de sitio. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.png"
        alt=""
        aria-hidden="true"
        style={{
          height: stacked ? "2.1em" : "1.08em",
          width: "auto",
          display: "block",
          flexShrink: 0,
        }}
      />
      {!soloImagen && <span>DINA<em>MYT</em></span>}
    </span>
  );
}
