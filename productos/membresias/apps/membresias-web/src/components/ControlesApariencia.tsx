'use client';

import { useEffect, useRef, useState } from 'react';
import { aplicarTema, getTema, temaEfectivo, type Tema } from '@/lib/theme';
import { guardarAparienciaEnLaCuenta } from '@/lib/api';
import { IDIOMAS, useI18n } from '@/lib/i18n';

/**
 * Tema e idioma en un botón flotante 🌐.
 *
 * Solo para las pantallas SIN barra de navegación —login y kiosco—, donde sin
 * esto nadie podría cambiar el tema ni el idioma. Con sesión, ese control vive
 * en el menú de la barra (ver `NavBar`).
 *
 * Se cierra al tocar fuera y con Escape: un panel flotante que solo se cierra
 * volviendo a pulsar su propio botón se queda tapando la pantalla, que es justo
 * lo que pasaba.
 */
export function ControlesApariencia() {
  const { t, idioma, setIdioma } = useI18n();
  const [tema, setTema] = useState<Tema>('sistema');
  const [abierto, setAbierto] = useState(false);
  const raizRef = useRef<HTMLDivElement | null>(null);

  // El servidor siempre renderiza el oscuro; el real se lee tras montar.
  useEffect(() => {
    setTema(getTema());
  }, []);

  useEffect(() => {
    if (!abierto) return;
    function fuera(e: MouseEvent | TouchEvent) {
      if (raizRef.current && !raizRef.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') setAbierto(false);
    }
    document.addEventListener('mousedown', fuera);
    document.addEventListener('touchstart', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('touchstart', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [abierto]);

  function alternarTema() {
    // Dos estados en el botón, no tres: `sistema` es un punto de partida, no un
    // destino al que alguien quiera volver pulsando. Las tres opciones escritas
    // están en el perfil del portal, que es donde se elige de verdad.
    const nuevo: Tema = temaEfectivo(tema) === 'claro' ? 'oscuro' : 'claro';
    aplicarTema(nuevo);
    setTema(nuevo);
    // Y a la CUENTA, para que la elección valga también en el portal, en
    // Campeonatos y en Academy. `localStorage` no cruza subdominios.
    guardarAparienciaEnLaCuenta({ theme: nuevo });
  }

  return (
    <div ref={raizRef} className="apar">
      {abierto && (
        <div className="apar-panel" role="group" aria-label={t('menu.apariencia')}>
          <button type="button" className="apar-item" onClick={alternarTema}>
            {temaEfectivo(tema) === 'oscuro' ? t('menu.modoClaro') : t('menu.modoOscuro')}
          </button>
          <div className="apar-langs">
            {IDIOMAS.map((l) => (
              <button
                key={l.codigo}
                type="button"
                className="apar-lang"
                data-activo={idioma === l.codigo}
                aria-pressed={idioma === l.codigo}
                onClick={() => {
                  setIdioma(l.codigo);
                  guardarAparienciaEnLaCuenta({
                    locale: l.codigo === 'en' ? 'en-US' : 'es-CO',
                  });
                }}
              >
                {l.etiqueta}
              </button>
            ))}
          </div>
        </div>
      )}
      <button
        type="button"
        className="apar-toggle"
        aria-label={t('menu.apariencia')}
        aria-expanded={abierto}
        title={t('menu.apariencia')}
        onClick={() => setAbierto((o) => !o)}
      >
        🌐
      </button>

      <style>{`
        .apar {
          position: fixed;
          right: 14px;
          bottom: 16px;
          z-index: 60;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 8px;
        }
        .apar-toggle {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          border: 1px solid var(--border);
          background: var(--bg-card);
          color: var(--text);
          font-size: 1.1rem;
          cursor: pointer;
          opacity: 0.75;
          transition: opacity 0.15s ease, border-color 0.15s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .apar-toggle:hover,
        .apar-toggle:focus-visible,
        .apar-toggle[aria-expanded="true"] { opacity: 1; border-color: var(--gold); }
        .apar-panel {
          background: var(--bg-card);
          border: 1px solid var(--gold-dim);
          border-radius: 0.6rem;
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          box-shadow: 0 12px 32px rgba(0,0,0,0.45);
          min-width: 190px;
        }
        .apar-item {
          padding: 8px 12px;
          background: transparent;
          border: 1px solid var(--border);
          border-radius: 0.5rem;
          color: var(--text);
          font: inherit;
          font-weight: 600;
          font-size: 0.85rem;
          cursor: pointer;
          text-align: left;
          width: 100%;
        }
        .apar-item:hover,
        .apar-item:focus-visible { background: var(--bg-elevated); outline: none; }
        .apar-langs { display: flex; gap: 6px; }
        .apar-lang {
          flex: 1;
          padding: 6px 10px;
          background: transparent;
          border: 1px solid var(--border);
          border-radius: 0.5rem;
          color: var(--text-muted);
          font: inherit;
          font-weight: 600;
          font-size: 0.8rem;
          cursor: pointer;
        }
        .apar-lang:hover,
        .apar-lang:focus-visible { color: var(--text); background: var(--bg-elevated); outline: none; }
        .apar-lang[data-activo="true"] {
          background: var(--gold-soft);
          border-color: var(--gold-dim);
          color: var(--gold);
          font-weight: 800;
        }
      `}</style>
    </div>
  );
}
