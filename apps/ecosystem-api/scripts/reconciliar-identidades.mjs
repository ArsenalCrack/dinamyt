#!/usr/bin/env node
/**
 * Reconciliación de una sola vez: la gente que YA existe en Membresías y en
 * Campeonatos pasa a tener cuenta en el ecosistema (§2.4 del plan maestro).
 *
 * La lógica vive en `lib/reconciliacion.mjs`; esto es el guion que la conecta,
 * la envuelve en una transacción y cuenta lo que pasó.
 *
 * ── CÓMO SE USA ─────────────────────────────────────────────────────────────
 *
 *   # Ensayo en seco: hace TODO el trabajo y deshace la transacción al final.
 *   sudo -u postgres RECONCILIACION_DATABASE_URL=postgresql:///dinamyt \
 *     node scripts/reconciliar-identidades.mjs
 *
 *   # De verdad, guardando el detalle:
 *   ... node scripts/reconciliar-identidades.mjs --aplicar --informe /root/reconciliacion.json
 *
 * Se conecta como **superusuario** (`postgres`) y no con el rol de una app: las
 * tablas de Membresías y Campeonatos tienen RLS en modo FORCE, así que un rol
 * normal vería solo una parte de las filas y el guion daría por reconciliado lo
 * que nunca vio. El guion lo comprueba y se planta.
 *
 * Es **idempotente**: correrlo dos veces no crea nada nuevo.
 */

import postgres from 'postgres';
import { writeFileSync } from 'node:fs';
import { reconciliar } from './lib/reconciliacion.mjs';

// ── Argumentos ──────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const valorDe = (bandera) => {
  const i = argv.indexOf(bandera);
  return i >= 0 ? argv[i + 1] : undefined;
};

const opciones = {
  aplicar: argv.includes('--aplicar'),
  crearClubesCampeonatos: argv.includes('--crear-clubes-campeonatos'),
  sinSuperusuario: argv.includes('--sin-superusuario'),
  informe: valorDe('--informe'),
  url: valorDe('--url') ?? process.env.RECONCILIACION_DATABASE_URL,
};

if (argv.includes('--ayuda') || argv.includes('-h')) {
  console.log(
    [
      'Uso: node scripts/reconciliar-identidades.mjs [opciones]',
      '',
      '  --aplicar                     escribe de verdad (sin esto, ensayo en seco)',
      '  --crear-clubes-campeonatos    crea también los clubes que solo conoce Campeonatos',
      '  --informe <ruta.json>         guarda el detalle completo en un archivo',
      '  --url <cadena>                conexión (o la variable RECONCILIACION_DATABASE_URL)',
      '  --sin-superusuario            seguir aunque el rol no sea superusuario (peligroso: RLS)',
    ].join('\n'),
  );
  process.exit(0);
}

if (!opciones.url) {
  console.error(
    'Falta la cadena de conexión. Ponla en RECONCILIACION_DATABASE_URL o pásala con --url.\n' +
      'Ejemplo:  sudo -u postgres RECONCILIACION_DATABASE_URL=postgresql:///dinamyt node scripts/reconciliar-identidades.mjs',
  );
  process.exit(1);
}

// ── Ejecución ───────────────────────────────────────────────────────────────

/** Marca para deshacer la transacción del ensayo sin que parezca un fallo. */
class Ensayo extends Error {}

/**
 * `postgresql:///dinamyt` significa «por el socket Unix» para `psql`, pero para
 * este driver significa TCP a localhost — y por TCP, PostgreSQL pide contraseña
 * aunque seas el usuario `postgres` (el socket usa autenticación `peer`, el
 * puerto no). El síntoma es un `password authentication failed for user
 * "postgres"` que no tiene nada que ver con permisos.
 *
 * Si la cadena no trae host, se habla por el socket: es como entra
 * `sudo -u postgres psql`, y no hay ninguna contraseña que inventar.
 */
export function socketSiNoHayHost(cadena) {
  // Se saca el host igual que lo saca el driver (src/index.js:541-543): lo que
  // hay entre `://` y la primera `/` o `?`, quitándole el usuario. Hacerlo con
  // `new URL` parecía más limpio, pero `postgres://postgres@/dinamyt` —que
  // `psql` acepta— no sobrevive a ese análisis y volvía a caer en TCP.
  const autoridad = /^[a-z+]+:\/\/([^/?]*)/i.exec(cadena)?.[1] ?? '';
  const host = autoridad.slice(autoridad.indexOf('@') + 1);
  return host ? null : (process.env.PGHOST ?? '/var/run/postgresql');
}

const socket = socketSiNoHayHost(opciones.url);
const sql = postgres(opciones.url, {
  onnotice: () => {},
  max: 1,
  ...(socket ? { host: socket } : {}),
});
const t0 = Date.now();

let informe = null;
let fallo = null;

try {
  await sql.begin(async (tx) => {
    informe = await reconciliar(tx, { ...opciones, log: (m) => console.log(m) });
    if (!opciones.aplicar) {
      // Ensayo en seco: se hizo TODO el trabajo y aquí se deshace entero. Es la
      // única forma de que el ensayo cuente la verdad y no una aproximación.
      throw new Ensayo();
    }
  });
} catch (err) {
  if (!(err instanceof Ensayo)) fallo = err;
}

await sql.end();

if (fallo) {
  console.error('\n✗ No se cambió nada: la transacción se deshizo entera.\n');
  console.error(fallo.message);
  process.exit(1);
}

// ── Resumen ─────────────────────────────────────────────────────────────────

const n = (a) => String(a.length).padStart(5);

console.log(`
${opciones.aplicar ? '✔ APLICADO' : '· ENSAYO EN SECO (no se escribió nada)'}   ${(
  (Date.now() - t0) / 1000
).toFixed(1)} s

  CLUBES
${n(informe.clubes.creados)}  creados en el ecosistema
${n(informe.clubes.enlazados)}  enlazados con uno que ya existía
${n(informe.clubes.campeonatosSinCruce)}  de Campeonatos SIN cruzar ${
  informe.clubes.campeonatosSinCruce.length
    ? '← míralos abajo y vuelve con --crear-clubes-campeonatos'
    : ''
}

  PERSONAS
${n(informe.personas.creadas)}  cuentas creadas
${n(informe.personas.enlazadas)}  enlazadas con una cuenta que ya existía
${n(informe.personas.sinContrasena)}  creadas SIN contraseña utilizable
${n(informe.personas.sinCorreo)}  fichas sin correo válido (se quedan sin cuenta: entran por QR/PIN)
${n(informe.personas.superadminsDetectados)}  superadmins detectados (NO se concedieron)

  PERTENENCIA
${n(informe.pertenencias.creadas)}  filas nuevas en org_members
${n(informe.pertenencias.actualizadas)}  filas completadas con el rol de una app
${n(informe.pertenencias.sinClub)}  personas sin club al que enlazarlas
`);

for (const aviso of informe.avisos) console.log(`  ⚠ ${aviso}`);

if (informe.clubes.campeonatosSinCruce.length) {
  console.log('\n  Clubes de Campeonatos que no cruzaron con ninguna organización:');
  for (const c of informe.clubes.campeonatosSinCruce) {
    console.log(
      `    · ${c.nombre}${c.ciudad ? ` (${c.ciudad})` : ''} — maestros: ${c.maestros.join(', ')}`,
    );
  }
}

if (informe.personas.superadminsDetectados.length) {
  console.log('\n  Superadmins de las apps (concédelos a mano si toca):');
  for (const s of informe.personas.superadminsDetectados) {
    console.log(`    · ${s.correo}  membresias=${s.membresias} campeonatos=${s.campeonatos}`);
  }
}

if (informe.personas.sinCorreo.length) {
  console.log('\n  Fichas sin correo utilizable (dale esta lista al maestro):');
  for (const p of informe.personas.sinCorreo.slice(0, 40)) {
    console.log(`    · [${p.app}] ${p.nombre ?? '(sin nombre)'} — ${p.email ?? '(vacío)'}`);
  }
  if (informe.personas.sinCorreo.length > 40) {
    console.log(`    … y ${informe.personas.sinCorreo.length - 40} más (están en el informe)`);
  }
}

if (opciones.informe) {
  writeFileSync(opciones.informe, JSON.stringify(informe, null, 2));
  console.log(`\n  Detalle completo en ${opciones.informe}`);
}

if (!opciones.aplicar) {
  console.log('\n  Cuando el resumen cuadre, repítelo con --aplicar.\n');
}
