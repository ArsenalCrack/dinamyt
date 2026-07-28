'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent as REvent } from 'react';
import { useI18n } from '@/lib/i18n';
import { CARNET_FOTO, type Encuadre, type ImagenAbierta } from '@/lib/imagen';

/**
 * Elegir qué parte de la imagen se queda.
 *
 * **Por qué existe.** Antes la app recortaba el cuadrado del CENTRO y ya. En un
 * retrato de celular —3 000 de ancho por 4 000 de alto— eso descarta 500 px por
 * arriba y 500 por abajo, y arriba es donde está la cabeza. Nadie podía
 * arreglarlo desde la aplicación: la única salida era abrir la foto en otra
 * app, recortarla a mano y volver a subirla.
 *
 * **Cómo funciona.** El visor es el cuadrado que se va a guardar. La imagen se
 * arrastra por debajo y el control la acerca o la aleja. Lo que se ve dentro
 * del visor es exactamente lo que se guarda: la vista previa y el recorte final
 * hacen la misma cuenta con distinto factor (ver `pintar` en `lib/imagen.ts`).
 *
 * **Las dos variantes no se comportan igual, y es a propósito:**
 *
 * - **Foto.** Empieza llenando el cuadrado (`cover`) y no se puede alejar más
 *   allá: una foto de carnet con franjas blancas a los lados no es una foto de
 *   carnet. Encima se dibuja el hueco del carnet (22 × 29 mm), que es más alto
 *   que ancho y se come los lados — mejor verlo aquí que al imprimir.
 * - **Escudo.** Empieza entero dentro del cuadrado (`contain`) y sí se puede
 *   alejar: a un escudo con el nombre del club escrito alrededor le hace falta
 *   aire, y recortarlo le corta el nombre.
 *
 * El botón de centrar devuelve al encuadre de partida, que es el que hacía la
 * app sola: quien no quiera tocar nada solo tiene que darle a guardar.
 */

/** Lado del visor en pantalla. Todo el encuadre se mide en estos píxeles. */
const VISOR = 264;

/** Cuánto se puede acercar, sobre el encuadre de partida. */
const ZOOM_MAX = 4;

/** Y cuánto alejarse. Solo el escudo: la foto no puede dejar huecos. */
const ZOOM_MIN_LOGO = 0.55;

export function AjustarImagen({
  imagen,
  variante,
  nombre,
  guardando,
  onCancelar,
  onConfirmar,
}: {
  imagen: ImagenAbierta;
  variante: 'foto' | 'logo';
  /** De quién es: acompaña al título para saber a quién se le está poniendo. */
  nombre: string;
  guardando: boolean;
  onCancelar: () => void;
  onConfirmar: (encuadre: Encuadre) => void;
}) {
  const { t } = useI18n();
  const esLogo = variante === 'logo';

  /**
   * El encuadre de partida: el que hacía la app sin preguntar. `cover` para la
   * foto —llena el cuadrado— y `contain` para el escudo —entra entero—.
   */
  const inicial = useMemo(() => {
    const porAncho = VISOR / imagen.ancho;
    const porAlto = VISOR / imagen.alto;
    const escala = esLogo ? Math.min(porAncho, porAlto) : Math.max(porAncho, porAlto);
    return {
      escala,
      x: (VISOR - imagen.ancho * escala) / 2,
      y: (VISOR - imagen.alto * escala) / 2,
    };
  }, [imagen.ancho, imagen.alto, esLogo]);

  const [escala, setEscala] = useState(inicial.escala);
  const [pos, setPos] = useState({ x: inicial.x, y: inicial.y });
  const arrastre = useRef<{ id: number; x: number; y: number } | null>(null);

  // Si cambia la imagen (se eligió otra sin cerrar el editor), se vuelve a
  // empezar: el encuadre de la anterior no significa nada en esta.
  useEffect(() => {
    setEscala(inicial.escala);
    setPos({ x: inicial.x, y: inicial.y });
  }, [inicial]);

  /**
   * Deja la imagen donde puede estar.
   *
   * La foto no puede dejar hueco: su esquina se mueve entre «el borde derecho
   * del visor» y 0. El escudo sí puede sobresalir o quedarse corto, pero su
   * centro tiene que seguir dentro del visor — si no, se puede empujar fuera de
   * la pantalla y guardar un cuadrado vacío.
   */
  function encajar(x: number, y: number, e: number) {
    const w = imagen.ancho * e;
    const h = imagen.alto * e;
    if (esLogo) {
      return {
        x: Math.min(Math.max(x, -w / 2), VISOR - w / 2),
        y: Math.min(Math.max(y, -h / 2), VISOR - h / 2),
      };
    }
    return {
      x: Math.min(0, Math.max(x, VISOR - w)),
      y: Math.min(0, Math.max(y, VISOR - h)),
    };
  }

  function alBajar(ev: REvent<HTMLDivElement>) {
    // Capturar el puntero es lo que hace que el arrastre siga funcionando
    // cuando el dedo se sale del visor. Que falle no es motivo para no
    // arrastrar: se sigue sin captura, y como mucho se suelta antes de tiempo.
    try {
      ev.currentTarget.setPointerCapture(ev.pointerId);
    } catch {
      /* puntero ya soltado o navegador quisquilloso */
    }
    arrastre.current = { id: ev.pointerId, x: ev.clientX, y: ev.clientY };
  }

  function alMover(ev: REvent<HTMLDivElement>) {
    const a = arrastre.current;
    if (!a || a.id !== ev.pointerId) return;
    const dx = ev.clientX - a.x;
    const dy = ev.clientY - a.y;
    arrastre.current = { id: ev.pointerId, x: ev.clientX, y: ev.clientY };
    setPos((p) => encajar(p.x + dx, p.y + dy, escala));
  }

  function alSoltar(ev: REvent<HTMLDivElement>) {
    if (arrastre.current?.id === ev.pointerId) arrastre.current = null;
  }

  /**
   * Acercar y alejar SIN que se mueva lo que se está mirando: el punto que
   * quedaba en el centro del visor sigue en el centro. Escalando a secas desde
   * la esquina, la cara se escapa del cuadro en cuanto se toca el control.
   */
  function cambiarZoom(nueva: number) {
    setPos((p) => {
      const medio = VISOR / 2;
      const x = medio - ((medio - p.x) * nueva) / escala;
      const y = medio - ((medio - p.y) * nueva) / escala;
      return encajar(x, y, nueva);
    });
    setEscala(nueva);
  }

  function centrar() {
    setEscala(inicial.escala);
    setPos({ x: inicial.x, y: inicial.y });
  }

  const minimo = inicial.escala * (esLogo ? ZOOM_MIN_LOGO : 1);
  const maximo = inicial.escala * ZOOM_MAX;
  /** Franja que el carnet deja ver de un cuadrado: 22 de cada 29 de ancho. */
  const anchoCarnet = Math.round((VISOR * CARNET_FOTO.ancho) / CARNET_FOTO.alto);

  return (
    <div className="encuadre">
      <p className="eyebrow">{t('encuadre.titulo')}</p>
      <p className="muted encuadre-quien">{nombre}</p>

      <div
        className="encuadre-visor"
        data-logo={esLogo}
        style={{ width: VISOR, height: VISOR }}
        onPointerDown={alBajar}
        onPointerMove={alMover}
        onPointerUp={alSoltar}
        onPointerCancel={alSoltar}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imagen.url}
          alt=""
          draggable={false}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: imagen.ancho * escala,
            height: imagen.alto * escala,
            transform: `translate(${pos.x}px, ${pos.y}px)`,
          }}
        />
        {/* El hueco del carnet, encima de todo. Solo informa: no recorta nada
            aquí, lo recorta el carnet al imprimirse. */}
        {!esLogo && (
          <span
            className="encuadre-carnet"
            style={{ width: anchoCarnet }}
            aria-hidden="true"
          >
            <span>{t('encuadre.enElCarnet')}</span>
          </span>
        )}
      </div>

      <label className="encuadre-zoom">
        <span className="muted">{t('encuadre.zoom')}</span>
        <input
          type="range"
          min={minimo}
          max={maximo}
          step={(maximo - minimo) / 100 || 0.01}
          value={escala}
          onChange={(e) => cambiarZoom(Number(e.target.value))}
          aria-label={t('encuadre.zoom')}
        />
      </label>

      <p className="muted encuadre-ayuda">
        {t(esLogo ? 'encuadre.ayudaLogo' : 'encuadre.ayudaFoto')}
      </p>

      <div className="encuadre-botones">
        <button
          type="button"
          className="btn btn-gold btn-sm"
          disabled={guardando}
          onClick={() => onConfirmar({ x: pos.x, y: pos.y, escala, visor: VISOR })}
        >
          {guardando ? t('foto.procesando') : t('encuadre.guardar')}
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={guardando}
          onClick={centrar}
        >
          {t('encuadre.centrar')}
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={guardando}
          onClick={onCancelar}
        >
          {t('comun.cancelar')}
        </button>
      </div>
    </div>
  );
}
