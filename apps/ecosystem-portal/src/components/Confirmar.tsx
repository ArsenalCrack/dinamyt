'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

/**
 * «¿Seguro?» — la pregunta que faltaba antes de las acciones que se notan.
 *
 * ── Por qué existe ──
 *
 * **Esto lo escribió un accidente.** En el panel, la ✕ de una fila de miembro
 * quitaba a esa persona del club EN EL ACTO: un clic, sin pregunta, sin
 * deshacer. Así salió el maestro de su propio club. Y no era la única: cambiar
 * el rol de alguien, desactivar un club, borrar una suscripción o cerrar la
 * entrada por código se disparaban igual, al primer toque, desde botones de
 * 40 px pegados unos a otros en una lista que en el celular se recorre con el
 * pulgar.
 *
 * Membresías lleva tiempo preguntando antes de borrar una clase; esto es lo
 * mismo traído al portal, y ampliado: **no solo al eliminar**, sino en todo lo
 * que le cambia el acceso, el rol o el dinero a alguien que no está delante.
 *
 * ── Por qué un diálogo propio y no `window.confirm` ──
 *
 * El `confirm` del navegador tenía a su favor lo que importa —no se pulsa sin
 * querer al deslizar la lista—, y en contra todo lo demás: sale con la tipografía
 * del sistema operativo en medio de una interfaz que no es nada de eso, no cabe
 * un nombre largo sin recortarlo, y en algunos navegadores móviles se puede
 * silenciar para el resto de la sesión — que es exactamente la pantalla que no
 * se puede perder.
 *
 * Este conserva la propiedad que valía: es modal, tapa la lista entera, y **el
 * foco arranca en «Cancelar»**. Quien venía dando Enter a ciegas, cancela.
 * Confirmar exige mirar y apuntar.
 *
 * ── Cómo se usa ──
 *
 *     const { confirmar, dialogo } = useConfirmar();
 *     …
 *     onClick={async () => {
 *       if (!(await confirmar({
 *         titulo: `¿Quitar a ${m.fullName} del club?`,
 *         detalle: 'Perderá el acceso a las apps del club.',
 *         textoOk: 'Quitar',
 *         tono: 'peligro',
 *       }))) return;
 *       void accion(…);
 *     }}
 *     …
 *     {dialogo}   ← una sola vez por pantalla, donde sea
 *
 * Devuelve una promesa, así que el sitio donde se pregunta es el mismo donde se
 * actúa: no hay que guardar en un estado «qué estaba a punto de hacer», que es
 * de donde salen los diálogos que borran la fila equivocada.
 */

export interface PeticionConfirmar {
  /** La pregunta, con el nombre propio dentro. «¿Quitar a Pablo del club?» */
  titulo: string;
  /** Qué pasa si se dice que sí. Lo que nadie sabe hasta que ya pasó. */
  detalle?: ReactNode;
  textoOk?: string;
  textoCancelar?: string;
  /** `peligro` pinta el botón en rojo. Para lo que no se puede deshacer. */
  tono?: 'peligro' | 'normal';
}

export function useConfirmar() {
  const [peticion, setPeticion] = useState<PeticionConfirmar | null>(null);
  // El `resolve` de la promesa que está esperando. En una ref y no en estado:
  // cambiarlo no tiene que repintar nada.
  const responder = useRef<((ok: boolean) => void) | null>(null);

  const confirmar = useCallback(
    (p: PeticionConfirmar) =>
      new Promise<boolean>((resolve) => {
        // Si ya había una pregunta abierta (no debería), la anterior se cierra
        // en «no»: dejar una promesa sin resolver cuelga el botón para siempre.
        responder.current?.(false);
        responder.current = resolve;
        setPeticion(p);
      }),
    [],
  );

  const cerrar = useCallback((ok: boolean) => {
    setPeticion(null);
    const fn = responder.current;
    responder.current = null;
    fn?.(ok);
  }, []);

  // Si la pantalla se desmonta con la pregunta abierta, la promesa se responde
  // que no. Sin esto queda viva y quien la esperaba no continúa jamás.
  useEffect(() => () => responder.current?.(false), []);

  return {
    confirmar,
    dialogo: peticion ? (
      <DialogoConfirmar peticion={peticion} onCerrar={cerrar} />
    ) : null,
  };
}

function DialogoConfirmar({
  peticion,
  onCerrar,
}: {
  peticion: PeticionConfirmar;
  onCerrar: (ok: boolean) => void;
}) {
  const cancelarRef = useRef<HTMLButtonElement>(null);
  const cajaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // De dónde venía el foco, para devolvérselo al cerrar: si no, quien navega
    // con teclado vuelve al principio de la página cada vez que cancela.
    const antes = document.activeElement as HTMLElement | null;
    cancelarRef.current?.focus();

    function alTeclear(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCerrar(false);
        return;
      }
      // El foco no se sale de la caja: por detrás está la misma lista de
      // botones que acaba de dispararla.
      if (e.key !== 'Tab' || !cajaRef.current) return;
      const focos = cajaRef.current.querySelectorAll<HTMLElement>('button');
      if (focos.length === 0) return;
      const primero = focos[0];
      const ultimo = focos[focos.length - 1];
      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    }

    document.addEventListener('keydown', alTeclear);
    return () => {
      document.removeEventListener('keydown', alTeclear);
      antes?.focus?.();
    };
  }, [onCerrar]);

  return createPortal(
    <div
      className="confirmar-fondo"
      // Tocar fuera cancela: es el gesto que ya espera todo el mundo, y hacia
      // el lado seguro.
      onClick={() => onCerrar(false)}
    >
      <div
        ref={cajaRef}
        className="confirmar-caja"
        role="alertdialog"
        aria-modal="true"
        aria-label={peticion.titulo}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="confirmar-titulo">{peticion.titulo}</p>
        {peticion.detalle && (
          <div className="confirmar-detalle">{peticion.detalle}</div>
        )}
        <div className="confirmar-botones">
          <button
            type="button"
            ref={cancelarRef}
            className="btn btn-outline"
            onClick={() => onCerrar(false)}
          >
            {peticion.textoCancelar ?? 'Cancelar'}
          </button>
          <button
            type="button"
            className={
              peticion.tono === 'peligro' ? 'btn btn-danger' : 'btn btn-gold'
            }
            onClick={() => onCerrar(true)}
          >
            {peticion.textoOk ?? 'Sí, continuar'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
