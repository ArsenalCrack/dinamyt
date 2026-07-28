'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { claveRol, useAuth } from '@/lib/auth';
import { IDIOMAS, useI18n, type ClaveTexto } from '@/lib/i18n';
import { aplicarTema, getTema, type Tema } from '@/lib/theme';
import { Avisos } from './Avisos';

/**
 * Barra de navegación con menú de hamburguesa, al estilo de DINAMYT-LOCAL.
 *
 * Un único panel para las dos pantallas, ANCLADO al botón y del tamaño de lo
 * que trae: en PC el desplegable anterior era una franja del ancho de la
 * ventana para enseñar tres botones. En móvil ese mismo panel añade los
 * enlaces, que arriba no caben.
 *
 * Se cierra como se espera que se cierre: al elegir algo, al tocar fuera, con
 * Escape y al cambiar de página. Que no se cerrara al hacer clic fuera era, de
 * hecho, la queja: el menú se quedaba abierto tapando la pantalla.
 */
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

  const links: { href: string; clave: ClaveTexto; visible: boolean }[] = [
    { href: '/admin', clave: 'menu.admin', visible: esSuper },
    { href: '/', clave: 'menu.panel', visible: esStaff },
    { href: '/alumnos', clave: 'menu.alumnos', visible: esStaff },
    { href: '/asistencia', clave: 'menu.asistencia', visible: esStaff },
    { href: '/estadisticas', clave: 'menu.estadisticas', visible: esStaff },
    { href: '/kiosco', clave: 'menu.kiosco', visible: esStaff },
    { href: '/planes', clave: 'menu.planes', visible: esStaff },
    { href: '/calendario', clave: 'menu.calendario', visible: esStaff },
    { href: '/mi', clave: 'menu.miEstado', visible: !esSuper },
  ];
  const visibles = links.filter((l) => l.visible);

  const activo = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

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

        <nav className="navbar-links">
          {visibles.map((l) => (
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
          <span className="navbar-quien">
            <b>{user.fullName || user.email}</b>
            <span>
              {t(claveRol(user))}
              {club ? ` · ${club.name}` : ''}
            </span>
          </span>

          {/* La campana vive en la barra: los avisos importan en cualquier
              pantalla, no solo en la que los estrenó. */}
          {!esSuper && <Avisos deTodoElClub={esStaff} />}

          <button
            type="button"
            className="navbar-toggle"
            aria-label={abierto ? t('menu.cerrar') : t('menu.abrir')}
            aria-expanded={abierto}
            aria-haspopup="menu"
            onClick={() => setAbierto((a) => !a)}
          >
            <span className="navbar-rayas" data-abierto={abierto} aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span className="navbar-toggle-texto">{t('menu.etiqueta')}</span>
          </button>
        </div>
      </div>

      {abierto && (
        <div className="navbar-panel" role="menu">
          <div className="navbar-panel-quien">
            <b>{user.fullName || user.email}</b>
            <span>
              {t(claveRol(user))}
              {club ? ` · ${club.name}` : ''}
            </span>
          </div>

          <div className="navbar-panel-links">
            {visibles.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                role="menuitem"
                className="navbar-item"
                data-activo={activo(l.href)}
              >
                {t(l.clave)}
              </Link>
            ))}
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
