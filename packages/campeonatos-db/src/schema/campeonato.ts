import {
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  decimal,
  date,
  jsonb,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import {
  camp,
  estadoCampeonatoEnum,
  modalidadEnum,
  estadoTatamiEnum,
  rolTatamiEnum,
} from './_schema';

// ── Campeonato ───────────────────────────────────────────────────────────────
export const campeonatos = camp.table('campeonatos', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Organización del ecosistema dueña del evento (UUID, sin FK entre bases). */
  orgId: uuid('org_id'),
  nombre: varchar('nombre', { length: 200 }).notNull(),
  descripcion: text('descripcion'),
  /** Sede / dirección del evento. */
  ubicacion: varchar('ubicacion', { length: 200 }),
  pais: varchar('pais', { length: 100 }),
  ciudad: varchar('ciudad', { length: 100 }),
  /** Ámbito: Regional | Nacional | Binacional | Internacional. */
  alcance: varchar('alcance', { length: 30 }),
  /** Número de áreas de competencia (1–12). */
  numTatamis: integer('num_tatamis').default(1),
  /** Cupo máximo de participantes (2–10000). */
  maxParticipantes: integer('max_participantes'),
  /** Público (visible y con inscripción abierta) o privado (por código). */
  esPublico: boolean('es_publico').default(true),
  /** Código de acceso para campeonatos privados. */
  codigo: varchar('codigo', { length: 20 }),
  fechaInicio: date('fecha_inicio'),
  fechaFin: date('fecha_fin'),
  estado: estadoCampeonatoEnum('estado').notNull().default('BORRADOR'),
  /** Costo base de participación (§5.1). */
  costoBase: decimal('costo_base', { precision: 10, scale: 2 }).default('0'),
  /** user_id del ecosistema (admin que creó el campeonato). */
  createdByUserId: uuid('created_by_user_id'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ── Modalidades habilitadas por campeonato + su costo extra (§5.1) ───────────
export const modalidadesCampeonato = camp.table(
  'modalidades_campeonato',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campeonatoId: uuid('campeonato_id')
      .notNull()
      .references(() => campeonatos.id),
    modalidad: modalidadEnum('modalidad').notNull(),
    costoExtra: decimal('costo_extra', { precision: 10, scale: 2 }).default('0'),
    activa: boolean('activa').default(true),
    /** Config de categorías para generar secciones: { genero, cinturon[], edad[], peso[] }. */
    categorias: jsonb('categorias'),
  },
  (t) => [uniqueIndex('uq_modalidad_campeonato').on(t.campeonatoId, t.modalidad)],
);

// ── Tatamis (áreas físicas de competencia, §8.1) ─────────────────────────────
export const tatamis = camp.table(
  'tatamis',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campeonatoId: uuid('campeonato_id')
      .notNull()
      .references(() => campeonatos.id),
    numero: integer('numero').notNull(),
    estado: estadoTatamiEnum('estado').notNull().default('LIBRE'),
    activo: boolean('activo').default(true),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (t) => [uniqueIndex('uq_tatami_campeonato_numero').on(t.campeonatoId, t.numero)],
);

// ── Jueces asignados a cada tatami (espejo de COMBAT AsignacionJuez) ─────────
// El acceso del juez es exclusivamente por asignación del administrador; se
// referencia por email del ecosystem (sin FK entre bases) + nombre visible.
export const juecesTatami = camp.table(
  'jueces_tatami',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tatamiId: uuid('tatami_id')
      .notNull()
      .references(() => tatamis.id),
    rolTatami: rolTatamiEnum('rol_tatami').notNull(),
    nombreDisplay: varchar('nombre_display', { length: 150 }).notNull(),
    /** Email de la cuenta del ecosystem (para gatear el acceso del juez). */
    userEmail: varchar('user_email', { length: 200 }),
    /** user_id del ecosystem del admin que asignó. */
    asignadoPorUserId: uuid('asignado_por_user_id'),
    asignadoAt: timestamp('asignado_at').defaultNow(),
  },
  (t) => [
    // Un rol único por tatami (no puede haber dos "j1" en el mismo tatami).
    uniqueIndex('uq_juez_tatami_rol').on(t.tatamiId, t.rolTatami),
  ],
);
