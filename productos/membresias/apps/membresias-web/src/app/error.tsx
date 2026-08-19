'use client';

import { useEffect } from 'react';

/**
 * Red de seguridad de la app.
 *
 * Sin este archivo, cualquier error de una pantalla lo atrapa el fallback que
 * trae Next y el maestro se queda mirando un «This page couldn't load» en
 * inglés, sin decir qué pasó ni cómo salir. Aquí se dice en español, se muestra
 * el motivo real y se ofrecen las tres salidas que sirven: reintentar la
 * pantalla, recargar entera (lo que arregla los casos de versión vieja en caché
 * tras un despliegue) y volver al login.
 *
 * El error se escribe además en la consola: es lo que hay que copiar y pegar
 * para diagnosticar cuando falla en producción.
 */
export default function ErrorApp({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[membresias] error no controlado:', error);
  }, [error]);

  return (
    <main
      style={{
        minHeight: '70vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
      }}
    >
      <div className="card" style={{ padding: '1.75rem', width: '100%', maxWidth: 460 }}>
        <p className="eyebrow" style={{ marginBottom: '0.35rem' }}>
          Algo se rompió
        </p>
        <h1 className="display" style={{ fontSize: '1.35rem', marginBottom: '0.5rem' }}>
          No se pudo cargar esta pantalla
        </h1>
        <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
          Tu sesión sigue abierta. Reintenta; si vuelve a pasar, recarga la página.
        </p>

        {error.message && (
          <p
            className="mono"
            style={{
              fontSize: '0.75rem',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: '0.5rem',
              padding: '0.6rem 0.7rem',
              marginBottom: '1rem',
              overflowWrap: 'anywhere',
            }}
          >
            {error.message}
            {error.digest ? ` · ${error.digest}` : ''}
          </p>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-cta" onClick={reset}>
            Reintentar
          </button>
          <button className="btn btn-outline" onClick={() => window.location.reload()}>
            Recargar la página
          </button>
          <a className="btn btn-outline" href="/login">
            Volver a entrar
          </a>
        </div>
      </div>
    </main>
  );
}
