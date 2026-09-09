'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Avatar } from '@/components/Avatar';
import { useI18n } from '@/lib/i18n';

/**
 * El símbolo de encendido de «Salir», dibujado en vez de escrito.
 *
 * Antes era el carácter ⏻ (U+23FB). No es un emoji: es un símbolo técnico que
 * casi ninguna fuente de Android trae, así que en el Chrome del celular el
 * botón salía con el cuadrito de «glifo que no tengo» delante del texto — y el
 * botón rojo de cerrar sesión es el peor sitio de la pantalla para que a
 * alguien le quede la duda de qué hace.
 *
 * Es el mismo trazo que la barra de Membresías y la de Campeonatos, a
 * propósito: la misma acción se dibuja igual en las cuatro webs.
 */
function IconoSalir() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0 }}
    >
      <path d="M12 2.8v9.4" />
      <path d="M6.3 6.3a8 8 0 1 0 11.4 0" />
    </svg>
  );
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * EL MENÚ DE CUENTA DEL PANEL — el chip de Membresías, sin barra de la que
 * colgar
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── Los dos fallos que arregla, que eran el mismo ────────────────────────────
 *
 * La cabecera del panel tenía CUATRO controles sueltos a la derecha —campana,
 * «Mi perfil», «Configuración» y «Salir»— compitiendo por el ancho con el
 * saludo, que va en la tipografía de titular (mayúsculas, anchura 118 %). En
 * una caja de 672 px eso deja al nombre poco más de 14 rem, y ahí es donde se
 * reportaron las dos caras del problema:
 *
 *   · **En el celular**, los cuatro botones no cabían en una fila y quedaban
 *     amontonados, medio saliéndose.
 *   · **En el monitor** —donde nadie esperaba que pasara nada— el saludo se
 *     partía en tres o cuatro renglones cortos, uno debajo de otro. «En
 *     responsivo está arreglado, pero en monitor no» es literalmente eso: el
 *     `flex-wrap` salva el teléfono bajando los botones, pero en escritorio
 *     caben en la fila y el que cede es el nombre.
 *
 * Los dos se cierran por el mismo sitio: **cuatro controles pasan a ser dos**
 * (la campana y este chip). El saludo recupera el ancho que le faltaba en el
 * monitor y la fila deja de desbordarse en el teléfono.
 *
 * ── Por qué un chip y no cuatro iconos ───────────────────────────────────────
 *
 * Porque es lo que ya hay en Membresías y en Campeonatos: el botón del menú ES
 * la identidad (nombre de pila + las tres rayas) y dentro está todo lo de la
 * cuenta. Reusa las clases `.navbar-toggle`, `.navbar-panel` y `.navbar-item`
 * del archivo compartido, así que no es «parecido»: es el mismo menú.
 *
 * ── Y por qué no lleva tema ni idioma ────────────────────────────────────────
 *
 * Porque en el portal eso vive en `/configuracion`, que está a un renglón de
 * aquí. Ponerlo también dentro sería el segundo sitio para lo mismo, que es
 * justo lo que se acaba de quitar del perfil.
 */
export function MenuCuenta({
  nombre,
  email,
  foto,
  esSuperAdmin = false,
  onSalir,
}: {
  nombre: string;
  email: string;
  foto: string | null;
  esSuperAdmin?: boolean;
  onSalir: () => void;
}) {
  const { t } = useI18n();
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLDivElement | null>(null);

  // Al navegar se cierra. Sin esto, volver atrás al panel lo encuentra abierto.
  useEffect(() => {
    setAbierto(false);
  }, [pathname]);

  useEffect(() => {
    if (!abierto) return;
    /**
     * ¿Hay una foto abierta en grande encima de todo?
     *
     * El visor vive en un portal colgado del `<body>` (ver `VisorImagen`), así
     * que para estos manejadores queda «fuera» del menú. Sin esta salvedad, el
     * primer toque dentro del visor cerraría el menú, y al cerrarse se
     * desmontaría el avatar que lo abrió y la foto desaparecería a media
     * maniobra. Es la misma salvedad que hace la barra de Membresías.
     */
    const conVisor = () => !!document.querySelector('.visor-imagen');

    function fuera(e: MouseEvent | TouchEvent) {
      if (conVisor()) return;
      if (raiz.current && !raiz.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape' && !conVisor()) setAbierto(false);
    }
    document.addEventListener('mousedown', fuera);
    document.addEventListener('touchstart', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('touchstart', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [abierto]);

  /** El nombre de pila: es lo que cabe en el chip sin apretar nada. */
  const primerNombre = (nombre || email).trim().split(/\s+/)[0];

  return (
    <div className="menu-cuenta" ref={raiz}>
      <button
        type="button"
        className="navbar-toggle"
        aria-label={abierto ? 'Cerrar el menú' : 'Abrir el menú'}
        aria-expanded={abierto}
        aria-haspopup="menu"
        onClick={() => setAbierto((a) => !a)}
      >
        <span className="navbar-toggle-nombre">{primerNombre}</span>
        <span className="navbar-rayas" data-abierto={abierto} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>

      {abierto && (
        <div className="navbar-panel" role="menu">
          <div className="navbar-panel-quien">
            {/* Ampliable aquí y no en el chip: el chip ES el botón que abre el
                menú, y un botón dentro de otro botón no es HTML válido — el
                navegador desarma el anidado y el toque se vuelve una lotería. */}
            <Avatar src={foto} nombre={nombre} size={38} ampliable />
            <span className="navbar-panel-datos">
              <b>{nombre}</b>
              <span>{esSuperAdmin ? 'Super administrador' : email}</span>
            </span>
          </div>

          <Link href="/perfil" role="menuitem" className="navbar-item">
            {t('menu.perfil')}
          </Link>
          {/* Configuración va al lado del perfil y no dentro: el perfil es
              quién eres —lo que las apps leen de ti— y esto es cómo quieres
              usar la cuenta. Ver `app/configuracion/page.tsx`. */}
          <Link href="/configuracion" role="menuitem" className="navbar-item">
            {t('config.titulo')}
          </Link>

          {/* ── Por qué «Salir» lleva aire por encima ──
              Es la única acción destructiva del menú, y equivocarse cuesta
              volver a escribir la contraseña. Pegado a «Configuración», al
              pasar el ratón los dos fondos se tocaban y parecían un solo
              bloque. Medio rem no es decoración: es el margen de un dedo. */}
          <div className="navbar-sep" />
          <button
            type="button"
            onClick={onSalir}
            className="btn btn-danger"
            style={{ width: '100%', justifyContent: 'flex-start', gap: '0.45rem' }}
          >
            <IconoSalir />
            {t('menu.salir')}
          </button>
        </div>
      )}
    </div>
  );
}
