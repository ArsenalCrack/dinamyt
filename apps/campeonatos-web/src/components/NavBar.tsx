'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cerrarSesion, obtenerToken, misInvitacionesAPI } from '@/lib/api';
import {
  getSesion,
  esAdmin,
  esJuez,
  puedeInscribir,
  etiquetaRol,
  type Sesion,
} from '@/lib/session';
import { Logo } from './Logo';

const PORTAL_URL =
  process.env.NEXT_PUBLIC_ECOSYSTEM_PORTAL_URL || 'http://localhost:3000';

/**
 * Barra de navegación GLOBAL: pública (Campeonatos, En vivo) y, con sesión,
 * SOLO lo que el rol necesita. En móvil colapsa a un menú hamburguesa.
 * Incluye la vuelta a "Mis aplicaciones" (dashboard del ecosystem).
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

  // Cada rol ve solo lo suyo: gestión (admin/maestro), mesa (admin),
  // tatami (juez), invitaciones/perfil (todo usuario logueado).
  const links: { href: string; etiqueta: string; visible: boolean; externo?: boolean }[] = [
    { href: '/campeonatos', etiqueta: 'Campeonatos', visible: true },
    { href: '/pantalla', etiqueta: 'En vivo', visible: true },
    { href: '/admin', etiqueta: 'Gestión', visible: puedeInscribir(sesion) },
    { href: '/admin/combate', etiqueta: 'Juez de mesa', visible: esAdmin(sesion) },
    { href: '/juez', etiqueta: 'Mi tatami', visible: esJuez(sesion) },
    {
      href: '/invitaciones',
      etiqueta: pendientes > 0 ? `Invitaciones (${pendientes})` : 'Invitaciones',
      visible: !!sesion,
    },
    { href: '/perfil', etiqueta: 'Mi perfil', visible: !!sesion },
    {
      href: `${PORTAL_URL}/dashboard`,
      etiqueta: '⇱ Mis aplicaciones',
      visible: !!sesion,
      externo: true,
    },
  ];
  const visibles = links.filter((l) => l.visible);

  function activo(href: string): boolean {
    if (href === '/admin') return pathname === '/admin' || /^\/admin\/[0-9a-f-]{36}/.test(pathname);
    return pathname === href || pathname.startsWith(href + '/');
  }

  const itemNav = (l: (typeof links)[number], enMenu = false) =>
    l.externo ? (
      <a
        key={l.href}
        href={l.href}
        className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${enMenu ? 'block' : ''}`}
        style={{ color: 'var(--text-muted)' }}
      >
        {l.etiqueta}
      </a>
    ) : (
      <Link
        key={l.href}
        href={l.href}
        className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${enMenu ? 'block' : ''}`}
        style={
          activo(l.href)
            ? { background: 'var(--bg-elevated)', color: 'var(--gold)' }
            : { color: 'var(--text-muted)' }
        }
      >
        {l.etiqueta}
      </Link>
    );

  return (
    <header
      className="sticky top-0 z-20 border-b"
      style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 sm:px-6">
        <Link href="/" className="shrink-0">
          <Logo size={30} />
        </Link>

        {/* Desktop: enlaces en línea */}
        <nav className="hidden flex-1 flex-wrap gap-1 md:flex">
          {visibles.map((l) => itemNav(l))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {sesion ? (
            <>
              <span className="hidden text-right text-xs lg:block">
                <span className="block font-semibold">{sesion.fullName || sesion.email}</span>
                <span style={{ color: 'var(--gold)' }}>{etiquetaRol(sesion)}</span>
              </span>
              <button
                onClick={() => {
                  cerrarSesion();
                  setSesion(null);
                  router.replace('/admin/login');
                }}
                className="btn btn-outline btn-sm hidden md:inline-flex"
              >
                Salir
              </button>
            </>
          ) : (
            <Link href="/admin/login" className="btn btn-gold btn-sm hidden md:inline-flex">
              Iniciar sesión
            </Link>
          )}

          {/* Móvil: hamburguesa */}
          <button
            onClick={() => setAbierto(!abierto)}
            className="btn btn-outline btn-sm md:hidden"
            aria-label="Abrir menú"
            aria-expanded={abierto}
          >
            {abierto ? '✕' : '☰'}
          </button>
        </div>
      </div>

      {/* Menú móvil desplegable */}
      {abierto && (
        <nav
          className="border-t px-4 py-3 md:hidden"
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
            {sesion ? (
              <button
                onClick={() => {
                  cerrarSesion();
                  setSesion(null);
                  setAbierto(false);
                  router.replace('/admin/login');
                }}
                className="btn btn-outline mt-2"
              >
                Salir
              </button>
            ) : (
              <Link href="/admin/login" className="btn btn-gold mt-2">
                Iniciar sesión
              </Link>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
