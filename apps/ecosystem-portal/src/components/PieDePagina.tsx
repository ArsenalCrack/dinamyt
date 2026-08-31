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
 *
 * ── Cómo se reparte, y por qué cambia en el celular ───────────────────────
 *
 * En escritorio son dos bloques a los extremos (`justify-between`); en el
 * celular no caben en una fila, y `flex-wrap` los dejaba pegados a la
 * izquierda con la dirección de correo colgando fuera de la pantalla. Debajo
 * de `sm` la fila se convierte en **columna centrada**, que es la única forma
 * de que una lista de cuatro enlaces de anchos distintos no parezca rota.
 *
 * La dirección de soporte va **en su propia línea**, separada de su etiqueta:
 * «¿Necesitas ayuda? soporte@dinamyt.org» junto es un solo bloque de texto
 * demasiado largo para 320 px, y un correo partido por la mitad no se puede
 * ni leer ni copiar.
 */
export function PieDePagina() {
  return (
    <footer className="border-t py-8" style={{ borderColor: 'var(--border)' }}>
      <div
        className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-4 text-center text-sm sm:flex-row sm:justify-between sm:gap-4 sm:px-6 sm:text-left"
        style={{ color: 'var(--text-muted)' }}
      >
        <span className="inline-flex items-center gap-2">
          <img src="/logo.png" alt="" width={22} height={22} />
          DINAMYT Ecosystem · Hapkido
        </span>
        <nav className="flex flex-col items-center gap-3 sm:flex-row sm:flex-wrap sm:justify-end sm:gap-x-4 sm:gap-y-2">
          <span className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            <Link href="/planes">Planes</Link>
            <Link href="/privacidad">Privacidad</Link>
            <a href={`${CAMPEONATOS_URL}/pantalla`}>Resultados</a>
          </span>
          <a
            href={`mailto:${CORREO_SOPORTE}`}
            style={{ color: 'var(--gold)' }}
            className="inline-flex max-w-full flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5"
          >
            <span aria-hidden="true">✉</span>
            <span style={{ color: 'var(--text-muted)' }}>¿Necesitas ayuda?</span>
            <span className="break-all">{CORREO_SOPORTE}</span>
          </a>
        </nav>
      </div>
    </footer>
  );
}
