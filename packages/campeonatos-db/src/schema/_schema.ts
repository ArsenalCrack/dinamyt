import { pgSchema } from 'drizzle-orm/pg-core';

/**
 * Todas las tablas de Campeonatos viven bajo el schema `campeonatos` de
 * PostgreSQL (aislado del schema `ecosystem`). La identidad del usuario se
 * referencia por `ecosystem_user_id` (UUID), sin FK entre bases.
 */
export const camp = pgSchema('campeonatos');

// ── Enums del dominio ────────────────────────────────────────────────────────

/** Ciclo de vida del campeonato (Requerimientos v3, §6.1). */
export const estadoCampeonatoEnum = camp.enum('estado_campeonato', [
  'BORRADOR',
  'LISTO',
  'EN_CURSO',
  'FINALIZADO',
]);

/** Modalidades de competencia (§7.1). Altura y longitud son modalidades distintas. */
export const modalidadEnum = camp.enum('modalidad', [
  'figura_manos_libres',
  'figura_armas',
  'defensa_personal',
  'salto_altura',
  'salto_longitud',
  'combate',
]);

/** Género del competidor. */
export const generoEnum = camp.enum('genero', ['MASCULINO', 'FEMENINO']);

/** Género de una sección: puede ser MIXTO para combates de <= 11 años (§7.1, R4). */
export const generoSeccionEnum = camp.enum('genero_seccion', [
  'MASCULINO',
  'FEMENINO',
  'MIXTO',
]);

/** Grupo de cinturón usado para categorizar (BLANCO < PRINCIPIANTE < INTERMEDIO ...). */
export const grupoCinturonEnum = camp.enum('grupo_cinturon', [
  'BLANCO',
  'PRINCIPIANTE',
  'INTERMEDIO',
  'AVANZADO',
  'NEGRO',
]);

/** Estado de una inscripción (directa queda PENDIENTE hasta aprobación, §6.2). */
export const estadoInscripcionEnum = camp.enum('estado_inscripcion', [
  'PENDIENTE',
  'APROBADA',
  'RECHAZADA',
]);

/** Estado de pago, calculado automáticamente (§5.1). */
export const estadoPagoEnum = camp.enum('estado_pago', [
  'PAGADO',
  'PARCIAL',
  'PENDIENTE',
]);

/** Estado de una sección / cola en el tatami (§8.1). */
export const estadoSeccionEnum = camp.enum('estado_seccion', [
  'EN_ESPERA',
  'EN_CURSO',
  'FINALIZADA',
]);

/** Estado del tatami: OCUPADO cuando tiene una sección EN_CURSO. */
export const estadoTatamiEnum = camp.enum('estado_tatami', ['LIBRE', 'OCUPADO']);

/** Resultado de un combate (hong = rojo, chung = azul). */
export const ganadorCombateEnum = camp.enum('ganador_combate', [
  'hong',
  'chung',
  'empate',
]);
