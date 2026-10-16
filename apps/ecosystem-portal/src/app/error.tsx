'use client';

import { useEffect } from 'react';
import { useI18n } from '@/lib/i18n';

/**
 * Lo que se ve cuando una pantalla falla al pintarse.
 *
 * No había: un error de una pantalla enseñaba el «Application error» de Next,
 * en inglés, en blanco y sin salida (auditoría 003, nº 3). Aquí la barra y el
 * pie siguen en su sitio —esto vive dentro del `layout`—, la sesión sigue
 * abierta, y hay tres salidas: reintentar la pantalla, recargar, o volver a
 * entrar. El mensaje técnico va debajo, pequeño, para el día que alguien
 * escriba a soporte «me sale esto».
 */
export default function ErrorDePantalla({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useI18n();

  useEffect(() => {
    console.error('[portal] error no controlado:', error);
  }, [error]);

  return (
    <main className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="card w-full max-w-[460px] p-7">
        <p className="eyebrow mb-1.5">{t('error.eyebrow')}</p>
        <h1 className="display mb-2 text-[1.35rem]">{t('error.titulo')}</h1>
        <p className="mb-4 text-sm text-muted">{t('error.texto')}</p>
        {error.message && (
          <p className="mono mb-4 rounded-lg border border-line bg-elevated px-3 py-2.5 text-xs [overflow-wrap:anywhere]">
            {error.message}
            {error.digest ? ` · ${error.digest}` : ''}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-gold" onClick={reset}>
            {t('error.reintentar')}
          </button>
          <button type="button" className="btn btn-outline" onClick={() => window.location.reload()}>
            {t('error.recargar')}
          </button>
          <a className="btn btn-outline" href="/login">
            {t('error.volverEntrar')}
          </a>
        </div>
      </div>
    </main>
  );
}
