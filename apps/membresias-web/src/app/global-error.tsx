'use client';

import { useEffect } from 'react';

/**
 * Último recinto: errores del propio layout raíz, donde `error.tsx` ya no
 * alcanza porque se cae con él. Reemplaza al documento entero, así que trae su
 * propio <html> y sus estilos en línea — a esta altura no se puede dar por
 * hecho que globals.css ni las tipografías hayan cargado.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[membresias] error global:', error);
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0e0e15',
          color: '#e9e9f0',
          fontFamily: 'system-ui, sans-serif',
          padding: '1.5rem',
        }}
      >
        <div
          style={{
            maxWidth: 460,
            width: '100%',
            border: '1px solid #2a2a3a',
            borderRadius: '0.75rem',
            padding: '1.75rem',
            background: '#15151f',
          }}
        >
          <h1 style={{ fontSize: '1.35rem', margin: '0 0 0.5rem' }}>
            No se pudo cargar la aplicación
          </h1>
          <p style={{ fontSize: '0.85rem', color: '#9a9aad', margin: '0 0 1rem' }}>
            Recarga la página. Si sigue igual, vuelve a entrar desde el login.
          </p>

          {error.message && (
            <p
              style={{
                fontFamily: 'ui-monospace, monospace',
                fontSize: '0.75rem',
                background: '#0e0e15',
                border: '1px solid #2a2a3a',
                borderRadius: '0.5rem',
                padding: '0.6rem 0.7rem',
                margin: '0 0 1rem',
                overflowWrap: 'anywhere',
              }}
            >
              {error.message}
              {error.digest ? ` · ${error.digest}` : ''}
            </p>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              onClick={reset}
              style={{
                padding: '0.5rem 0.9rem',
                borderRadius: '0.5rem',
                border: '1px solid #c9a227',
                background: '#c9a227',
                color: '#0e0e15',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Reintentar
            </button>
            <a
              href="/login"
              style={{
                padding: '0.5rem 0.9rem',
                borderRadius: '0.5rem',
                border: '1px solid #2a2a3a',
                color: '#e9e9f0',
                textDecoration: 'none',
              }}
            >
              Volver a entrar
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
