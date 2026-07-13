import { pgSchema } from 'drizzle-orm/pg-core';

/**
 * Todas las tablas de Membresías viven bajo el schema `membresias` de PostgreSQL
 * (aislado de `ecosystem` y `campeonatos`). La identidad de la persona se
 * referencia por `ecosystem_user_id` (UUID), sin FK entre bases.
 */
export const mem = pgSchema('membresias');

// ── Enums del dominio ────────────────────────────────────────────────────────

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

/** Cómo se identificó al alumno en el check-in. */
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
