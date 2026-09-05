#!/usr/bin/env node
/**
 * Ensayo de «las fotos, al disco» sobre un PostgreSQL de verdad.
 *
 *     pnpm --filter @dinamyt/ecosystem-api fotos:ensayo
 *
 * Levanta un PostgreSQL compilado a WebAssembly (PGlite), le aplica las
 * migraciones reales del ecosystem, siembra las imágenes que duelen —la que
 * miente sobre su formato, la que no es de ningún formato aceptado, la que ya
 * está en el disco, la que no tiene ninguna— y corre el guion entero. Después
 * lo corre OTRA VEZ, que es la única forma de demostrar que es idempotente.
 *
 * Y comprueba lo que ninguna prueba unitaria puede: que **el guion y el código
 * produzcan el mismo nombre para los mismos bytes**. Son dos implementaciones
 * de la misma regla en dos lenguajes; si se separaran, la mitad de las filas
 * apuntaría a un archivo que no existe y nadie se enteraría hasta ver un
 * carnet sin foto.
 *
 * No necesita red ni base de datos.
 */

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import {
  mkdtempSync,
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { moverFotosAlDisco, nombreDe } from './lib/fotos-al-disco.mjs';

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

// ── Imágenes de verdad ──────────────────────────────────────────────────────
//
// Tienen que serlo: media función del guion es comprobar la FIRMA, y sembrar
// bytes inventados haría pasar el ensayo por el motivo contrario al que dice.

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
);
const du = (tipo, buf) => `data:image/${tipo};base64,${buf.toString('base64')}`;

// ── El almacén de mentira: escribe en un directorio temporal ────────────────

const dir = mkdtempSync(join(tmpdir(), 'dinamyt-ensayo-media-'));
function guardar(datos, tipo) {
  const nombre = nombreDe(datos, tipo);
  const destino = join(dir, nombre);
  if (!existsSync(destino)) {
    writeFileSync(destino, datos);
  }
  return `/media/${nombre}`;
}

// ── El escenario ────────────────────────────────────────────────────────────

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

console.log('\n2. Las imágenes que duelen');
const svg = `data:image/svg+xml;base64,${Buffer.from('<svg onload=alert(1)/>').toString('base64')}`;
const mentirosa = du('png', JPEG); // dice PNG, por dentro es JPEG

const gente = [
  ['con-foto@ejemplo.com', du('png', PNG)],
  ['otra-foto@ejemplo.com', du('jpeg', JPEG)],
  ['misma-foto@ejemplo.com', du('png', PNG)], // los mismos bytes que la primera
  ['ya-en-disco@ejemplo.com', '/media/' + 'a'.repeat(32) + '.jpg'],
  ['fuera@ejemplo.com', 'https://cdn.club.com/x.png'],
  ['sin-foto@ejemplo.com', null],
  ['svg@ejemplo.com', svg],
  ['mentirosa@ejemplo.com', mentirosa],
];
const ids = {};
for (const [correo, avatar] of gente) {
  const filas = await consulta(
    'INSERT INTO ecosystem.users (email, full_name, avatar_url) VALUES ($1, $2, $3) RETURNING id',
    [correo, correo.split('@')[0].toUpperCase(), avatar],
  );
  ids[correo] = filas[0].id;
}
await consulta(
  "INSERT INTO ecosystem.organizations (name, slug, type, logo_url) VALUES ($1, $2, 'CLUB', $3) RETURNING id",
  ['Club del Ensayo', 'club-ensayo', du('png', PNG)],
);
console.log(`  ✔ ${gente.length} personas y 1 club sembrados`);

console.log('\n3. La primera pasada');
const informe = await moverFotosAlDisco(consulta, { guardar });
const fotos = informe.find((i) => i.tabla === 'users');
const escudos = informe.find((i) => i.tabla === 'organizations');

comprobar(
  'solo mira lo incrustado: 5 de 8 personas (3 son data-URL válidos + 2 rotos)',
  fotos.total === 5,
  fotos,
);
comprobar('mueve las 3 buenas', fotos.movidas === 3, fotos);
comprobar('deja 2 sin tocar para mirarlas a mano', fotos.rotas.length === 2, fotos.rotas);
comprobar(
  'el SVG queda fuera (puede llevar scripts)',
  fotos.rotas.some((r) => r.id === ids['svg@ejemplo.com']),
);
comprobar(
  'la que miente sobre su formato queda fuera',
  fotos.rotas.some((r) => r.id === ids['mentirosa@ejemplo.com']),
);
comprobar('el escudo del club también se mueve', escudos.movidas === 1, escudos);

console.log('\n4. Lo que quedó en la base');
const filas = await consulta(
  'SELECT email, avatar_url FROM ecosystem.users ORDER BY email',
  [],
);
const porCorreo = Object.fromEntries(filas.map((f) => [f.email, f.avatar_url]));

comprobar(
  'la foto pasó a ser una ruta',
  /^\/media\/[a-f0-9]{32}\.png$/.test(porCorreo['con-foto@ejemplo.com']),
  porCorreo['con-foto@ejemplo.com'],
);
comprobar(
  'los mismos bytes dan la MISMA ruta (dos personas, un archivo)',
  porCorreo['con-foto@ejemplo.com'] === porCorreo['misma-foto@ejemplo.com'],
);
comprobar(
  'la que ya estaba en disco no se tocó',
  porCorreo['ya-en-disco@ejemplo.com'] === '/media/' + 'a'.repeat(32) + '.jpg',
);
comprobar(
  'la alojada fuera no se tocó',
  porCorreo['fuera@ejemplo.com'] === 'https://cdn.club.com/x.png',
);
comprobar('quien no tenía foto sigue sin tenerla', porCorreo['sin-foto@ejemplo.com'] === null);
comprobar(
  'el SVG sigue donde estaba: no se borra lo que no se supo leer',
  porCorreo['svg@ejemplo.com'] === svg,
);
comprobar(
  'la mentirosa sigue donde estaba',
  porCorreo['mentirosa@ejemplo.com'] === mentirosa,
);

console.log('\n5. Los archivos');
const enDisco = readdirSync(dir);
comprobar(
  'se escribieron 2 archivos, no 3: dos personas comparten imagen',
  enDisco.length === 2,
  enDisco,
);
comprobar(
  'los bytes en disco son los originales, sin recomprimir',
  readFileSync(join(dir, porCorreo['con-foto@ejemplo.com'].slice(7))).equals(PNG),
);

console.log('\n6. La segunda pasada (idempotencia)');
const otra = await moverFotosAlDisco(consulta, { guardar });
const fotos2 = otra.find((i) => i.tabla === 'users');
comprobar(
  'ya no queda nada incrustado salvo lo que se dejó a propósito',
  fotos2.total === 2 && fotos2.movidas === 0,
  fotos2,
);
comprobar('y no se escribió ningún archivo nuevo', readdirSync(dir).length === 2);

console.log('\n7. El guion y el código dicen lo mismo');
// Esta es la comprobación que justifica el ensayo entero: `nombreDe` (JS, aquí)
// y `guardarImagen` (TypeScript, en la API) son dos escrituras de la misma
// regla. El día que una cambie sin la otra, la mitad de las filas apuntará a un
// archivo que no existe.
const esperado = `${createHash('sha256').update(PNG).digest('hex').slice(0, 32)}.png`;
comprobar(
  'el nombre es sha256(contenido)[:32] + la extensión del formato',
  nombreDe(PNG, 'png') === esperado,
  { nombreDe: nombreDe(PNG, 'png'), esperado },
);
comprobar(
  'y coincide con la ruta que quedó en la fila',
  porCorreo['con-foto@ejemplo.com'] === `/media/${esperado}`,
);

console.log(
  fallos === 0
    ? '\n✔ Todo en verde. El guion está listo para el ensayo en seco contra la copia del VPS.\n'
    : `\n✘ ${fallos} comprobación(es) en rojo.\n`,
);
process.exit(fallos === 0 ? 0 : 1);
