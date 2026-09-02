'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
 * 3. **Se cae sola y lleva a alguna parte.** Un aviso cuyo motivo ya no existe
 *    —el alumno pagó— no se devuelve (`vigentes` en la API), así que la
 *    campana dice lo que pasa HOY y no lo que pasaba el martes. Y cada línea
 *    es un enlace al sitio donde se hace algo con eso: la ficha del alumno con
 *    el cobro a la vista para el maestro, «Mi estado» para el alumno. Antes se
 *    leía el aviso, se cerraba el panel y había que ir a buscar a la persona.
 * 4. **Se vacía de uno en uno.** Abrir la campana ya no marca los nueve avisos
 *    como leídos de golpe. Eso hacía dos cosas mal a la vez: los ocho que no se
 *    llegaron a mirar desaparecían para siempre, y el número —que es lo único
 *    que se mira de reojo— saltaba de 9 a 0 sin pasar por el medio, así que
 *    dejaba de informar de nada. Ahora leer uno baja el número en uno, que es
 *    lo que hace cualquier bandeja de entrada del mundo. Para el atracón hay un
 *    «marcar todo como leído», que es una decisión de la persona y no un efecto
 *    secundario de haber abierto el panel.
 */
export function Avisos({ deTodoElClub = false }: { deTodoElClub?: boolean }) {
  const { t, idioma } = useI18n();
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [push, setPush] = useState<'activo' | 'inactivo' | 'imposible'>('inactivo');
  const [msgPush, setMsgPush] = useState('');
  const raizRef = useRef<HTMLDivElement | null>(null);

  const cargar = useCallback(async (): Promise<Aviso[]> => {
    try {
      const r = await api.get<Aviso[]>('/notifications', {
        params: deTodoElClub ? { all: '1' } : undefined,
      });
      setAvisos(r.data);
      return r.data;
    } catch {
      setAvisos([]); // sin avisos que mostrar; la campana no estorba
      return [];
    }
  }, [deTodoElClub]);

  useEffect(() => {
    void estadoPush().then(setPush);
  }, []);

  /**
   * Se relee al cambiar de pantalla.
   *
   * La campana vive en la barra, así que no se vuelve a montar al navegar: sin
   * esto, el maestro cobraba una mensualidad, volvía al panel y el número
   * seguía diciendo lo mismo que cuando abrió el navegador. Y lo que se ve mal
   * en una campana no es un aviso de más: es la sospecha de que ninguno de los
   * otros vale.
   *
   * Cambiar de pantalla es la señal barata que cubre todos los casos —cobrar,
   * cambiar un plan, dar de baja a alguien— sin que cada uno tenga que
   * acordarse de avisar.
   */
  const ruta = usePathname();
  useEffect(() => {
    void cargar();
  }, [cargar, ruta]);

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

  /**
   * Qué cuenta el número rojo.
   *
   * Para el alumno, los que no ha abierto. Para el maestro NO puede ser eso:
   * los avisos del club son de sus alumnos, y «sin leer» ahí significa «mis
   * alumnos no los han abierto», que no es una tarea suya. Para él cuenta
   * **todos los que la API devuelve**, que ya son solo los que siguen siendo
   * verdad (ver `vigentes` en `routes/notifications.ts`).
   *
   * Antes contaba los de HOY, y ese filtro por fecha era el que rompía las dos
   * puntas: el aviso del alumno que pagó esta mañana seguía sumando hasta la
   * medianoche, y el del que lleva vencido desde el jueves desaparecía del
   * número sin que nadie hubiera cobrado nada.
   */
  const pendientes = deTodoElClub
    ? avisos.length
    : avisos.filter((a) => !a.readAt).length;

  /**
   * A dónde lleva cada aviso.
   *
   * Al maestro, a la ficha del alumno con el formulario de cobro ya a la vista
   * (`#cobrar`, el mismo ancla que usa el botón «Cobrar» del panel): el aviso
   * dice que alguien debe, y lo siguiente que se hace es cobrarle. Al alumno,
   * a «Mi estado», que es donde ve su vencimiento y su carnet.
   */
  function destino(a: Aviso): string {
    return deTodoElClub ? `/alumnos/${a.userId}#cobrar` : '/mi';
  }

  async function alternar() {
    const nuevo = !abierto;
    setAbierto(nuevo);
    setMsgPush('');
    if (!nuevo) return;

    // Abrirla es releerla: entre que se pintó la pantalla y ahora, el maestro
    // pudo haber cobrado en otra pestaña. Lo que se enseña al abrir tiene que
    // ser lo de este segundo, no lo de hace media hora.
    //
    // Lo que abrir ya NO hace es marcarlos leídos. Ver la nota 4 de arriba.
    await cargar();
  }

  /**
   * Este aviso, leído. El número baja en uno.
   *
   * Se pinta primero y se guarda después, a propósito: el toque tiene que
   * responder en el mismo instante, y lo que hay al otro lado es una fila que
   * ya se sabe de quién es. Si la llamada falla se vuelve a leer la lista, que
   * es la única forma honesta de deshacerlo — dejar el número bajado mintiendo
   * es peor que el parpadeo de recuperarlo.
   */
  async function marcarUno(id: string) {
    const ahora = new Date().toISOString();
    setAvisos((lista) =>
      lista.map((a) => (a.id === id ? { ...a, readAt: a.readAt ?? ahora } : a)),
    );
    try {
      await api.post(`/notifications/${id}/leido`);
    } catch {
      void cargar();
    }
  }

  /** El atracón: los treinta que se juntaron y no se van a abrir uno a uno. */
  async function marcarTodos() {
    const ahora = new Date().toISOString();
    setAvisos((lista) => lista.map((a) => ({ ...a, readAt: a.readAt ?? ahora })));
    try {
      await api.post('/notifications/leidos');
    } catch {
      void cargar();
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
              <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                {/* Solo con DOS o más pendientes. Con uno, «marcar todo» y
                    «marcar éste» son el mismo botón puesto dos veces, y el de
                    la fila ya está donde se está mirando. */}
                {!deTodoElClub && pendientes > 1 && (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => void marcarTodos()}
                  >
                    {t('aviso.marcarTodo')}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setAbierto(false)}
                >
                  ✕
                </button>
              </div>
            </div>

            {avisos.length === 0 ? (
              <p className="muted" style={{ fontSize: '0.85rem' }}>
                {t('aviso.sinAvisos')}
              </p>
            ) : (
              <ul className="avisos-lista">
                {avisos.map((a) => (
                  <li key={a.id} className="avisos-fila">
                    <Link
                      href={destino(a)}
                      className="avisos-item"
                      data-nuevo={!deTodoElClub && !a.readAt}
                      // El panel se cierra al saltar: dejarlo abierto encima de
                      // la pantalla a la que se acaba de llegar tapa justo lo
                      // que se venía a hacer.
                      //
                      // Y abrirlo ES leerlo: ir a mirarlo y que el número siga
                      // en nueve al volver es lo que hace que la campana
                      // parezca un adorno pegado a la barra.
                      onClick={() => {
                        setAbierto(false);
                        if (!deTodoElClub && !a.readAt) void marcarUno(a.id);
                      }}
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
                    </Link>
                    {/* «Ya lo leí», sin ir a ninguna parte.
                        El aviso del alumno lleva siempre a la misma pantalla —«Mi
                        estado»—, así que sin esto la única manera de bajar el
                        número era navegar allí y volver, nueve veces. Este botón
                        es para el caso normal: ya sé lo que dice, quítamelo.
                        En la lista del club no aparece: esos avisos son de los
                        alumnos y «leído» lo dice su dueño, no el maestro. */}
                    {!deTodoElClub && !a.readAt && (
                      <button
                        type="button"
                        className="avisos-visto"
                        onClick={() => void marcarUno(a.id)}
                        aria-label={t('aviso.marcarLeido')}
                        title={t('aviso.marcarLeido')}
                      >
                        ✓
                      </button>
                    )}
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
