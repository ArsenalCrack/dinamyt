import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { eq } from 'drizzle-orm';
import * as schema from './schema';
import {
  campeonatos,
  competidores,
  inscripciones,
  inscripcionModalidades,
} from './schema';

// Verifica el schema contra un Postgres real EN MEMORIA (PGlite/WASM): aplica
// las migraciones generadas y comprueba defaults, FKs y constraints. No requiere
// Docker ni base de datos externa.
describe('schema campeonatos (PGlite)', () => {
  let db: PgliteDatabase<typeof schema>;

  beforeAll(async () => {
    const client = new PGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: 'drizzle/migrations' });
  });

  it('aplica migraciones y respeta los defaults del campeonato', async () => {
    const [c] = await db
      .insert(campeonatos)
      .values({ nombre: 'Copa Test' })
      .returning();
    expect(c.estado).toBe('BORRADOR');
    // Postgres devuelve decimal(10,2) con escala: '0.00', no '0'.
    expect(c.costoBase).toBe('0.00');
  });

  it('crea competidor provisional + inscripción con FK y default de pago', async () => {
    const [c] = await db
      .insert(campeonatos)
      .values({ nombre: 'Copa Norte' })
      .returning();
    const [comp] = await db
      .insert(competidores)
      .values({
        documento: '1093295569',
        nombreCompleto: 'Juan Pérez',
        genero: 'MASCULINO',
        grupoCinturon: 'INTERMEDIO',
      })
      .returning();
    expect(comp.ecosystemUserId).toBeNull(); // perfil provisional

    const [ins] = await db
      .insert(inscripciones)
      .values({ campeonatoId: c.id, competidorId: comp.id })
      .returning();
    expect(ins.estado).toBe('PENDIENTE');
    expect(ins.estadoPago).toBe('PENDIENTE');

    await db
      .insert(inscripcionModalidades)
      .values({ inscripcionId: ins.id, modalidad: 'combate' });
    const mods = await db
      .select()
      .from(inscripcionModalidades)
      .where(eq(inscripcionModalidades.inscripcionId, ins.id));
    expect(mods).toHaveLength(1);
    expect(mods[0].modalidad).toBe('combate');
  });

  it('rechaza documento de competidor duplicado (unique)', async () => {
    await db
      .insert(competidores)
      .values({ documento: 'DUP-001', nombreCompleto: 'Uno' });
    await expect(
      db
        .insert(competidores)
        .values({ documento: 'DUP-001', nombreCompleto: 'Dos' }),
    ).rejects.toThrow();
  });
});
