'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cerrarSesion, obtenerToken } from '@/lib/api';
import { getSesion, esAdmin, etiquetaRol, type Sesion } from '@/lib/session';
import { Logo } from './Logo';

/**
 * Barra superior común del panel: logo, navegación según el rol y sesión.
 * Se oculta en /admin/login (ahí no hay sesión que mostrar).
 */
export function AdminHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const [sesion, setSesion] = useState<Sesion | null>(null);

  useEffect(() => {
    if (obtenerToken()) setSesion(getSesion());
  }, [pathname]);

  if (pathname === '/admin/login') return null;

  const links = [
    { href: '/admin', etiqueta: 'Campeonatos', visible: true },
    { href: '/admin/combate', etiqueta: 'Juez de mesa', visible: true },
    { href: '/pantalla', etiqueta: 'Pantalla', visible: true },
  ];

  function activo(href: string): boolean {
    if (href === '/admin') return pathname === '/admin' || /^\/admin\/[0-9a-f-]{36}/.test(pathname);
    return pathname.startsWith(href);
  }

  return (
    <header
      className="sticky top-0 z-20 border-b"
      style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/admin" className="shrink-0">
          <Logo size={32} />
        </Link>

        <nav className="order-3 flex w-full gap-1 sm:order-none sm:w-auto sm:flex-1">
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
          {sesion && (
            <span className="hidden text-right text-xs sm:block">
              <span className="block font-semibold">
                {sesion.fullName || sesion.email}
              </span>
              <span style={{ color: 'var(--gold)' }}>{etiquetaRol(sesion)}</span>
            </span>
          )}
          {sesion && esAdmin(sesion) && (
            <span className="badge badge-gold sm:hidden">{etiquetaRol(sesion)}</span>
          )}
          <button
            onClick={() => {
              cerrarSesion();
              router.replace('/admin/login');
            }}
            className="btn btn-outline btn-sm"
          >
            Salir
          </button>
        </div>
      </div>
    </header>
  );
}
