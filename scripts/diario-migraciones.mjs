#!/usr/bin/env node
/**
 * Separa el diario de migraciones de Drizzle, que hoy está compartido.
 *
 * ── El problema ──────────────────────────────────────────────────────────────
 * Drizzle guarda qué migraciones aplicó en `drizzle.__drizzle_migrations`, un
 * nombre GLOBAL a la base de datos. En el proyecto de Supabase
 * `yabnklhtfknwvpgadacp` conviven CUATRO esquemas —ecosystem, academy, y las
 * versiones viejas de membresias y campeonatos— y las cuatro apps escriben en
 * esa misma tabla.
 *
 * El migrador decide qué aplicar comparando marcas de tiempo: recorre sus
 * migraciones y salta las que tengan `created_at` menor o igual al máximo que
 * encuentre en el diario. Con el diario compartido, ese máximo puede ser de
 * OTRA app. Resultado: migraciones dadas por aplicadas sin haberse ejecutado,
 * y un esquema incompleto que no falla hasta la primera consulta.
 *
 * ── Qué hace esto ────────────────────────────────────────────────────────────
 * Calcula el hash de cada migración de cada app —sha256 del contenido del
 * archivo, exactamente como `readMigrationFiles` de drizzle-orm— y emite el SQL
 * que reparte las filas del diario compartido a un diario por esquema.
 *
 * ── Cómo se usa ──────────────────────────────────────────────────────────────
 *   node scripts/diario-migraciones.mjs separar   > separar.sql
 *   node scripts/diario-migraciones.mjs sellar    > sellar.sql
 *   node scripts/diario-migraciones.mjs listar
 *
 *   separar → reparte `drizzle.__drizzle_migrations` en `<esquema>.__drizzle_migrations`
 *             según a qué app pertenece cada hash. Es el caso del VPS, cuando
 *             el volcado trae el diario compartido.
 *   sellar  → INSERTA las filas dando por aplicadas TODAS las migraciones de
 *             cada app. Para una base cuyo esquema ya es correcto pero cuyo
 *             diario se perdió (p. ej. un volcado hecho sin `-n drizzle`).
 *   listar  → enseña tag, hash y fecha de cada migración, para comprobar a mano.
 *
 * **Emite SQL por la salida estándar y no toca ninguna base.** Se lee antes de
 * ejecutarlo. Un script que escribe solo en la base de producción es
 * exactamente lo que no queremos aquí.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Las apps que comparten base, con el esquema donde debe acabar su diario y
 * dónde están sus migraciones.
 *
 * Membresías NO está aquí: vive en otro proyecto de Supabase, con su diario
 * para ella sola, y su propio código ya lo traslada al arrancar (ver
 * `packages/membresias-db/src/migrate.ts`).
 */
const APPS = [
  { esquema: 'ecosystem', migraciones: 'apps/ecosystem-api/drizzle/migrations' },
  { esquema: 'academy', migraciones: 'packages/academy-db/drizzle/migrations' },
];

/**
 * Lee las migraciones de una app tal y como las lee drizzle-orm: el orden y las
 * marcas de tiempo salen de `meta/_journal.json`, y el hash es el sha256 del
 * contenido del archivo sin tocar.
 */
function leerMigraciones(carpetaRelativa) {
  const carpeta = path.join(raiz, carpetaRelativa);
  const journalPath = path.join(carpeta, 'meta', '_journal.json');
  if (!fs.existsSync(journalPath)) {
    throw new Error(`No hay meta/_journal.json en ${carpetaRelativa}`);
  }
  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));

  return journal.entries.map((entrada) => {
    const sql = fs.readFileSync(path.join(carpeta, `${entrada.tag}.sql`), 'utf8');
    return {
      tag: entrada.tag,
      when: entrada.when,
      hash: crypto.createHash('sha256').update(sql).digest('hex'),
    };
  });
}

function comillas(valor) {
  return `'${String(valor).replace(/'/g, "''")}'`;
}

function cabecera(titulo) {
  return [
    '-- ' + '='.repeat(74),
    `-- ${titulo}`,
    `-- Generado por scripts/diario-migraciones.mjs el ${new Date().toISOString()}`,
    '-- Revísalo antes de ejecutarlo. Y ten el volcado a mano.',
    '-- ' + '='.repeat(74),
    '',
  ].join('\n');
}

/** Tabla de diario vacía, con la forma exacta que espera drizzle-orm. */
function crearTabla(esquema) {
  return [
    `CREATE SCHEMA IF NOT EXISTS "${esquema}";`,
    `CREATE TABLE IF NOT EXISTS "${esquema}"."__drizzle_migrations" (`,
    `  id SERIAL PRIMARY KEY,`,
    `  hash text NOT NULL,`,
    `  created_at bigint`,
    `);`,
  ].join('\n');
}

function separar(apps) {
  const salida = [cabecera('Repartir el diario compartido a un diario por esquema')];

  salida.push(
    '-- Comprobación previa: esto tiene que devolver filas, o no hay nada que repartir.',
    "-- SELECT count(*) FROM drizzle.__drizzle_migrations;",
    '',
    'BEGIN;',
    '',
  );

  for (const { esquema, migraciones } of apps) {
    const lista = leerMigraciones(migraciones);
    const hashes = lista.map((m) => comillas(m.hash)).join(',\n    ');

    salida.push(
      `-- ── ${esquema} · ${lista.length} migraciones ${'─'.repeat(Math.max(0, 44 - esquema.length))}`,
      crearTabla(esquema),
      `INSERT INTO "${esquema}"."__drizzle_migrations" (hash, created_at)`,
      `SELECT d.hash, d.created_at`,
      `  FROM drizzle.__drizzle_migrations d`,
      ` WHERE d.hash IN (`,
      `    ${hashes}`,
      ` )`,
      `   AND NOT EXISTS (`,
      `     SELECT 1 FROM "${esquema}"."__drizzle_migrations" x WHERE x.hash = d.hash`,
      `   );`,
      '',
    );
  }

  const todos = apps.flatMap(({ esquema, migraciones }) =>
    leerMigraciones(migraciones).map((m) => ({ ...m, esquema })),
  );

  salida.push(
    '-- ── Lo que quede sin repartir ────────────────────────────────────────────',
    '-- Serán filas de las versiones VIEJAS de membresias y campeonatos, que se',
    '-- descartan (§3.2 del plan). Míralas ANTES de borrar nada:',
    '--',
    '--   SELECT * FROM drizzle.__drizzle_migrations',
    '--    WHERE hash NOT IN (' + todos.map((m) => comillas(m.hash)).join(', ') + ');',
    '--',
    '-- Si solo quedan esas, el esquema `drizzle` ya no hace falta:',
    '--   DROP SCHEMA drizzle CASCADE;',
    '',
    '-- Repasa los conteos antes de confirmar.',
    'COMMIT;',
    '',
  );

  return salida.join('\n');
}

function sellar(apps) {
  const salida = [
    cabecera('Sellar el diario: dar por aplicadas las migraciones que ya están en el esquema'),
    '-- SOLO para una base cuyo esquema YA es correcto y cuyo diario se perdió.',
    '-- Si el esquema no está completo, esto haría que las migraciones que faltan',
    '-- no se apliquen NUNCA. Comprueba las tablas primero.',
    '',
    'BEGIN;',
    '',
  ];

  for (const { esquema, migraciones } of apps) {
    const lista = leerMigraciones(migraciones);
    salida.push(
      `-- ── ${esquema} · ${lista.length} migraciones ${'─'.repeat(Math.max(0, 44 - esquema.length))}`,
      crearTabla(esquema),
    );
    for (const m of lista) {
      salida.push(
        `INSERT INTO "${esquema}"."__drizzle_migrations" (hash, created_at)`,
        `SELECT ${comillas(m.hash)}, ${m.when}  -- ${m.tag}`,
        ` WHERE NOT EXISTS (SELECT 1 FROM "${esquema}"."__drizzle_migrations"`,
        `                    WHERE hash = ${comillas(m.hash)});`,
      );
    }
    salida.push('');
  }

  salida.push('COMMIT;', '');
  return salida.join('\n');
}

function listar(apps) {
  const lineas = [];
  for (const { esquema, migraciones } of apps) {
    const lista = leerMigraciones(migraciones);
    lineas.push(`\n${esquema}  (${lista.length} migraciones · ${migraciones})`);
    lineas.push('─'.repeat(100));
    for (const m of lista) {
      const fecha = new Date(m.when).toISOString().slice(0, 10);
      lineas.push(`  ${m.tag.padEnd(34)} ${fecha}  ${m.hash}`);
    }
  }
  return lineas.join('\n');
}

const modo = process.argv[2] ?? 'listar';
const acciones = { separar, sellar, listar };

if (!acciones[modo]) {
  console.error(`Modo desconocido: ${modo}. Usa separar, sellar o listar.`);
  process.exit(1);
}

console.log(acciones[modo](APPS));
