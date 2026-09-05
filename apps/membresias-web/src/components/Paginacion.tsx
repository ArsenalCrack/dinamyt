'use client';

import { useI18n } from '@/lib/i18n';

/**
 * Filas por página. El mismo número en todas las pantallas.
 *
 * Eran veinticinco, elegidos mirando un portátil. En el celular cada fila ya
 * no es un renglón sino una ficha de seis líneas (ver `.tabla-apilable` en
 * globals.css), así que veinticinco alumnos son una tira de pantalla y media
 * de pulgar para llegar al final — y el paginador estaba justo ahí, al final,
 * donde solo lo encuentra quien tuvo la paciencia de bajar.
 *
 * Quince cabe en un portátil sin desplazarse y en el teléfono se recorre de un
 * gesto. El número sigue siendo uno solo para las dos pantallas a propósito:
 * dos tamaños distintos harían que «página 3» significara cosas distintas
 * según desde dónde se mire, y el maestro que busca a alguien lo hace desde
 * los dos.
 *
 * La API tiene su propio tope (`MAX_POR_PAGINA`), que es otra cosa: aquello es
 * la red de seguridad, esto es la decisión de diseño.
 */
export const POR_PAGINA = 15;

/**
 * Paso de páginas de los listados de gente.
 *
 * **Lo importante no son las flechas, es el rótulo del medio.** «26–50 de 213»
 * es lo que le dice al maestro que su club tiene 213 alumnos y que está viendo
 * el segundo puñado. Sin ese número, una lista paginada es indistinguible de
 * una lista que perdió gente por el camino — y esa duda, en la pantalla donde
 * se cobran mensualidades, es exactamente lo que no puede pasar.
 *
 * No se dibuja nada cuando todo cabe en una página: un paginador para once
 * alumnos es ruido.
 *
 * ── Y va DOS veces, arriba y abajo ────────────────────────────────────────
 *
 * Estaba solo al final, que es el sitio donde nadie lo ve hasta haber bajado
 * la lista entera — o sea, después de haber hecho justo el trabajo que el
 * paginador venía a ahorrar. En el celular era peor todavía: quince fichas son
 * un buen rato de pulgar, y quien va por la página cuatro tiene que recorrer
 * la cuatro entera para pedir la cinco.
 *
 * Arriba también sirve para otra cosa que no es pasar página: el rótulo del
 * medio —«16–30 de 213»— se ve ANTES de leer la lista, así que se entra
 * sabiendo cuánta gente hay y por dónde se anda. `arriba` solo cambia de qué
 * lado va el margen; el resto es exactamente el mismo control.
 */
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
  /** Nuevo `offset`. Quien llama recarga con él. */
  onIr: (offset: number) => void;
  /** Encima de la lista: separa por abajo en vez de por arriba. */
  arriba?: boolean;
}) {
  const { t } = useI18n();
  if (total <= limit) return null;

  const desde = total === 0 ? 0 : offset + 1;
  const hasta = Math.min(offset + limit, total);
  const hayAnterior = offset > 0;
  const haySiguiente = hasta < total;

  return (
    <nav
      className="paginacion"
      data-arriba={arriba || undefined}
      aria-label={t('pag.navegacion')}
    >
      <button
        type="button"
        className="btn btn-outline btn-sm"
        disabled={!hayAnterior}
        onClick={() => onIr(Math.max(0, offset - limit))}
      >
        ‹ {t('pag.anterior')}
      </button>
      <span className="paginacion-cuenta mono">
        {desde}–{hasta} {t('pag.de')} {total}
      </span>
      <button
        type="button"
        className="btn btn-outline btn-sm"
        disabled={!haySiguiente}
        onClick={() => onIr(offset + limit)}
      >
        {t('pag.siguiente')} ›
      </button>
    </nav>
  );
}

/**
 * «Ver más» para los historiales de pagos y asistencias.
 *
 * Aquí NO se pagina, se destapa: el historial se lee de arriba abajo —lo más
 * reciente primero— y pasar páginas para ver el mes pasado es más trabajo que
 * bajar. Lo que sí hacía falta es que el recorte se vea: antes la ficha
 * enseñaba treinta asistencias de las que hubiera y el resto desaparecía sin
 * decir nada.
 */
export function VerMas({
  visibles,
  total,
  onMas,
}: {
  visibles: number;
  total: number;
  onMas: () => void;
}) {
  const { t } = useI18n();
  if (total === 0) return null;

  return (
    <div className="ver-mas">
      <span className="muted mono">
        {Math.min(visibles, total)} {t('pag.de')} {total}
      </span>
      {visibles < total && (
        <button type="button" className="btn btn-outline btn-sm" onClick={onMas}>
          {t('pag.verMas')}
        </button>
      )}
    </div>
  );
}
