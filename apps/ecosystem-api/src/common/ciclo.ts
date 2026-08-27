/**
 * El ciclo de cobro de una suscripción del ecosistema.
 *
 * ── Por qué esto es una copia y no un import ──
 *
 * Es la misma lógica que `lib/billing.ts` de Membresías, y a propósito: si el
 * ecosistema contara los meses de otra manera, un club vería una fecha en el
 * panel del super-admin y otra en su propia app. Pero Membresías **es un
 * producto que se vende solo**, en otro repositorio y a veces en otra máquina;
 * importarla desde aquí ataría los dos despliegues para siempre a cambio de
 * cuarenta líneas. Se copia lo que hace falta —solo el ciclo mensual— y se
 * anota de dónde viene.
 *
 * ── Todo son cadenas 'YYYY-MM-DD' y todo se calcula en UTC ──
 *
 * La columna de la base es un `timestamp`, pero la aritmética de meses se hace
 * sobre texto: sumar un mes a un `Date` local en Bogotá y volver a leerlo puede
 * caer en el día anterior según la hora, y una suscripción que vence «el 31»
 * acaba venciendo el 30 sin que nadie haya tocado nada.
 */

/** Estado de una suscripción frente a su fecha de vencimiento. */
export type EstadoSuscripcion =
  | 'al_dia'
  | 'por_vencer'
  | 'vencida'
  | 'sin_fecha';

function parse(d: string): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function diasDelMes(anio: number, mesIndice0: number): number {
  return new Date(Date.UTC(anio, mesIndice0 + 1, 0)).getUTCDate();
}

/**
 * Hoy como 'YYYY-MM-DD', en la zona que se le diga.
 *
 * ── Por qué la zona es un parámetro ───────────────────────────────────────
 *
 * Antes esto leía el reloj local del proceso, que en el VPS es
 * `TZ=America/Bogota`. Mientras todos los clubes estuvieran en Colombia daba
 * igual; en cuanto hay uno en España, «vence hoy» se calcula con el día de
 * Bogotá y ese club recibe el aviso de vencimiento con un día de desfase — o
 * lo recibe cuando para él ya venció.
 *
 * La zona del club vive en `organizations.timezone`. Quien no la pase se
 * queda con el comportamiento de siempre, que es lo correcto para todo lo que
 * no pertenece a ningún club en concreto.
 */
export function hoyStr(zona?: string | null, ahora = new Date()): string {
  if (zona) {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: zona,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(ahora);
    } catch {
      // Una zona que este Node no conoce no puede tumbar el cálculo de un
      // vencimiento: se cae al reloj del servidor, como antes.
    }
  }
  const y = ahora.getFullYear();
  const m = String(ahora.getMonth() + 1).padStart(2, '0');
  const day = String(ahora.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Una fecha de la base como 'YYYY-MM-DD'. */
export function comoFecha(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

/** Día del mes en el que cae una fecha: el ancla del ciclo. */
export function anclaDe(fecha: string): number {
  return parse(fecha).getUTCDate();
}

/**
 * Suma `meses` conservando el día ancla, recortando al último día del mes
 * cuando ese día no existe.
 *
 * Es lo que hace que quien empezó el 31 de enero venza el 28 de febrero y el
 * **31** de marzo — y no el 28 de marzo, que es donde acaba quien suma días en
 * vez de meses y va perdiendo tres cada vez que pasa por un mes corto.
 */
export function sumarMeses(base: string, meses: number, ancla: number): string {
  const b = parse(base);
  const indice = b.getUTCMonth() + meses;
  const anio = b.getUTCFullYear() + Math.floor(indice / 12);
  const mes = ((indice % 12) + 12) % 12;
  const dia = Math.min(ancla, diasDelMes(anio, mes));
  return fmt(new Date(Date.UTC(anio, mes, dia)));
}

/**
 * El vencimiento nuevo al renovar.
 *
 * Se ancla en `max(hoy, vencimientoAnterior)`, y esa es toda la regla:
 *
 *   · Quien renueva **antes** de vencer no pierde los días que le quedaban —
 *     encadena desde su fecha, no desde hoy.
 *   · Quien renueva **tarde** no recibe gratis el tiempo que estuvo vencido:
 *     el mes nuevo empieza hoy. Encadenar desde una fecha de hace tres meses
 *     le vendería un mes que ya se gastó.
 *
 * El ancla se conserva entre renovaciones (`anclaGuardada`) para que el club
 * que paga el día 5 siga venciendo el 5 aunque un mes se retrase al 12.
 */
export function siguienteVencimiento(entrada: {
  hoy: string;
  vencimientoAnterior: string | null;
  meses: number;
  anclaGuardada?: number | null;
}): string {
  const { hoy, vencimientoAnterior } = entrada;
  const base =
    vencimientoAnterior && vencimientoAnterior > hoy
      ? vencimientoAnterior
      : hoy;
  const ancla = entrada.anclaGuardada ?? anclaDe(base);
  return sumarMeses(base, Math.max(1, entrada.meses), ancla);
}

/**
 * Dónde EMPIEZA cada mes que compró una renovación.
 *
 * Sirve para decir a qué periodo corresponde el dinero, no solo cuándo entró
 * en caja: un club que paga tres meses de golpe en agosto no metió el triple
 * en agosto — compró agosto, septiembre y octubre.
 */
export function iniciosDePeriodo(entrada: {
  desde: string;
  meses: number;
}): string[] {
  const total = Math.max(1, entrada.meses);
  const ancla = anclaDe(entrada.desde);
  const out: string[] = [];
  let actual = entrada.desde;
  for (let i = 0; i < total; i++) {
    out.push(actual);
    actual = sumarMeses(actual, 1, ancla);
  }
  return out;
}

/** Días que faltan para el vencimiento. Negativo si ya pasó. */
export function diasFaltantes(
  vence: string | null,
  hoy: string,
): number | null {
  if (!vence) return null;
  return Math.round(
    (parse(vence).getTime() - parse(hoy).getTime()) / 86_400_000,
  );
}

/**
 * Cómo está una suscripción hoy.
 *
 * `ventanaDias` es cuánto antes se empieza a avisar. Siete y no tres como en
 * Membresías: allí avisa al alumno, que paga el mismo día en el club; aquí
 * avisa a un maestro que tiene que hacer una transferencia y a un
 * administrador que tiene que acordarse de cobrar.
 */
export function estadoSuscripcion(
  vence: string | null,
  hoy: string,
  ventanaDias = 7,
): EstadoSuscripcion {
  if (!vence) return 'sin_fecha';
  if (vence < hoy) return 'vencida';
  return (diasFaltantes(vence, hoy) ?? 0) <= ventanaDias
    ? 'por_vencer'
    : 'al_dia';
}
