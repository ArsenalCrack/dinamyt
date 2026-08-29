/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { CORREO_SOPORTE } from '@/lib/contacto';

const CAMPEONATOS_URL =
  process.env.NEXT_PUBLIC_CAMPEONATOS_URL || 'http://localhost:3003';

/**
 * El pie del portal. Va en el `layout`, así que sale en TODAS las pantallas
 * —incluidas login, registro, recuperar y poner-contraseña—, y esa es la
 * razón de que exista: hasta hoy las dos únicas direcciones del portal
 * estaban en la página de planes y en la política de privacidad, que no es
 * donde busca ayuda quien no consigue entrar a su cuenta.
 *
 * Es un componente de servidor (no lleva estado ni hooks): no pesa ni un byte
 * en el paquete del navegador.
 */
export function PieDePagina() {
  return (
    <footer className="border-t py-8" style={{ borderColor: 'var(--border)' }}>
      <div
        className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 text-sm sm:px-6"
        style={{ color: 'var(--text-muted)' }}
      >
        <span className="inline-flex items-center gap-2">
          <img src="/logo.png" alt="" width={22} height={22} />
          DINAMYT Ecosystem · Hapkido
        </span>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href="/planes">Planes</Link>
          <Link href="/privacidad">Privacidad</Link>
          <a href={`${CAMPEONATOS_URL}/pantalla`}>Resultados</a>
          <a
            href={`mailto:${CORREO_SOPORTE}`}
            style={{ color: 'var(--gold)' }}
            className="inline-flex items-center gap-1"
          >
            <span aria-hidden="true">✉</span> ¿Necesitas ayuda? {CORREO_SOPORTE}
          </a>
        </nav>
      </div>
    </footer>
  );
}
