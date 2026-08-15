import { sql } from 'drizzle-orm';
import {
  uuid,
  varchar,
  boolean,
  integer,
  timestamp,
  date,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { mem, metodoCheckinEnum } from './_schema';
import { memberships } from './planes';

// ── Las clases del club ──────────────────────────────────────────────────────
/**
 * Una clase del club: su nombre, quién entrena en ella y su horario.
 *
 * Existe porque un club puede partir a sus alumnos en dos grupos que entrenan
 * el MISMO día a horas distintas —niños a las cuatro, adultos a las seis— y el
 * horario, que era una lista de días del club, no tenía dónde decirlo.
 *
 * Un club puede no tener ninguna: entonces funciona como siempre, con un solo
 * horario para todo el mundo. Ese es el caso normal y es el que no puede
 * romperse.
 */
export const clubGroups = mem.table(
  'club_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    name: varchar('name', { length: 80 }).notNull(),
    /** Quién entrena aquí y qué se hace. Lo lee el alumno en su panel. */
    descripcion: varchar('descripcion', { length: 500 }),
    /** En qué orden se enseñan las clases. Sin esto salen como salgan. */
    orden: integer('orden').notNull().default(0),
    /**
     * Las clases no se borran, se apagan: sus asistencias son historia del
     * club, y un borrado duro se las llevaría por delante.
     */
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [uniqueIndex('uq_club_group_nombre').on(t.orgId, t.name)],
);

// ── Días/horarios de operación del club (§7.4) ───────────────────────────────
export const clubSchedule = mem.table(
  'club_schedule',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    /**
     * De qué clase es este día. `null` = del club entero, que es lo que usa el
     * club que no divide a sus alumnos.
     *
     * Con clases, dos filas pueden compartir el martes con horas distintas: eso
     * es exactamente lo que la columna `grupo` de antes —un varchar suelto que
     * nadie escribía nunca— no podía representar.
     */
    groupId: uuid('group_id').references(() => clubGroups.id, { onDelete: 'cascade' }),
    /** 0=domingo … 6=sábado. */
    weekday: integer('weekday').notNull(),
    opensAt: varchar('opens_at', { length: 5 }),
    closesAt: varchar('closes_at', { length: 5 }),
    isActive: boolean('is_active').default(true),
  },
  (t) => [index('ix_club_schedule_grupo').on(t.orgId, t.groupId)],
);

// ── Qué se trabaja esta semana ───────────────────────────────────────────────
/**
 * La nota de una semana, de una clase (o del club, si no está dividido).
 *
 * `semana` es SIEMPRE el lunes de esa semana, normalizado por la API: es lo que
 * convierte «la semana del 14» en una clave con la que se puede hacer un índice
 * único y responder «¿qué toca esta semana?» sin recorrer nada.
 */
export const classNotes = mem.table(
  'class_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    /** `null` = la nota del club entero. */
    groupId: uuid('group_id').references(() => clubGroups.id, { onDelete: 'cascade' }),
    /** El LUNES de la semana a la que pertenece la nota. */
    semana: date('semana').notNull(),
    nota: varchar('nota', { length: 500 }).notNull(),
    createdById: uuid('created_by_id'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  // Dos índices parciales y no uno de tres columnas: para PostgreSQL dos NULL
  // son DISTINTOS dentro de un índice único, así que el índice de tres columnas
  // dejaría meter notas repetidas justo en el caso del club sin dividir, donde
  // `groupId` es nulo siempre.
  (t) => [
    uniqueIndex('uq_class_note_grupo')
      .on(t.orgId, t.groupId, t.semana)
      .where(sql`${t.groupId} IS NOT NULL`),
    uniqueIndex('uq_class_note_club')
      .on(t.orgId, t.semana)
      .where(sql`${t.groupId} IS NULL`),
  ],
);

// ── Excepciones del calendario (festivos/cierres y aperturas extra) ──────────
export const scheduleExceptions = mem.table('schedule_exceptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  date: date('date').notNull(),
  isClosed: boolean('is_closed').notNull(),
  /**
   * Por qué el club abre o cierra ese día. Más largo que el resto de textos a
   * propósito: aquí no cabe un dato, cabe una explicación —«cerrado por el
   * campeonato departamental, volvemos el lunes»—, y es lo que el alumno lee
   * en su panel el día que no hay clase.
   */
  note: varchar('note', { length: 500 }),
});

// ── Kioscos / dispositivos registrados ───────────────────────────────────────
export const devices = mem.table('devices', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  os: varchar('os', { length: 40 }),
  hasReader: boolean('has_reader').default(false),
  lastSeenAt: timestamp('last_seen_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

// ── Asistencias / check-ins (única por alumno y día) ─────────────────────────
export const attendances = mem.table(
  'attendances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    membershipId: uuid('membership_id')
      .notNull()
      .references(() => memberships.id),
    checkedInAt: timestamp('checked_in_at').defaultNow(),
    /** Día local del check-in; garantiza unicidad por día (sin doble marca). */
    checkinDate: date('checkin_date').notNull(),
    method: metodoCheckinEnum('method').notNull(),
    /**
     * A qué clase asistió. La sella el check-in desde la membresía del alumno,
     * no la manda el navegador: quien marca no elige a qué clase fue.
     */
    groupId: uuid('group_id').references(() => clubGroups.id, { onDelete: 'set null' }),
    deviceId: uuid('device_id').references(() => devices.id),
  },
  (t) => [uniqueIndex('uq_attendance_day').on(t.membershipId, t.checkinDate)],
);
