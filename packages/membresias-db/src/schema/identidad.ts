import {
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { mem, rolUsuarioEnum } from './_schema';

/**
 * Identidad propia de DINAMYT Membresías.
 *
 * Antes las personas vivían en el ecosistema DINAMYT y esta app solo leía su
 * roster. Como producto independiente, los clubes y los usuarios viven aquí:
 * Membresías emite sus propios tokens y no necesita ningún servicio externo
 * para funcionar.
 */

// ── Clubes ───────────────────────────────────────────────────────────────────
// Los crea el SUPERADMIN. `is_active` es la llave del negocio: apagarlo deja
// fuera al club entero (maestro incluido) sin borrar un solo dato.
export const orgs = mem.table('orgs', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 120 }).notNull(),
  /** Identificador legible y único (para URLs y para que el maestro lo reconozca). */
  slug: varchar('slug', { length: 60 }).notNull().unique(),
  city: varchar('city', { length: 80 }),
  country: varchar('country', { length: 80 }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ── Usuarios ─────────────────────────────────────────────────────────────────
// Toda persona que entra a la app: superadmin, maestro (owner), auxiliar
// (staff), acudiente (guardian) y alumno (student).
//
// No hay auto-registro ni recuperación de contraseña por correo: el superadmin
// crea los maestros y el maestro crea a su gente. Quien olvida su contraseña se
// la pide a quien lo creó. Por eso esta app no envía un solo email.
export const users = mem.table(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    fullName: varchar('full_name', { length: 150 }).notNull(),
    /** bcrypt. Nunca sale de la API. */
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    phone: varchar('phone', { length: 40 }),
    /** Foto de perfil: data-URL o http. La ve el maestro en el roster. */
    avatarUrl: text('avatar_url'),
    role: rolUsuarioEnum('role').notNull().default('student'),
    /** Atraviesa todos los clubes. Ver `rolUsuarioEnum`. */
    isSuperAdmin: boolean('is_super_admin').notNull().default(false),
    /** Club al que pertenece. `null` solo para el superadmin. */
    orgId: uuid('org_id').references(() => orgs.id),
    isActive: boolean('is_active').notNull().default(true),
    /** Quién lo dio de alta (trazabilidad de la jerarquía). */
    createdById: uuid('created_by_id'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [index('ix_users_org').on(t.orgId)],
);
