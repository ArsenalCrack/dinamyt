import {
  uuid,
  varchar,
  timestamp,
  integer,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { camp, modalidadEnum, generoSeccionEnum, estadoSeccionEnum } from './_schema';
import { campeonatos, tatamis } from './campeonato';
import { inscripciones } from './competidor';

// ── Sección / Categoría ─────────────────────────────────────────────────────
// Se genera automáticamente al inscribir, combinando:
// Modalidad → Género → Grupo Cinturón → Rango Edad → Rango Peso (§6.2).
export const secciones = camp.table('secciones', {
  id: uuid('id').primaryKey().defaultRandom(),
  campeonatoId: uuid('campeonato_id')
    .notNull()
    .references(() => campeonatos.id),
  modalidad: modalidadEnum('modalidad').notNull(),
  genero: generoSeccionEnum('genero'),
  /** Agrupación de cinturón configurada por el admin (texto libre, ej. "Blanco-Naranja"). */
  cinturon: varchar('cinturon', { length: 100 }),
  /** Ej. "12-13". */
  rangoEdad: varchar('rango_edad', { length: 30 }),
  /** Ej. "-50kg". NULL en modalidades sin peso (figuras, defensa personal). */
  rangoPeso: varchar('rango_peso', { length: 30 }),
  /** Clave canónica única generada (para deduplicar al regenerar). */
  clave: varchar('clave', { length: 300 }),
  /** Nombre público (ej. "Combate Masculino Intermedio 15-17"). */
  nombre: varchar('nombre', { length: 200 }).notNull(),
  estado: estadoSeccionEnum('estado').notNull().default('EN_ESPERA'),
  createdAt: timestamp('created_at').defaultNow(),
});

// ── Competidores asignados a cada sección ────────────────────────────────────
export const seccionInscripciones = camp.table(
  'seccion_inscripciones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    seccionId: uuid('seccion_id')
      .notNull()
      .references(() => secciones.id),
    inscripcionId: uuid('inscripcion_id')
      .notNull()
      .references(() => inscripciones.id),
  },
  (t) => [uniqueIndex('uq_seccion_inscripcion').on(t.seccionId, t.inscripcionId)],
);

// ── Cola FIFO de secciones asignadas a tatamis (§8.1) ────────────────────────
export const colaTatami = camp.table('cola_tatami', {
  id: uuid('id').primaryKey().defaultRandom(),
  tatamiId: uuid('tatami_id')
    .notNull()
    .references(() => tatamis.id),
  seccionId: uuid('seccion_id')
    .notNull()
    .references(() => secciones.id),
  orden: integer('orden').notNull().default(0),
  estado: estadoSeccionEnum('estado').notNull().default('EN_ESPERA'),
  inicio: timestamp('inicio'),
  fin: timestamp('fin'),
});
