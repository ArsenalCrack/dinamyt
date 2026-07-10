import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from './testing';
import { seedAcademy, HAPKIDO_GRADOS } from './seed';
import {
  martialArts,
  grades,
  academyUsers,
  enrollments,
  gradeAdvancements,
  contents,
  contentViews,
} from './schema';

// Verifica que la migración + seed dejan la BD de Academy operativa (PGlite).
describe('academy-db (schema + seed con PGlite)', () => {
  const ALUMNO = '00000000-0000-0000-0000-000000000021';
  const MAESTRO = '00000000-0000-0000-0000-000000000022';

  it('la migración crea el schema y el seed siembra Hapkido con 11 cinturones', async () => {
    const db = await createTestDb();
    await seedAcademy(db);
    await seedAcademy(db); // idempotente: la segunda pasada no duplica

    const artes = await db.select().from(martialArts);
    expect(artes).toHaveLength(1);
    expect(artes[0].name).toBe('Hapkido');
    expect(artes[0].isActive).toBe(true);

    const cinturones = await db
      .select()
      .from(grades)
      .where(eq(grades.martialArtId, artes[0].id));
    expect(cinturones).toHaveLength(11);
    const ordenados = [...cinturones].sort((a, b) => a.orderIndex - b.orderIndex);
    expect(ordenados[0].name).toBe('Blanco');
    expect(ordenados[10].name).toBe('Negro');
    expect(new Set(cinturones.map((c) => c.groupName)).size).toBe(5);
    expect(HAPKIDO_GRADOS).toHaveLength(11);
  });

  it('matricula, avance de grado y snapshot inmutable', async () => {
    const db = await createTestDb();
    await seedAcademy(db);
    const [arte] = await db.select().from(martialArts);
    const cinturones = await db
      .select()
      .from(grades)
      .where(eq(grades.martialArtId, arte.id));
    const blanco = cinturones.find((c) => c.orderIndex === 1)!;
    const amarillo = cinturones.find((c) => c.orderIndex === 2)!;

    const [matricula] = await db
      .insert(enrollments)
      .values({
        studentUserId: ALUMNO,
        martialArtId: arte.id,
        currentGradeId: blanco.id,
      })
      .returning();

    await db.insert(gradeAdvancements).values({
      enrollmentId: matricula.id,
      fromGradeId: blanco.id,
      toGradeId: amarillo.id,
      fromGradeName: blanco.name,
      toGradeName: amarillo.name,
      approvedByUserId: MAESTRO,
      approvedByName: 'Maestro Cóndor',
    });

    const historial = await db.select().from(gradeAdvancements);
    expect(historial).toHaveLength(1);
    // El historial guarda NOMBRES snapshot, no solo FKs: aunque el catálogo
    // cambie, sigue mostrando el estado al momento del avance.
    expect(historial[0].fromGradeName).toBe('Blanco');
    expect(historial[0].toGradeName).toBe('Amarillo');
  });

  it('la vista de contenido es única por (contenido, estudiante)', async () => {
    const db = await createTestDb();
    await seedAcademy(db);
    const [arte] = await db.select().from(martialArts);
    const [blanco] = await db
      .select()
      .from(grades)
      .where(eq(grades.orderIndex, 1));

    const [unidad] = await db
      .insert(contents)
      .values({
        martialArtId: arte.id,
        gradeId: blanco.id,
        title: 'Caídas básicas',
        type: 'texto',
        body: 'Nakbop: caída frontal, lateral y hacia atrás.',
        createdByUserId: MAESTRO,
      })
      .returning();

    await db
      .insert(contentViews)
      .values({ contentId: unidad.id, studentUserId: ALUMNO });
    await expect(
      db.insert(contentViews).values({ contentId: unidad.id, studentUserId: ALUMNO }),
    ).rejects.toThrow();
  });

  it('el usuario local es único por ecosystem_user_id', async () => {
    const db = await createTestDb();
    await db
      .insert(academyUsers)
      .values({ ecosystemUserId: ALUMNO, fullName: 'Alumno Uno' });
    await expect(
      db.insert(academyUsers).values({ ecosystemUserId: ALUMNO }),
    ).rejects.toThrow();
  });
});
