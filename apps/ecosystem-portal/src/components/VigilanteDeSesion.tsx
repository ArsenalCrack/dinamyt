'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  obtenerToken,
  olvidarToken,
  refrescarSesionAPI,
  vigilarSesion,
  marcarActividad,
  AVISO_SEGUNDOS,
} from '@/lib/api';

/**
 * El reloj de inactividad, con cara.
 *
 * ── Qué problema resuelve ──────────────────────────────────────────────────
 *
 * El servidor cierra las sesiones que llevan veinte minutos paradas, y eso es
 * lo que hace que un computador prestado deje de ser una cuenta abierta al
 * mundo. Pero un cierre silencioso, sin aviso, tiene su propio coste: alguien
 * que estaba leyendo una pantalla larga vuelve al teclado, pulsa «guardar» y
 * pierde lo que había escrito sin entender por qué.
 *
 * Este componente hace las dos cosas que faltan por el lado del navegador:
 *
 *   · **Avisa un minuto antes**, con una cuenta atrás y un botón para seguir.
 *     Un minuto es tiempo de terminar la frase o de copiar lo escrito.
 *   · **Renueva el pase mientras haya actividad.** El pase dura media hora; sin
 *     renovarlo, la sesión de alguien que sí está trabajando se caería a la
 *     media hora en seco.
 *
 * Lo que NO hace es decidir. La sesión la cierra el servidor, que lleva sus
 * propios relojes y no se fía de este (ver `SessionsService`). Esto solo lo
 * hace visible y lo adelanta.
 *
 * Se monta en el layout, así que corre en todas las pantallas — incluidas las
 * públicas. En esas no hay pase y `vigilarSesion` no tiene nada que vigilar,
 * salvo mandar al login si alguien llega con una sesión ya muerta.
 */
export function VigilanteDeSesion() {
  const router = useRouter();
  const ruta = usePathname();
  const [restan, setRestan] = useState(0);

  /**
   * Las pantallas donde no hay nada que vigilar.
   *
   * Sacar a alguien del login «por inactividad» es absurdo —está ahí para
   * entrar, no para estar dentro—, y sacarlo de `/salir` sería pelearse con la
   * pantalla que ya está cerrando la sesión.
   */
  const publica =
    !ruta ||
    ruta === '/' ||
    ruta.startsWith('/login') ||
    ruta.startsWith('/registro') ||
    ruta.startsWith('/recuperar') ||
    ruta.startsWith('/poner-contrasena') ||
    ruta.startsWith('/salir');

  const sacar = useCallback(
    (motivo: string) => {
      olvidarToken();
      setRestan(0);
      // `router.replace` y no `push`: quien fue echado por inactividad no
      // tiene por qué poder volver atrás a una pantalla que ya no puede
      // cargar sus datos.
      router.replace(`/login?motivo=${encodeURIComponent(motivo)}`);
    },
    [router],
  );

  useEffect(() => {
    if (publica) return;
    if (!obtenerToken()) return;

    return vigilarSesion({
      alAvisar: (segundos) => setRestan(segundos),
      alCerrar: sacar,
      renovar: async () => (await refrescarSesionAPI()) !== null,
    });
  }, [publica, sacar]);

  if (!restan) return null;

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-4"
    >
      <div
        className="card flex w-full max-w-md flex-col gap-3 p-4 shadow-lg"
        style={{ borderColor: 'var(--gold)' }}
      >
        <div>
          <p className="display text-lg">Tu sesión está a punto de cerrarse</p>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            Llevas un rato sin actividad. Se cerrará en{' '}
            <strong>{restan}</strong> segundo{restan === 1 ? '' : 's'} para que
            nadie más pueda usar tu cuenta desde este equipo.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn btn-cta flex-1"
            onClick={() => {
              // Pulsar el botón ES la señal de vida. El propio `pointerdown`
              // ya la registra, pero se marca explícitamente para no depender
              // del orden en que lleguen los eventos.
              marcarActividad();
              setRestan(0);
            }}
          >
            Sigo aquí
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => sacar('Cerraste la sesión.')}
          >
            Salir ahora
          </button>
        </div>
      </div>
    </div>
  );
}

/** Segundos de aviso, por si alguna pantalla quiere explicarlo. */
export const SEGUNDOS_DE_AVISO = AVISO_SEGUNDOS;
