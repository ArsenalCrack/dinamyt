'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { claveRol, useAuth } from '@/lib/auth';
import { IDIOMAS, useI18n, type ClaveTexto } from '@/lib/i18n';
import { aplicarTema, getTema, type Tema } from '@/lib/theme';
import { Avatar } from './Avatar';
import { Avisos } from './Avisos';

/**
 * Barra de navegación.
 *
 * **Qué se ve arriba y qué no.** Antes subían a la barra los ocho enlaces del
 * rol y, al lado, el nombre del maestro con su club: en un portátil normal eso
 * llegaba al borde y el nombre se apretaba contra los enlaces. Ahora arriba
 * quedan solo los enlaces del día a día (`principal`) y el resto vive en el
 * menú, que es donde se busca lo que se usa una vez por semana.
 *
 * **Dónde está el nombre.** En el botón del menú, como un chip con la foto y el
 * nombre de pila, y completo —nombre, rol y club— dentro del panel. Un nombre
 * largo o el club «Academia de Artes Marciales del Norte» ya no tienen que
 * caber en un hueco de la barra: se recortan con puntos suspensivos en el chip
 * y se leen enteros al abrir.
 *
 * El panel se cierra como se espera: al elegir algo, al tocar fuera, con Escape
 * y al cambiar de página.
 */

/**
 * El símbolo de encendido de «Salir», dibujado en vez de escrito.
 *
 * Antes era el carácter ⏻ (U+23FB). No es un emoji: es un símbolo técnico que
 * casi ninguna fuente de Android trae, así que en el Chrome del celular el
 * botón salía con un hueco —o con el cuadrito de «glifo que no tengo»— delante
 * del texto. Un SVG se ve igual en todos lados y hereda el color del botón,
 * que en este caso es el rojo de acción destructiva.
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

interface Enlace {
  href: string;
  clave: ClaveTexto;
  visible: boolean;
  /** Del día a día: se gana un sitio en la barra. El resto va al menú. */
  principal: boolean;
}

export function NavBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { t, idioma, setIdioma } = useI18n();
  const { user, club, logout, esStaff, esSuper } = useAuth();
  const [abierto, setAbierto] = useState(false);
  // Se arranca en 'dark', igual que el servidor, y se corrige tras montar: el
  // tema real vive en localStorage y leerlo aquí rompería la hidratación.
  const [tema, setTema] = useState<Tema>('dark');
  const raizRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setTema(getTema());
  }, []);

  useEffect(() => {
    setAbierto(false); // al navegar se cierra
  }, [pathname]);

  useEffect(() => {
    if (!abierto) return;
    /**
     * ¿Hay una foto abierta en grande encima de todo?
     *
     * El visor vive en un portal colgado del `<body>` (ver `VisorImagen`), así
     * que para estos dos manejadores queda «fuera» de la barra. Sin esta
     * salvedad, el primer toque dentro del visor —el botón de cerrar, un
     * arrastre, un pellizco— cerraba el menú, y al cerrarse se desmontaba el
     * avatar que lo había abierto y la foto desaparecía a media maniobra. Lo
     * mismo con Escape: cerraba las dos cosas de golpe cuando lo que se quería
     * era salir solo de la foto.
     */
    const conVisor = () => !!document.querySelector('.visor-imagen');

    function fuera(e: MouseEvent | TouchEvent) {
      if (conVisor()) return;
      if (raizRef.current && !raizRef.current.contains(e.target as Node)) {
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

  // La única pantalla sin barra es el login: todavía no hay sesión ni sitio a
  // donde navegar. El kiosco SÍ la lleva desde ahora — se abre en la puerta del
  // salón, sí, pero de allí se sale igual que de cualquier otra pantalla, y
  // tenerla escondida obligaba a mantener aquí dentro un enlace de vuelta y un
  // par de controles duplicados.
  if (pathname === '/login') return null;
  if (!user) return null;

  // El orden es el de la barra. `principal` marca lo que se abre a diario: el
  // panel, el roster, la asistencia y el kiosco de la puerta. Planes,
  // calendario y estadísticas se tocan al empezar el mes.
  const links: Enlace[] = [
    { href: '/admin', clave: 'menu.admin', visible: esSuper, principal: true },
    { href: '/', clave: 'menu.panel', visible: esStaff, principal: true },
    { href: '/alumnos', clave: 'menu.alumnos', visible: esStaff, principal: true },
    { href: '/asistencia', clave: 'menu.asistencia', visible: esStaff, principal: true },
    { href: '/kiosco', clave: 'menu.kiosco', visible: esStaff, principal: true },
    { href: '/estadisticas', clave: 'menu.estadisticas', visible: esStaff, principal: false },
    { href: '/planes', clave: 'menu.planes', visible: esStaff, principal: false },
    { href: '/calendario', clave: 'menu.calendario', visible: esStaff, principal: false },
    { href: '/mi', clave: 'menu.miEstado', visible: !esSuper, principal: true },
  ];
  const visibles = links.filter((l) => l.visible);
  const enLaBarra = visibles.filter((l) => l.principal);

  const activo = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  /** El nombre de pila: es lo que cabe en el chip sin apretar nada. */
  const nombre = user.fullName || user.email;
  const primerNombre = nombre.split(' ')[0];
  const rolYClub = `${t(claveRol(user))}${club ? ` · ${club.name}` : ''}`;

  function alternarTema() {
    const nuevo: Tema = tema === 'dark' ? 'light' : 'dark';
    aplicarTema(nuevo);
    setTema(nuevo);
  }

  // Se espera al logout antes de navegar: la cookie de sesión la borra el
  // servidor, y si se cambia de página antes el navegador puede cancelar la
  // petición y dejar la sesión viva en la API.
  async function salir() {
    await logout();
    setAbierto(false);
    router.replace('/login');
  }

  return (
    <header ref={raizRef} className="navbar">
      <div className="navbar-inner">
        <Link
          href={esSuper ? '/admin' : esStaff ? '/' : '/mi'}
          className="navbar-marca"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="DINAMYT" width={30} height={30} />
          <span className="display">{t('app.nombre')}</span>
        </Link>

        <nav className="navbar-links" aria-label={t('menu.navegacion')}>
          {enLaBarra.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="navbar-link"
              data-activo={activo(l.href)}
            >
              {t(l.clave)}
            </Link>
          ))}
        </nav>

        <div className="navbar-derecha">
          {/* La campana vive en la barra: los avisos importan en cualquier
              pantalla, no solo en la que los estrenó. */}
          {!esSuper && <Avisos deTodoElClub={esStaff} />}

          {/* El botón del menú ES la identidad: foto, nombre de pila y las tres
              rayas. Así el nombre tiene su propio sitio en vez de disputárselo
              a los enlaces. */}
          <button
            type="button"
            className="navbar-toggle"
            aria-label={abierto ? t('menu.cerrar') : t('menu.abrir')}
            aria-expanded={abierto}
            aria-haspopup="menu"
            onClick={() => setAbierto((a) => !a)}
          >
            <Avatar src={user.avatarUrl} nombre={nombre} size={24} />
            <span className="navbar-toggle-nombre">{primerNombre}</span>
            <span className="navbar-rayas" data-abierto={abierto} aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </button>
        </div>
      </div>

      {abierto && (
        <div className="navbar-panel" role="menu">
          <div className="navbar-panel-quien">
            {/* Ampliable aquí y no en el chip de arriba: el chip ES el botón
                que abre el menú, y un botón dentro de otro botón no es HTML
                válido —el navegador desarma el anidado y el toque se vuelve
                una lotería—. Dentro del panel la foto ya no compite con nada. */}
            <Avatar src={user.avatarUrl} nombre={nombre} size={38} ampliable />
            <span className="navbar-panel-datos">
              <b>{nombre}</b>
              <span>{rolYClub}</span>
            </span>
          </div>

          {/* Todos los enlaces, no solo los que faltan: en móvil el menú es la
              única navegación que hay. En PC, los que ya se ven arriba se
              ocultan por CSS, y si no queda ninguno se va el bloque entero
              (`data-solo-principales`). */}
          <div
            className="navbar-panel-nav"
            data-solo-principales={visibles.every((l) => l.principal)}
          >
            <p className="navbar-etiqueta">{t('menu.navegacion')}</p>
            <div className="navbar-panel-links">
              {visibles.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  role="menuitem"
                  className="navbar-item"
                  data-activo={activo(l.href)}
                  data-principal={l.principal}
                >
                  {t(l.clave)}
                </Link>
              ))}
            </div>
            <div className="navbar-sep" />
          </div>

          <button type="button" role="menuitem" className="navbar-item" onClick={alternarTema}>
            {tema === 'dark' ? t('menu.modoClaro') : t('menu.modoOscuro')}
          </button>

          <p className="navbar-etiqueta">🌐 {t('menu.idioma')}</p>
          <div className="navbar-idiomas" role="group" aria-label={t('menu.idioma')}>
            {IDIOMAS.map((l) => (
              <button
                key={l.codigo}
                type="button"
                className="navbar-idioma"
                data-activo={idioma === l.codigo}
                aria-pressed={idioma === l.codigo}
                onClick={() => setIdioma(l.codigo)}
              >
                {l.etiqueta}
              </button>
            ))}
          </div>

          <div className="navbar-sep" />
          <button
            onClick={salir}
            className="btn btn-danger"
            style={{ width: '100%', justifyContent: 'flex-start' }}
          >
            <IconoSalir />
            {t('menu.salir')}
          </button>
        </div>
      )}
    </header>
  );
}
