'use client';

import { useState } from 'react';
import { api, mensajeError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { avisoError, avisoOk } from '@/lib/toast';
import { useConfirmar } from './Confirmar';

/**
 * El segundo gesto de la ficha: sacar a alguien del club de verdad (ver
 * `lib/eliminar-del-club.ts` en la API).
 *
 * Se pregunta con el aviso de lo irreversible (§4.9-bis): el nombre en la
 * pregunta, lo que se borra y lo que queda, y el foco arrancando en
 * «Cancelar». Son los datos de otra persona.
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
  const { confirmar, dialogo } = useConfirmar();
  const [enviando, setEnviando] = useState(false);

  async function eliminar() {
    const seguro = await confirmar({
      titulo: `${t('eliminar.tituloA')}${nombre}${t('eliminar.tituloB')}`,
      detalle: (
        <ul>
          <li>{t('eliminar.queBorra')}</li>
          <li>{t('eliminar.queQueda')}</li>
          {enDinamyt && <li>{t('eliminar.portal')}</li>}
        </ul>
      ),
      tono: 'irreversible',
      textoIrreversible: t('eliminar.sinVuelta'),
      textoOk: t('eliminar.si'),
      textoCancelar: t('comun.cancelar'),
    });
    if (!seguro) return;

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
      <button
        type="button"
        className="btn btn-danger btn-sm"
        style={{ marginTop: '0.7rem' }}
        disabled={enviando}
        onClick={() => void eliminar()}
      >
        {enviando ? t('comun.guardando') : t('eliminar.boton')}
      </button>
      {dialogo}
    </div>
  );
}
