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

/** Cuántos por página. Veinte caben en una pantalla de celular sin agobiar. */
export const POR_PAGINA = 20;

export function Paginacion({
  offset,
  limit,
  total,
  onIr,
}: {
  offset: number;
  limit: number;
  total: number;
  onIr: (offset: number) => void;
}) {
  if (total <= limit) return null;

  const desde = offset + 1;
  const hasta = Math.min(offset + limit, total);
  const hayAnterior = offset > 0;
  const haySiguiente = hasta < total;

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
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
