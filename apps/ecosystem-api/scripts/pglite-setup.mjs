// Setup de la BD local embebida (PGlite) del ECOSYSTEM: aplica migraciones y
// siembra super-admin + planes. Idempotente. Uso: `pnpm db:local:setup`.
import 'dotenv/config';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import bcrypt from 'bcryptjs';
import { join } from 'node:path';

const dir = process.env.PGLITE_DATA;
if (!dir) {
  console.error('[ecosystem] Falta PGLITE_DATA en apps/ecosystem-api/.env');
  process.exit(1);
}

const pg = new PGlite(dir);
const db = drizzle(pg);
await migrate(db, { migrationsFolder: join(process.cwd(), 'drizzle', 'migrations') });
console.log('[ecosystem] migraciones aplicadas en', dir);

// ── Super administrador ──
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
if (email && password) {
  const ex = await pg.query('select 1 from ecosystem.users where email = $1', [email]);
  if (ex.rows.length === 0) {
    const hash = await bcrypt.hash(password, 12);
    await pg.query(
      `insert into ecosystem.users
        (email, document_id, full_name, password_hash, is_email_verified, is_active, is_super_admin, data_consent_at)
       values ($1,$2,$3,$4,true,true,true,now())`,
      [
        email,
        process.env.ADMIN_DOCUMENT ?? '1000000000',
        process.env.ADMIN_NAME ?? 'Super Administrador DINAMYT',
        hash,
      ],
    );
    console.log('[ecosystem] super-admin creado:', email);
  } else {
    console.log('[ecosystem] super-admin ya existe:', email);
  }
} else {
  console.warn('[ecosystem] ADMIN_EMAIL/ADMIN_PASSWORD no definidos: sin super-admin.');
}

// ── Catálogo de planes (todas las combinaciones) ──
// Los planes que incluyen Campeonatos NO tienen precio de lista: el alcance
// (tatamis, número de eventos) se acuerda con un administrador → precio null.
const planes = [
  ['Plan Academy', 'Formación del practicante: planes de estudio, evaluaciones y progreso por cinturón.', ['academy'], 50, '50000', '500000'],
  ['Plan Membresías', 'Operación del club: mensualidades, check-in de asistencia, avisos y reportes.', ['membresias'], 200, '60000', '600000'],
  ['Plan Academy + Membresías', 'La formación del practicante y la operación del club en un solo plan.', ['academy', 'membresias'], 200, '95000', '950000'],
  ['Plan Campeonatos', 'Torneos con puntuación en vivo. El alcance y el precio se acuerdan con un administrador.', ['campeonatos'], 100, null, null],
  ['Plan Academy + Campeonatos', 'Formación más torneos oficiales. El precio se acuerda con un administrador.', ['academy', 'campeonatos'], 100, null, null],
  ['Plan Campeonatos + Membresías', 'Operación del club más torneos oficiales. El precio se acuerda con un administrador.', ['campeonatos', 'membresias'], 200, null, null],
  ['Plan Completo', 'Todo el ecosistema: Academy, Campeonatos y Membresías. El precio se acuerda con un administrador.', ['academy', 'campeonatos', 'membresias'], 200, null, null],
];
for (const [name, desc, apps, maxU, pm, pa] of planes) {
  const appsSql = `ARRAY[${apps.map((a) => `'${a}'`).join(',')}]::text[]`;
  const ex = await pg.query('select 1 from ecosystem.subscription_plans where name = $1', [name]);
  if (ex.rows.length === 0) {
    await pg.query(
      `insert into ecosystem.subscription_plans
        (name, description, apps_included, max_users, price_monthly, price_annual)
       values ($1,$2,${appsSql},$3,$4,$5)`,
      [name, desc, maxU, pm, pa],
    );
    console.log('[ecosystem] plan creado:', name);
  } else {
    // Idempotente: mantiene el catálogo alineado (descripción, apps y precios).
    await pg.query(
      `update ecosystem.subscription_plans
         set description = $2, apps_included = ${appsSql}, max_users = $3,
             price_monthly = $4, price_annual = $5
       where name = $1`,
      [name, desc, maxU, pm, pa],
    );
  }
}

// ── Usuarios demo con rol (para probar accesos por rol en local) ──
// Crea una org con suscripción activa (Plan Campeonatos) y dos usuarios:
// un juez y un entrenador. Así su token trae role_campeonatos correcto.
const hashDemo = await bcrypt.hash('Demo1234!', 12);

let org = (
  await pg.query('select id from ecosystem.organizations where name = $1', ['Club Demo DINAMYT'])
).rows[0];
if (!org) {
  org = (
    await pg.query(
      "insert into ecosystem.organizations (name, type) values ($1, 'CLUB') returning id",
      ['Club Demo DINAMYT'],
    )
  ).rows[0];
  console.log('[ecosystem] org demo creada: Club Demo DINAMYT');
}

const planCamp = (
  await pg.query("select id from ecosystem.subscription_plans where name = 'Plan Campeonatos'")
).rows[0];
if (planCamp) {
  const sub = (
    await pg.query('select 1 from ecosystem.subscriptions where org_id = $1', [org.id])
  ).rows[0];
  if (!sub) {
    await pg.query(
      `insert into ecosystem.subscriptions (org_id, plan_id, status, starts_at, ends_at)
       values ($1, $2, 'ACTIVE', now(), now() + interval '1 year')`,
      [org.id, planCamp.id],
    );
    console.log('[ecosystem] suscripción activa (Plan Campeonatos) para la org demo');
  }
}

const demos = [
  ['juez@dinamyt.com', 'JUEZ DEMO', 'judge', '2000000001'],
  ['coach@dinamyt.com', 'COACH DEMO (TÍTULO)', 'coach', '2000000002'],
  ['orgadmin@dinamyt.com', 'ADMIN DE ORGANIZACIÓN DEMO', 'admin', '2000000003'],
  ['competidor@dinamyt.com', 'COMPETIDOR DEMO', 'competitor', '2000000004'],
  ['maestro@dinamyt.com', 'MAESTRO DEL CLUB DEMO', 'maestro', '2000000005'],
  // Juez de esquina de prueba: mismo rol `judge` del ecosistema; su función
  // (esquina/central/mesa) se define al asignarlo a un tatami en Campeonatos.
  ['juezesquina@dinamyt.com', 'JUEZ DE ESQUINA DEMO', 'judge', '2000000006'],
];
for (const [email, name, role, doc] of demos) {
  let u = (await pg.query('select id from ecosystem.users where email = $1', [email])).rows[0];
  if (!u) {
    u = (
      await pg.query(
        `insert into ecosystem.users
          (email, document_id, full_name, password_hash, is_email_verified, is_active, data_consent_at)
         values ($1, $2, $3, $4, true, true, now()) returning id`,
        [email, doc, name, hashDemo],
      )
    ).rows[0];
  }
  const mem = (
    await pg.query('select 1 from ecosystem.org_members where org_id = $1 and user_id = $2', [
      org.id,
      u.id,
    ])
  ).rows[0];
  if (!mem) {
    await pg.query(
      'insert into ecosystem.org_members (org_id, user_id, role) values ($1, $2, $3)',
      [org.id, u.id, role],
    );
  }
  console.log(`[ecosystem] usuario demo: ${email} (${role}) / Demo1234!`);
}

// ── Escenario demo de MEMBRESÍAS ──
// Plan Membresías + un club con suscripción activa + un maestro (owner) y 2 alumnos.
const exPlanMem = (
  await pg.query("select id from ecosystem.subscription_plans where name = 'Plan Membresías'")
).rows[0];
let planMemId = exPlanMem?.id;
if (!planMemId) {
  planMemId = (
    await pg.query(
      `insert into ecosystem.subscription_plans (name, description, apps_included, max_users, price_monthly, price_annual)
       values ('Plan Membresías','Acceso a DINAMYT Membresías.', ARRAY['membresias']::text[], 200, '60000','600000') returning id`,
    )
  ).rows[0].id;
  console.log('[ecosystem] plan creado: Plan Membresías');
}

let orgMem = (
  await pg.query("select id from ecosystem.organizations where name = 'Club Membresías Demo'")
).rows[0];
if (!orgMem) {
  orgMem = (
    await pg.query(
      "insert into ecosystem.organizations (name, type) values ('Club Membresías Demo','CLUB') returning id",
    )
  ).rows[0];
  console.log('[ecosystem] org demo creada: Club Membresías Demo');
}
const subMem = (
  await pg.query('select 1 from ecosystem.subscriptions where org_id = $1', [orgMem.id])
).rows[0];
if (!subMem) {
  await pg.query(
    `insert into ecosystem.subscriptions (org_id, plan_id, status, starts_at, ends_at)
     values ($1,$2,'ACTIVE', now(), now() + interval '1 year')`,
    [orgMem.id, planMemId],
  );
  console.log('[ecosystem] suscripción activa (Plan Membresías) para el club');
}

const demosMem = [
  ['owner@dinamyt.com', 'Maestro Membresías (owner)', 'owner', '3000000001'],
  ['alumno1@dinamyt.com', 'Ana Gómez', 'student', '3000000002'],
  ['alumno2@dinamyt.com', 'Juan Pérez', 'student', '3000000003'],
];
for (const [email, name, role, doc] of demosMem) {
  let u = (await pg.query('select id from ecosystem.users where email = $1', [email])).rows[0];
  if (!u) {
    u = (
      await pg.query(
        `insert into ecosystem.users (email, document_id, full_name, password_hash, is_email_verified, is_active, data_consent_at)
         values ($1,$2,$3,$4,true,true,now()) returning id`,
        [email, doc, name, hashDemo],
      )
    ).rows[0];
  }
  const mem = (
    await pg.query('select 1 from ecosystem.org_members where org_id = $1 and user_id = $2', [
      orgMem.id,
      u.id,
    ])
  ).rows[0];
  if (!mem) {
    await pg.query('insert into ecosystem.org_members (org_id, user_id, role) values ($1,$2,$3)', [
      orgMem.id,
      u.id,
      role,
    ]);
  }
  console.log(`[ecosystem] usuario demo membresías: ${email} (${role}) / Demo1234!`);
}

// ── Escenario demo de ACADEMY ──
// Academia con Plan Academy activo + un maestro y un estudiante. Sus tokens
// traen scope 'academy' y role_academy (maestro/student); academy-api lo
// normaliza a teacher/student.
const planAca = (
  await pg.query("select id from ecosystem.subscription_plans where name = 'Plan Academy'")
).rows[0];

let orgAca = (
  await pg.query("select id from ecosystem.organizations where name = 'Academia Academy Demo'")
).rows[0];
if (!orgAca) {
  orgAca = (
    await pg.query(
      "insert into ecosystem.organizations (name, type) values ('Academia Academy Demo','ACADEMY') returning id",
    )
  ).rows[0];
  console.log('[ecosystem] org demo creada: Academia Academy Demo');
}
if (planAca) {
  const subAca = (
    await pg.query('select 1 from ecosystem.subscriptions where org_id = $1', [orgAca.id])
  ).rows[0];
  if (!subAca) {
    await pg.query(
      `insert into ecosystem.subscriptions (org_id, plan_id, status, starts_at, ends_at)
       values ($1,$2,'ACTIVE', now(), now() + interval '1 year')`,
      [orgAca.id, planAca.id],
    );
    console.log('[ecosystem] suscripción activa (Plan Academy) para la academia');
  }
}

const demosAca = [
  ['profesor@dinamyt.com', 'Maestro Academy (Hapkido)', 'maestro', '4000000001'],
  ['estudiante@dinamyt.com', 'Estudiante Academy', 'student', '4000000002'],
];
for (const [email, name, role, doc] of demosAca) {
  let u = (await pg.query('select id from ecosystem.users where email = $1', [email])).rows[0];
  if (!u) {
    u = (
      await pg.query(
        `insert into ecosystem.users (email, document_id, full_name, password_hash, is_email_verified, is_active, data_consent_at)
         values ($1,$2,$3,$4,true,true,now()) returning id`,
        [email, doc, name, hashDemo],
      )
    ).rows[0];
  }
  const mem = (
    await pg.query('select 1 from ecosystem.org_members where org_id = $1 and user_id = $2', [
      orgAca.id,
      u.id,
    ])
  ).rows[0];
  if (!mem) {
    await pg.query('insert into ecosystem.org_members (org_id, user_id, role) values ($1,$2,$3)', [
      orgAca.id,
      u.id,
      role,
    ]);
  }
  console.log(`[ecosystem] usuario demo academy: ${email} (${role}) / Demo1234!`);
}

await pg.close();
console.log('[ecosystem] setup completado.');
