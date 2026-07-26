'use client';

import { useEffect, useState } from 'react';
import { aplicarTema, getTema, type Tema } from '@/lib/theme';
import { IDIOMAS, useI18n } from '@/lib/i18n';

/**
 * Tema e idioma en un solo control.
 *
 * Se usa en dos sitios: dentro del menú de la NavBar (`variante="menu"`) y como
 * botón flotante 🌐 en las pantallas SIN sesión — login y kiosco — donde no hay
 * barra de navegación y, sin esto, nadie podría cambiar el tema ni el idioma.
 */
export function ControlesApariencia({
  variante = 'flotante',
}: {
  variante?: 'flotante' | 'menu';
}) {
  const { t, idioma, setIdioma } = useI18n();
  const [tema, setTema] = useState<Tema>('dark');
  const [abierto, setAbierto] = useState(false);

  // El servidor siempre renderiza 'dark'; el tema real se lee tras montar.
  useEffect(() => {
    setTema(getTema());
  }, []);

  function alternarTema() {
    const nuevo: Tema = tema === 'dark' ? 'light' : 'dark';
    aplicarTema(nuevo);
    setTema(nuevo);
  }

  const panel = (
    <div className="apar-panel" role="group" aria-label={t('menu.apariencia')}>
      <button type="button" className="apar-item" onClick={alternarTema}>
        {tema === 'dark' ? t('menu.modoClaro') : t('menu.modoOscuro')}
      </button>
      <div className="apar-langs">
        {IDIOMAS.map((l) => (
          <button
            key={l.codigo}
            type="button"
            className="apar-lang"
            data-activo={idioma === l.codigo}
            aria-pressed={idioma === l.codigo}
            onClick={() => setIdioma(l.codigo)}
          >
            {l.etiqueta}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className={variante === 'flotante' ? 'apar apar-flotante' : 'apar'}>
      {variante === 'menu' ? (
        panel
      ) : (
        <>
          {abierto && panel}
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
        </>
      )}

      <style>{`
        .apar { display: flex; flex-direction: column; align-items: stretch; gap: 8px; }
        .apar-flotante {
          position: fixed;
          right: 14px;
          bottom: 16px;
          z-index: 60;
          align-items: flex-end;
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
        .apar-toggle:focus-visible { opacity: 1; border-color: var(--gold); }
        .apar-panel {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 0.6rem;
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          box-shadow: 0 6px 24px rgba(0,0,0,0.25);
          min-width: 180px;
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
