#!/usr/bin/env node
/**
 * Ensayo de la migración `0017_fechas_con_zona`, con la base en OTRA ZONA.
 *
 *     pnpm --filter @dinamyt/membresias-db zonas:ensayo
 *
 * ── Qué se está probando, y por qué no basta con leer el SQL ───────────────
 *
 * La 0017 convierte 24 columnas a `timestamptz`, y **cada una con su propio
 * `USING`**, porque no todas guardan lo mismo: unas las escribió `DEFAULT
 * now()` con la hora de pared de la base y otras las escribió la aplicación en
 * UTC. Un `USING` equivocado no falla: convierte, guarda un instante que no
 * es, y no se nota hasta que alguien mira una hora meses después — que es
 * justo cómo apareció el fallo original, en la lista de asistencia.
 *
 * Eso no se comprueba leyendo. Se comprueba fabricando las dos clases de fila
 * —con la base en `America/Bogota`, que es la condición que destapa el fallo—,
 * aplicando las mismas expresiones de la migración, y mirando si el instante
 * que sale es el que era.
 *
 * ── Los cuatro bloques ──
 *
 *   1. **La base, en la zona del VPS.** Si el bloque 2 NO detecta el desvío,
 *      el ensayo está corriendo en UTC y no está probando nada.
 *   2. **La base miente antes de migrar.**
 *   3. **Las tres conversiones** (zona de la base, UTC y la mixta) devuelven el
 *      instante correcto.
 *   4. **El SQL y el esquema de Drizzle dicen lo mismo.** Se migra de verdad y
 *      se le pregunta a `information_schema` columna por columna: las de
 *      instante tienen que haber quedado `timestamptz` y no puede quedar ni una
 *      `timestamp` sin zona. Es lo que detecta que alguien añada una columna en
 *      el esquema y se olvide de la migración, o al revés.
 *
 * ── Por qué es un guion y no un test de Vitest ─────────────────────────────
 *
 * Porque necesita una PGlite suya, en otra zona horaria y sin el arnés de
 * `testing.ts` — que arranca en GMT justamente para que las pruebas no
 * dependan de dónde corran. Mismo criterio que su gemelo del ecosistema
 * (`apps/ecosystem-api/scripts/probar-zonas.mjs`).
 */

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const MIGRACIONES = join(AQUI, '..', 'drizzle', 'migrations');

const ZONA = 'America/Bogota';
/** Margen para «esto es ahora»: el ensayo entero tarda menos que esto. */
const MARGEN_MS = 60_000;

let fallos = 0;
function comprobar(nombre, condicion, detalle = '') {
  if (condicion) {
    console.log(`  ✔ ${nombre}`);
  } else {
    fallos++;
    console.log(`  ✘ ${nombre}${detalle ? ` — ${detalle}` : ''}`);
  }
}

/** Cuántos minutos separan lo leído del instante real. */
function desvioMin(leido, real) {
  return Math.round((leido.getTime() - real.getTime()) / 60_000);
}

/**
 * Cómo lee Drizzle una columna **sin zona**: le pega un `+0000` al texto y la
 * da por UTC (`mapFromDriverValue`). Ese es el convenio cuya discrepancia con
 * `now()` es el fallo entero.
 *
 * Se hace sobre `::text` y no sobre lo que devuelve el driver a propósito: el
 * parser de PGlite interpreta las columnas sin zona con la hora LOCAL DEL
 * PROCESO, que no es lo que hace Drizzle y además cambia según la máquina.
 * Leyendo el texto y aplicando el convenio a mano, esto prueba lo mismo en
 * cualquier sitio.
 */
const comoLeeDrizzleSinZona = (texto) => new Date(texto.replace(' ', 'T') + 'Z');

/**
 * Cómo lee Drizzle una columna **con zona**: el texto ya trae el
 * desplazamiento, así que sale el instante sin suponer nada.
 *
 * Postgres lo escribe como `2026-08-31 09:12:00.123-05`, con el huso en dos
 * dígitos. `new Date()` no acepta ese `-05` suelto —quiere `-05:00`— y devuelve
 * `Invalid Date` sin quejarse, así que se completa a mano.
 */
function comoLeeDrizzleConZona(texto) {
  const iso = texto.replace(' ', 'T');
  return new Date(/[+-]\d{2}$/.test(iso) ? `${iso}:00` : iso);
}

const pg = new PGlite(); // en memoria

// ══════════════════════════════════════════════════════════════════════════
console.log('\n1. La base, en la zona del servidor');
// **La línea que hace útil a todo este ensayo.** Sin ella PGlite corre en GMT,
// cuadra con lo que espera el cliente y el fallo no aparece — que es
// exactamente por lo que se coló hasta producción.
await pg.query(`SET TIME ZONE '${ZONA}'`);
const zona = (await pg.query('show timezone')).rows[0].TimeZone;
comprobar(`la base corre en ${zona}, no en UTC`, zona === ZONA);

// ══════════════════════════════════════════════════════════════════════════
console.log('\n2. Antes de migrar, una columna sin zona miente');

await pg.query(`
  create table ensayo (
    id            serial primary key,
    quien         text        not null,
    created_at    timestamp   default now(),
    updated_at    timestamp   default now(),
    checked_in_at timestamp   default now(),
    read_at       timestamp
  )
`);

const antes = new Date();

// (a) Fila normal: la base pone las tres columnas con default; la aplicación
//     pone `read_at`. Es el caso de la inmensa mayoría.
await pg.query(`insert into ensayo (quien, read_at) values ('base', $1)`, [
  antes.toISOString(),
]);

// (b) Fila que la aplicación actualizó después: `updated_at` pasa a UTC y deja
//     de coincidir con `created_at`. Es el caso mixto que persigue el CASE.
await pg.query(`insert into ensayo (quien, read_at) values ('tocada', $1)`, [
  antes.toISOString(),
]);
await pg.query(`update ensayo set updated_at = $1 where quien = 'tocada'`, [
  new Date().toISOString(),
]);

const { rows: crudas } = await pg.query(
  `select quien, (checked_in_at)::text as checked_in_at, (read_at)::text as read_at
     from ensayo order by id`,
);
const cruda = crudas.find((f) => f.quien === 'base');

// El cliente lee una columna sin zona como si fuera UTC. Lo que escribió la
// base era hora de pared de Bogotá, así que sale cinco horas en el pasado.
// Es literalmente la hora que el maestro veía en la lista de asistencia.
const desvioBase = desvioMin(comoLeeDrizzleSinZona(cruda.checked_in_at), antes);
comprobar(
  `la hora del check-in se lee ${desvioBase} min desviada (debe ser ≈ -300)`,
  desvioBase <= -295 && desvioBase >= -305,
  'si esto da 0, el ensayo corre en UTC y no está probando nada',
);
comprobar(
  'lo que escribió la aplicación ya se leía bien',
  Math.abs(desvioMin(comoLeeDrizzleSinZona(cruda.read_at), antes)) < 2,
);

// ══════════════════════════════════════════════════════════════════════════
console.log('\n3. Las tres conversiones de la 0017');

// Las mismas expresiones que la migración, palabra por palabra. Si se cambian
// allí, hay que cambiarlas aquí — y si solo se cambian en un sitio, este
// bloque lo dice.
await pg.query(`
  alter table ensayo
    alter column created_at type timestamptz
      using created_at at time zone current_setting('TimeZone'),
    alter column checked_in_at type timestamptz
      using checked_in_at at time zone current_setting('TimeZone'),
    alter column updated_at type timestamptz
      using case
        when updated_at - created_at < interval '2 seconds'
          then updated_at at time zone current_setting('TimeZone')
        else updated_at at time zone 'UTC'
      end,
    alter column read_at type timestamptz
      using read_at at time zone 'UTC'
`);

const { rows: convertidas } = await pg.query(
  `select quien,
          (created_at)::text    as created_at,
          (updated_at)::text    as updated_at,
          (checked_in_at)::text as checked_in_at,
          (read_at)::text       as read_at
     from ensayo order by id`,
);
const conv = Object.fromEntries(
  convertidas.map((f) => [
    f.quien,
    {
      created_at: comoLeeDrizzleConZona(f.created_at),
      updated_at: comoLeeDrizzleConZona(f.updated_at),
      checked_in_at: comoLeeDrizzleConZona(f.checked_in_at),
      read_at: comoLeeDrizzleConZona(f.read_at),
    },
  ]),
);

comprobar(
  'grupo A · la hora del check-in queda en su instante real',
  Math.abs(conv.base.checked_in_at.getTime() - antes.getTime()) < MARGEN_MS,
  `desvío ${desvioMin(conv.base.checked_in_at, antes)} min`,
);
comprobar(
  'grupo B · lo de `new Date()` no se movió',
  Math.abs(conv.base.read_at.getTime() - antes.getTime()) < MARGEN_MS,
  `desvío ${desvioMin(conv.base.read_at, antes)} min`,
);
comprobar(
  'grupo C · fila nunca tocada → se trata como hora de la base',
  Math.abs(conv.base.updated_at.getTime() - antes.getTime()) < MARGEN_MS,
  `desvío ${desvioMin(conv.base.updated_at, antes)} min`,
);
comprobar(
  'grupo C · fila actualizada por la app → se trata como UTC',
  Math.abs(conv.tocada.updated_at.getTime() - antes.getTime()) < MARGEN_MS,
  `desvío ${desvioMin(conv.tocada.updated_at, antes)} min`,
);

// El default sobrevive al cambio de tipo, y ahora guarda el instante bueno:
// eso es lo que se compró con la migración — que dé igual quién escriba.
await pg.query(`insert into ensayo (quien) values ('despues')`);
const { rows: nuevas } = await pg.query(
  `select (checked_in_at)::text as checked_in_at from ensayo where quien = 'despues'`,
);
const recien = comoLeeDrizzleConZona(nuevas[0].checked_in_at);
comprobar(
  '`DEFAULT now()` sobre `timestamptz` ya guarda el instante correcto',
  Math.abs(recien.getTime() - Date.now()) < MARGEN_MS,
  `desvío ${desvioMin(recien, new Date())} min`,
);

// ══════════════════════════════════════════════════════════════════════════
console.log('\n4. El SQL de la migración y el esquema de Drizzle, ¿dicen lo mismo?');

await migrate(drizzle(pg), {
  migrationsFolder: MIGRACIONES,
  migrationsSchema: 'membresias',
});

const { rows: columnas } = await pg.query(`
  select table_name, column_name, data_type
    from information_schema.columns
   where table_schema = 'membresias'
     and data_type like 'timestamp%'
   order by table_name, column_name
`);

const sinZona = columnas.filter((c) => !c.data_type.includes('with time zone'));
const conZona = columnas.filter((c) => c.data_type.includes('with time zone'));

// Aquí no hay excepciones que listar, y eso es lo bueno: los días del
// calendario de Membresías ya son columnas `date` (`vence_el`, `birth_date`,
// `checkin_date`, `semana`…), así que NINGUNA `timestamp` puede quedarse sin
// zona. Una que aparezca es una columna nueva que se olvidó en la migración.
comprobar(
  `las ${conZona.length} columnas de instante quedaron con zona`,
  sinZona.length === 0,
  sinZona.map((c) => `${c.table_name}.${c.column_name}`).join(', '),
);
comprobar(
  'no falta ninguna: el esquema tiene 24 columnas de instante',
  conZona.length === 24,
  `hay ${conZona.length}; si añadiste una, actualiza este número y la migración`,
);

await pg.close();

if (fallos) {
  console.error(`\n✘ El ensayo de zonas falla en ${fallos} punto(s).\n`);
  process.exit(1);
}
console.log(`\n✔ El ensayo de zonas pasa entero — ${conZona.length} columnas con zona.\n`);
