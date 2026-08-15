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

/**
 * El LUNES de la semana que contiene `dateStr`.
 *
 * Es lo que convierte «la semana del 14» en una clave: la nota semanal de una
 * clase se guarda contra este lunes, así que el maestro que la escribe el
 * miércoles y el alumno que la lee el sábado están mirando la misma fila. Sin
 * normalizar, cada día de la semana sería una nota distinta.
 *
 * La semana va de lunes a domingo, igual que en `lib/billing.ts`: `getUTCDay()`
 * numera 0=domingo, así que el domingo se trata como el séptimo día y su lunes
 * es el de SEIS días antes, no el del día siguiente.
 */
export function lunesDe(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const diaSemana = d.getUTCDay() === 0 ? 7 : d.getUTCDay(); // 1=lunes … 7=domingo
  d.setUTCDate(d.getUTCDate() - (diaSemana - 1));
  return d.toISOString().slice(0, 10);
}

/**
 * Los días de la semana que le tocan a un alumno, según su clase.
 *
 * Es la pieza que hace que «¿hoy hay clase?» signifique algo cuando el club
 * está dividido: si el de la clase de la tarde preguntara por los días del
 * club entero, le diría que sí los martes, que es cuando entrena la OTRA clase.
 *
 * - Con clase asignada, solo sus filas.
 * - Sin clase asignada (o club sin dividir), todas: es lo que había antes de
 *   existir las clases, y es lo que no puede cambiar para quien no las usa.
 */
export function diasDeClase(
  filas: { weekday: number; groupId: string | null }[],
  groupId: string | null,
): number[] {
  const suyas = groupId ? filas.filter((f) => f.groupId === groupId) : filas;
  return [...new Set(suyas.map((f) => f.weekday))].sort((a, b) => a - b);
}
