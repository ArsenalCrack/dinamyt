'use client';

/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { useI18n } from '@/lib/i18n';

const CAMPEONATOS_URL =
  process.env.NEXT_PUBLIC_CAMPEONATOS_URL || 'http://localhost:3003';

/**
 * La barra de las páginas que se leen sin cuenta: la portada, `/planes` y
 * `/privacidad`.
 *
 * Era la de la portada y nada más, así que quien llegaba a `/planes` o a la
 * política por un enlace de WhatsApp no veía de quién era la página: arriba
 * solo había un «← Inicio» gris (auditoría 003, nº 9). Ahora las tres llevan
 * la marca —que lleva a la portada— y la puerta de entrar.
 *
 * El fondo, el desenfoque y el borde los pone `.barra-superior`
 * (`packages/shared/estilos.css`), que responde al tema. Con sesión abierta
 * estas páginas tampoco llevan la barra de dentro (`tieneBarra`), así que el
 * botón es siempre «Iniciar sesión»: `/login` devuelve al panel a quien ya
 * entró.
 */
export function BarraPublica({ conPlanes = true }: { conPlanes?: boolean }) {
  const { t } = useI18n();
  return (
    <header className="barra-superior">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="inline-flex items-center gap-2.5" aria-label="DINAMYT, inicio">
          <img src="/logo.png" alt="" width={30} height={30} />
          {/* La marca del ecosistema, con la clase compartida. El portal no
              lleva sufijo de aplicación: él ES DINAMYT. */}
          <span className="marca text-lg" translate="no">
            DINAMYT
          </span>
        </Link>
        <nav className="flex items-center gap-2">
          <a href={`${CAMPEONATOS_URL}/resultados`} className="btn btn-outline hidden sm:inline-flex">
            {t('pie.resultados')}
          </a>
          {conPlanes && (
            <Link href="/planes" className="btn btn-outline hidden sm:inline-flex">
              {t('planes.titulo')}
            </Link>
          )}
          <Link href="/login" className="btn btn-gold">
            {t('portada.entrar')}
          </Link>
        </nav>
      </div>
    </header>
  );
}
