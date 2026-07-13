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

// ── 2. Planes de suscripción base (todas las combinaciones) ─────────────────
// Los planes que incluyen Campeonatos NO tienen precio de lista: el alcance
// (tatamis, número de eventos) se acuerda con un administrador → precio null.
const PLANES_BASE = [
  {
    name: 'Plan Academy',
    description:
      'Formación del practicante: planes de estudio, evaluaciones y progreso por cinturón.',
    appsIncluded: ['academy'],
    maxUsers: 50,
    priceMonthly: '50000',
    priceAnnual: '500000',
  },
  {
    name: 'Plan Membresías',
    description:
      'Operación del club: mensualidades, check-in de asistencia, avisos y reportes.',
    appsIncluded: ['membresias'],
    maxUsers: 200,
    priceMonthly: '60000',
    priceAnnual: '600000',
  },
  {
    name: 'Plan Academy + Membresías',
    description:
      'La formación del practicante y la operación del club en un solo plan.',
    appsIncluded: ['academy', 'membresias'],
    maxUsers: 200,
    priceMonthly: '95000',
    priceAnnual: '950000',
  },
  {
    name: 'Plan Campeonatos',
    description:
      'Torneos con puntuación en vivo. El alcance y el precio se acuerdan con un administrador.',
    appsIncluded: ['campeonatos'],
    maxUsers: 100,
    priceMonthly: null,
    priceAnnual: null,
  },
  {
    name: 'Plan Academy + Campeonatos',
    description:
      'Formación más torneos oficiales. El precio se acuerda con un administrador.',
    appsIncluded: ['academy', 'campeonatos'],
    maxUsers: 100,
    priceMonthly: null,
    priceAnnual: null,
  },
  {
    name: 'Plan Campeonatos + Membresías',
    description:
      'Operación del club más torneos oficiales. El precio se acuerda con un administrador.',
    appsIncluded: ['campeonatos', 'membresias'],
    maxUsers: 200,
    priceMonthly: null,
    priceAnnual: null,
  },
  {
    name: 'Plan Completo',
    description:
      'Todo el ecosistema: Academy, Campeonatos y Membresías. El precio se acuerda con un administrador.',
    appsIncluded: ['academy', 'campeonatos', 'membresias'],
    maxUsers: 200,
    priceMonthly: null,
    priceAnnual: null,
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
