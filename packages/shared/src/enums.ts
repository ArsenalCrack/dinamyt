/**
 * Catálogos compartidos del ecosistema DINAMYT.
 *
 * Son la fuente de verdad para los valores que cruzan la frontera entre el
 * ecosystem (emisor del token) y las apps (consumidoras).
 */

/** Aplicaciones del ecosistema que una suscripción puede habilitar. */
export type AppScope = 'academy' | 'campeonatos';

/**
 * Roles de un usuario dentro de DINAMYT Campeonatos.
 * Ver Requerimientos de Campeonatos v3, §4.1.
 */
export type CampeonatosRole = 'admin' | 'coach' | 'competitor' | 'judge';

/** Tipos de organización del ecosistema. */
export type OrgType = 'FEDERATION' | 'LEAGUE' | 'CLUB' | 'ACADEMY';

/** Estado de una suscripción. */
export type SubscriptionStatus =
  | 'ACTIVE'
  | 'EXPIRED'
  | 'SUSPENDED'
  | 'PENDING_REVIEW';

/** Estado de pago de una suscripción. */
export type PaymentStatus = 'PAID' | 'PARTIAL' | 'PENDING';
