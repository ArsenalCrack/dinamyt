import { sql } from 'drizzle-orm';
import {
  uuid,
  varchar,
  text,
  boolean,
  date,
  timestamp,
  index,
  uniqueIndex,
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
  /**
   * Escudo del club: data-URL o http, igual que la foto de un alumno. Lo sube
   * el MAESTRO —es su club— y sale en el carnet y en el panel de sus alumnos.
   * Ver `apps/membresias-api/src/lib/fotos.ts`.
   */
  logoUrl: text('logo_url'),
  isActive: boolean('is_active').notNull().default(true),
  /**
   * El mismo club, visto desde el ecosistema DINAMYT.
   *
   * Es un ESPEJO, no una clave: `id` no se toca porque lo referencian ocho
   * tablas y todas las políticas de RLS. Lo llena la reconciliación (§2.4 del
   * plan maestro) y sirve para que el club exista una sola vez —el maestro lo
   * registra en el portal y aparece en Membresías y en Campeonatos con su
   * gente ya asociada—. Vacío mientras Membresías corra sola.
   */
  ecoOrgId: uuid('eco_org_id'),
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
    /**
     * bcrypt. Nunca sale de la API. **Puede estar vacío.**
     *
     * Vacío significa «esta persona entra por DINAMYT»: su ficha la creó el
     * canje del SSO (`POST /auth/sso`) a partir de su cuenta del ecosistema, y
     * su contraseña vive allí, una sola vez. Antes era obligatorio, y eso era
     * justo lo que rompía el puente: el alumno que su maestro había dado de
     * alta en el portal llegaba aquí y se le decía que le pidiera a su maestro
     * que lo agregara.
     *
     * El login no necesita saberlo: `verificarPassword` con un hash vacío
     * devuelve `false` sin lanzar, así que estas fichas no entran por el
     * formulario y lo hacen con el mismo mensaje genérico que un correo que no
     * existe. Decir «esta entra por DINAMYT» delataría qué correos hay dados de
     * alta.
     */
    passwordHash: varchar('password_hash', { length: 255 }),
    phone: varchar('phone', { length: 40 }),
    /** Foto de perfil: data-URL o http. La ve el maestro en el roster. */
    avatarUrl: text('avatar_url'),
    /**
     * Cinturón del alumno, por nombre y no por enum: el catálogo lo fija la
     * aplicación (ver `lib/cinturones.ts`) y así añadir un grado nuevo no
     * obliga a migrar el tipo en las bases que ya existen — mismo criterio que
     * DINAMYT-LOCAL con sus competidores.
     */
    belt: varchar('belt', { length: 40 }),
    /**
     * Desde cuándo entrena, que NO es desde cuándo tiene cuenta.
     *
     * Un club que estrena la app trae alumnos con años encima: si su antigüedad
     * saliera de `created_at`, todos empezarían de cero el día que el maestro
     * los dio de alta. La pone el maestro y, si no la pone, se cae de vuelta a
     * `created_at`.
     */
    trainsSince: date('trains_since'),
    /**
     * Cuándo nació. Opcional: nadie se queda sin cuenta por no acordarse.
     *
     * Es el único dato de la ficha que su dueño puede poner PERO NO CORREGIR.
     * La asimetría es a propósito: el alumno es quien mejor sabe cuándo nació,
     * así que dejarlo rellenar el hueco ahorra una pregunta en clase; pero una
     * vez escrita, la fecha decide qué día lo felicita el club y —el día que
     * haya categorías por edad— en cuál compite. Un campo así no puede quedar
     * al alcance de quien tenga una tarde aburrida. Lo corrige el maestro (ver
     * `PATCH /auth/me` y `PATCH /users/:id`).
     */
    birthDate: date('birth_date'),
    /**
     * Cuándo se expidió su carnet. De aquí sale la vigencia impresa.
     *
     * Existe porque antes no existía: el carnet se imprimía con «emitido hoy,
     * vence dentro de un año» calculado en el navegador en el momento de
     * imprimir. Así el papel jamás vencía —reimprimirlo ERA renovarlo— y dos
     * copias del mismo carnet decían cosas distintas según el día.
     *
     * Se fija al dar de alta a la persona y solo la mueve un acto deliberado
     * del maestro: reexpedir el carnet (ver `POST /users/:id/carnet`).
     */
    carnetEmitidoEl: date('carnet_emitido_el').notNull().default(sql`CURRENT_DATE`),
    /**
     * Datos que solo importan el día que importan: si a alguien le pasa algo en
     * el tatami, están en su carnet y no hay que buscar a nadie.
     */
    bloodType: varchar('blood_type', { length: 8 }),
    emergencyName: varchar('emergency_name', { length: 150 }),
    emergencyPhone: varchar('emergency_phone', { length: 40 }),
    role: rolUsuarioEnum('role').notNull().default('student'),
    /** Atraviesa todos los clubes. Ver `rolUsuarioEnum`. */
    isSuperAdmin: boolean('is_super_admin').notNull().default(false),
    /** Club al que pertenece. `null` solo para el superadmin. */
    orgId: uuid('org_id').references(() => orgs.id),
    isActive: boolean('is_active').notNull().default(true),
    /** Quién lo dio de alta (trazabilidad de la jerarquía). */
    createdById: uuid('created_by_id'),
    /**
     * La cuenta de esta persona en el ecosistema DINAMYT (el `sub` de su
     * token). Una persona, una cuenta, para siempre; esta fila es su FICHA en
     * este club, que es otra cosa (§2 del plan maestro).
     *
     * Es lo que hace que el enlace no dependa del correo: si alguien cambia el
     * suyo en el portal, la ficha lo sigue reconociendo. Vacío en las fichas
     * que todavía no tienen cuenta —el alumno sin correo que entra por carnet
     * QR o PIN—, que siguen funcionando igual que siempre.
     */
    ecoSub: uuid('eco_sub'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (t) => [
    index('ix_users_org').on(t.orgId),
    // Parcial: dos fichas sin cuenta no chocan entre sí, pero una cuenta del
    // ecosistema no puede acabar enlazada a dos fichas del mismo club.
    uniqueIndex('ux_membresias_users_eco_sub')
      .on(t.ecoSub)
      .where(sql`${t.ecoSub} is not null`),
  ],
);
