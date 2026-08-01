import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDb } from './testing';
import { orgs, users } from './schema';
import type { Db } from './client';

/**
 * La migración que pone en mayúsculas los nombres que YA estaban guardados.
 *
 * **Por qué merece su propio test.** `users` tiene RLS con `FORCE`, así que las
 * políticas se aplican también al dueño de las tablas. Fuera de una petición no
 * hay `app.org_id` fijado, de modo que `org_id = org_actual()` es NULL para
 * todas las filas: un `UPDATE` a secas se saldría con **cero filas tocadas y
 * sin ningún error**, la migración quedaría marcada como aplicada y los
 * nombres viejos seguirían en minúsculas para siempre. Nadie se enteraría hasta
 * imprimir un carnet.
 *
 * Por eso la migración abre `app.acceso_total` y por eso esto se prueba con un
 * rol NORMAL: PGlite conecta como `postgres`, que es SUPERUSER y se salta RLS,
 * así que probándolo con el rol por defecto pasaría igual estando roto.
 */

const ROL = 'app_migracion';
const SQL_MIGRACION = join(
  __dirname,
  '..',
  'drizzle',
  'migrations',
  '0011_nombres_en_mayusculas.sql',
);

/** Las sentencias del archivo, como se las pasa el migrador de Drizzle. */
function sentencias(archivo: string): string[] {
  return readFileSync(archivo, 'utf8')
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function comoRolNormal(db: Db) {
  await db.execute(sql.raw(`DROP ROLE IF EXISTS ${ROL}`));
  await db.execute(sql.raw(`CREATE ROLE ${ROL} NOLOGIN`));
  await db.execute(sql.raw(`GRANT USAGE ON SCHEMA membresias TO ${ROL}`));
  await db.execute(
    sql.raw(`GRANT SELECT, UPDATE ON ALL TABLES IN SCHEMA membresias TO ${ROL}`),
  );
}

async function sembrar(db: Db) {
  const [club] = await db
    .insert(orgs)
    .values({ name: 'Club Viejo', slug: 'club-viejo' })
    .returning();
  await db.insert(users).values([
    {
      email: 'jose@club.com',
      fullName: 'josé maría ñuñez',
      emergencyName: 'ana restrepo',
      passwordHash: 'x',
      role: 'student',
      orgId: club.id,
    },
    {
      email: 'mixto@club.com',
      fullName: 'Juan Pérez',
      passwordHash: 'x',
      role: 'student',
      orgId: club.id,
    },
    {
      // El superadmin no pertenece a ningún club: `org_id` NULL. Es el que se
      // quedaría fuera de cualquier arreglo que filtrara por club.
      email: 'super@club.com',
      fullName: 'super admin',
      passwordHash: 'x',
      role: 'owner',
      orgId: null,
    },
  ]);
  return club;
}

/** Los nombres guardados, leídos como superusuario (sin RLS de por medio). */
async function nombres(db: Db): Promise<string[]> {
  const filas = await db.select({ n: users.fullName }).from(users);
  return filas.map((f) => f.n).sort();
}

describe('0011 — nombres en mayúsculas', () => {
  it('sube a mayúsculas los nombres ya guardados, con RLS activo', async () => {
    const db = (await createTestDb()) as unknown as Db;
    await sembrar(db);
    await comoRolNormal(db);

    // Igual que el migrador: todas las sentencias en UNA transacción (ver
    // `PgDialect.migrate`), y con un rol normal, como en producción.
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL ROLE ${ROL}`));
      for (const s of sentencias(SQL_MIGRACION)) await tx.execute(sql.raw(s));
    });

    expect(await nombres(db)).toEqual([
      'JOSÉ MARÍA ÑUÑEZ',
      'JUAN PÉREZ',
      'SUPER ADMIN',
    ]);

    // Las tildes y la eñe sobreviven: son parte del nombre de la persona.
    const [conTilde] = await db
      .select({ e: users.emergencyName })
      .from(users)
      .where(sql`${users.email} = 'jose@club.com'`);
    expect(conTilde.e).toBe('ANA RESTREPO');
  });

  it('sin abrir el acceso total, el UPDATE no tocaría ni una fila', async () => {
    // Este es el fallo silencioso contra el que protege la migración: no da
    // error, simplemente no hace nada. Si algún día alguien «simplifica» el
    // `set_config`, este test lo dice.
    const db = (await createTestDb()) as unknown as Db;
    await sembrar(db);
    await comoRolNormal(db);

    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL ROLE ${ROL}`));
      await tx.execute(
        sql.raw(`UPDATE "membresias"."users" SET "full_name" = upper("full_name")`),
      );
    });

    expect(await nombres(db)).toEqual(['Juan Pérez', 'josé maría ñuñez', 'super admin']);
  });

  it('el acceso total no sobrevive a la transacción de la migración', async () => {
    // `set_config(..., true)` es LOCAL. Si se hubiera puesto en `false`, la
    // conexión saldría del pool con permiso para ver todos los clubes.
    const db = (await createTestDb()) as unknown as Db;
    await sembrar(db);

    await db.transaction(async (tx) => {
      for (const s of sentencias(SQL_MIGRACION)) await tx.execute(sql.raw(s));
    });

    const r = (await db.execute(
      sql.raw(`SELECT membresias.acceso_total() AS acceso`),
    )) as unknown as { rows: { acceso: boolean }[] };
    expect(r.rows[0].acceso).toBe(false);
  });
});
