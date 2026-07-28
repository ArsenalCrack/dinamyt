'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n, type ClaveTexto } from '@/lib/i18n';
import { fmtFecha } from '@/lib/formato';
import { activarPush, estadoPush } from '@/lib/push';

interface Aviso {
  id: string;
  userId: string;
  membershipId: string | null;
  type: 'pre_venc' | 'venc' | 'mora' | 'maestro';
  channel: string;
  scheduledFor: string | null;
  status: string;
  readAt: string | null;
  /** Nombre de quien lo recibe (le sirve al maestro, que ve los del club). */
  fullName: string;
  /** Vencimiento que motivó el aviso: es lo que lo hace legible. */
  venceEl: string | null;
}

/**
 * Campana de avisos.
 *
 * Vive en la barra de navegación, así que acompaña al usuario por toda la app.
 * El staff ve los del club (`?all=1`); el alumno y el acudiente, los suyos.
 *
 * Dos cosas cambian respecto de la primera versión:
 *
 * 1. **Se lee.** Antes cada línea decía el tipo de aviso y una fecha suelta.
 *    Ahora dice de quién es y qué pasa con su mensualidad, que es lo que uno
 *    va a mirar.
 * 2. **Se ve en el celular.** El panel estaba anclado al borde derecho y en
 *    pantalla estrecha se salía; ahora se centra sobre un velo (ver
 *    `.avisos-panel` en globals.css).
 */
export function Avisos({ deTodoElClub = false }: { deTodoElClub?: boolean }) {
  const { t, idioma } = useI18n();
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [push, setPush] = useState<'activo' | 'inactivo' | 'imposible'>('inactivo');
  const [msgPush, setMsgPush] = useState('');
  const raizRef = useRef<HTMLDivElement | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await api.get<Aviso[]>('/notifications', {
        params: deTodoElClub ? { all: '1' } : undefined,
      });
      setAvisos(r.data);
    } catch {
      setAvisos([]); // sin avisos que mostrar; la campana no estorba
    }
  }, [deTodoElClub]);

  useEffect(() => {
    void cargar();
    void estadoPush().then(setPush);
  }, [cargar]);

  // Cerrar al tocar fuera o con Escape.
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

  const hoy = new Date().toISOString().slice(0, 10);

  /**
   * Qué cuenta el número rojo.
   *
   * Para el alumno, los que no ha abierto. Para el maestro NO puede ser eso:
   * los avisos del club son de sus alumnos, y «sin leer» ahí significa «mis
   * alumnos no los han abierto», que no es una tarea suya. Para él cuenta los
   * de hoy: lo que ha pasado en el club desde esta mañana.
   */
  const pendientes = deTodoElClub
    ? avisos.filter((a) => a.scheduledFor?.slice(0, 10) === hoy).length
    : avisos.filter((a) => !a.readAt).length;

  async function alternar() {
    const nuevo = !abierto;
    setAbierto(nuevo);
    setMsgPush('');
    // Abrir la campana ES leerlos. Solo los propios: ver arriba.
    if (nuevo && !deTodoElClub && avisos.some((a) => !a.readAt)) {
      try {
        await api.post('/notifications/leidos');
        const ahora = new Date().toISOString();
        setAvisos((lista) => lista.map((a) => ({ ...a, readAt: a.readAt ?? ahora })));
      } catch {
        /* que falle no impide leerlos en pantalla */
      }
    }
  }

  async function activarNotificaciones() {
    setMsgPush('');
    const r = await activarPush();
    if (r.ok) {
      setPush('activo');
      setMsgPush(t('mi.pushActivo'));
    } else {
      setMsgPush(r.motivo ?? t('mi.activarPush'));
    }
  }

  /** El aviso en una frase: de quién es, qué pasa y cuándo. */
  function texto(a: Aviso): string {
    const fecha = a.venceEl ? fmtFecha(a.venceEl, idioma) : '';
    const cuando =
      a.type === 'venc' || a.type === 'mora'
        ? `${t('aviso.vencioEl')} ${fecha}`
        : `${t('aviso.venceEl')} ${fecha}`;
    if (!fecha) return t('aviso.sinFecha');
    return deTodoElClub ? `${a.fullName} · ${cuando}` : cuando;
  }

  return (
    <div ref={raizRef} className="avisos">
      <button
        type="button"
        className="btn btn-outline btn-sm"
        onClick={alternar}
        aria-expanded={abierto}
        aria-label={t('aviso.titulo')}
        title={t('aviso.titulo')}
      >
        🔔
        {pendientes > 0 && <span className="avisos-badge mono">{pendientes}</span>}
      </button>

      {abierto && (
        <>
          {/* En móvil el panel se centra y este velo apaga lo de detrás; en PC
              el velo no se dibuja (ver globals.css). */}
          <div className="avisos-velo" onClick={() => setAbierto(false)} aria-hidden="true" />
          <div className="avisos-panel" role="dialog" aria-label={t('aviso.titulo')}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '0.5rem',
              }}
            >
              <p className="eyebrow">
                {deTodoElClub ? t('aviso.delClub') : t('aviso.misAvisos')}
              </p>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setAbierto(false)}
              >
                ✕
              </button>
            </div>

            {avisos.length === 0 ? (
              <p className="muted" style={{ fontSize: '0.85rem' }}>
                {t('aviso.sinAvisos')}
              </p>
            ) : (
              <ul>
                {avisos.map((a) => (
                  <li
                    key={a.id}
                    className="avisos-item"
                    data-nuevo={!deTodoElClub && !a.readAt}
                  >
                    <span
                      className="avisos-titulo"
                      style={{
                        color:
                          a.type === 'mora' || a.type === 'venc'
                            ? 'var(--danger)'
                            : a.type === 'pre_venc'
                              ? 'var(--gold)'
                              : 'var(--text)',
                      }}
                    >
                      {t(`aviso.${a.type}` as ClaveTexto)}
                    </span>
                    <span className="avisos-texto">{texto(a)}</span>
                    <span className="avisos-fecha">
                      {fmtFecha(a.scheduledFor?.slice(0, 10), idioma)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {/* Los avisos push viven o mueren en este botón: sin permiso del
                navegador, el aviso solo existe dentro de esta campana. */}
            {push !== 'imposible' && (
              <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '0.7rem' }}>
                {push === 'activo' ? (
                  <p className="muted" style={{ fontSize: '0.75rem' }}>
                    ✓ {t('mi.pushActivo')}
                  </p>
                ) : (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    style={{ width: '100%' }}
                    onClick={activarNotificaciones}
                  >
                    🔔 {t('mi.activarPush')}
                  </button>
                )}
                {msgPush && (
                  <p className="muted" style={{ fontSize: '0.72rem', marginTop: '0.4rem' }}>
                    {msgPush}
                  </p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
