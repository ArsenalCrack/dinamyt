'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { claveRol, useAuth } from '@/lib/auth';
import { useI18n, type ClaveTexto } from '@/lib/i18n';
import { ControlesApariencia } from './ControlesApariencia';

/**
 * Barra de navegación: enlaces según el rol, tema e idioma, y «Salir» siempre
 * diferenciado por ser la única acción destructiva. En móvil todo vive en el
 * menú de hamburguesa.
 */
export function NavBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useI18n();
  const { user, club, logout, esStaff, esSuper } = useAuth();
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    setAbierto(false); // al navegar se cierra el menú móvil
  }, [pathname]);

  // Pantallas sin barra: login (aún sin sesión) y kiosco (pantalla completa).
  if (pathname === '/login' || pathname === '/kiosco') return null;
  if (!user) return null;

  const links: { href: string; clave: ClaveTexto; visible: boolean }[] = [
    { href: '/admin', clave: 'menu.admin', visible: esSuper },
    { href: '/', clave: 'menu.panel', visible: esStaff },
    { href: '/alumnos', clave: 'menu.alumnos', visible: esStaff },
    { href: '/asistencia', clave: 'menu.asistencia', visible: esStaff },
    { href: '/kiosco', clave: 'menu.kiosco', visible: esStaff },
    { href: '/planes', clave: 'menu.planes', visible: esStaff },
    { href: '/calendario', clave: 'menu.calendario', visible: esStaff },
    {
      href: '/mi',
      clave: esStaff ? 'menu.miEstado' : 'menu.miMembresia',
      visible: !esSuper,
    },
  ];
  const visibles = links.filter((l) => l.visible);

  const activo = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  const itemNav = (l: (typeof links)[number], enMenu = false) => (
    <Link
      key={l.href}
      href={l.href}
      style={{
        borderRadius: '0.5rem',
        padding: '0.45rem 0.7rem',
        fontSize: '0.85rem',
        fontWeight: 600,
        // Nunca partir una etiqueta en dos líneas.
        whiteSpace: 'nowrap',
        display: enMenu ? 'block' : undefined,
        ...(activo(l.href)
          ? { background: 'var(--bg-elevated)', color: 'var(--gold)' }
          : { color: 'var(--text-muted)' }),
      }}
    >
      {t(l.clave)}
    </Link>
  );

  // Se espera al logout antes de navegar: la cookie de sesión la borra el
  // servidor, y si se cambia de página antes el navegador puede cancelar la
  // petición y dejar la sesión viva en la API.
  async function salir() {
    await logout();
    setAbierto(false);
    router.replace('/login');
  }

  const identidad = (
    <span
      className="muted"
      style={{ fontSize: '0.72rem', textAlign: 'right', whiteSpace: 'nowrap' }}
    >
      <span style={{ display: 'block', fontWeight: 600, color: 'var(--text)' }}>
        {user.fullName || user.email}
      </span>
      <span style={{ color: 'var(--gold)' }}>
        {t(claveRol(user))}
        {club ? ` · ${club.name}` : ''}
      </span>
    </span>
  );

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        background: 'var(--bg)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div
        style={{
          maxWidth: 1180,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          padding: '0.6rem 1rem',
        }}
      >
        <Link
          href={esSuper ? '/admin' : esStaff ? '/' : '/mi'}
          style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="DINAMYT" width={30} height={30} />
          <span className="display" style={{ fontSize: '1rem', whiteSpace: 'nowrap' }}>
            {t('login.titulo')}
          </span>
        </Link>

        <nav
          className="nav-desktop"
          style={{ flex: 1, alignItems: 'center', gap: '0.15rem', flexWrap: 'nowrap' }}
        >
          {visibles.map((l) => itemNav(l))}
        </nav>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div className="nav-user" style={{ alignItems: 'center', gap: '0.5rem' }}>
            {identidad}
            <button
              onClick={() => setAbierto(!abierto)}
              className="btn btn-outline btn-sm"
              aria-label={t('menu.apariencia')}
              aria-expanded={abierto}
              title={t('menu.apariencia')}
            >
              🌐
            </button>
            <button
              onClick={salir}
              className="btn btn-danger btn-sm"
              title={t('menu.salir')}
              style={{ whiteSpace: 'nowrap' }}
            >
              ⏻ {t('menu.salir')}
            </button>
          </div>

          {/* Hamburguesa: SOLO móvil */}
          <button
            onClick={() => setAbierto(!abierto)}
            className="nav-burger btn btn-outline btn-sm"
            aria-label={abierto ? t('menu.cerrar') : t('menu.abrir')}
            aria-expanded={abierto}
          >
            {abierto ? '✕' : '☰'}
          </button>
        </div>
      </div>

      {/* Desplegable: en móvil trae los enlaces; en PC, solo tema e idioma. */}
      {abierto && (
        <div
          style={{
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-card)',
            padding: '0.75rem 1rem',
          }}
        >
          <div style={{ maxWidth: 1180, margin: '0 auto' }}>
            <div className="nav-movil">
              <p className="muted" style={{ fontSize: '0.72rem', padding: '0 0.75rem 0.5rem' }}>
                {user.fullName || user.email} ·{' '}
                <span style={{ color: 'var(--gold)' }}>{t(claveRol(user))}</span>
                {club ? ` · ${club.name}` : ''}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {visibles.map((l) => itemNav(l, true))}
              </div>
              <div style={{ height: 1, background: 'var(--border)', margin: '0.6rem 0' }} />
            </div>

            <ControlesApariencia variante="menu" />

            <button
              onClick={salir}
              className="nav-movil btn btn-danger"
              style={{ marginTop: '0.6rem', width: '100%' }}
            >
              ⏻ {t('menu.salir')}
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
