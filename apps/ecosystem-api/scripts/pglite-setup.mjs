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

// ── Planes base ──
const planes = [
  ['Plan Academy', 'Acceso a DINAMYT Academy.', "ARRAY['academy']::text[]", 50, '50000', '500000'],
  ['Plan Campeonatos', 'Acceso a DINAMYT Campeonatos.', "ARRAY['campeonatos']::text[]", 100, '80000', '800000'],
  ['Plan Completo', 'Acceso a DINAMYT Academy y Campeonatos.', "ARRAY['academy','campeonatos']::text[]", 100, '120000', '1200000'],
];
for (const [name, desc, appsSql, maxU, pm, pa] of planes) {
  const ex = await pg.query('select 1 from ecosystem.subscription_plans where name = $1', [name]);
  if (ex.rows.length === 0) {
    await pg.query(
      `insert into ecosystem.subscription_plans
        (name, description, apps_included, max_users, price_monthly, price_annual)
       values ($1,$2,${appsSql},$3,$4,$5)`,
      [name, desc, maxU, pm, pa],
    );
    console.log('[ecosystem] plan creado:', name);
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
  ['juez@dinamyt.com', 'Juez Demo', 'judge', '2000000001'],
  ['coach@dinamyt.com', 'Entrenador Demo', 'coach', '2000000002'],
  ['orgadmin@dinamyt.com', 'Admin de Organización Demo', 'admin', '2000000003'],
  ['competidor@dinamyt.com', 'Competidor Demo', 'competitor', '2000000004'],
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

await pg.close();
console.log('[ecosystem] setup completado.');
