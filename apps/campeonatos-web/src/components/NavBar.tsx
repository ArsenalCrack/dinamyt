'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cerrarSesion, obtenerToken, misInvitacionesAPI } from '@/lib/api';
import { getSesion, esAdmin, puedeInscribir, etiquetaRol, type Sesion } from '@/lib/session';
import { Logo } from './Logo';

/**
 * Barra de navegación GLOBAL del sistema: pública (Campeonatos, Pantalla) y,
 * con sesión, las secciones según el rol. Se oculta en las vistas de
 * pantalla completa (pantalla del evento y panel del juez en el tatami).
 */
export function NavBar() {
  const router = useRouter();
  const pathname = usePathname();
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [pendientes, setPendientes] = useState(0);

  useEffect(() => {
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
    { href: '/pantalla', etiqueta: 'En vivo', visible: true },
    { href: '/admin', etiqueta: 'Gestión', visible: !!sesion && puedeInscribir(sesion) },
    { href: '/juez', etiqueta: 'Mi tatami', visible: !!sesion },
    { href: '/admin/combate', etiqueta: 'Juez de mesa', visible: !!sesion && esAdmin(sesion) },
    {
      href: '/invitaciones',
      etiqueta: pendientes > 0 ? `Invitaciones (${pendientes})` : 'Invitaciones',
      visible: !!sesion,
    },
  ];

  function activo(href: string): boolean {
    if (href === '/admin') return pathname === '/admin' || /^\/admin\/[0-9a-f-]{36}/.test(pathname);
    return pathname === href || pathname.startsWith(href + '/');
  }

  return (
    <header
      className="sticky top-0 z-20 border-b"
      style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
        <Link href="/" className="shrink-0">
          <Logo size={30} />
        </Link>

        <nav className="order-3 flex w-full flex-wrap gap-1 sm:order-none sm:w-auto sm:flex-1">
          {links
            .filter((l) => l.visible)
            .map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-lg px-3 py-1.5 text-sm font-semibold"
                style={
                  activo(l.href)
                    ? { background: 'var(--bg-elevated)', color: 'var(--gold)' }
                    : { color: 'var(--text-muted)' }
                }
              >
                {l.etiqueta}
              </Link>
            ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {sesion ? (
            <>
              <span className="hidden text-right text-xs sm:block">
                <span className="block font-semibold">{sesion.fullName || sesion.email}</span>
                <span style={{ color: 'var(--gold)' }}>{etiquetaRol(sesion)}</span>
              </span>
              <button
                onClick={() => {
                  cerrarSesion();
                  setSesion(null);
                  router.replace('/admin/login');
                }}
                className="btn btn-outline btn-sm"
              >
                Salir
              </button>
            </>
          ) : (
            <Link href="/admin/login" className="btn btn-gold btn-sm">
              Iniciar sesión
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
