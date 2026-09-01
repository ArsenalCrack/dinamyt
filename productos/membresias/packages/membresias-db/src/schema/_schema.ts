import { pgSchema } from 'drizzle-orm/pg-core';

/**
 * Todas las tablas viven bajo el schema `membresias` de PostgreSQL. Desde que
 * Membresías es un producto independiente, la identidad de las personas
 * (clubes y usuarios) también vive aquí: ver `schema/identidad.ts`.
 */
export const mem = pgSchema('membresias');

/**
 * ── Las fechas de aquí son de DOS clases, y se escriben distinto ───────────
 *
 * **Instantes** — cuándo pasó algo: `created_at`, `checked_in_at`, `paid_at`,
 * `sent_at`… Llevan `{ withTimezone: true }`, o sea `timestamptz`. Guardan un
 * punto en el tiempo, no una hora de pared, así que da igual si el valor lo
 * pone `DEFAULT now()` (la base, en SU zona) o un `new Date()` de la
 * aplicación (UTC): los dos escriben el mismo instante y los dos se leen bien.
 *
 * Sin zona no daba igual, y se veía en la pantalla que más se mira: la hora de
 * la asistencia. La base escribía la hora de pared del servidor
 * (`TZ=America/Bogota` en el VPS), Drizzle la leía dando por hecho que era UTC
 * (`mapFromDriverValue` le pega un `+0000`), y el kiosco enseñaba cada marca
 * **cinco horas en el pasado**. En local no se veía porque PGlite arranca en
 * `GMT` y los dos convenios coincidían de casualidad. El arreglo es la
 * migración `0017_fechas_con_zona`.
 *
 * **Fechas civiles** — un día del calendario, sin hora: `vence_el`,
 * `birth_date`, `checkin_date`, `semana`, `periodo_desde`… Son columnas `date`
 * y **no se tocan**: un cumpleaños no ocurre a una hora, y una mensualidad que
 * vence «el 31» no vence a las 19:00 del 30.
 *
 * **La regla para una columna nueva:** ¿se va a comparar con `Date.now()` o a
 * pintar con una hora? Instante, `timestamp(..., { withTimezone: true })`.
 * ¿Es un día que alguien escribiría en un formulario? `date`.
 */

// ── Enums del dominio ────────────────────────────────────────────────────────

/**
 * Rol de un usuario DENTRO de su club.
 *
 * El superadmin no está en esta lista: es el booleano `users.is_super_admin`,
 * aparte, porque atraviesa todos los clubes en vez de pertenecer a uno (mismo
 * criterio que DINAMYT-LOCAL: así ampliar la jerarquía no obliga a migrar el
 * tipo en bases existentes).
 */
export const rolUsuarioEnum = mem.enum('rol_usuario', [
  'owner',
  'staff',
  'guardian',
  'student',
]);

/** Tipo de plan/tarifa (§5.1 PLAN_MEMBRESIAS). */
export const tipoPlanEnum = mem.enum('tipo_plan', [
  'mensual',
  'semanal',
  'clase',
  'paquete',
  'matricula',
]);

/** Método con que se recibió el pago (solo metadato; el cobro es externo). */
export const metodoPagoEnum = mem.enum('metodo_pago', [
  'efectivo',
  'transferencia',
  'nequi',
  'daviplata',
]);

/** Estado de un pago (soporta pago parcial). */
export const estadoPagoEnum = mem.enum('estado_pago', [
  'PAGADO',
  'PARCIAL',
  'PENDIENTE',
]);

/** Estado de la membresía del alumno EN ESTE club. */
export const estadoMembresiaEnum = mem.enum('estado_membresia', [
  'activo',
  'inactivo',
  'suspendido',
  'retirado',
]);

/**
 * Cómo se identificó al alumno en el check-in.
 *
 * `fingerprint` es historia: el lector de huella se retiró del producto. El
 * valor sigue en el enum porque quitarlo obligaría a migrar el tipo en bases
 * existentes y a reescribir asistencias ya registradas. Nada lo emite hoy.
 */
export const metodoCheckinEnum = mem.enum('metodo_checkin', [
  'fingerprint',
  'qr',
  'pin',
  'manual',
]);

/** Canal por el que se envía un aviso. */
export const canalNotifEnum = mem.enum('canal_notif', ['push', 'email', 'inapp']);

/** Tipo de aviso. */
export const tipoNotifEnum = mem.enum('tipo_notif', [
  'pre_venc',
  'venc',
  'mora',
  'maestro',
]);

/** Estado de un aviso encolado. */
export const estadoNotifEnum = mem.enum('estado_notif', [
  'PENDIENTE',
  'ENVIADA',
  'FALLIDA',
]);
