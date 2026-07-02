'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cerrarSesion, obtenerToken, misInvitacionesAPI } from '@/lib/api';
import {
  getSesion,
  esJuez,
  puedeInscribir,
  etiquetaRol,
  type Sesion,
} from '@/lib/session';
import { Logo } from './Logo';

const PORTAL_URL =
  process.env.NEXT_PUBLIC_ECOSYSTEM_PORTAL_URL || 'http://localhost:3000';

/**
 * Barra de navegación GLOBAL, corta a propósito: Campeonatos + el destino de
 * trabajo del rol + Mi perfil. "Mis aplicaciones" es la salida al ecosystem
 * y va SEPARADA y con estilo distinto (no es una sección de esta app).
 * El responsive usa clases CSS propias (nav-desktop / nav-burger / nav-movil)
 * con media queries explícitas: en PC nunca se ve la hamburguesa.
 */
export function NavBar() {
  const router = useRouter();
  const pathname = usePathname();
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [pendientes, setPendientes] = useState(0);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    setAbierto(false); // al navegar se cierra el menú móvil
    if (obtenerToken()) {
      setSesion(getSesion());
      misInvitacionesAPI()
        .then((invs) => setPendientes(invs.filter((i) => i.estado === 'PENDIENTE').length))
        .catch(() => setPendientes(0));
    } else {
      setSesion(null);
    }
  }, [pathname]);

  // Vistas a pantalla completa: sin barra (TV / teléfono del juez / login).
  if (
    /^\/pantalla\/.+/.test(pathname) ||
    pathname.startsWith('/tatami/') ||
    pathname === '/admin/login'
  ) {
    return null;
  }

  const links: { href: string; etiqueta: string; visible: boolean }[] = [
    { href: '/campeonatos', etiqueta: 'Campeonatos', visible: true },
    { href: '/admin', etiqueta: 'Gestión', visible: puedeInscribir(sesion) },
    { href: '/juez', etiqueta: 'Mi tatami', visible: esJuez(sesion) },
    {
      href: '/perfil',
      etiqueta: pendientes > 0 ? `Mi perfil (${pendientes})` : 'Mi perfil',
      visible: !!sesion,
    },
  ];
  const visibles = links.filter((l) => l.visible);

  function activo(href: string): boolean {
    if (href === '/admin') return pathname === '/admin' || /^\/admin\/[0-9a-f-]{36}/.test(pathname);
    if (href === '/perfil')
      return pathname.startsWith('/perfil') || pathname.startsWith('/invitaciones');
    if (href === '/campeonatos')
      return pathname.startsWith('/campeonatos') || pathname.startsWith('/pantalla');
    return pathname === href || pathname.startsWith(href + '/');
  }

  const itemNav = (l: (typeof links)[number], enMenu = false) => (
    <Link
      key={l.href}
      href={l.href}
      className={`rounded-lg px-3 py-2 text-sm font-semibold ${enMenu ? 'block' : ''}`}
      style={
        activo(l.href)
          ? { background: 'var(--bg-elevated)', color: 'var(--gold)' }
          : { color: 'var(--text-muted)' }
      }
    >
      {l.etiqueta}
    </Link>
  );

  // Salida al ecosystem: separada y con estilo propio (no es una ruta más).
  const linkApps = (enMenu = false) =>
    sesion && (
      <a
        href={`${PORTAL_URL}/dashboard`}
        className={enMenu ? 'btn btn-outline mt-1' : 'btn btn-outline btn-sm'}
        title="Volver al ecosistema DINAMYT (tus aplicaciones)"
      >
        ⇱ Mis aplicaciones
      </a>
    );

  function salir() {
    cerrarSesion();
    setSesion(null);
    setAbierto(false);
    router.replace('/admin/login');
  }

  return (
    <header
      className="sticky top-0 z-20 border-b"
      style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 sm:px-6">
        <Link href="/" className="shrink-0">
          <Logo size={30} />
        </Link>

        {/* Escritorio: enlaces en línea (la hamburguesa jamás aparece aquí) */}
        <nav className="nav-desktop flex-1 items-center gap-1">
          {visibles.map((l) => itemNav(l))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <div className="nav-user items-center gap-2">
            {sesion ? (
              <>
                <span className="hidden text-right text-xs lg:block">
                  <span className="block font-semibold">{sesion.fullName || sesion.email}</span>
                  <span style={{ color: 'var(--gold)' }}>{etiquetaRol(sesion)}</span>
                </span>
                {/* separador visual: lo de la derecha sale de esta app */}
                <span
                  className="mx-1 hidden h-6 w-px lg:block"
                  style={{ background: 'var(--border)' }}
                />
                {linkApps()}
                <button onClick={salir} className="btn btn-outline btn-sm">
                  Salir
                </button>
              </>
            ) : (
              <Link href="/admin/login" className="btn btn-gold btn-sm">
                Iniciar sesión
              </Link>
            )}
          </div>

          {/* Hamburguesa: SOLO móvil (oculta por CSS en ≥768px) */}
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

      {/* Menú móvil desplegable (oculto por CSS en ≥768px) */}
      {abierto && (
        <nav
          className="nav-movil border-t px-4 py-3"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
        >
          {sesion && (
            <p className="mb-2 px-3 text-xs" style={{ color: 'var(--text-muted)' }}>
              {sesion.fullName || sesion.email} ·{' '}
              <span style={{ color: 'var(--gold)' }}>{etiquetaRol(sesion)}</span>
            </p>
          )}
          <div className="flex flex-col gap-1">
            {visibles.map((l) => itemNav(l, true))}
            <div className="my-2 h-px" style={{ background: 'var(--border)' }} />
            {linkApps(true)}
            {sesion ? (
              <button onClick={salir} className="btn btn-outline mt-1">
                Salir
              </button>
            ) : (
              <Link href="/admin/login" className="btn btn-gold mt-1">
                Iniciar sesión
              </Link>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
