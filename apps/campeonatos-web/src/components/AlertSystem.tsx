'use client';

import { useState, useCallback } from 'react';

/**
 * Port del AlertSystem de DINAMYT-COMBAT: modales a pantalla completa para
 * el juez central — anuncio de GANADOR (con el color del competidor) y
 * confirmaciones de acciones peligrosas (reset, descalificar…).
 */
export interface ConfirmData {
  titulo: string;
  mensaje: string;
  tipo?: 'info' | 'peligro';
  confirmLabel?: string;
  soloOk?: boolean;
  onConfirm: () => void;
}

export interface GanadorData {
  nombre: string;
  color: 'hong' | 'chung';
  motivo: string;
}

export function useAlertSystem() {
  const [confirmData, setConfirmData] = useState<ConfirmData | null>(null);
  const [ganadorData, setGanadorData] = useState<GanadorData | null>(null);

  return {
    confirmData,
    ganadorData,
    showConfirm: useCallback((d: ConfirmData) => setConfirmData(d), []),
    showGanador: useCallback((d: GanadorData) => setGanadorData(d), []),
    clearConfirm: useCallback(() => setConfirmData(null), []),
    clearGanador: useCallback(() => setGanadorData(null), []),
  };
}

export function AlertOverlays({
  confirmData,
  ganadorData,
  onCloseConfirm,
  onCloseGanador,
}: {
  confirmData: ConfirmData | null;
  ganadorData: GanadorData | null;
  onCloseConfirm: () => void;
  onCloseGanador: () => void;
}) {
  return (
    <>
      {/* ── Anuncio de GANADOR a pantalla completa ─────────────────────── */}
      {ganadorData && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 text-center"
          style={{ background: 'rgba(10,10,16,0.94)' }}
        >
          <div
            className="text-sm font-extrabold uppercase tracking-[0.3em]"
            style={{ color: 'var(--gold)' }}
          >
            🏆 Ganador
          </div>
          <div
            className="mt-4 max-w-3xl text-5xl font-extrabold sm:text-7xl"
            style={{ color: ganadorData.color === 'hong' ? 'var(--hong)' : 'var(--chung)' }}
          >
            {ganadorData.nombre}
          </div>
          <div className="mt-3 text-lg" style={{ color: 'var(--text-muted)' }}>
            {ganadorData.motivo}
          </div>
          <button onClick={onCloseGanador} className="btn btn-gold mt-8 px-8 py-3 text-base">
            ✓ Cerrar combate
          </button>
        </div>
      )}

      {/* ── Confirmación modal ─────────────────────────────────────────── */}
      {confirmData && !ganadorData && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-6"
          style={{ background: 'rgba(10,10,16,0.8)' }}
        >
          <div className="card w-full max-w-sm p-6 text-center">
            <div
              className="text-sm font-extrabold uppercase tracking-widest"
              style={{
                color: confirmData.tipo === 'peligro' ? 'var(--danger)' : 'var(--gold)',
              }}
            >
              {confirmData.titulo}
            </div>
            <p className="mt-3 text-sm" style={{ color: 'var(--text-muted)' }}>
              {confirmData.mensaje}
            </p>
            <div className="mt-5 flex justify-center gap-2">
              {!confirmData.soloOk && (
                <button onClick={onCloseConfirm} className="btn btn-outline">
                  Cancelar
                </button>
              )}
              <button
                onClick={() => {
                  confirmData.onConfirm();
                  onCloseConfirm();
                }}
                className="btn btn-gold"
              >
                {confirmData.confirmLabel ?? 'Aceptar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
