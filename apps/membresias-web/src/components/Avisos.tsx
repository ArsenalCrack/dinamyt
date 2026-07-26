'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n, type ClaveTexto } from '@/lib/i18n';
import { fmtFecha } from '@/lib/formato';

interface Aviso {
  id: string;
  userId: string;
  membershipId: string;
  type: 'pre_venc' | 'venc' | 'mora' | 'maestro';
  channel: string;
  scheduledFor: string;
  status: string;
}

/**
 * Campana de avisos con contador. El staff ve los del club (?all=1); el alumno
 * y el acudiente solo los suyos. Los genera el job diario de la API
 * (pre-vencimiento, vencimiento y mora).
 */
export function Avisos({ deTodoElClub = false }: { deTodoElClub?: boolean }) {
  const { t, idioma } = useI18n();
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [abierto, setAbierto] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    api
      .get<Aviso[]>('/notifications', {
        params: deTodoElClub ? { all: '1' } : undefined,
      })
      .then((r) => setAvisos(r.data))
      .catch(() => setAvisos([]));
  }, [deTodoElClub]);

  // Cerrar al hacer clic fuera del panel.
  useEffect(() => {
    if (!abierto) return;
    function fuera(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    }
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierto]);

  const hoy = new Date().toISOString().slice(0, 10);
  const nuevos = avisos.filter((a) => a.scheduledFor?.slice(0, 10) === hoy).length;

  return (
    <div ref={panelRef} style={{ position: 'relative' }}>
      <button
        className="btn btn-outline btn-sm"
        onClick={() => setAbierto(!abierto)}
        aria-expanded={abierto}
        title={t('aviso.titulo')}
      >
        🔔 {t('aviso.titulo')}
        {nuevos > 0 && (
          <span
            className="mono"
            style={{
              background: 'var(--gold)',
              color: 'var(--bg)',
              borderRadius: 999,
              fontSize: '0.68rem',
              fontWeight: 700,
              padding: '0 0.45rem',
              marginLeft: '0.2rem',
            }}
          >
            {nuevos}
          </span>
        )}
      </button>

      {abierto && (
        <div
          className="card"
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 6px)',
            width: 320,
            maxWidth: '86vw',
            zIndex: 40,
            padding: '0.75rem',
            maxHeight: 380,
            overflowY: 'auto',
          }}
        >
          <p className="eyebrow" style={{ marginBottom: '0.5rem' }}>
            {deTodoElClub ? t('aviso.delClub') : t('aviso.misAvisos')}
          </p>
          {avisos.length === 0 ? (
            <p className="muted" style={{ fontSize: '0.85rem' }}>
              {t('aviso.sinAvisos')}
            </p>
          ) : (
            <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {avisos.map((a) => (
                <li
                  key={a.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '0.6rem',
                    borderBottom: '1px solid var(--border)',
                    paddingBottom: '0.4rem',
                    fontSize: '0.85rem',
                  }}
                >
                  <span
                    style={{
                      color:
                        a.type === 'mora'
                          ? 'var(--danger)'
                          : a.type === 'venc'
                            ? 'var(--gold)'
                            : 'var(--text)',
                      fontWeight: 600,
                    }}
                  >
                    {t(`aviso.${a.type}` as ClaveTexto)}
                  </span>
                  <span className="mono muted" style={{ fontSize: '0.72rem', flexShrink: 0 }}>
                    {fmtFecha(a.scheduledFor?.slice(0, 10), idioma)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
