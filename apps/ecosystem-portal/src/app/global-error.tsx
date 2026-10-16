'use client';

import { useEffect, useState } from 'react';

/**
 * El último recurso: cuando falla el `layout` mismo.
 *
 * Aquí no hay `layout`, ni proveedor de idioma, ni hoja de estilos en la que
 * confiar —puede ser justo lo que falló—, así que todo va escrito dentro: los
 * dos idiomas y los colores del tema oscuro (DESIGN.md). El idioma sale de la
 * cookie compartida del ecosistema, como en Membresías. Sin esto, Next enseña
 * «Application error» en inglés y en blanco (auditoría 003, nº 3).
 */
const TEXTOS = {
  es: {
    titulo: 'No se pudo cargar DINAMYT',
    ayuda: 'Recarga la página. Si sigue igual, vuelve a entrar desde el login.',
    reintentar: 'Reintentar',
    volver: 'Volver a entrar',
  },
  en: {
    titulo: 'DINAMYT could not load',
    ayuda: 'Reload the page. If it keeps happening, sign in again from the login screen.',
    reintentar: 'Try again',
    volver: 'Sign in again',
  },
} as const;

function useIdiomaDeLaCookie(): 'es' | 'en' {
  const [idioma, setIdioma] = useState<'es' | 'en'>('es');
  useEffect(() => {
    try {
      const m = /(?:^|; )dinamyt_idioma=([^;]*)/.exec(document.cookie);
      const valor = m ? decodeURIComponent(m[1]).split('~')[0] : '';
      if (valor === 'en') setIdioma('en');
    } catch {
      /* sin cookies: se queda en español */
    }
  }, []);
  return idioma;
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const idioma = useIdiomaDeLaCookie();
  const txt = TEXTOS[idioma];

  useEffect(() => {
    console.error('[portal] error global:', error);
  }, [error]);

  return (
    <html lang={idioma}>
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          background: '#0e0e15',
          color: '#f3f1e8',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 460,
            padding: '1.75rem',
            background: '#15151f',
            border: '1px solid #262635',
            borderRadius: '0.75rem',
          }}
        >
          <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.35rem' }}>{txt.titulo}</h1>
          <p style={{ margin: '0 0 1rem', fontSize: '0.875rem', color: '#a19db8' }}>{txt.ayuda}</p>
          {error.message && (
            <p
              style={{
                margin: '0 0 1rem',
                padding: '0.6rem 0.7rem',
                fontFamily: 'ui-monospace, monospace',
                fontSize: '0.75rem',
                background: '#0e0e15',
                border: '1px solid #262635',
                borderRadius: '0.5rem',
                overflowWrap: 'anywhere',
              }}
            >
              {error.message}
              {error.digest ? ` · ${error.digest}` : ''}
            </p>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={reset}
              style={{
                padding: '0.5rem 1rem',
                border: '1px solid rgba(255,255,255,0.14)',
                borderRadius: '0.5rem',
                background: '#00875a',
                color: '#ffffff',
                font: 'inherit',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {txt.reintentar}
            </button>
            <a
              href="/login"
              style={{
                padding: '0.5rem 1rem',
                border: '1px solid #3a3a4e',
                borderRadius: '0.5rem',
                color: '#f3f1e8',
                textDecoration: 'none',
                fontWeight: 600,
              }}
            >
              {txt.volver}
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
