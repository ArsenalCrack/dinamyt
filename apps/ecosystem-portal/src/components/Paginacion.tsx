'use client';

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
 * Cuántos por página.
 *
 * Eran veinte, y en el celular veinte filas con foto son un rato largo de
 * pulgar para llegar al final — donde estaba el único paso de páginas. Quince
 * se recorre de un gesto y cabe en un portátil sin desplazarse. Es el mismo
 * número que usa Membresías, a propósito: la misma gente pasa de una lista a
 * la otra y «página 3» tiene que querer decir lo mismo en las dos.
 */
export const POR_PAGINA = 15;

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
