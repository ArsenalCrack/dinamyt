'use client';

import { useI18n } from '@/lib/i18n';

/**
 * Filas por página. El mismo número en todas las pantallas: veinticinco caben
 * en un portátil sin desplazarse y en el celular son tres o cuatro pantallazos
 * de pulgar, que es donde la gente deja de bajar.
 *
 * La API tiene su propio tope (`MAX_POR_PAGINA`), que es otra cosa: aquello es
 * la red de seguridad, esto es la decisión de diseño.
 */
export const POR_PAGINA = 25;

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
 */
export function Paginacion({
  offset,
  limit,
  total,
  onIr,
}: {
  offset: number;
  limit: number;
  total: number;
  /** Nuevo `offset`. Quien llama recarga con él. */
  onIr: (offset: number) => void;
}) {
  const { t } = useI18n();
  if (total <= limit) return null;

  const desde = total === 0 ? 0 : offset + 1;
  const hasta = Math.min(offset + limit, total);
  const hayAnterior = offset > 0;
  const haySiguiente = hasta < total;

  return (
    <nav className="paginacion" aria-label={t('pag.navegacion')}>
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
