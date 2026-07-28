import {
  uuid,
  varchar,
  boolean,
  integer,
  timestamp,
  date,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { mem, metodoCheckinEnum } from './_schema';
import { memberships } from './planes';

// ── Días/horarios de operación del club (§7.4) ───────────────────────────────
export const clubSchedule = mem.table('club_schedule', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  /** 0=domingo … 6=sábado. */
  weekday: integer('weekday').notNull(),
  opensAt: varchar('opens_at', { length: 5 }),
  closesAt: varchar('closes_at', { length: 5 }),
  grupo: varchar('grupo', { length: 80 }),
  isActive: boolean('is_active').default(true),
});

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
    grupo: varchar('grupo', { length: 80 }),
    deviceId: uuid('device_id').references(() => devices.id),
  },
  (t) => [uniqueIndex('uq_attendance_day').on(t.membershipId, t.checkinDate)],
);
