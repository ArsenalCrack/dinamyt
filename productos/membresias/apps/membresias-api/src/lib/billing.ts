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

/**
 * El último día de la semana que contiene `dateStr`: el domingo.
 *
 * La semana va de LUNES A DOMINGO, que es como se cuenta aquí y como la
 * entiende quien paga «la semana». `getUTCDay()` numera 0=domingo, así que el
 * domingo se trata como el séptimo día y no como el primero.
 */
function finDeSemana(dateStr: string): string {
  const d = parse(dateStr);
  const diaSemana = d.getUTCDay() === 0 ? 7 : d.getUTCDay(); // 1=lunes … 7=domingo
  return addDays(dateStr, 7 - diaSemana);
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
 *
 * **El plan semanal cubre LA SEMANA, no siete días.** Quien paga el miércoles
 * paga «esta semana» y vuelve a pagar el lunes, igual que quien paga el lunes:
 * eso es lo que el maestro cobra y lo que el alumno entiende. Contando siete
 * días, en cambio, cada alumno acababa con su propio día de renovación —el
 * miércoles, el jueves, el sábado— y el maestro tenía siete cobros distintos
 * repartidos por la semana en vez de uno solo.
 *
 * Renovar corre a la semana SIGUIENTE (`prevDue + 1 día` cae ya en el lunes de
 * la otra), así que pagar dos semanas de golpe llega al domingo de la siguiente
 * y no se queda en el mismo domingo dos veces.
 */
export function nextDue(input: {
  today: string;
  prevDue: string | null;
  planType: PlanType;
  durationDays?: number | null;
  anchorDay?: number | null;
}): string | null {
  const { today, prevDue, planType } = input;

  if (planType === 'semanal') {
    // `>=` y no `>`: pagar el mismo día en que vence compra la semana que
    // viene, no otra vez la que se acaba hoy.
    return finDeSemana(prevDue && prevDue >= today ? addDays(prevDue, 1) : today);
  }
  if (planType === 'mensual') {
    const base = prevDue && prevDue > today ? prevDue : today;
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

/**
 * Lo que el alumno tiene comprado: una fecha, un saldo de clases, o las dos.
 *
 * Es la forma de una fila de `memberships`, así que las rutas pasan la fila y
 * ya. Antes se pasaba solo `venceEl` y de ahí venía el error de abajo.
 */
export interface Cobertura {
  venceEl: string | null;
  clasesRestantes?: number | null;
}

/** De peor a mejor. Entre dos coberturas manda la mejor. */
const ORDEN: EstadoMembresia[] = ['vencido', 'por_vencer', 'al_dia'];

/**
 * Estado del alumno.
 *
 * **Mira las DOS coberturas, y ese es el arreglo.** Antes solo miraba
 * `venceEl`, así que un alumno que acababa de pagar una clase suelta —o un
 * paquete— seguía apareciendo «Por vencer» o «Vencido»: su pago no mueve
 * ninguna fecha, suma clases (ver `nextDue`), y esta función no las veía. El
 * maestro cobraba y el panel del alumno seguía dándole la lata.
 *
 * Cuando hay de las dos manda la mejor: quien tiene la mensualidad al día no
 * está vencido por haber gastado las clases de un paquete viejo, ni al revés.
 *
 * Un saldo de clases no tiene «por vencer»: o quedan clases o no quedan. Que se
 * esté acabando lo dice el kiosco al marcar la última (ver `routes/checkin.ts`),
 * que es donde el alumno está delante para oírlo.
 */
export function estado(
  cobertura: Cobertura,
  today: string,
  ventanaDias = 3,
): EstadoMembresia {
  const { venceEl, clasesRestantes } = cobertura;

  let porTiempo: EstadoMembresia | null = null;
  if (venceEl) {
    if (venceEl < today) porTiempo = 'vencido';
    else porTiempo = (diasFaltantes(venceEl, today) ?? 0) <= ventanaDias ? 'por_vencer' : 'al_dia';
  }

  const porClases: EstadoMembresia | null =
    clasesRestantes == null ? null : clasesRestantes > 0 ? 'al_dia' : 'vencido';

  if (!porTiempo && !porClases) return 'sin_plan';
  if (!porTiempo) return porClases!;
  if (!porClases) return porTiempo;
  return ORDEN.indexOf(porClases) > ORDEN.indexOf(porTiempo) ? porClases : porTiempo;
}
