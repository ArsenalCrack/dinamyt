'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
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
 * ── Lo irreversible se ve distinto ──
 *
 * `tono: 'irreversible'` pone el borde rojo, el icono de alerta y una franja
 * que dice que no se puede deshacer: lo que hace un aviso del sistema, y por
 * eso se reconoce antes de leerlo. Para lo que además pide escribir algo —una
 * contraseña, una palabra—, `ModalAccesible` es la misma caja con el mismo
 * comportamiento (ver `BorrarMiCuenta` en el portal).
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
 *
 * Membresías tiene una copia de este archivo (mismo nombre): si se cambia aquí,
 * se cambia allá.
 */

export type TonoConfirmar = 'normal' | 'peligro' | 'irreversible';

export interface PeticionConfirmar {
  /** La pregunta, con el nombre propio dentro. «¿Quitar a Pablo del club?» */
  titulo: string;
  /** Qué pasa si se dice que sí. Lo que nadie sabe hasta que ya pasó. */
  detalle?: ReactNode;
  textoOk?: string;
  textoCancelar?: string;
  /** `peligro` pinta el botón en rojo; `irreversible`, además, avisa que no hay vuelta atrás. */
  tono?: TonoConfirmar;
  /** La franja de `irreversible`. Por defecto: «Esta acción no se puede deshacer.» */
  textoIrreversible?: string;
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
  const tono = peticion.tono ?? 'normal';

  return (
    <ModalAccesible
      titulo={peticion.titulo}
      tono={tono}
      focoInicial={cancelarRef}
      onCancelar={() => onCerrar(false)}
      textoIrreversible={peticion.textoIrreversible}
      botones={
        <>
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
            className={tono === 'normal' ? 'btn btn-gold' : 'btn btn-danger'}
            onClick={() => onCerrar(true)}
          >
            {peticion.textoOk ?? 'Sí, continuar'}
          </button>
        </>
      }
    >
      {peticion.detalle && <div className="confirmar-detalle">{peticion.detalle}</div>}
    </ModalAccesible>
  );
}

/**
 * La caja modal y todo lo que la hace usable: el foco entra en lo seguro y se
 * devuelve al cerrar, el tabulador no se sale, Escape y tocar fuera cancelan,
 * y la página de detrás no se mueve.
 *
 * `botones` va el «Cancelar» PRIMERO: la hoja de estilos los invierte en
 * pantalla (ver `.confirmar-botones` en la hoja compartida). `campos` va
 * DESPUÉS de la franja de lo irreversible: se lee la advertencia antes de
 * empezar a escribir.
 */
export function ModalAccesible({
  titulo,
  tono = 'normal',
  focoInicial,
  onCancelar,
  textoIrreversible,
  campos,
  botones,
  children,
}: {
  titulo: string;
  tono?: TonoConfirmar;
  focoInicial: RefObject<HTMLElement | null>;
  onCancelar: () => void;
  textoIrreversible?: string;
  /** Lo que hay que escribir para confirmar (contraseña, palabra). */
  campos?: ReactNode;
  botones: ReactNode;
  children?: ReactNode;
}) {
  const cajaRef = useRef<HTMLDivElement>(null);
  // La última versión de `onCancelar`, para que Escape y el fondo no llamen a
  // la del primer render (que puede saber, por ejemplo, que todavía no se
  // estaba enviando nada).
  const cancelar = useRef(onCancelar);
  cancelar.current = onCancelar;

  useEffect(() => {
    // De dónde venía el foco, para devolvérselo al cerrar: si no, quien navega
    // con teclado vuelve al principio de la página cada vez que cancela.
    const antes = document.activeElement as HTMLElement | null;
    focoInicial.current?.focus();

    // La página de detrás no se mueve mientras la pregunta está abierta: se
    // leía la pregunta sobre una fila y al cerrar se estaba en otra.
    const scrollPrevio = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function alTeclear(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelar.current();
        return;
      }
      // El foco no se sale de la caja: por detrás está la misma lista de
      // botones que acaba de dispararla.
      if (e.key !== 'Tab' || !cajaRef.current) return;
      const focos = Array.from(
        cajaRef.current.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href]'),
      ).filter((el) => !el.hasAttribute('disabled'));
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
      document.body.style.overflow = scrollPrevio;
      antes?.focus?.();
    };
    // Es de montar y desmontar: lo que cambia entre renders se lee de las refs.
  }, [focoInicial]);

  return createPortal(
    <div
      className="confirmar-fondo"
      // Tocar fuera cancela: es el gesto que ya espera todo el mundo, y hacia
      // el lado seguro.
      onClick={() => cancelar.current()}
    >
      <div
        ref={cajaRef}
        className="confirmar-caja"
        data-tono={tono}
        role="alertdialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={(e) => e.stopPropagation()}
      >
        {tono === 'irreversible' && (
          <div className="confirmar-icono" aria-hidden="true">
            ⚠
          </div>
        )}
        <p className="confirmar-titulo">{titulo}</p>
        {children}
        {tono === 'irreversible' && (
          <p className="confirmar-irreversible">
            {textoIrreversible ?? 'Esta acción no se puede deshacer.'}
          </p>
        )}
        {campos}
        <div className="confirmar-botones">{botones}</div>
      </div>
    </div>,
    document.body,
  );
}
