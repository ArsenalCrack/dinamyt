'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DURACION, suscribirAvisos, type Aviso } from '@/lib/toast';
import { useI18n } from '@/lib/i18n';

/**
 * Pila de avisos flotantes. Va montada una sola vez en el layout; quien avisa
 * llama a `avisoOk()` / `avisoError()` (ver `lib/toast.ts`).
 *
 * ── Decisiones de diseño, y por qué ──
 *
 * · **Abajo.** En Android el snackbar vive abajo, cerca del pulgar y lejos de
 *   la barra de estado. En escritorio, además, es donde no tapa el formulario
 *   que se acaba de rellenar. Arriba estorbaría a la barra fija de la app.
 * · **Centrado en móvil, a la derecha en escritorio.** Es la convención de cada
 *   sitio: ancho completo en el teléfono (donde no sobra espacio), y esquina
 *   inferior derecha en el PC, como las notificaciones del sistema.
 * · **Por encima de todo y fuera del flujo.** Se pinta en un portal sobre el
 *   `<body>`: dentro de la página, cualquier contenedor con `overflow` lo
 *   recortaría — que es como estos avisos acaban invisibles.
 * · **El error no se va solo tan rápido y se puede cerrar.** Un «listo» se lee
 *   de un vistazo; un «no se pudo: ya existe un alumno con ese correo» hay que
 *   leerlo entero.
 * · **Se pausa al pasar el ratón o al enfocar con el teclado**, para que no se
 *   borre justo mientras se está leyendo.
 * · **Tope de tres.** Más avisos a la vez tapan la pantalla; el más viejo cede
 *   su sitio.
 * · Lectores de pantalla: `alert` (interrumpe) para los errores, `status`
 *   (espera un hueco) para lo demás.
 */

/** Cuántos se enseñan a la vez. El más antiguo sale al llegar el cuarto. */
const MAX_VISIBLES = 3;
/** Lo que dura la animación de salida antes de quitarlo del DOM. */
const SALIDA_MS = 200;

interface AvisoEnPantalla extends Aviso {
  /** Marcado para salir: dispara la animación y luego se elimina. */
  saliendo?: boolean;
}

export function Toaster() {
  const { t } = useI18n();
  const [avisos, setAvisos] = useState<AvisoEnPantalla[]>([]);
  // Un temporizador por aviso. En un ref y no en el estado: cambiarlos no tiene
  // que repintar nada.
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const quitar = useCallback((id: number) => {
    const pendiente = timers.current.get(id);
    if (pendiente) clearTimeout(pendiente);
    timers.current.delete(id);
    setAvisos((lista) => lista.map((a) => (a.id === id ? { ...a, saliendo: true } : a)));
    setTimeout(() => {
      setAvisos((lista) => lista.filter((a) => a.id !== id));
    }, SALIDA_MS);
  }, []);

  const programarCierre = useCallback(
    (a: Aviso) => {
      const previo = timers.current.get(a.id);
      if (previo) clearTimeout(previo);
      timers.current.set(
        a.id,
        setTimeout(() => quitar(a.id), DURACION[a.tipo]),
      );
    },
    [quitar],
  );

  useEffect(() => {
    return suscribirAvisos((nuevo) => {
      setAvisos((lista) => {
        // Repetir la misma acción no apila el mismo texto tres veces: se
        // reemplaza el que ya estaba, que es lo que hace Android.
        const sinRepetido = lista.filter(
          (a) => !(a.texto === nuevo.texto && a.tipo === nuevo.tipo),
        );
        return [...sinRepetido, nuevo].slice(-MAX_VISIBLES);
      });
      programarCierre(nuevo);
    });
  }, [programarCierre]);

  // Al desmontar, ningún temporizador se queda vivo apuntando a un componente
  // que ya no existe.
  useEffect(() => {
    const pendientes = timers.current;
    return () => {
      for (const p of pendientes.values()) clearTimeout(p);
      pendientes.clear();
    };
  }, []);

  // Sin avisos no se pinta nada, y eso resuelve de paso el renderizado en el
  // servidor: la lista solo puede llenarse desde la suscripción, que vive en un
  // efecto y por tanto solo corre en el navegador. Para cuando hay algo que
  // enseñar, `document` existe seguro.
  if (avisos.length === 0) return null;

  return createPortal(
    <div className="toaster" aria-live="polite">
      {avisos.map((a) => (
        <div
          key={a.id}
          className="toast"
          data-tipo={a.tipo}
          data-saliendo={a.saliendo ? 'true' : undefined}
          role={a.tipo === 'error' ? 'alert' : 'status'}
          // Leer con calma: mientras el puntero (o el foco) esté encima, el
          // aviso no se va.
          onMouseEnter={() => {
            const p = timers.current.get(a.id);
            if (p) clearTimeout(p);
          }}
          onMouseLeave={() => programarCierre(a)}
          onFocus={() => {
            const p = timers.current.get(a.id);
            if (p) clearTimeout(p);
          }}
          onBlur={() => programarCierre(a)}
        >
          <span className="toast-ico" aria-hidden="true">
            {a.tipo === 'ok' ? '✓' : a.tipo === 'error' ? '!' : 'i'}
          </span>
          <span className="toast-txt">{a.texto}</span>
          <button
            type="button"
            className="toast-cerrar"
            aria-label={t('comun.cerrar')}
            onClick={() => quitar(a.id)}
          >
            ✕
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
