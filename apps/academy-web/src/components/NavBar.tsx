'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cerrarSesion, obtenerToken } from '@/lib/api';
import {
  getSesion,
  getRolEfectivo,
  limpiarRolCache,
  etiquetaRol,
  type Sesion,
} from '@/lib/session';

const PORTAL_URL =
  process.env.NEXT_PUBLIC_ECOSYSTEM_PORTAL_URL || 'http://localhost:3000';

/**
 * Barra de navegación de Academy: enlaces por rol efectivo (la API decide),
 * «Mis aplicaciones» como salida al ecosistema y «Salir» SIEMPRE diferenciado.
 * En móvil todo vive en el menú de hamburguesa.
 */
export function NavBar() {
  const router = useRouter();
  const pathname = usePathname();
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [rol, setRol] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    setAbierto(false); // al navegar se cierra el menú móvil
    const s = obtenerToken() ? getSesion() : null;
    setSesion(s);
    if (s) void getRolEfectivo().then(setRol);
  }, [pathname]);

  if (pathname === '/login') return null;
  if (!sesion) return null;

  const esMaestro = rol === 'teacher' || rol === 'admin';
  const esAdmin = rol === 'admin';
  const links: { href: string; etiqueta: string; visible: boolean }[] = [
    { href: '/aprender', etiqueta: 'Aprender', visible: true },
    { href: '/evaluaciones', etiqueta: 'Evaluaciones', visible: true },
    { href: '/progreso', etiqueta: 'Mi progreso', visible: true },
    { href: '/maestro', etiqueta: 'Panel del maestro', visible: esMaestro },
    { href: '/admin', etiqueta: 'Administración', visible: esAdmin },
  ];
  const visibles = links.filter((l) => l.visible);

  const activo = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  const itemNav = (l: (typeof links)[number], enMenu = false) => (
    <Link
      key={l.href}
      href={l.href}
      className={enMenu ? 'block' : ''}
      style={{
        borderRadius: '0.5rem',
        padding: '0.45rem 0.7rem',
        fontSize: '0.85rem',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        display: enMenu ? 'block' : undefined,
        ...(activo(l.href)
          ? { background: 'var(--bg-elevated, rgba(255,255,255,0.06))', color: 'var(--gold)' }
          : { color: 'var(--text-muted)' }),
      }}
    >
      {l.etiqueta}
    </Link>
  );

  const linkApps = (enMenu = false) => (
    <a
      href={`${PORTAL_URL}/dashboard`}
      className={enMenu ? 'btn btn-outline' : 'btn btn-outline btn-sm'}
      title="Volver al ecosistema DINAMYT (tus aplicaciones)"
      style={enMenu ? { marginTop: '0.25rem' } : undefined}
    >
      ⇱ Mis aplicaciones
    </a>
  );

  function salir() {
    cerrarSesion();
    limpiarRolCache();
    setSesion(null);
    setAbierto(false);
    router.replace('/login');
  }

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
          href="/"
          style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="DINAMYT" width={30} height={30} />
          <span className="display" style={{ fontSize: '1rem', whiteSpace: 'nowrap' }}>
            Academy
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
            <span className="muted" style={{ fontSize: '0.72rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
              <span style={{ display: 'block', fontWeight: 600, color: 'var(--text)' }}>
                {sesion.fullName || sesion.email}
              </span>
              <span style={{ color: 'var(--gold)' }}>
                {etiquetaRol(rol, sesion.isSuperAdmin)}
              </span>
            </span>
            {linkApps()}
            {/* Salir se distingue del resto: única acción destructiva */}
            <button
              onClick={salir}
              className="btn btn-danger btn-sm"
              title="Cerrar sesión"
              style={{ whiteSpace: 'nowrap' }}
            >
              ⏻ Salir
            </button>
          </div>

          <button
            onClick={() => setAbierto(!abierto)}
            className="nav-burger btn btn-outline btn-sm"
            aria-label={abierto ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={abierto}
          >
            {abierto ? '✕' : '☰'}
          </button>
        </div>
      </div>

      {abierto && (
        <nav
          className="nav-movil"
          style={{
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-card)',
            padding: '0.75rem 1rem',
          }}
        >
          <p className="muted" style={{ fontSize: '0.72rem', padding: '0 0.75rem 0.5rem' }}>
            {sesion.fullName || sesion.email} ·{' '}
            <span style={{ color: 'var(--gold)' }}>
              {etiquetaRol(rol, sesion.isSuperAdmin)}
            </span>
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {visibles.map((l) => itemNav(l, true))}
            <div style={{ height: 1, background: 'var(--border)', margin: '0.5rem 0' }} />
            {linkApps(true)}
            <button onClick={salir} className="btn btn-danger" style={{ marginTop: '0.25rem' }}>
              ⏻ Salir
            </button>
          </div>
        </nav>
      )}
    </header>
  );
}
