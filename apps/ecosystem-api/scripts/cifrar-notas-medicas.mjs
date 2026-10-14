#!/usr/bin/env node
/**
 * Cifrar las notas médicas que se guardaron en claro.
 *
 * ── Por qué existe ──
 *
 * `common/crypto.ts` cifra `users.medical_notes` con `FIELD_ENCRYPTION_KEY`, y
 * sin la variable las guardaba tal cual. En la VPS la variable no estuvo puesta
 * hasta octubre de 2026, así que lo escrito hasta entonces está en claro
 * mientras la política de privacidad dice lo contrario. Poner la clave arregla
 * lo que se guarde a partir de ahí; esto arregla lo de antes.
 *
 * ── Cómo se usa ──
 *
 *   pnpm --filter @dinamyt/ecosystem-api notas:cifrar              # ensayo
 *   pnpm --filter @dinamyt/ecosystem-api notas:cifrar --aplicar    # escribe
 *
 * Sin `--aplicar` hace todo el trabajo dentro de una transacción que se
 * deshace, igual que `fotos:al-disco`. Respalda antes de aplicar (§2.5).
 *
 * Nunca imprime una nota: solo cuenta.
 *
 * ⚠️ **La clave no está en el respaldo diario.** Si se pierde, lo cifrado no
 * se recupera con nada. Se guarda fuera del servidor antes de aplicar.
 */

import 'dotenv/config';
import postgres from 'postgres';
import { cargarCifrado, cifrarNotasMedicas } from './lib/cifrar-notas.mjs';

const args = process.argv.slice(2);
const aplicar = args.includes('--aplicar');
const url =
  args.find((a) => a.startsWith('--url='))?.slice(6) ??
  process.env.DATABASE_URL ??
  '';
const esquema = process.env.DB_SCHEMA || 'ecosystem';

if (!process.env.FIELD_ENCRYPTION_KEY) {
  console.error(`
✗ FIELD_ENCRYPTION_KEY no está puesta: no hay con qué cifrar.

  Ponla en el .env de ecosystem-api, guárdala también fuera del servidor y
  reinicia el servicio. Ver OPERAR.md §1.4.
`);
  process.exit(1);
}
if (!url) {
  console.error(
    'Falta la cadena de conexión. Ponla en DATABASE_URL o pásala con --url=…',
  );
  process.exit(1);
}

let cifrado;
try {
  cifrado = cargarCifrado();
} catch (err) {
  console.error(`\n✗ ${err.message}\n`);
  process.exit(1);
}

// Igual que `fotos:al-disco`: sin host en la cadena se habla por el socket.
const autoridad = /^[a-z+]+:\/\/([^/?]*)/i.exec(url)?.[1] ?? '';
const host = autoridad.slice(autoridad.indexOf('@') + 1);
const sql = postgres(url, {
  onnotice: () => {},
  max: 1,
  ...(host ? {} : { host: process.env.PGHOST ?? '/var/run/postgresql' }),
});

/** Marca para deshacer la transacción del ensayo sin que parezca un fallo. */
class Ensayo extends Error {}

let informe = null;
let fallo = null;

try {
  await sql.begin(async (tx) => {
    informe = await cifrarNotasMedicas(
      (texto, parametros) => tx.unsafe(texto, parametros),
      { esquema, ...cifrado },
    );
    if (!aplicar) throw new Ensayo();
  });
} catch (err) {
  if (!(err instanceof Ensayo)) fallo = err;
}

await sql.end();

if (fallo) {
  console.error(
    '\n✗ No se cambió ninguna fila: la transacción se deshizo entera.\n',
  );
  console.error(fallo.message);
  process.exit(1);
}

console.log(
  `\n── Notas médicas ${aplicar ? '· APLICADO' : '· ENSAYO (no se cambió ninguna fila)'} ──\n`,
);
console.log(`   personas con nota médica:  ${informe.conNota}`);
console.log(`   ya estaban cifradas:       ${informe.yaCifradas}`);
console.log(
  `   ${aplicar ? 'cifradas ahora:            ' : 'se cifrarían:              '}${informe.cifradasAhora}\n`,
);
if (!aplicar && informe.cifradasAhora > 0) {
  console.log('   Repite con --aplicar para escribirlo.\n');
} else {
  console.log('   ✓ No queda ninguna nota médica en claro.\n');
}
