'use client';

import { useState } from 'react';
import { api, mensajeError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { avisoError, avisoOk } from '@/lib/toast';

/**
 * El segundo gesto de la ficha: sacar a alguien del club de verdad (ver
 * `lib/eliminar-del-club.ts` en la API). Se pregunta antes y se dice qué se
 * borra y qué queda (§4.9-bis): son los datos de otra persona.
 *
 * Va al final de la ficha y fuera del `<fieldset disabled>`: a quien ya se le
 * cortó el acceso también se le puede eliminar, y suele ser justo a ese.
 */
export function EliminarDelClub({
  id,
  nombre,
  enDinamyt,
  onEliminado,
}: {
  id: string;
  nombre: string;
  /** También es del club en el portal: allí sale a la vez. */
  enDinamyt: boolean;
  onEliminado: () => void;
}) {
  const { t } = useI18n();
  const [preguntando, setPreguntando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function eliminar() {
    setEnviando(true);
    try {
      await api.post(`/users/${id}/eliminar`);
      avisoOk(t('eliminar.hecho'));
      onEliminado();
    } catch (err) {
      avisoError(mensajeError(err, t('eliminar.titulo')));
      setEnviando(false);
    }
  }

  return (
    <div
      className="card"
      style={{ padding: '0.9rem 1rem', marginTop: '1.25rem', borderColor: 'var(--danger)' }}
    >
      <h2 style={{ fontSize: '0.95rem', fontWeight: 700 }}>{t('eliminar.titulo')}</h2>
      <p className="muted" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
        {t('eliminar.ayuda')}
      </p>

      {!preguntando ? (
        <button
          type="button"
          className="btn btn-outline btn-sm"
          style={{ marginTop: '0.7rem', color: 'var(--danger)', borderColor: 'var(--danger)' }}
          onClick={() => setPreguntando(true)}
        >
          {t('eliminar.boton')}
        </button>
      ) : (
        <div role="alertdialog" aria-live="polite" style={{ marginTop: '0.7rem' }}>
          <p style={{ fontWeight: 700 }}>
            {t('eliminar.pregunta')} <span className="mono">{nombre}</span>
          </p>
          <p style={{ fontSize: '0.82rem', marginTop: '0.35rem' }}>{t('eliminar.queBorra')}</p>
          {enDinamyt && (
            <p style={{ fontSize: '0.82rem', marginTop: '0.35rem' }}>{t('eliminar.portal')}</p>
          )}
          <p style={{ fontSize: '0.82rem', marginTop: '0.35rem', color: 'var(--danger)' }}>
            {t('eliminar.sinVuelta')}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.7rem' }}>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={enviando}
              onClick={() => void eliminar()}
            >
              {enviando ? t('comun.guardando') : t('eliminar.si')}
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={enviando}
              onClick={() => setPreguntando(false)}
            >
              {t('comun.cancelar')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
