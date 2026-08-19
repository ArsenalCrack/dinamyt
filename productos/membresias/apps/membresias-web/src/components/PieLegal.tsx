'use client';

import { usePathname } from 'next/navigation';
import { useI18n } from '@/lib/i18n';

/**
 * Aviso de derechos de autor, al pie de toda la aplicación.
 *
 * **Sobre el año.** Va desde el año de creación hasta el actual —«2026» a
 * secas el primer año, «2026–2028» después—, que es la forma habitual de
 * declarar una obra que se sigue modificando. El año actual se calcula al
 * vuelo: un aviso que dice 2026 en 2030 se lee como un proyecto abandonado.
 *
 * Se oculta en el KIOSCO y solo ahí: esa pantalla se deja abierta en la puerta
 * del salón y no lleva nada que no sea el escáner.
 */

/** Primer año publicado de la obra. No se toca: es el que fija la antigüedad. */
const AÑO_INICIAL = 2026;

/** Titular de los derechos. */
export const AUTOR = 'Amir Sarmiento';

export function PieLegal() {
  const { t } = useI18n();
  const pathname = usePathname();
  if (pathname === '/kiosco') return null;

  const ahora = new Date().getFullYear();
  const años = ahora > AÑO_INICIAL ? `${AÑO_INICIAL}–${ahora}` : String(AÑO_INICIAL);

  return (
    <footer className="pie-legal">
      <p>
        © {años} <strong>{AUTOR}</strong> · {t('legal.derechos')}
      </p>
      <p className="pie-legal-nota">{t('legal.nota')}</p>
    </footer>
  );
}
