import { uuid, integer, decimal, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { camp } from './_schema';
import { secciones } from './seccion';
import { inscripciones } from './competidor';

// ── Resultados de modalidades puntuadas por 4 jueces físicos ─────────────────
// Aplica a figura manos libres, figura con armas, defensa personal y saltos.
// El total es la suma de los jueces activos; soporta < 4 jueces (§7.2, RF-CAM-10).
// En defensa personal solo se califica al competidor que presenta como
// "Defensor" (la pareja no se evalúa), así que se puntúa una sola inscripción.
export const resultadosFigura = camp.table('resultados_figura', {
  id: uuid('id').primaryKey().defaultRandom(),
  seccionId: uuid('seccion_id')
    .notNull()
    .references(() => secciones.id),
  inscripcionId: uuid('inscripcion_id')
    .notNull()
    .references(() => inscripciones.id),
  j1: decimal('j1', { precision: 6, scale: 2 }),
  j2: decimal('j2', { precision: 6, scale: 2 }),
  j3: decimal('j3', { precision: 6, scale: 2 }),
  j4: decimal('j4', { precision: 6, scale: 2 }),
  total: decimal('total', { precision: 7, scale: 2 }),
  posicion: integer('posicion'),
  /** Saltos: oportunidades por distancia/altura (intento + 2 repeticiones, §7.4). */
  detalle: jsonb('detalle'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
