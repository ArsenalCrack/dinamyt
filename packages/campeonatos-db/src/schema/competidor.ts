import {
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  decimal,
  date,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import {
  camp,
  generoEnum,
  grupoCinturonEnum,
  estadoInscripcionEnum,
  estadoPagoEnum,
  modalidadEnum,
} from './_schema';
import { campeonatos } from './campeonato';

// ── Competidor ───────────────────────────────────────────────────────────────
// Perfil del competidor en Campeonatos. Se ancla al user_id del ecosistema; si
// el maestro lo inscribe antes de que tenga cuenta, queda PROVISIONAL
// (ecosystemUserId = null) y se vincula luego por número de documento (§3.2).
export const competidores = camp.table(
  'competidores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** UUID del usuario en el ecosistema. NULL = perfil provisional. */
    ecosystemUserId: uuid('ecosystem_user_id'),
    /** Identificador puente entre el perfil provisional y la cuenta del ecosistema. */
    documento: varchar('documento', { length: 30 }).notNull(),
    nombreCompleto: varchar('nombre_completo', { length: 200 }).notNull(),
    fechaNacimiento: date('fecha_nacimiento'),
    correo: varchar('correo', { length: 200 }),
    celular: varchar('celular', { length: 30 }),
    genero: generoEnum('genero'),
    /** Peso actual en kg (dato competitivo, editable por maestro o competidor). */
    pesoActual: decimal('peso_actual', { precision: 5, scale: 2 }),
    cinturon: varchar('cinturon', { length: 50 }),
    grupoCinturon: grupoCinturonEnum('grupo_cinturon'),
    academiaClub: varchar('academia_club', { length: 200 }),
    /** Categoría Especial: recibe puntuación máxima sin afectar el ranking (§7.6). */
    categoriaEspecial: boolean('categoria_especial').default(false),
    /** Justificación de la condición especial. Dato sensible: cifrar en la capa app (§11.1). */
    categoriaEspecialJustificacion: text('categoria_especial_justificacion'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_competidor_documento').on(t.documento),
    uniqueIndex('uq_competidor_ecosystem_user').on(t.ecosystemUserId),
  ],
);

// ── Inscripción (competidor ↔ campeonato) ───────────────────────────────────
export const inscripciones = camp.table(
  'inscripciones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campeonatoId: uuid('campeonato_id')
      .notNull()
      .references(() => campeonatos.id),
    competidorId: uuid('competidor_id')
      .notNull()
      .references(() => competidores.id),
    /** Peso al momento de inscribir (puede diferir del peso actual). */
    pesoInscripcion: decimal('peso_inscripcion', { precision: 5, scale: 2 }),
    /** Snapshot del cinturón al inscribir (historial inmutable: queda el cinturón con el que participó). */
    grupoCinturonInscripcion: grupoCinturonEnum('grupo_cinturon_inscripcion'),
    cinturonInscripcion: varchar('cinturon_inscripcion', { length: 50 }),
    estado: estadoInscripcionEnum('estado').notNull().default('PENDIENTE'),
    /** Total = costo base + modalidades extra (calculado, §5.1). */
    montoTotal: decimal('monto_total', { precision: 10, scale: 2 }).default('0'),
    montoAbonado: decimal('monto_abonado', { precision: 10, scale: 2 }).default('0'),
    estadoPago: estadoPagoEnum('estado_pago').notNull().default('PENDIENTE'),
    observacionesPago: text('observaciones_pago'),
    /** Para menores de 18: representante legal (Ley 1098, §11.2). */
    representanteLegalNombre: varchar('representante_legal_nombre', { length: 200 }),
    representanteLegalAcepta: boolean('representante_legal_acepta').default(false),
    /** user_id del ecosistema que inscribió (maestro o admin). */
    inscritoPorUserId: uuid('inscrito_por_user_id'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_inscripcion_campeonato_competidor').on(
      t.campeonatoId,
      t.competidorId,
    ),
  ],
);

// ── Modalidades de cada inscripción (define monto y secciones, §6.2) ─────────
export const inscripcionModalidades = camp.table(
  'inscripcion_modalidades',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    inscripcionId: uuid('inscripcion_id')
      .notNull()
      .references(() => inscripciones.id),
    modalidad: modalidadEnum('modalidad').notNull(),
  },
  (t) => [uniqueIndex('uq_inscripcion_modalidad').on(t.inscripcionId, t.modalidad)],
);
