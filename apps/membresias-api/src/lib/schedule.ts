/**
 * Calendario del club (§7.4). Determina si una fecha es día de clase según los
 * días de la semana configurados y las excepciones (festivos/cierres o aperturas
 * extra). Sin calendario configurado, se asume abierto para no bloquear a un club
 * que aún no lo definió.
 */
export function esDiaClase(
  weekdaysActivos: number[],
  exceptions: { date: string; isClosed: boolean }[],
  dateStr: string,
): boolean {
  const exc = exceptions.find((e) => e.date === dateStr);
  if (exc) return !exc.isClosed; // la excepción manda (cierre o apertura extra)
  if (weekdaysActivos.length === 0) return true; // sin calendario → abierto
  const wd = new Date(`${dateStr}T00:00:00Z`).getUTCDay(); // 0=domingo … 6=sábado
  return weekdaysActivos.includes(wd);
}
