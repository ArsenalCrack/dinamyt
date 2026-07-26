'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cerrarSesion, obtenerToken } from '@/lib/api';
import { getSesion, esStaff, etiquetaRol, type Sesion } from '@/lib/session';

const PORTAL_URL =
  process.env.NEXT_PUBLIC_ECOSYSTEM_PORTAL_URL || 'http://localhost:3000';

/**
 * Barra de navegación de Membresías: enlaces por rol, «Mis aplicaciones» como
 * salida al ecosistema y «Salir» SIEMPRE diferenciado (acción destructiva).
 * En móvil todo vive en el menú de hamburguesa (nada de botones amontonados).
 */
export function NavBar() {
  const router = useRouter();
  const pathname = usePathname();
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    setAbierto(false); // al navegar se cierra el menú móvil
    setSesion(obtenerToken() ? getSesion() : null);
  }, [pathname]);

  // Pantallas sin barra: login (aún sin sesión) y kiosco (pantalla completa).
  if (pathname === '/login' || pathname === '/kiosco') return null;
  if (!sesion) return null;

  const staff = esStaff(sesion);
  const links: { href: string; etiqueta: string; visible: boolean }[] = [
    { href: '/', etiqueta: 'Panel del club', visible: staff },
    { href: '/asistencia', etiqueta: 'Asistencia', visible: staff },
    { href: '/kiosco', etiqueta: 'Kiosco', visible: staff },
    { href: '/planes', etiqueta: 'Planes', visible: staff },
    { href: '/calendario', etiqueta: 'Calendario', visible: staff },
    { href: '/mi', etiqueta: staff ? 'Mi estado' : 'Mi membresía', visible: true },
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
        // Nunca partir una etiqueta en dos líneas (evita el texto "atrapado").
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
        <Link href={staff ? '/' : '/mi'} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="DINAMYT" width={30} height={30} />
          <span className="display" style={{ fontSize: '1rem', whiteSpace: 'nowrap' }}>
            Membresías
          </span>
        </Link>

        {/* Escritorio: enlaces en línea, ocupando el espacio disponible sin
            partir palabras (nowrap por item). */}
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
              <span style={{ color: 'var(--gold)' }}>{etiquetaRol(sesion)}</span>
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

          {/* Hamburguesa: SOLO móvil */}
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

      {/* Menú móvil desplegable */}
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
            <span style={{ color: 'var(--gold)' }}>{etiquetaRol(sesion)}</span>
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
