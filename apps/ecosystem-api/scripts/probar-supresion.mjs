#!/usr/bin/env node
/**
 * Ensayo de «borrar una cuenta» sobre un PostgreSQL de verdad.
 *
 *     pnpm --filter @dinamyt/ecosystem-api supresion:ensayo
 *
 * Levanta un PostgreSQL compilado a WebAssembly (PGlite), le aplica las
 * migraciones reales del ecosystem, siembra a una persona con algo en las
 * tablas donde hay algo que comprobar —y a otra con cosas que la primera
 * tocó— y corre la limpieza de verdad (`dist/modules/supresion/borrar-de-la-base.js`).
 *
 * Lo que defiende es lo que una prueba con la base simulada no ve: que las
 * veinte tablas y sus llaves foráneas dejan hacerlo en este orden, que lo que
 * habla de la persona desaparece, que lo que se conserva sigue apuntando a una
 * fila vaciada, y que a nadie más se le toca nada. Y que cada llave foránea
 * hacia `users` tiene su política (`POLITICA_DE_LLAVES`): una migración que
 * añada una sin decidir qué pasa con ella al borrar hace fallar el paso 1.
 * (Las llaves solas no lo avisarían: la fila de `users` se vacía, no se borra.)
 *
 * No necesita red ni base de datos. Sí necesita `dist/`: compila antes.
 */

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { eq } from 'drizzle-orm';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const dist = join(import.meta.dirname, '..', 'dist');
const modulo = join(dist, 'modules', 'supresion', 'borrar-de-la-base.js');
if (!existsSync(modulo)) {
  console.error(`\n✗ No encuentro ${modulo}. Compila primero: pnpm --filter @dinamyt/ecosystem-api build\n`);
  process.exit(1);
}
const requerir = createRequire(import.meta.url);
const { borrarDeLaBase, NOMBRE_BORRADA, POLITICA_DE_LLAVES } = requerir(modulo);
const schema = requerir(join(dist, 'db', 'schema', 'index.js'));
const {
  orgInvitations,
  orgJoinRequests,
  orgMemberBajas,
  orgMembers,
  orgNotifications,
  organizations,
  otpCodes,
  pendingRegistrations,
  pushSubscriptions,
  sessions,
  userGuardians,
  users,
} = schema;

let fallos = 0;
function comprobar(descripcion, condicion, detalle) {
  if (condicion) {
    console.log(`  ✔ ${descripcion}`);
  } else {
    fallos += 1;
    console.log(`  ✘ ${descripcion}`);
    if (detalle !== undefined) console.log(`      ${JSON.stringify(detalle)}`);
  }
}

const pg = new PGlite();
const db = drizzle(pg, { schema });
const manana = () => new Date(Date.now() + 86_400_000);
const cuantas = async (tabla, donde) => (await db.select().from(tabla).where(donde)).length;

console.log('\n1. Migraciones reales del ecosystem');
await migrate(db, {
  migrationsFolder: join(import.meta.dirname, '..', 'drizzle', 'migrations'),
  migrationsSchema: 'ecosystem',
});
console.log('  ✔ aplicadas');

const llaves = (
  await pg.query(`
    SELECT c.conrelid::regclass::text AS tabla, a.attname AS columna
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'f' AND c.confrelid = 'ecosystem.users'::regclass`)
).rows.map((f) => `${f.tabla.replace(/^ecosystem\./, '')}.${f.columna}`);
const sinPolitica = llaves.filter((l) => !(l in POLITICA_DE_LLAVES));
const sobran = Object.keys(POLITICA_DE_LLAVES).filter((l) => !llaves.includes(l));
comprobar(
  `las ${llaves.length} llaves hacia users tienen política al borrar`,
  sinPolitica.length === 0,
  { sinPolitica },
);
comprobar('la política no habla de llaves que ya no existen', sobran.length === 0, { sobran });

console.log('\n2. Una persona con algo en cada tabla, y otra a la que tocó');
const [{ id: ana }, { id: otra }] = await db
  .insert(users)
  .values([
    {
      email: 'Ana@Correo.com',
      fullName: 'ANA PÉREZ',
      documentId: '1010',
      phone: '3000000000',
      medicalNotes: 'asma',
      bloodType: 'O+',
      emergencyContactName: 'JUAN',
      passwordHash: 'x',
      avatarUrl: '/media/abc.jpg',
    },
    { email: 'otra@correo.com', fullName: 'OTRA PERSONA', passwordHash: 'y' },
  ])
  .returning({ id: users.id });
const [{ id: club }] = await db
  .insert(organizations)
  .values({ name: 'Club del Ensayo', slug: 'club-ensayo', type: 'CLUB' })
  .returning({ id: organizations.id });

const ahora = new Date();
await db.insert(sessions).values({ userId: ana, createdAt: ahora, lastSeenAt: ahora, expiresAt: manana() });
await db.insert(otpCodes).values({ userId: ana, code: '123456', type: 'EMAIL_VERIFY', expiresAt: manana() });
await db.insert(pushSubscriptions).values({ userId: ana, endpoint: 'https://push/ana', p256dh: 'k', auth: 'a' });
await db.insert(orgMembers).values([
  { orgId: club, userId: ana, role: 'member' },
  { orgId: club, userId: otra, role: 'admin' },
]);
await db.insert(orgMemberBajas).values([
  { orgId: club, userId: ana, role: 'member', removedAt: ahora },
  { orgId: club, userId: otra, role: 'member', removedAt: ahora, removedByUserId: ana },
]);
await db.insert(userGuardians).values({ minorUserId: ana, guardianUserId: otra });
await db.insert(orgJoinRequests).values({ orgId: club, userId: ana });
await db.insert(orgInvitations).values([
  { orgId: club, email: 'ana@correo.com' },
  { orgId: club, email: 'nuevo@correo.com', invitedByUserId: ana },
]);
await db.insert(pendingRegistrations).values({
  email: 'ana@correo.com',
  fullName: 'ANA PÉREZ',
  passwordHash: 'x',
  code: '000000',
  expiresAt: manana(),
});
await db.insert(orgNotifications).values([
  { orgId: club, userId: ana, kind: 'miembro_alta' },
  { orgId: club, userId: otra, kind: 'miembro_alta', subjectUserId: ana, data: { fullName: 'ANA PÉREZ' } },
  { orgId: club, userId: otra, kind: 'miembro_baja', subjectUserId: otra, actorUserId: ana },
]);
console.log('  ✔ sembradas');

console.log('\n3. Borrar a Ana');
await db.transaction((tx) => borrarDeLaBase(tx, { id: ana, email: 'Ana@Correo.com' }));
console.log('  ✔ sin errores de llaves foráneas');

console.log('\n4. Su fila queda vaciada y marcada');
const [u] = await db.select().from(users).where(eq(users.id, ana));
comprobar('nombre genérico', u.fullName === NOMBRE_BORRADA, u.fullName);
comprobar('correo libre', u.email === `eliminado-${ana}@eliminado.invalid`, u.email);
comprobar(
  'sin documento, teléfono, salud, emergencia, contraseña ni foto',
  [u.documentId, u.phone, u.medicalNotes, u.bloodType, u.emergencyContactName, u.passwordHash, u.avatarUrl].every(
    (v) => v === null,
  ),
);
comprobar('inactiva y con borrada_el', u.isActive === false && u.borradaEl !== null && u.borrarEl === null);

console.log('\n5. Lo que solo existía por ella, fuera');
comprobar('sesiones', (await cuantas(sessions, eq(sessions.userId, ana))) === 0);
comprobar('códigos', (await cuantas(otpCodes, eq(otpCodes.userId, ana))) === 0);
comprobar('suscripciones al celular', (await cuantas(pushSubscriptions, eq(pushSubscriptions.userId, ana))) === 0);
comprobar('pertenencia al club', (await cuantas(orgMembers, eq(orgMembers.userId, ana))) === 0);
comprobar('su baja guardada', (await cuantas(orgMemberBajas, eq(orgMemberBajas.userId, ana))) === 0);
comprobar('vínculo de acudiente', (await cuantas(userGuardians, eq(userGuardians.minorUserId, ana))) === 0);
comprobar('solicitud de entrada', (await cuantas(orgJoinRequests, eq(orgJoinRequests.userId, ana))) === 0);
comprobar('invitación a su correo', (await cuantas(orgInvitations, eq(orgInvitations.email, 'ana@correo.com'))) === 0);
comprobar(
  'registro a medias',
  (await cuantas(pendingRegistrations, eq(pendingRegistrations.email, 'ana@correo.com'))) === 0,
);
comprobar('avisos que recibía', (await cuantas(orgNotifications, eq(orgNotifications.userId, ana))) === 0);
comprobar('avisos que hablan de ella', (await cuantas(orgNotifications, eq(orgNotifications.subjectUserId, ana))) === 0);

console.log('\n6. A la otra persona no se le toca nada');
const [o] = await db.select().from(users).where(eq(users.id, otra));
comprobar('su fila intacta', o.fullName === 'OTRA PERSONA' && o.isActive === true);
comprobar('sigue en el club', (await cuantas(orgMembers, eq(orgMembers.userId, otra))) === 1);
const [baja] = await db.select().from(orgMemberBajas).where(eq(orgMemberBajas.userId, otra));
comprobar('su baja sigue, sin decir quién la dio', baja && baja.removedByUserId === null);
const [inv] = await db.select().from(orgInvitations).where(eq(orgInvitations.email, 'nuevo@correo.com'));
comprobar('la invitación que Ana mandó sigue, apuntando a la fila vaciada', inv && inv.invitedByUserId === ana);
const [aviso] = await db.select().from(orgNotifications).where(eq(orgNotifications.kind, 'miembro_baja'));
comprobar('su aviso sigue, sin actor', aviso && aviso.actorUserId === null);

console.log('\n7. Dos veces deja lo mismo');
await db.transaction((tx) => borrarDeLaBase(tx, { id: ana, email: u.email }));
const [u2] = await db.select().from(users).where(eq(users.id, ana));
comprobar('igual que antes', u2.fullName === NOMBRE_BORRADA && u2.email === u.email);

console.log(fallos === 0 ? '\n✔ Todo en orden.\n' : `\n✘ ${fallos} comprobación(es) fallaron.\n`);
await pg.close();
process.exit(fallos === 0 ? 0 : 1);
