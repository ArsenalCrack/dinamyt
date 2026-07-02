/**
 * Catálogos compartidos del ecosistema DINAMYT.
 *
 * Son la fuente de verdad para los valores que cruzan la frontera entre el
 * ecosystem (emisor del token) y las apps (consumidoras).
 */

/** Aplicaciones del ecosistema que una suscripción puede habilitar. */
export type AppScope = 'academy' | 'campeonatos';

/**
 * Roles de un usuario dentro de DINAMYT Campeonatos (§4.1):
 * - admin: crea/configura/dirige los campeonatos de su organización.
 * - maestro: maestro del club — inscribe e invita a SUS competidores.
 * - coach: TÍTULO informativo dentro del campeonato (acompaña/representa a
 *   competidores y seguridad lo identifica). NO gestiona ni inscribe.
 * - judge: puntúa en el tatami que le asignen.
 * - competitor: acepta invitaciones, compite y ve su historial.
 */
export type CampeonatosRole =
  | 'admin'
  | 'maestro'
  | 'coach'
  | 'competitor'
  | 'judge';

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
