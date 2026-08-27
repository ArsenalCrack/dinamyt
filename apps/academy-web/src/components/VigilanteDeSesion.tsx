'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  obtenerToken,
  olvidarToken,
  refrescarSesionAPI,
  vigilarSesion,
  marcarActividad,
} from '@/lib/api';
import { limpiarRolCache } from '@/lib/session';

/**
 * El reloj de inactividad de Academy, con cara.
 *
 * Espejo del que vive en el portal, y hace falta aquí por su cuenta: las dos
 * apps están en dominios distintos y ningún navegador les deja compartir
 * almacén ni temporizadores. Sin esto, Academy sería el eslabón por el que se
 * escapa todo — un maestro que deja abierto el computador de la sala en la
 * pantalla de evaluaciones estaría exactamente igual que antes.
 *
 * Hace dos cosas:
 *
 *   · **Avisa un minuto antes** del cierre por inactividad, con cuenta atrás
 *     y un botón para seguir. Corregir evaluaciones es leer largo rato sin
 *     tocar nada, y perder lo escrito sin explicación es peor que volver a
 *     entrar.
 *   · **Renueva el pase mientras haya actividad.** El pase dura media hora;
 *     sin renovarlo, la sesión de quien sí está trabajando se caería en seco.
 *
 * Quien decide es el ecosystem, que lleva los relojes de verdad y no se fía de
 * este. Esto lo hace visible y lo adelanta.
 */
export function VigilanteDeSesion() {
  const router = useRouter();
  const ruta = usePathname();
  const [restan, setRestan] = useState(0);

  // En el login no hay nada que vigilar: se está ahí para entrar, no para
  // estar dentro, y echar a alguien de ahí «por inactividad» no significa nada.
  const publica = !ruta || ruta === '/' || ruta.startsWith('/login');

  const sacar = useCallback(
    (motivo: string) => {
      olvidarToken();
      limpiarRolCache();
      setRestan(0);
      router.replace(`/login?motivo=${encodeURIComponent(motivo)}`);
    },
    [router],
  );

  useEffect(() => {
    if (publica) return;
    if (!obtenerToken()) return;
    return vigilarSesion({
      alAvisar: setRestan,
      alCerrar: sacar,
      renovar: refrescarSesionAPI,
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
              // Pulsar el botón ES la señal de vida. El `pointerdown` ya la
              // registra; se marca aquí para no depender del orden de los
              // eventos.
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
