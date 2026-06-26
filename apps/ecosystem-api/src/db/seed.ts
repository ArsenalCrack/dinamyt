/**
 * Seed del ecosistema DINAMYT.
 *
 * Crea, de forma idempotente:
 *   1. El super administrador de la plataforma (desde variables de entorno).
 *   2. Los planes de suscripción base: Academy, Campeonatos y Completo.
 *
 * Uso:
 *   1. Configura ADMIN_EMAIL y ADMIN_PASSWORD en tu .env (ver .env.example).
 *   2. Aplica las migraciones primero:  npm run db:migrate
 *   3. Ejecuta:                          npm run db:seed
 */
import { db } from './index';
import { users, subscriptionPlans } from './schema';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';

// ── 1. Super administrador ───────────────────────────────────────────────────
async function seedSuperAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const fullName = process.env.ADMIN_NAME ?? 'Super Administrador DINAMYT';
  const documentId = process.env.ADMIN_DOCUMENT ?? '1000000000';

  if (!email || !password) {
    console.warn(
      '[seed] ADMIN_EMAIL o ADMIN_PASSWORD no definidos: se omite el super admin.',
    );
    return;
  }

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing[0]) {
    console.log(`[seed] Super admin ya existe (${email}); sin cambios.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await db.insert(users).values({
    email,
    passwordHash,
    fullName,
    documentId,
    isEmailVerified: true, // el super admin no pasa por verificación OTP
    isActive: true,
    isSuperAdmin: true,
    dataConsentAt: new Date(),
  });
  console.log(`[seed] Super admin creado: ${email}`);
}

// ── 2. Planes de suscripción base ────────────────────────────────────────────
const PLANES_BASE = [
  {
    name: 'Plan Academy',
    description: 'Acceso a DINAMYT Academy.',
    appsIncluded: ['academy'],
    maxUsers: 50,
    priceMonthly: '50000',
    priceAnnual: '500000',
  },
  {
    name: 'Plan Campeonatos',
    description: 'Acceso a DINAMYT Campeonatos.',
    appsIncluded: ['campeonatos'],
    maxUsers: 100,
    priceMonthly: '80000',
    priceAnnual: '800000',
  },
  {
    name: 'Plan Completo',
    description: 'Acceso a DINAMYT Academy y Campeonatos.',
    appsIncluded: ['academy', 'campeonatos'],
    maxUsers: 100,
    priceMonthly: '120000',
    priceAnnual: '1200000',
  },
];

async function seedPlanes() {
  for (const plan of PLANES_BASE) {
    const existing = await db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.name, plan.name))
      .limit(1);

    if (existing[0]) {
      console.log(`[seed] Plan ya existe: ${plan.name}; sin cambios.`);
      continue;
    }

    await db.insert(subscriptionPlans).values(plan);
    console.log(`[seed] Plan creado: ${plan.name}`);
  }
}

// ── Orquestación ─────────────────────────────────────────────────────────────
async function main() {
  console.log('[seed] Iniciando seed del ecosistema DINAMYT...');
  await seedSuperAdmin();
  await seedPlanes();
  console.log('[seed] Seed completado.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed] Error durante el seed:', err);
  process.exit(1);
});
