'use client';

/* eslint-disable @next/next/no-img-element */
import { usePathname } from 'next/navigation';
import { useI18n } from '@/lib/i18n';

/**
 * El pie de la aplicación.
 *
 * ── El mismo pie que el del portal, y por qué ─────────────────────────────
 *
 * Eran dos pies distintos en dos aplicaciones que son la misma cuenta: el del
 * portal llevaba la marca, los enlaces y el correo de soporte pero ningún
 * aviso de derechos; el de Membresías llevaba el aviso de derechos y nada más.
 * Así que quien entraba por el club no encontraba a dónde escribir si no podía
 * entrar —que es justo cuando hace falta—, y quien entraba por el portal no
 * veía de quién es la obra. Y saltar de una a otra se sentía como cambiar de
 * empresa.
 *
 * Ahora los dos dicen lo mismo en el mismo orden: arriba quién es y dónde
 * pedir ayuda; abajo, de quién es esto. Cambia solo lo que tiene que cambiar:
 * el nombre de la aplicación y sus enlaces.
 *
 * ── Sobre el año ──
 *
 * Va desde el año de creación hasta el actual —«2026» a secas el primer año,
 * «2026–2028» después—, que es la forma habitual de declarar una obra que se
 * sigue modificando. El año actual se calcula al vuelo: un aviso que dice 2026
 * en 2030 se lee como un proyecto abandonado.
 *
 * Se oculta en el KIOSCO y solo ahí: esa pantalla se deja abierta en la puerta
 * del salón y no lleva nada que no sea el escáner.
 */

/** Primer año publicado de la obra. No se toca: es el que fija la antigüedad. */
const AÑO_INICIAL = 2026;

/** Titular de los derechos. */
export const AUTOR = 'Amir Sarmiento';

/**
 * El buzón de quien no puede entrar. Es el mismo del portal y con el mismo
 * valor por defecto, así que un club sin la variable puesta sigue enseñando
 * una dirección que existe.
 */
const CORREO_SOPORTE =
  process.env.NEXT_PUBLIC_SUPPORT_CONTACT_EMAIL || 'soporte@dinamyt.org';

/** El portal, si esta instalación vive dentro de DINAMYT. */
const PORTAL_URL = process.env.NEXT_PUBLIC_ECOSYSTEM_PORTAL_URL || '';

export function PieLegal() {
  const { t } = useI18n();
  const pathname = usePathname();
  if (pathname === '/kiosco') return null;

  const ahora = new Date().getFullYear();
  const años = ahora > AÑO_INICIAL ? `${AÑO_INICIAL}–${ahora}` : String(AÑO_INICIAL);

  return (
    <footer className="pie">
      <div className="pie-fila">
        <span className="pie-marca">
          <img src="/logo.png" alt="" width={22} height={22} />
          DINAMYT Membresías · Hapkido
        </span>
        <nav className="pie-enlaces">
          {/* Solo si hay portal detrás: un club que usa Membresías por su
              cuenta no tiene ninguna cuenta DINAMYT que abrir, y el enlace lo
              llevaría a una pantalla de acceso ajena. */}
          {PORTAL_URL && (
            <>
              <a href={PORTAL_URL} target="_blank" rel="noopener noreferrer">
                {t('legal.portal')}
              </a>
              <a
                href={`${PORTAL_URL}/privacidad`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('legal.privacidad')}
              </a>
            </>
          )}
          {/* La dirección va en su propio trozo y con `break-all`: un correo
              partido por la mitad no se puede ni leer ni copiar. */}
          <a href={`mailto:${CORREO_SOPORTE}`} className="pie-soporte">
            <span aria-hidden="true">✉</span>
            <span>{t('legal.ayuda')}</span>
            <span className="pie-correo">{CORREO_SOPORTE}</span>
          </a>
        </nav>
      </div>

      <div className="pie-legal">
        <p>
          © {años} <strong>{AUTOR}</strong> · {t('legal.derechos')}
        </p>
        <p className="pie-legal-nota">{t('legal.nota')}</p>
      </div>
    </footer>
  );
}
