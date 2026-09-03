'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as REvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

/**
 * Ver una imagen en grande, como en WhatsApp: se toca la foto y se abre encima
 * de todo, sobre negro.
 *
 * **Para qué.** Las fotos de la app viven en miniaturas de 40 a 72 píxeles —el
 * roster, la cabecera del panel, el botón de cambiar foto—, y a ese tamaño no
 * se distingue si la que quedó guardada es la buena, si el encuadre dejó la
 * cara entera o si el escudo del club salió torcido. Para comprobarlo había que
 * imprimir el carnet.
 *
 * **Lo que hace.** Se cierra con Escape, tocando el fondo o con el botón. Se
 * acerca con la rueda, con dos dedos o con doble toque, y estando acercada se
 * arrastra. Nada de esto guarda nada: es un visor, no un editor —para cambiar
 * el encuadre está `AjustarImagen`—.
 *
 * Va en un portal, colgado del `<body>`: dentro de la tarjeta que lo abre
 * quedaría atrapado por el `overflow` de la tabla o por el apilamiento de la
 * barra pegajosa.
 *
 * **Es el MISMO archivo que el de Membresías**, sin su `useI18n` —el portal no
 * tiene idiomas—. Que estuviera solo allí es justo lo que se venía a arreglar:
 * el escudo del club y la foto de cada persona se editan AQUÍ, en el portal, y
 * aquí eran miniaturas de 32 píxeles que no había forma de mirar. Se subía una
 * foto y para comprobar cómo había quedado había que abrir la otra aplicación.
 */

/** Lo más que se puede acercar. */
const ZOOM_MAX = 5;

/** A cuánto salta el doble toque. */
const ZOOM_DOBLE = 2.5;

const RUEDA = 0.0016;

/**
 * Convierte una miniatura —la que sea— en algo que se abre en grande.
 *
 * Existe porque las imágenes del portal no son todas avatares: el escudo del
 * club es un cuadrado redondeado, la foto del perfil es un círculo de 96 px y
 * la de una fila mide 32. Envolver en vez de reimplementar deja el aspecto
 * exactamente como estaba y solo añade el gesto.
 *
 * `logo` cambia el redondeo del aro de foco: un escudo cuadrado dentro de un
 * foco circular se ve mal recortado.
 *
 * ⚠️ **No se usa dentro de un `<a>` ni de un `<button>` que ya haga algo.** Un
 * botón dentro de otro no es HTML válido: el navegador desarma el anidado y el
 * toque se vuelve una lotería entre las dos acciones.
 */
export function Ampliable({
  src,
  alt,
  logo = false,
  children,
}: {
  src: string;
  alt: string;
  logo?: boolean;
  children: ReactNode;
}) {
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      <button
        type="button"
        className="miniatura-ampliable"
        data-logo={logo ? 'true' : undefined}
        onClick={() => setAbierta(true)}
        aria-label={`Ver ${alt} en grande`}
        title="Ver en grande"
        style={{ flexShrink: 0 }}
      >
        {children}
      </button>
      {abierta && (
        <VisorImagen src={src} alt={alt} onCerrar={() => setAbierta(false)} />
      )}
    </>
  );
}

export function VisorImagen({
  src,
  alt,
  onCerrar,
}: {
  src: string;
  alt: string;
  onCerrar: () => void;
}) {
  const [montado, setMontado] = useState(false);
  const [escala, setEscala] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const escalaRef = useRef(1);
  const punteros = useRef(new Map<number, { x: number; y: number }>());
  const pellizco = useRef<{ dist: number; escala: number } | null>(null);
  /** Cuándo fue el toque anterior: es lo que distingue un doble toque. */
  const ultimoToque = useRef(0);

  // El portal necesita el DOM, que en el render del servidor no existe.
  useEffect(() => setMontado(true), []);

  const fijar = useCallback((e: number, x = 0, y = 0) => {
    const objetivo = Math.min(ZOOM_MAX, Math.max(1, e));
    escalaRef.current = objetivo;
    setEscala(objetivo);
    // Al volver al tamaño original la imagen se recentra: si no, se queda
    // desplazada fuera de la pantalla y parece que desapareció.
    setPos(objetivo === 1 ? { x: 0, y: 0 } : { x, y });
  }, []);

  // Escape cierra, y mientras está abierto la página de debajo no se desplaza:
  // en el celular, arrastrar la foto acercada movía además la pantalla entera.
  useEffect(() => {
    const alTeclear = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') onCerrar();
    };
    window.addEventListener('keydown', alTeclear);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', alTeclear);
      document.body.style.overflow = overflow;
    };
  }, [onCerrar]);

  function alBajar(ev: REvent<HTMLDivElement>) {
    try {
      ev.currentTarget.setPointerCapture(ev.pointerId);
    } catch {
      /* navegador quisquilloso: se arrastra sin captura */
    }
    punteros.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    pellizco.current = null;

    // Doble toque: acerca donde se tocó, o vuelve al tamaño original.
    const ahora = Date.now();
    if (punteros.current.size === 1 && ahora - ultimoToque.current < 300) {
      fijar(escalaRef.current > 1 ? 1 : ZOOM_DOBLE);
      ultimoToque.current = 0;
      return;
    }
    ultimoToque.current = ahora;
  }

  function alMover(ev: REvent<HTMLDivElement>) {
    const activos = punteros.current;
    if (!activos.has(ev.pointerId)) return;
    const previo = activos.get(ev.pointerId)!;
    activos.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    if (activos.size >= 2) {
      const [a, b] = [...activos.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (!pellizco.current || pellizco.current.dist === 0) {
        pellizco.current = { dist, escala: escalaRef.current };
        return;
      }
      const nueva = (pellizco.current.escala * dist) / pellizco.current.dist;
      escalaRef.current = Math.min(ZOOM_MAX, Math.max(1, nueva));
      setEscala(escalaRef.current);
      if (escalaRef.current === 1) setPos({ x: 0, y: 0 });
      return;
    }

    // Arrastrar solo tiene sentido con la imagen acercada: sin esto, mover el
    // dedo sobre una foto a tamaño original la sacaba de la pantalla.
    if (escalaRef.current <= 1) return;
    const dx = ev.clientX - previo.x;
    const dy = ev.clientY - previo.y;
    setPos((p) => ({ x: p.x + dx, y: p.y + dy }));
  }

  function alSoltar(ev: REvent<HTMLDivElement>) {
    punteros.current.delete(ev.pointerId);
    if (punteros.current.size < 2) pellizco.current = null;
  }

  if (!montado) return null;

  return createPortal(
    <div
      className="visor-imagen"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      // El fondo cierra, la imagen no: es lo que se espera de un visor y lo que
      // evita cerrarlo sin querer al soltar un arrastre encima de la foto.
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
      onWheel={(e) => fijar(escalaRef.current * Math.exp(-e.deltaY * RUEDA), pos.x, pos.y)}
      onPointerDown={alBajar}
      onPointerMove={alMover}
      onPointerUp={alSoltar}
      onPointerCancel={alSoltar}
    >
      <button
        type="button"
        className="visor-cerrar"
        onClick={onCerrar}
        aria-label="Cerrar"
      >
        ✕
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        draggable={false}
        style={{
          transform: `translate(${pos.x}px, ${pos.y}px) scale(${escala})`,
          cursor: escala > 1 ? 'grab' : 'default',
        }}
      />
      <p className="visor-pie">{alt}</p>
    </div>,
    document.body,
  );
}
