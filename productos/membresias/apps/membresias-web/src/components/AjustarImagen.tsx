'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as REvent,
} from 'react';
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
 * arrastra por debajo y se acerca con la rueda, con dos dedos o con el control.
 * Lo que se ve dentro del visor es exactamente lo que se guarda: la vista
 * previa y el recorte final hacen la misma cuenta con distinto factor (ver
 * `pintar` en `lib/imagen.ts`).
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
 * El damero de la transparencia aparece detrás de lo que NO tiene fondo, sea
 * escudo o foto (`imagen.alfa`, ver `lib/imagen.ts`). Antes lo enseñaba el
 * escudo y solo el escudo: una foto en PNG sin fondo se veía sobre el gris casi
 * negro del visor y parecía tener el fondo negro puesto.
 *
 * El botón de centrar devuelve al encuadre de partida, que es el que hacía la
 * app sola: quien no quiera tocar nada solo tiene que darle a guardar.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * **Tres cosas que hacían que ampliar fuera inutilizable, y de dónde venían:**
 *
 * 1. **La imagen se aplastaba y se corría a la izquierda.** No era la cuenta
 *    del zoom: era el *preflight* de Tailwind, que le pone `max-width: 100%` a
 *    todo `<img>`. Al pasar de 264 px de ancho, el navegador recortaba el ancho
 *    al del visor mientras el alto seguía creciendo —de ahí la cara estirada—
 *    y lo que se guardaba no era lo que se veía. El arreglo vive en
 *    `globals.css` (`.encuadre-visor img { max-width: none }`), porque el
 *    problema es de CSS y no de este archivo.
 * 2. **El visor decía medir 264 px y a veces medía menos.** El lado era una
 *    constante, pero el CSS lo encogía en pantallas estrechas
 *    (`max-width: 100%`). Todo el encuadre se mide en píxeles del visor, así
 *    que en un celular angosto la cuenta se hacía sobre un cuadrado que no era
 *    el de la pantalla. Ahora el lado se MIDE (ver `useLayoutEffect`).
 * 3. **Solo se podía acercar con la barra.** Ni rueda del ratón ni dos dedos, y
 *    ninguno de los dos gestos es opcional hoy. Además ambos acercan hacia
 *    DONDE se está mirando —el cursor, el punto entre los dedos—, no hacia el
 *    centro: acercar la cara y que se escape del cuadro era lo que obligaba a
 *    arrastrar otra vez después de cada toque.
 */

/** Lado máximo del visor en pantalla. En pantallas estrechas manda el ancho. */
const VISOR_MAX = 264;

/** Cuánto se puede acercar, sobre el encuadre de partida. */
const ZOOM_MAX = 6;

/** Y cuánto alejarse. Solo el escudo: la foto no puede dejar huecos. */
const ZOOM_MIN_LOGO = 0.55;

/** Cuánto acerca una muesca de rueda. 1,0015 por píxel de `deltaY`. */
const RUEDA = 0.0015;

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
   * El lado real del visor, medido.
   *
   * No es una constante porque el CSS lo encoge cuando no cabe, y todo el
   * encuadre —la posición, la escala y lo que se manda a recortar— está en
   * píxeles de ESTE cuadrado. Con un número inventado, en un celular angosto se
   * guardaba un recorte distinto del que se veía.
   */
  const cajaRef = useRef<HTMLDivElement | null>(null);
  const visorRef = useRef<HTMLDivElement | null>(null);
  const [visor, setVisor] = useState(VISOR_MAX);

  useLayoutEffect(() => {
    const caja = cajaRef.current;
    if (!caja) return;
    const medir = () => {
      const ancho = caja.clientWidth;
      if (ancho > 0) setVisor(Math.min(VISOR_MAX, Math.floor(ancho)));
    };
    medir();
    if (typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver(medir);
    obs.observe(caja);
    return () => obs.disconnect();
  }, []);

  /**
   * El encuadre de partida: el que hacía la app sin preguntar. `cover` para la
   * foto —llena el cuadrado— y `contain` para el escudo —entra entero—.
   */
  const inicial = useMemo(() => {
    const porAncho = visor / imagen.ancho;
    const porAlto = visor / imagen.alto;
    const escala = esLogo ? Math.min(porAncho, porAlto) : Math.max(porAncho, porAlto);
    return {
      escala,
      x: (visor - imagen.ancho * escala) / 2,
      y: (visor - imagen.alto * escala) / 2,
    };
  }, [imagen.ancho, imagen.alto, esLogo, visor]);

  const [escala, setEscala] = useState(inicial.escala);
  const [pos, setPos] = useState({ x: inicial.x, y: inicial.y });

  /**
   * La escala vigente, fuera del estado.
   *
   * La rueda y el pellizco pueden disparar varios eventos antes de que React
   * repinte, y todos ellos necesitan saber de qué escala parten. Leyéndola del
   * estado, los que llegan dentro del mismo fotograma parten todos de la
   * misma —la vieja— y el zoom se queda corto o pega saltos.
   */
  const escalaRef = useRef(inicial.escala);

  /** Pone la escala en los dos sitios a la vez, que es como se usa siempre. */
  const fijarEscala = useCallback((e: number) => {
    escalaRef.current = e;
    setEscala(e);
  }, []);

  // Si cambia la imagen —o el lado del visor— se vuelve a empezar: el encuadre
  // anterior está medido en otro cuadrado y no significa lo mismo aquí.
  useEffect(() => {
    fijarEscala(inicial.escala);
    setPos({ x: inicial.x, y: inicial.y });
  }, [inicial, fijarEscala]);

  /**
   * Deja la imagen donde puede estar.
   *
   * La foto no puede dejar hueco: su esquina se mueve entre «el borde derecho
   * del visor» y 0. El escudo sí puede sobresalir o quedarse corto, pero su
   * centro tiene que seguir dentro del visor — si no, se puede empujar fuera de
   * la pantalla y guardar un cuadrado vacío.
   */
  const encajar = useCallback(
    (x: number, y: number, e: number) => {
      const w = imagen.ancho * e;
      const h = imagen.alto * e;
      if (esLogo) {
        return {
          x: Math.min(Math.max(x, -w / 2), visor - w / 2),
          y: Math.min(Math.max(y, -h / 2), visor - h / 2),
        };
      }
      return {
        x: Math.min(0, Math.max(x, visor - w)),
        y: Math.min(0, Math.max(y, visor - h)),
      };
    },
    [imagen.ancho, imagen.alto, esLogo, visor],
  );

  const minimo = inicial.escala * (esLogo ? ZOOM_MIN_LOGO : 1);
  const maximo = inicial.escala * ZOOM_MAX;

  /**
   * Acercar SIN que se escape lo que se está mirando: el punto de la imagen que
   * estaba bajo `(anclaX, anclaY)` —el cursor, el punto entre los dos dedos, o
   * el centro si no hay nada que apuntar— sigue estando ahí después.
   *
   * Escalando a secas desde la esquina, la cara se sale del cuadro en cuanto se
   * toca el control y hay que volver a arrastrarla cada vez.
   */
  const zoomHacia = useCallback(
    (nueva: number, anclaX?: number, anclaY?: number) => {
      const actual = escalaRef.current;
      const objetivo = Math.min(maximo, Math.max(minimo, nueva));
      if (objetivo === actual) return;
      const ax = anclaX ?? visor / 2;
      const ay = anclaY ?? visor / 2;
      setPos((p) =>
        encajar(
          ax - ((ax - p.x) * objetivo) / actual,
          ay - ((ay - p.y) * objetivo) / actual,
          objetivo,
        ),
      );
      fijarEscala(objetivo);
    },
    [encajar, fijarEscala, maximo, minimo, visor],
  );

  /**
   * Los punteros que hay encima ahora mismo. Uno arrastra; dos pellizcan.
   *
   * Se guardan en un ref y no en el estado porque cambian en cada `move` y
   * repintar la pantalla sesenta veces por segundo por eso no aporta nada.
   */
  const punteros = useRef(new Map<number, { x: number; y: number }>());
  /** Distancia y punto medio del pellizco anterior, para saber cuánto varió. */
  const pellizco = useRef<{ dist: number; escala: number } | null>(null);

  /** Coordenadas dentro del visor, que es donde vive el encuadre. */
  function enElVisor(clientX: number, clientY: number) {
    const caja = visorRef.current?.getBoundingClientRect();
    return caja ? { x: clientX - caja.left, y: clientY - caja.top } : { x: 0, y: 0 };
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
    punteros.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    pellizco.current = null;
  }

  function alMover(ev: REvent<HTMLDivElement>) {
    const activos = punteros.current;
    if (!activos.has(ev.pointerId)) return;
    const previo = activos.get(ev.pointerId)!;
    activos.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    // ── Dos dedos: pellizcar ──
    if (activos.size >= 2) {
      const [a, b] = [...activos.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const medio = enElVisor((a.x + b.x) / 2, (a.y + b.y) / 2);
      if (!pellizco.current || pellizco.current.dist === 0) {
        pellizco.current = { dist, escala: escalaRef.current };
        return;
      }
      zoomHacia((pellizco.current.escala * dist) / pellizco.current.dist, medio.x, medio.y);
      return;
    }

    // ── Un dedo (o el ratón): arrastrar ──
    const dx = ev.clientX - previo.x;
    const dy = ev.clientY - previo.y;
    setPos((p) => encajar(p.x + dx, p.y + dy, escalaRef.current));
  }

  function alSoltar(ev: REvent<HTMLDivElement>) {
    punteros.current.delete(ev.pointerId);
    // Al levantar un dedo del pellizco, el que queda no debe dar un salto: el
    // arrastre se recalcula desde su posición actual.
    if (punteros.current.size < 2) pellizco.current = null;
  }

  /**
   * La rueda del ratón, en el PC.
   *
   * Va con `addEventListener` y `{ passive: false }` en vez de con `onWheel`
   * de React: React registra el suyo como pasivo y ahí `preventDefault()` no
   * hace nada, así que acercar la foto movía además el scroll de la página
   * entera por debajo.
   */
  useEffect(() => {
    const el = visorRef.current;
    if (!el) return;
    const alRodar = (ev: WheelEvent) => {
      ev.preventDefault();
      const caja = el.getBoundingClientRect();
      zoomHacia(
        escalaRef.current * Math.exp(-ev.deltaY * RUEDA),
        ev.clientX - caja.left,
        ev.clientY - caja.top,
      );
    };
    el.addEventListener('wheel', alRodar, { passive: false });
    return () => el.removeEventListener('wheel', alRodar);
  }, [zoomHacia]);

  function centrar() {
    fijarEscala(inicial.escala);
    setPos({ x: inicial.x, y: inicial.y });
  }

  /** Franja que el carnet deja ver de un cuadrado: 22 de cada 29 de ancho. */
  const anchoCarnet = Math.round((visor * CARNET_FOTO.ancho) / CARNET_FOTO.alto);

  return (
    <div className="encuadre">
      <p className="eyebrow">{t('encuadre.titulo')}</p>
      <p className="muted encuadre-quien">{nombre}</p>

      {/* La caja mide el ancho disponible; el visor se queda con el lado que
          quepa. Sin este intermediario habría que medir el propio visor, cuyo
          tamaño es justo lo que se está calculando. */}
      <div ref={cajaRef} className="encuadre-caja">
        <div
          ref={visorRef}
          className="encuadre-visor"
          data-alfa={imagen.alfa}
          style={{ width: visor, height: visor }}
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
      </div>

      <label className="encuadre-zoom">
        <span className="muted">{t('encuadre.zoom')}</span>
        <input
          type="range"
          min={minimo}
          max={maximo}
          step={(maximo - minimo) / 200 || 0.01}
          value={escala}
          onChange={(e) => zoomHacia(Number(e.target.value))}
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
          onClick={() => onConfirmar({ x: pos.x, y: pos.y, escala, visor })}
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
