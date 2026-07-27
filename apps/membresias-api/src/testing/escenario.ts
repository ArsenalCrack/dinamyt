import type { FastifyInstance } from 'fastify';
import { orgs, users, type Db } from '@dinamyt/membresias-db';
import { createTestDb } from '@dinamyt/membresias-db/testing';
import { buildApp } from '../app';
import { firmarToken } from '../lib/auth/tokens';
import { hashPassword } from '../lib/auth/passwords';
import { reiniciarLimites } from '../lib/auth/rate-limit';

/**
 * Escenario base de los tests: un club con su maestro, un auxiliar y dos
 * alumnos, más un superadmin y un club rival para probar el aislamiento.
 *
 * Los tokens se firman con el MISMO código que producción (`firmarToken`), así
 * que los specs ejercitan el verificador de verdad en vez de un mock.
 */

export const PASSWORD = 'Prueba1234';

export interface Escenario {
  app: FastifyInstance;
  db: Db;
  orgId: string;
  /** Club distinto, para comprobar que nadie ve datos ajenos. */
  otroOrgId: string;
  ids: {
    owner: string;
    staff: string;
    alumno: string;
    alumno2: string;
    superadmin: string;
    ownerAjeno: string;
    alumnoAjeno: string;
  };
  /** Cabecera Authorization ya lista para `app.inject`. */
  auth(userId: string): { authorization: string };
}

export async function crearEscenario(): Promise<Escenario> {
  // El contador de rate limiting vive en el proceso y todos los `app.inject`
  // salen de la misma IP: sin esto los tests se van sumando entre ellos y en
  // algún punto de la suite empiezan a salir 429 donde no toca.
  reiniciarLimites();

  const db = (await createTestDb()) as unknown as Db;
  const hash = await hashPassword(PASSWORD);

  const [club] = await db
    .insert(orgs)
    .values({ name: 'Club Central', slug: 'club-central' })
    .returning();
  const [clubAjeno] = await db
    .insert(orgs)
    .values({ name: 'Club Rival', slug: 'club-rival' })
    .returning();

  const filas = await db
    .insert(users)
    .values([
      {
        email: 'maestro@club.com',
        fullName: 'Maestro Uno',
        passwordHash: hash,
        role: 'owner',
        orgId: club.id,
      },
      {
        email: 'auxiliar@club.com',
        fullName: 'Auxiliar Uno',
        passwordHash: hash,
        role: 'staff',
        orgId: club.id,
      },
      {
        email: 'alumno1@club.com',
        fullName: 'Alumno Uno',
        passwordHash: hash,
        role: 'student',
        orgId: club.id,
      },
      {
        email: 'alumno2@club.com',
        fullName: 'Alumno Dos',
        passwordHash: hash,
        role: 'student',
        orgId: club.id,
      },
      {
        email: 'super@dinamyt.com',
        fullName: 'Super Admin',
        passwordHash: hash,
        role: 'owner',
        isSuperAdmin: true,
        orgId: null,
      },
      {
        email: 'maestro@rival.com',
        fullName: 'Maestro Rival',
        passwordHash: hash,
        role: 'owner',
        orgId: clubAjeno.id,
      },
      {
        email: 'alumno@rival.com',
        fullName: 'Alumno Rival',
        passwordHash: hash,
        role: 'student',
        orgId: clubAjeno.id,
      },
    ])
    .returning();

  const porEmail = new Map(filas.map((u) => [u.email, u]));
  const tokens = new Map<string, string>();
  for (const u of filas) {
    tokens.set(
      u.id,
      await firmarToken({
        sub: u.id,
        email: u.email,
        fullName: u.fullName,
        org_id: u.orgId,
        role_membresias: u.role,
        is_super_admin: u.isSuperAdmin,
      }),
    );
  }

  return {
    app: buildApp({ db }),
    db,
    orgId: club.id,
    otroOrgId: clubAjeno.id,
    ids: {
      owner: porEmail.get('maestro@club.com')!.id,
      staff: porEmail.get('auxiliar@club.com')!.id,
      alumno: porEmail.get('alumno1@club.com')!.id,
      alumno2: porEmail.get('alumno2@club.com')!.id,
      superadmin: porEmail.get('super@dinamyt.com')!.id,
      ownerAjeno: porEmail.get('maestro@rival.com')!.id,
      alumnoAjeno: porEmail.get('alumno@rival.com')!.id,
    },
    auth: (userId: string) => ({ authorization: `Bearer ${tokens.get(userId)}` }),
  };
}
