import { pgSchema } from 'drizzle-orm/pg-core';

/**
 * Todas las tablas de Academy viven bajo el schema `academy` de PostgreSQL
 * (aislado de `ecosystem`, `campeonatos` y `membresias`). La identidad de la
 * persona se referencia por `ecosystem_user_id` (UUID), sin FK entre bases.
 */
export const aca = pgSchema('academy');

// ── Enums del dominio ────────────────────────────────────────────────────────

/** Rol LOCAL de Academy (complementa `role_academy` del token; §2.2 spec). */
export const rolAcademyEnum = aca.enum('rol_academy', [
  'admin',
  'teacher',
  'student',
]);

/** Tipo de unidad de contenido (RF-ACA-10). */
export const tipoContenidoEnum = aca.enum('tipo_contenido', [
  'documento',
  'video',
  'imagen',
  'texto',
]);

/** Tipo de pregunta de una evaluación (RF-ACA-17/18). */
export const tipoPreguntaEnum = aca.enum('tipo_pregunta', [
  'opcion_multiple',
  'evidencia',
]);

/** Ciclo de vida de un intento de evaluación. */
export const estadoIntentoEnum = aca.enum('estado_intento', [
  'EN_CURSO',
  'ENVIADO',
  'CALIFICADO',
]);

/** Estado de una solicitud de maestro (RF-ACA-27). */
export const estadoSolicitudEnum = aca.enum('estado_solicitud', [
  'PENDIENTE',
  'APROBADA',
  'RECHAZADA',
]);

/** Naturaleza de una evaluación: cuestionario (opción múltiple), tarea
 *  (entregable/evidencia) o actividad (mixta). Etiqueta pedagógica: el motor
 *  de preguntas es el mismo. */
export const tipoEvaluacionEnum = aca.enum('tipo_evaluacion', [
  'cuestionario',
  'tarea',
  'actividad',
]);

/** Ciclo de vida del análisis de una figura (visión por computador). */
export const estadoFiguraEnum = aca.enum('estado_figura', [
  'PROCESANDO',
  'COMPLETADO',
  'ERROR',
]);
