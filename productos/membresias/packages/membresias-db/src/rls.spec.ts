import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDb } from './testing';
import { orgs, users, memberships, plans } from './schema';
import { conContexto } from './contexto';
import type { Db } from './client';

/**
 * Estas pruebas verifican que las POLÍTICAS aíslan de verdad, no solo que
 * existan.
 *
 * Detalle que las hace necesarias: PGlite conecta como `postgres`, que es
 * SUPERUSER, y un superusuario se salta RLS aunque las tablas lo tengan
 * forzado. Si se probara con el rol por defecto, todo pasaría sin que ninguna
 * política se hubiera evaluado nunca. Por eso aquí se crea un rol normal y se
 * consulta desde él, que es como se conecta la API en producción.
 */

const ROL = 'app_sin_privilegios';

async function comoRolNormal(db: Db) {
  await db.execute(sql.raw(`DROP ROLE IF EXISTS ${ROL}`));
  await db.execute(sql.raw(`CREATE ROLE ${ROL} NOLOGIN`));
  await db.execute(sql.raw(`GRANT USAGE ON SCHEMA membresias TO ${ROL}`));
  await db.execute(
    sql.raw(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA membresias TO ${ROL}`,
    ),
  );
}

/** Dos clubes, cada uno con su maestro, su plan y su membresía. */
async function sembrarDosClubes(db: Db) {
  const [clubA] = await db
    .insert(orgs)
    .values({ name: 'Club A', slug: 'club-a' })
    .returning();
  const [clubB] = await db
    .insert(orgs)
    .values({ name: 'Club B', slug: 'club-b' })
    .returning();

  const [usuarioA] = await db
    .insert(users)
    .values({
      email: 'a@club.com',
      fullName: 'Maestro A',
      passwordHash: 'x',
      role: 'owner',
      orgId: clubA.id,
    })
    .returning();
  const [usuarioB] = await db
    .insert(users)
    .values({
      email: 'b@club.com',
      fullName: 'Maestro B',
      passwordHash: 'x',
      role: 'owner',
      orgId: clubB.id,
    })
    .returning();

  const [planA] = await db
    .insert(plans)
    .values({ orgId: clubA.id, name: 'Mensual A', type: 'mensual', price: '100' })
    .returning();
  await db
    .insert(plans)
    .values({ orgId: clubB.id, name: 'Mensual B', type: 'mensual', price: '200' });

  await db
    .insert(memberships)
    .values({ orgId: clubA.id, userId: usuarioA.id, currentPlanId: planA.id });
  await db.insert(memberships).values({ orgId: clubB.id, userId: usuarioB.id });

  return { clubA, clubB };
}

describe('RLS por club', () => {
  it('una consulta SIN filtro de club solo devuelve las filas de su club', async () => {
    const db = (await createTestDb()) as unknown as Db;
    const { clubA } = await sembrarDosClubes(db);
    await comoRolNormal(db);

    // Ojo al SELECT: no lleva WHERE org_id. Es exactamente el descuido que RLS
    // tiene que atrapar, y sin políticas devolvería los planes de los dos clubes.
    const filas = await conContexto(db, { orgId: clubA.id }, async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL ROLE ${ROL}`));
      return tx.select().from(plans);
    });

    expect(filas).toHaveLength(1);
    expect(filas[0].name).toBe('Mensual A');
  });

  it('las membresías del otro club son invisibles', async () => {
    const db = (await createTestDb()) as unknown as Db;
    const { clubB } = await sembrarDosClubes(db);
    await comoRolNormal(db);

    const filas = await conContexto(db, { orgId: clubB.id }, async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL ROLE ${ROL}`));
      return tx.select().from(memberships);
    });

    expect(filas).toHaveLength(1);
    expect(filas[0].orgId).toBe(clubB.id);
  });

  it('no se puede escribir una fila en el club de otro', async () => {
    const db = (await createTestDb()) as unknown as Db;
    const { clubA, clubB } = await sembrarDosClubes(db);
    await comoRolNormal(db);

    const fallo = await conContexto(db, { orgId: clubA.id }, async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL ROLE ${ROL}`));
      try {
        // Contexto del club A intentando crear un plan en el club B.
        await tx
          .insert(plans)
          .values({ orgId: clubB.id, name: 'Intruso', type: 'mensual', price: '1' });
        return null;
      } catch (err) {
        // Drizzle envuelve el error de PostgreSQL: el texto de la política
        // ("new row violates row-level security policy") queda en `cause`.
        return err as Error & { cause?: Error };
      }
    });

    expect(fallo).not.toBeNull();
    expect(String(fallo?.cause?.message ?? fallo?.message)).toMatch(
      /row-level security/i,
    );
  });

  it('sin contexto de club no se ve nada (no es "acceso libre")', async () => {
    const db = (await createTestDb()) as unknown as Db;
    await sembrarDosClubes(db);
    await comoRolNormal(db);

    const filas = await conContexto(db, { orgId: null }, async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL ROLE ${ROL}`));
      return tx.select().from(plans);
    });

    expect(filas).toHaveLength(0);
  });

  it('accesoTotal cruza clubes: es lo que usan el login y el superadmin', async () => {
    const db = (await createTestDb()) as unknown as Db;
    await sembrarDosClubes(db);
    await comoRolNormal(db);

    const filas = await conContexto(
      db,
      { orgId: null, accesoTotal: true },
      async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL ROLE ${ROL}`));
        return tx.select().from(plans);
      },
    );

    expect(filas).toHaveLength(2);
  });

  it('el contexto no sobrevive a la transacción (no se filtra entre peticiones)', async () => {
    const db = (await createTestDb()) as unknown as Db;
    const { clubA } = await sembrarDosClubes(db);
    await comoRolNormal(db);

    await conContexto(db, { orgId: clubA.id }, async (tx) => {
      await tx.select().from(plans);
    });

    // Una transacción posterior que no fije nada arranca en blanco: si
    // set_config no fuera local, aquí seguiría viéndose el club A.
    const despues = await conContexto(db, { orgId: null }, async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL ROLE ${ROL}`));
      return tx.select().from(plans);
    });

    expect(despues).toHaveLength(0);
  });
});
