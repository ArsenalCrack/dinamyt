/**
 * Calendario del club (§7.4). Determina si una fecha es día de clase según los
 * días de la semana configurados y las excepciones (festivos/cierres o aperturas
 * extra).
 */

/**
 * Qué hacer con el club que todavía NO configuró sus días de la semana.
 *
 * Son las dos respuestas legítimas a la misma pregunta, y por eso es un
 * parámetro y no una decisión escondida dentro:
 *
 * - `abierto` — lo que usa el CHECK-IN. Un club recién creado no tiene
 *   calendario, y negarle la asistencia a todo el mundo hasta que el maestro
 *   entre a marcar casillas sería dejar la aplicación inservible el primer día.
 * - `cerrado` — lo que usa el PANEL DEL ALUMNO. Ahí la pregunta es «¿hoy hay
 *   clase?», y un club sin horario publicado no puede contestar que sí: eso es
 *   justo lo que hacía, y el alumno se presentaba al salón por un mensaje que
 *   no se basaba en nada. Quien pregunta se merece «tu club todavía no publicó
 *   sus días», no un sí inventado.
 */
export type SinCalendario = 'abierto' | 'cerrado';

export function esDiaClase(
  weekdaysActivos: number[],
  exceptions: { date: string; isClosed: boolean }[],
  dateStr: string,
  sinCalendario: SinCalendario = 'abierto',
): boolean {
  const exc = exceptions.find((e) => e.date === dateStr);
  if (exc) return !exc.isClosed; // la excepción manda (cierre o apertura extra)
  if (weekdaysActivos.length === 0) return sinCalendario === 'abierto';
  const wd = new Date(`${dateStr}T00:00:00Z`).getUTCDay(); // 0=domingo … 6=sábado
  return weekdaysActivos.includes(wd);
}
