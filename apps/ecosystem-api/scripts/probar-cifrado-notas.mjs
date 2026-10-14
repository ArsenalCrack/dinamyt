#!/usr/bin/env node
/**
 * Ensayo de «cifrar las notas médicas» sobre un PostgreSQL de verdad.
 *
 *     pnpm --filter @dinamyt/ecosystem-api notas:ensayo
 *
 * Levanta un PostgreSQL compilado a WebAssembly (PGlite), le aplica las
 * migraciones reales del ecosystem, siembra las notas que importan —la que
 * quedó en claro, la que ya estaba cifrada, la vacía, la que no existe— y
 * corre el guion. Después lo corre OTRA VEZ, que es la única forma de
 * demostrar que es idempotente.
 *
 * Y comprueba lo que de verdad importa: que **lo que escribe el guion lo lee
 * la API**, con la función de la API. Una nota que se cifra y no se sabe
 * descifrar es una nota perdida.
 *
 * No necesita red ni base de datos. Sí necesita `dist/`: compila antes.
 */

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { join } from 'node:path';
import { PREFIJO, cargarCifrado, cifrarNotasMedicas } from './lib/cifrar-notas.mjs';

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

process.env.FIELD_ENCRYPTION_KEY = 'clave-del-ensayo';
const { encryptField, decryptField } = cargarCifrado();

const pg = new PGlite();
const db = drizzle(pg);
const consulta = (texto, parametros) =>
  pg.query(texto, parametros).then((r) => r.rows);

console.log('\n1. Migraciones reales del ecosystem');
await migrate(db, {
  migrationsFolder: join(import.meta.dirname, '..', 'drizzle', 'migrations'),
  migrationsSchema: 'ecosystem',
});
console.log('  ✔ aplicadas');

console.log('\n2. Las notas que importan');
const EN_CLARO = 'Asma leve. Alergia a la penicilina — ñ, tildes y «comillas».';
const YA_CIFRADA = 'Operado de la rodilla derecha en 2024.';
const gente = [
  ['en-claro@ejemplo.com', EN_CLARO],
  ['ya-cifrada@ejemplo.com', encryptField(YA_CIFRADA)],
  ['vacia@ejemplo.com', ''],
  ['sin-nota@ejemplo.com', null],
];
for (const [correo, nota] of gente) {
  await consulta(
    'INSERT INTO ecosystem.users (email, full_name, medical_notes) VALUES ($1, $2, $3)',
    [correo, correo.split('@')[0].toUpperCase(), nota],
  );
}
console.log(`  ✔ ${gente.length} personas sembradas`);

const nota = async (correo) =>
  (await consulta('SELECT medical_notes FROM ecosystem.users WHERE email = $1', [correo]))[0]
    .medical_notes;

console.log('\n3. La primera pasada');
const informe = await cifrarNotasMedicas(consulta, { encryptField, decryptField });
comprobar('cuenta dos personas con nota', informe.conNota === 2, informe);
comprobar('una ya estaba cifrada', informe.yaCifradas === 1, informe);
comprobar('cifra la que estaba en claro', informe.cifradasAhora === 1, informe);

const cifrada = await nota('en-claro@ejemplo.com');
comprobar('en la base ya no se lee', cifrada.startsWith(PREFIJO) && !cifrada.includes('Asma'));
comprobar('la API la descifra igual, con tildes y todo', decryptField(cifrada) === EN_CLARO);
comprobar(
  'la que ya estaba cifrada no se cifró dos veces',
  decryptField(await nota('ya-cifrada@ejemplo.com')) === YA_CIFRADA,
);
comprobar('la vacía sigue vacía', (await nota('vacia@ejemplo.com')) === '');
comprobar('la que no existía sigue sin existir', (await nota('sin-nota@ejemplo.com')) === null);

console.log('\n4. La segunda pasada no toca nada');
const otra = await cifrarNotasMedicas(consulta, { encryptField, decryptField });
comprobar('no cifra ninguna', otra.cifradasAhora === 0, otra);
comprobar('las dos constan como cifradas', otra.yaCifradas === 2, otra);
comprobar('y la nota no cambió', (await nota('en-claro@ejemplo.com')) === cifrada);

console.log('\n5. Con otra clave no se pisa nada');
await consulta("UPDATE ecosystem.users SET medical_notes = 'Nota nueva en claro' WHERE email = 'vacia@ejemplo.com'", []);
let rechazo = null;
try {
  // Una función de descifrado que no devuelve lo que entró: es lo que pasaría
  // con la clave cambiada entre cifrar y comprobar.
  await cifrarNotasMedicas(consulta, { encryptField, decryptField: () => 'otra cosa' });
} catch (err) {
  rechazo = err;
}
comprobar('se niega y lo dice', rechazo instanceof Error && /no se descifra igual/.test(rechazo.message));

console.log(fallos === 0 ? '\n✔ Todo en orden.\n' : `\n✘ ${fallos} comprobación(es) fallaron.\n`);
await pg.close();
process.exit(fallos === 0 ? 0 : 1);
