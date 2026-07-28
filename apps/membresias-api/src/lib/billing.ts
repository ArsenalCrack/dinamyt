/**
 * Lógica pura del ciclo de cobro de Membresías (§5.2 / §3.3). Trabaja con fechas
 * como cadenas 'YYYY-MM-DD' (igual que la columna `date` de la BD) y calcula en
 * UTC para evitar corrimientos por zona horaria.
 */

export type PlanType = 'mensual' | 'semanal' | 'clase' | 'paquete' | 'matricula';

export type EstadoMembresia = 'al_dia' | 'por_vencer' | 'vencido' | 'sin_plan';

function parse(d: string): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

function addDays(dateStr: string, n: number): string {
  const d = parse(dateStr);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
}

/** Suma `months` meses conservando `anchorDay`, recortando al último día si el mes no lo tiene. */
function addMonthsClamped(baseStr: string, months: number, anchorDay: number): string {
  const b = parse(baseStr);
  const targetIdx = b.getUTCMonth() + months;
  const ty = b.getUTCFullYear() + Math.floor(targetIdx / 12);
  const tm = ((targetIdx % 12) + 12) % 12;
  const day = Math.min(anchorDay, daysInMonth(ty, tm));
  return fmt(new Date(Date.UTC(ty, tm, day)));
}

/** Fecha de hoy como 'YYYY-MM-DD' (hora local; en prod fijar TZ=America/Bogota). */
export function todayStr(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Día ancla del mes derivado de la fecha del primer pago. */
export function anchorFrom(dateStr: string): number {
  return parse(dateStr).getUTCDate();
}

/**
 * Nuevo vencimiento tras un pago de un plan por tiempo. Se ancla en
 * `max(hoy, venceAnterior)` para no castigar al que paga anticipado ni regalar
 * días al que paga tarde. Planes por clase/paquete/matrícula no tocan la fecha.
 */
export function nextDue(input: {
  today: string;
  prevDue: string | null;
  planType: PlanType;
  durationDays?: number | null;
  anchorDay?: number | null;
}): string | null {
  const { today, prevDue, planType } = input;
  const base = prevDue && prevDue > today ? prevDue : today;

  if (planType === 'semanal') return addDays(base, input.durationDays ?? 7);
  if (planType === 'mensual') {
    const anchor = input.anchorDay ?? anchorFrom(base);
    return addMonthsClamped(base, 1, anchor);
  }
  // clase / paquete / matricula: no hay vencimiento por tiempo.
  return prevDue;
}

/**
 * Vencimiento tras pagar VARIOS periodos de golpe (tres meses, dos semanas…).
 *
 * Es `nextDue` aplicado en cadena, y no una multiplicación, porque el día ancla
 * manda: quien paga el 31 de enero vence el 28 de febrero y el 31 de marzo, no
 * el 28 de marzo. Multiplicar días perdería ese día cada vez que se pasa por un
 * mes corto.
 */
export function nextDueVarios(input: {
  today: string;
  prevDue: string | null;
  planType: PlanType;
  durationDays?: number | null;
  anchorDay?: number | null;
  periodos: number;
}): string | null {
  let due = input.prevDue;
  for (let i = 0; i < Math.max(1, input.periodos); i++) {
    due = nextDue({ ...input, prevDue: due });
  }
  return due;
}

/**
 * Dónde EMPIEZA cada periodo que compró un pago.
 *
 * Sirve para repartir el dinero por meses: un pago de dos mensualidades hecho
 * el 27 de julio arranca periodos el 27 de julio y el 27 de agosto, así que la
 * mitad del importe le toca a julio y la otra mitad a agosto. Sin esto, el
 * panel del club sumaba los dos meses en julio y leía el doble de lo esperado.
 */
export function iniciosDePeriodo(input: {
  desde: string;
  planType: PlanType;
  durationDays?: number | null;
  periodos: number;
}): string[] {
  const { desde, planType } = input;
  const total = Math.max(1, input.periodos);
  const anchor = anchorFrom(desde);
  const out: string[] = [];
  let actual = desde;
  for (let i = 0; i < total; i++) {
    out.push(actual);
    actual =
      planType === 'semanal'
        ? addDays(actual, input.durationDays ?? 7)
        : addMonthsClamped(actual, 1, anchor);
  }
  return out;
}

/** Días que faltan para el vencimiento (negativo si ya venció). */
export function diasFaltantes(venceEl: string | null, today: string): number | null {
  if (!venceEl) return null;
  return Math.round((parse(venceEl).getTime() - parse(today).getTime()) / 86_400_000);
}

/** Estado del alumno según su vencimiento y la ventana de aviso. */
export function estado(
  venceEl: string | null,
  today: string,
  ventanaDias = 3,
): EstadoMembresia {
  if (!venceEl) return 'sin_plan';
  if (venceEl < today) return 'vencido';
  const dias = diasFaltantes(venceEl, today) ?? 0;
  return dias <= ventanaDias ? 'por_vencer' : 'al_dia';
}
