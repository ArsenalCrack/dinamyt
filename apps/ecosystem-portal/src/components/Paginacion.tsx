'use client';

import { useEffect, useState } from 'react';

/**
 * Paso de páginas, igual que el de Membresías.
 *
 * ── Por qué no un scroll infinito ──
 *
 * Porque lo que se hace en estas listas es BUSCAR a alguien, no navegar. Con
 * scroll infinito no hay forma de saber cuánta gente hay ni de volver a donde
 * estabas, y en el celular se convierte en deslizar hasta que aparezca. El
 * contador («21–40 de 137») responde la pregunta que el maestro tiene de
 * verdad: cuántos alumnos son.
 *
 * No se dibuja nada si todo cabe en una página: una barra de paginación bajo
 * una lista de cuatro personas es ruido.
 */

/**
 * Cuántos por página EN EL TELÉFONO, y el valor por defecto.
 *
 * Veinte filas con foto son un rato largo de pulgar para llegar al final, que
 * es donde estaba el único paso de páginas. Quince se recorre de un gesto.
 *
 * Es también el número que se usa cuando todavía no se sabe el ancho —el
 * servidor no tiene ventana que medir—, y eso es lo correcto: pedir de menos y
 * corregir hacia arriba solo añade filas; al revés se pediría de más y habría
 * que tirar la mitad.
 */
export const POR_PAGINA = 15;

/**
 * Y cuántos en un MONITOR.
 *
 * La lista se pinta a dos columnas a partir de `lg`, así que quince filas
 * dejaban una columna con ocho y otra con siete y un hueco debajo. Veinte
 * llenan las dos y siguen cabiendo sin desplazarse. Es el mismo número que
 * tenía antes de que el teléfono obligara a bajarlo — lo que faltaba no era
 * elegir uno de los dos, era distinguirlos.
 */
export const POR_PAGINA_ANCHO = 20;

/** A partir de aquí se considera monitor. El mismo corte que usa la barra. */
const ANCHO_MONITOR = '(min-width: 860px)';

/**
 * Cuántos caben de verdad en esta pantalla.
 *
 * Arranca en `POR_PAGINA` —igual que el servidor, para que el primer render
 * coincida— y sube tras montar si hay sitio. Escucha los cambios de ancho: girar
 * el teléfono o partir la ventana en dos cambia la respuesta, y una lista que se
 * queda con el número de antes deja media pantalla vacía.
 */
export function usePorPagina(): number {
  const [n, setN] = useState(POR_PAGINA);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const consulta = window.matchMedia(ANCHO_MONITOR);
    const aplicar = () => setN(consulta.matches ? POR_PAGINA_ANCHO : POR_PAGINA);
    aplicar();
    // Safari no soportó `addEventListener` aquí hasta la 14, y en iOS todavía
    // se ve la 13 en teléfonos que la gente usa a diario.
    if (consulta.addEventListener) {
      consulta.addEventListener('change', aplicar);
      return () => consulta.removeEventListener('change', aplicar);
    }
    consulta.addListener(aplicar);
    return () => consulta.removeListener(aplicar);
  }, []);

  return n;
}

export function Paginacion({
  offset,
  limit,
  total,
  onIr,
  arriba = false,
}: {
  offset: number;
  limit: number;
  total: number;
  onIr: (offset: number) => void;
  /**
   * Encima de la lista: separa por abajo en vez de por arriba.
   *
   * Va en los dos sitios porque al final solo lo encuentra quien ya bajó la
   * lista entera, o sea después de haber hecho el trabajo que este control
   * venía a ahorrar. Y arriba el contador se lee ANTES: se entra sabiendo
   * cuánta gente hay.
   */
  arriba?: boolean;
}) {
  if (total <= limit) return null;

  const desde = offset + 1;
  const hasta = Math.min(offset + limit, total);
  const hayAnterior = offset > 0;
  const haySiguiente = hasta < total;

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 text-sm ${
        arriba ? 'mb-3' : 'mt-3'
      }`}
    >
      <span style={{ color: 'var(--text-muted)' }}>
        {desde}–{hasta} de {total}
      </span>
      <div className="flex gap-1.5">
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={!hayAnterior}
          onClick={() => onIr(Math.max(0, offset - limit))}
        >
          ‹ Anterior
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={!haySiguiente}
          onClick={() => onIr(offset + limit)}
        >
          Siguiente ›
        </button>
      </div>
    </div>
  );
}
