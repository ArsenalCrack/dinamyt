'use client';

import { useEffect, useState } from 'react';

/**
 * El idioma, leido A MANO de la cookie compartida.
 *
 * ── Por que aqui no vale `useI18n` ──
 *
 * Porque este archivo REEMPLAZA el documento entero —trae su propio <html>— y
 * por tanto corre fuera del `I18nProvider`. Llamar al hook aqui no daria un
 * texto en ingles: daria un segundo error encima del que ya estamos enseniando,
 * que es la unica cosa que esta pantalla no se puede permitir.
 *
 * La cookie `dinamyt_idioma` es la misma que reparten las cuatro webs, y su
 * valor va firmado (`en~<id>`): aqui solo interesa la parte de delante. Si no
 * existe o no se puede leer, espaniol, que es lo que habia.
 *
 * Se lee en un efecto y no al pintar: en el servidor no hay `document`, y
 * mirarlo durante el render descuadraria la hidratacion.
 */
const TEXTOS = {
  es: {
    titulo: 'No se pudo cargar la aplicación',
    ayuda: 'Recarga la página. Si sigue igual, vuelve a entrar desde el login.',
    reintentar: 'Reintentar',
    volver: 'Volver a entrar',
  },
  en: {
    titulo: 'The application could not load',
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
      /* sin cookies: se queda en espaniol */
    }
  }, []);
  return idioma;
}

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
  const idioma = useIdiomaDeLaCookie();
  const txt = TEXTOS[idioma];

  useEffect(() => {
    console.error('[membresias] error global:', error);
  }, [error]);

  return (
    <html lang={idioma}>
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
            {txt.titulo}
          </h1>
          <p style={{ fontSize: '0.85rem', color: '#9a9aad', margin: '0 0 1rem' }}>
            {txt.ayuda}
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
              {txt.reintentar}
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
              {txt.volver}
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
