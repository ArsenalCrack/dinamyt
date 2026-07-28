import { and, eq } from 'drizzle-orm';
import { memberships, users, type Db } from '@dinamyt/membresias-db';

/** El alumno no existe, no está activo, o es de otro club. */
export class AlumnoNoDelClub extends Error {
  constructor() {
    super('Alumno no encontrado en este club.');
    this.name = 'AlumnoNoDelClub';
  }
}

/**
 * Un PIN de check-in que no esté cogido en este club.
 *
 * El PIN es el plan B del carnet QR —la cámara no lee, el alumno lo dejó en
 * casa—, así que tiene que existir sin que nadie se acuerde de crearlo. Antes
 * lo tecleaba el maestro en la ficha y en la práctica casi nadie tenía uno.
 *
 * Único DENTRO del club y no en toda la base: el check-in lo busca por
 * `org_id` + `checkin_pin` (ver `routes/checkin.ts`), así que dos alumnos del
 * mismo club con el mismo PIN harían que uno marcara la asistencia del otro.
 * Entre clubes distintos repetirlo no molesta a nadie.
 *
 * Cuatro dígitos son 10 000 combinaciones: de sobra para un club. Si alguno
 * llegara a llenarse, el sorteo pasa a seis en vez de quedarse dando vueltas.
 */
async function pinLibre(db: Db, orgId: string): Promise<string> {
  for (let intento = 0; intento < 40; intento++) {
    const digitos = intento < 20 ? 4 : 6;
    const pin = String(Math.floor(Math.random() * 10 ** digitos)).padStart(digitos, '0');
    const [cogido] = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.orgId, orgId), eq(memberships.checkinPin, pin)))
      .limit(1);
    if (!cogido) return pin;
  }
  // Cuarenta sorteos fallidos con un millón de combinaciones no pasa; si
  // pasara, la membresía se crea igual y el maestro pone el PIN a mano. Quedarse
  // sin membresía por esto sería mucho peor que quedarse sin PIN.
  throw new SinPinLibre();
}

/** No se encontró un PIN libre. Ver `pinLibre`. */
class SinPinLibre extends Error {}

/**
 * Get-or-create del estado de membresía del alumno en este club.
 *
 * Comprueba SIEMPRE que el alumno pertenezca al club antes de crear nada. Sin
 * esa comprobación, escanear en el club B un carnet QR del club A daría de alta
 * una membresía fantasma: el carnet es un UUID y cualquier UUID valdría.
 */
export async function ensureMembership(db: Db, orgId: string, userId: string) {
  const [persona] = await db
    .select({ id: users.id, isActive: users.isActive })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.orgId, orgId)))
    .limit(1);
  if (!persona || !persona.isActive) throw new AlumnoNoDelClub();

  const [existing] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)))
    .limit(1);

  if (existing) {
    // Membresía de antes de que el PIN se generara solo, o a la que el maestro
    // le borró el suyo: se le pone uno al pasar por aquí.
    if (existing.checkinPin) return existing;
    try {
      const [conPin] = await db
        .update(memberships)
        .set({ checkinPin: await pinLibre(db, orgId), updatedAt: new Date() })
        .where(eq(memberships.id, existing.id))
        .returning();
      return conPin;
    } catch (err) {
      if (err instanceof SinPinLibre) return existing;
      throw err;
    }
  }

  let checkinPin: string | null = null;
  try {
    checkinPin = await pinLibre(db, orgId);
  } catch (err) {
    if (!(err instanceof SinPinLibre)) throw err;
  }
  const [row] = await db
    .insert(memberships)
    .values({ orgId, userId, checkinPin })
    .returning();
  return row;
}
