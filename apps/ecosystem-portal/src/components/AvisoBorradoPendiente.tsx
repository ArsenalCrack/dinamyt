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
 *
 * Vencido el plazo ya no ofrece cancelar: el barrido puede haber borrado en
 * una app y estar esperando a otra (`SupresionService`, `enCurso`).
 */
export function AvisoBorradoPendiente() {
  const { t, idioma } = useI18n();
  const ruta = usePathname();
  const [pendiente, setPendiente] = useState<{ borrarEl: string; enCurso: boolean } | null>(
    null,
  );
  const [cancelando, setCancelando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    // El «listo» de una cancelación es para la pantalla donde se hizo.
    setMensaje('');
    if (!obtenerToken()) {
      setPendiente(null);
      return;
    }
    let vivo = true;
    api
      .get('/users/me/borrado')
      .then((r) => {
        const d = r.data as { borrarEl: string | null; enCurso?: boolean };
        if (vivo) setPendiente(d.borrarEl ? { borrarEl: d.borrarEl, enCurso: !!d.enCurso } : null);
      })
      .catch(() => {
        // Sin respuesta no se inventa un aviso: se queda como estaba.
      });
    return () => {
      vivo = false;
    };
  }, [ruta]);

  if (!pendiente && !mensaje) return null;

  async function cancelar() {
    setCancelando(true);
    try {
      await api.delete('/users/me/borrado');
      setPendiente(null);
      setMensaje(t('borrar.cancelado'));
    } catch (err) {
      // 409: el plazo venció entre que se cargó la pantalla y el clic.
      if ((err as { response?: { status?: number } }).response?.status === 409) {
        setPendiente((p) => p && { ...p, enCurso: true });
      }
      setMensaje(extraerError(err, t('borrar.error')));
    } finally {
      setCancelando(false);
    }
  }

  const fecha =
    pendiente &&
    new Date(pendiente.borrarEl).toLocaleString(idioma === 'en' ? 'en-US' : 'es-CO', {
      dateStyle: 'long',
      timeStyle: 'short',
      // 24 h: «11:01 p. m.» seguido de un punto se leía «p. m..».
      hourCycle: 'h23',
    });

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6">
      <div
        className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
        role={pendiente ? 'alert' : 'status'}
        style={{ borderColor: pendiente ? 'var(--danger)' : 'var(--ok)' }}
      >
        {pendiente?.enCurso ? (
          <p className="text-sm">
            {t('borrar.enCursoA')}
            <strong className="text-danger">{fecha}</strong>
            {t('borrar.enCursoB')}
          </p>
        ) : pendiente ? (
          <>
            <p className="text-sm">
              <strong className="text-danger">
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
