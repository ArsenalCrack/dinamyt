'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import api, { extraerError, obtenerToken } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

/**
 * «Tu cuenta se borrará el…», arriba de todas las pantallas mientras dure el
 * plazo, con el botón para cancelarlo a mano.
 *
 * Va en el layout y no solo en Configuración porque quien vuelve a entrar para
 * arrepentirse aterriza en el panel, y quien entra sin saber nada —el dueño de
 * verdad, si fue otro quien lo pidió con su contraseña— tiene que verlo antes
 * de ponerse a hacer cualquier otra cosa.
 *
 * Pregunta otra vez al cambiar de pantalla: entrar desde el login no recarga
 * el layout, y sin eso el aviso no salía hasta refrescar.
 */
export function AvisoBorradoPendiente() {
  const { t, idioma } = useI18n();
  const ruta = usePathname();
  const [borrarEl, setBorrarEl] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    // El «listo» de una cancelación es para la pantalla donde se hizo.
    setMensaje('');
    if (!obtenerToken()) {
      setBorrarEl(null);
      return;
    }
    let vivo = true;
    api
      .get('/users/me/borrado')
      .then((r) => {
        if (vivo) setBorrarEl((r.data as { borrarEl: string | null }).borrarEl);
      })
      .catch(() => {
        // Sin respuesta no se inventa un aviso: se queda como estaba.
      });
    return () => {
      vivo = false;
    };
  }, [ruta]);

  if (!borrarEl && !mensaje) return null;

  async function cancelar() {
    setCancelando(true);
    try {
      await api.delete('/users/me/borrado');
      setBorrarEl(null);
      setMensaje(t('borrar.cancelado'));
    } catch (err) {
      setMensaje(extraerError(err, t('borrar.error')));
    } finally {
      setCancelando(false);
    }
  }

  const fecha =
    borrarEl &&
    new Date(borrarEl).toLocaleString(idioma === 'en' ? 'en-US' : 'es-CO', {
      dateStyle: 'long',
      timeStyle: 'short',
      // 24 h: «11:01 p. m.» seguido de un punto se leía «p. m..».
      hourCycle: 'h23',
    });

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6">
      <div
        className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
        role={borrarEl ? 'alert' : 'status'}
        style={{ borderColor: borrarEl ? 'var(--danger)' : 'var(--ok)' }}
      >
        {borrarEl ? (
          <>
            <p className="text-sm">
              <strong style={{ color: 'var(--danger)' }}>
                {t('borrar.pendienteA')}
                {fecha}
              </strong>
              {t('borrar.pendienteB')}
            </p>
            <button
              type="button"
              className="btn btn-gold btn-sm self-start sm:self-auto"
              disabled={cancelando}
              onClick={() => void cancelar()}
            >
              {t('borrar.cancelar')}
            </button>
          </>
        ) : (
          <p className="text-sm">{mensaje}</p>
        )}
      </div>
    </div>
  );
}
