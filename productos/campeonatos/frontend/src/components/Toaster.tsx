"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DURACION, suscribirAvisos, type Aviso } from "@/lib/toast";
import { useI18n } from "@/lib/i18n";

/**
 * Pila de avisos flotantes. Va montada una sola vez en el layout; quien avisa
 * llama a `avisoOk()` / `avisoError()` (ver `lib/toast.ts`).
 *
 * ── Decisiones de diseño, y por qué ──
 *
 * · **Abajo.** En Android el snackbar vive abajo, cerca del pulgar y lejos de
 *   la barra de estado. En escritorio, además, es donde no tapa el formulario
 *   que se acaba de rellenar. Arriba estorbaría al menú fijo de la app.
 * · **Centrado en móvil, a la derecha en escritorio.** Es la convención de cada
 *   sitio: ancho completo en el teléfono (donde no sobra espacio), y esquina
 *   inferior derecha en el PC, como las notificaciones del sistema.
 * · **Por encima de todo y fuera del flujo.** Se pinta en un portal sobre el
 *   `<body>`: dentro de la página, cualquier contenedor con `overflow` lo
 *   recortaría — que es como estos avisos acaban invisibles.
 * · **El error no se va solo tan rápido y se puede cerrar.** Un "listo" se lee
 *   de un vistazo; un "no se pudo: el correo ya existe" hay que leerlo entero.
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

export default function Toaster() {
  const { t } = useI18n();
  const [avisos, setAvisos] = useState<AvisoEnPantalla[]>([]);
  // Un temporizador por aviso. En un ref y no en el estado: cambiarlos no tiene
  // que repintar nada.
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const quitar = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
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
    const cancelar = suscribirAvisos((nuevo) => {
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
    return cancelar;
  }, [programarCierre]);

  // Al desmontar, ningún temporizador se queda vivo apuntando a un componente
  // que ya no existe.
  useEffect(() => {
    const pendientes = timers.current;
    return () => {
      for (const t of pendientes.values()) clearTimeout(t);
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
          data-saliendo={a.saliendo ? "true" : undefined}
          role={a.tipo === "error" ? "alert" : "status"}
          // Leer con calma: mientras el puntero (o el foco) esté encima, el
          // aviso no se va.
          onMouseEnter={() => {
            const t = timers.current.get(a.id);
            if (t) clearTimeout(t);
          }}
          onMouseLeave={() => programarCierre(a)}
          onFocus={() => {
            const t = timers.current.get(a.id);
            if (t) clearTimeout(t);
          }}
          onBlur={() => programarCierre(a)}
        >
          <span className="toast-ico" aria-hidden="true">
            {a.tipo === "ok" ? "✓" : a.tipo === "error" ? "!" : "i"}
          </span>
          <span className="toast-txt">{a.texto}</span>
          <button
            type="button"
            className="toast-cerrar"
            aria-label={t("comun.cerrar")}
            onClick={() => quitar(a.id)}
          >
            ✕
          </button>
        </div>
      ))}

      <style>{`
        .toaster {
          position: fixed;
          z-index: 9500;
          left: 0;
          right: 0;
          /* Sobre la barra de gestos de Android y la zona segura de iOS. */
          bottom: calc(16px + env(safe-area-inset-bottom, 0px));
          padding: 0 12px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          /* El contenedor ocupa el ancho de la ventana: sin esto se quedaría
             interceptando clics en una franja invisible de la pantalla. */
          pointer-events: none;
        }

        .toast {
          pointer-events: auto;
          width: 100%;
          max-width: 480px;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 10px 12px 14px;
          border-radius: var(--radius-sm);
          background: var(--bg-card);
          border: 1.5px solid var(--border);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
          color: var(--text);
          font-family: var(--font-body);
          font-size: 0.94rem;
          font-weight: 600;
          line-height: 1.35;
          /* SIN animation-fill-mode a propósito: con relleno hacia atrás, el
             estado en reposo del aviso sería el primer fotograma —opacidad
             0—, y basta con que la animación no llegue a correr (pestaña en
             segundo plano, animaciones desactivadas) para que el aviso quede
             invisible sin que nada lo delate. Así el estado normal es
             "visible" y la animación solo lo adorna al entrar. */
          animation: toast-entra 200ms ease-out;
        }

        /* Aquí sí hace falta el relleno: el aviso tiene que QUEDARSE
           transparente hasta que lo quiten del DOM. */
        .toast[data-saliendo="true"] {
          animation: toast-sale ${SALIDA_MS}ms ease-in both;
        }

        .toast[data-tipo="ok"] {
          border-color: rgba(0, 196, 106, 0.45);
        }
        .toast[data-tipo="error"] {
          border-color: rgba(255, 68, 68, 0.5);
        }
        .toast[data-tipo="info"] {
          border-color: var(--gold-border);
        }

        .toast-ico {
          flex: 0 0 auto;
          width: 22px;
          height: 22px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          font-size: 0.82rem;
          font-weight: 900;
          line-height: 1;
        }
        .toast[data-tipo="ok"] .toast-ico {
          background: var(--green-bg);
          color: var(--green);
        }
        .toast[data-tipo="error"] .toast-ico {
          background: rgba(255, 68, 68, 0.14);
          color: var(--red-alert);
        }
        .toast[data-tipo="info"] .toast-ico {
          background: var(--gold-bg);
          color: var(--gold);
        }

        .toast-txt {
          flex: 1 1 auto;
          min-width: 0;
          overflow-wrap: anywhere;
        }

        .toast-cerrar {
          flex: 0 0 auto;
          /* 36 px: el mínimo cómodo para un dedo sin que el aviso engorde. */
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          background: transparent;
          border: none;
          border-radius: var(--radius-sm);
          color: var(--text-dim);
          font-size: 0.9rem;
          cursor: pointer;
          transition: var(--transition);
        }
        .toast-cerrar:hover,
        .toast-cerrar:focus-visible {
          background: var(--bg-elevated);
          color: var(--text);
          outline: none;
        }

        /* Escritorio: esquina inferior derecha, como las notificaciones del
           sistema. En móvil se queda centrado y a todo lo ancho.
           El min-width es para que un "Guardado." no salga como una pastilla
           diminuta perdida en la esquina: los avisos cortos y los largos ocupan
           un bloque reconocible (mismo criterio que el snackbar de Material). */
        @media (min-width: 640px) {
          .toaster {
            left: auto;
            right: 0;
            align-items: flex-end;
            padding: 0 20px;
            max-width: 520px;
          }
          .toast {
            min-width: 320px;
          }
        }

        @keyframes toast-entra {
          from { opacity: 0; transform: translateY(16px) scale(0.98); }
          to   { opacity: 1; transform: none; }
        }
        @keyframes toast-sale {
          from { opacity: 1; transform: none; }
          to   { opacity: 0; transform: translateY(8px) scale(0.98); }
        }

        /* Quien pidió menos movimiento en su sistema recibe solo el fundido.
           Con nombres DISTINTOS y no redefiniendo los de arriba: dos
           reglas @keyframes con el mismo nombre compiten por él, y cuál gana no es
           algo en lo que convenga confiar. */
        @media (prefers-reduced-motion: reduce) {
          .toast { animation: toast-fundido 150ms ease-out; }
          .toast[data-saliendo="true"] { animation: toast-fundido-sale 150ms ease-in both; }
        }
        @keyframes toast-fundido {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes toast-fundido-sale {
          from { opacity: 1; }
          to   { opacity: 0; }
        }
      `}</style>
    </div>,
    document.body,
  );
}
