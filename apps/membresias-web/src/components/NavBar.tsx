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
    function fuera(e: MouseEvent | TouchEvent) {
      if (raizRef.current && !raizRef.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') setAbierto(false);
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

  // Pantallas sin barra: login (aún sin sesión) y kiosco (pantalla completa).
  if (pathname === '/login' || pathname === '/kiosco') return null;
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
            <Avatar src={user.avatarUrl} nombre={nombre} size={38} />
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
            ⏻ {t('menu.salir')}
          </button>
        </div>
      )}
    </header>
  );
}
