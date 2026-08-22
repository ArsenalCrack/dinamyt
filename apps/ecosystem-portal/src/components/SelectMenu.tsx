'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';

export interface OpcionSelect {
  valor: string;
  etiqueta: string;
  /** Punto de color a la izquierda (lo usa el selector de cinturón). */
  punto?: string;
}

/**
 * Desplegable propio, con el panel dorado del ecosistema.
 *
 * Sustituye al `<select>` nativo, que se pinta con los colores del sistema
 * operativo —gris, distinto en cada navegador, y en Android con su propia hoja
 * a pantalla completa— en medio de una interfaz que no es nada de eso. El
 * portal era la última de las tres apps que lo seguía usando: este es
 * literalmente el MISMO componente que Membresías y Campeonatos, traído tal
 * cual para que las tres se sientan una sola (ver `OPERAR.md`, §4.8).
 *
 * Abrir y cerrar es estado de React puro, así que SIEMPRE se pliega: al elegir,
 * al tocar fuera y con Escape. El teclado también manda (flechas, Enter, Home,
 * End), porque un menú que solo obedece al ratón deja fuera a quien no lo usa.
 */
export function SelectMenu({
  valor,
  onChange,
  opciones,
  etiquetaAria,
  placeholder = 'Selecciona…',
  disabled = false,
  style,
  botonStyle,
}: {
  valor: string;
  onChange: (valor: string) => void;
  opciones: OpcionSelect[];
  etiquetaAria?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Estilo del contenedor (por ejemplo, un ancho máximo dentro de una fila). */
  style?: CSSProperties;
  botonStyle?: CSSProperties;
}) {
  const [abierto, setAbierto] = useState(false);
  const [activa, setActiva] = useState(0);
  /** Dónde dibujar el panel, en coordenadas de ventana. Ver `situar`. */
  const [caja, setCaja] = useState<{
    left: number;
    width: number;
    top?: number;
    bottom?: number;
  } | null>(null);
  const raizRef = useRef<HTMLDivElement | null>(null);
  const botonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLUListElement | null>(null);

  const elegida = opciones.find((o) => o.valor === valor);

  /**
   * El panel se dibuja FUERA del componente, pegado al `<body>` y en
   * coordenadas de ventana.
   *
   * No es capricho: dentro de la tarjeta del roster hay un contenedor con
   * `overflow-x: auto` para que la tabla se deslice en móvil, y un desplegable
   * hijo suyo quedaba recortado por ese recuadro — se abría y no se veía. Desde
   * el `body` no lo recorta nadie.
   *
   * Si abajo no cabe, se abre hacia arriba.
   */
  const situar = useCallback(() => {
    const b = botonRef.current;
    if (!b) return;
    const r = b.getBoundingClientRect();
    const alto = Math.min(272, opciones.length * 40 + 12);
    const cabeAbajo = window.innerHeight - r.bottom > alto + 12;
    setCaja({
      left: r.left,
      width: r.width,
      ...(cabeAbajo
        ? { top: r.bottom + 5 }
        : { bottom: window.innerHeight - r.top + 5 }),
    });
  }, [opciones.length]);

  useLayoutEffect(() => {
    if (abierto) situar();
  }, [abierto, situar]);

  // Cerrar al tocar fuera (ratón y táctil) o con Escape. Los tres, no uno:
  // en el celular no hay `mousedown`, y sin la tecla el menú atrapa al teclado.
  // Si la PÁGINA se mueve, el panel se cierra: va en coordenadas de ventana y
  // seguir a su botón mientras todo se desplaza costaría más de lo que vale.
  //
  // Pero el scroll DENTRO de la propia lista no cuenta. Ese detalle es el que
  // hacía que la lista de cinturones se cerrara sola al intentar bajar por
  // ella: el listener va en fase de captura, así que también le llegaban los
  // desplazamientos del panel.
  useEffect(() => {
    if (!abierto) return;
    function dentro(destino: Node | null) {
      return (
        Boolean(raizRef.current?.contains(destino)) ||
        Boolean(panelRef.current?.contains(destino))
      );
    }
    function fuera(e: MouseEvent | TouchEvent) {
      if (!dentro(e.target as Node)) setAbierto(false);
    }
    function tecla(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') setAbierto(false);
    }
    function alDesplazar(e: Event) {
      if (dentro(e.target as Node)) return;
      setAbierto(false);
    }
    const cerrar = () => setAbierto(false);
    document.addEventListener('mousedown', fuera);
    document.addEventListener('touchstart', fuera);
    document.addEventListener('keydown', tecla);
    window.addEventListener('scroll', alDesplazar, true);
    window.addEventListener('resize', cerrar);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('touchstart', fuera);
      document.removeEventListener('keydown', tecla);
      window.removeEventListener('scroll', alDesplazar, true);
      window.removeEventListener('resize', cerrar);
    };
  }, [abierto]);

  // Al abrir, la opción vigente queda a la vista aunque la lista sea larga
  // (el catálogo de países son doscientas).
  useEffect(() => {
    if (!abierto) return;
    panelRef.current
      ?.querySelector('[data-activa="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [abierto, activa]);

  function abrir() {
    const i = opciones.findIndex((o) => o.valor === valor);
    setActiva(i < 0 ? 0 : i);
    setAbierto(true);
  }

  function elegir(v: string) {
    onChange(v);
    setAbierto(false);
  }

  function alTeclear(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      setAbierto(false);
      return;
    }
    if (!abierto) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        abrir();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiva((i) => Math.min(i + 1, opciones.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiva((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActiva(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActiva(opciones.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const o = opciones[activa];
      if (o) elegir(o.valor);
    }
  }

  return (
    <div
      ref={raizRef}
      className="selectmenu"
      style={style}
      onKeyDown={disabled ? undefined : alTeclear}
    >
      <button
        ref={botonRef}
        type="button"
        className="selectmenu-btn"
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-label={etiquetaAria}
        disabled={disabled}
        onClick={() => (abierto ? setAbierto(false) : abrir())}
        style={botonStyle}
      >
        {elegida?.punto && (
          <span className="selectmenu-punto" style={{ background: elegida.punto }} />
        )}
        <span className="selectmenu-label" data-vacio={!elegida}>
          {elegida ? elegida.etiqueta : placeholder}
        </span>
        <span className="selectmenu-flecha" aria-hidden="true" data-abierto={abierto}>
          ▾
        </span>
      </button>

      {abierto &&
        caja &&
        createPortal(
          <ul
            className="selectmenu-panel"
            role="listbox"
            ref={panelRef}
            aria-label={etiquetaAria}
            style={{
              left: caja.left,
              width: caja.width,
              ...(caja.top !== undefined ? { top: caja.top } : { bottom: caja.bottom }),
            }}
          >
            {opciones.map((o, i) => (
              <li
                key={o.valor}
                role="option"
                aria-selected={o.valor === valor}
                className="selectmenu-opcion"
                data-activa={i === activa}
                onMouseEnter={() => setActiva(i)}
                onClick={() => elegir(o.valor)}
              >
                {o.punto && (
                  <span className="selectmenu-punto" style={{ background: o.punto }} />
                )}
                {o.etiqueta}
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  );
}
