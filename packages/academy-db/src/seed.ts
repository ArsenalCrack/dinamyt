import { eq } from 'drizzle-orm';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { martialArts, grades } from './schema';

/**
 * Jerarquía de once cinturones de Hapkido (GHA / Hapkido del Cóndor) en cinco
 * grupos de competencia (RF-ACA-07). MISMO catálogo que usa Campeonatos: si
 * cambia allá, debe cambiar aquí.
 */
export const HAPKIDO_GRADOS: { nombre: string; grupo: string }[] = [
  { nombre: 'Blanco', grupo: 'BLANCO' },
  { nombre: 'Amarillo', grupo: 'PRINCIPIANTE' },
  { nombre: 'Naranja', grupo: 'PRINCIPIANTE' },
  { nombre: 'Naranja/Verde', grupo: 'PRINCIPIANTE' },
  { nombre: 'Verde', grupo: 'INTERMEDIO' },
  { nombre: 'Verde/Azul', grupo: 'INTERMEDIO' },
  { nombre: 'Azul', grupo: 'INTERMEDIO' },
  { nombre: 'Rojo', grupo: 'AVANZADO' },
  { nombre: 'Marrón', grupo: 'AVANZADO' },
  { nombre: 'Marrón/Negro', grupo: 'AVANZADO' },
  { nombre: 'Negro', grupo: 'NEGRO' },
];

/** Base común de Drizzle sobre Postgres: cubre postgres-js Y PGlite. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPgDb = PgDatabase<PgQueryResultHKT, any, any>;

/**
 * Siembra idempotente del arte marcial inicial: Hapkido con sus 11 cinturones
 * (RF-ACA-07). Si Hapkido ya existe, no hace nada.
 */
export async function seedAcademy(db: AnyPgDb): Promise<void> {
  const existentes = await db
    .select({ id: martialArts.id })
    .from(martialArts)
    .where(eq(martialArts.name, 'Hapkido'));
  if (existentes.length > 0) return;

  const [hapkido] = await db
    .insert(martialArts)
    .values({
      name: 'Hapkido',
      description:
        'Arte marcial coreano de defensa personal. Programa técnico de la ' +
        'Global Hapkido Association y la academia Hapkido del Cóndor.',
      federation: 'Global Hapkido Association (GHA)',
    })
    .returning({ id: martialArts.id });

  await db.insert(grades).values(
    HAPKIDO_GRADOS.map((g, i) => ({
      martialArtId: hapkido.id,
      name: g.nombre,
      groupName: g.grupo,
      orderIndex: i + 1,
    })),
  );
}
