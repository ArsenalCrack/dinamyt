#!/usr/bin/env node
/**
 * Ensayo de la migración `0012_fechas_con_zona`, con la base en OTRA ZONA.
 *
 *     pnpm zonas:ensayo
 *
 * ── Qué se está probando, y por qué no basta con leer el SQL ───────────────
 *
 * La 0012 convierte 35 columnas a `timestamptz`, y **cada una con su propio
 * `USING`**, porque no todas guardan lo mismo: unas las escribió `DEFAULT
 * now()` con la hora de pared de Bogotá y otras las escribió la aplicación en
 * UTC. Un `USING` equivocado no falla: convierte, guarda un instante que no
 * es, y no se nota hasta que alguien mira una fecha meses después.
 *
 * Eso no se comprueba leyendo. Se comprueba fabricando las dos clases de fila
 * —con la base en `America/Bogota`, que es la condición que destapa el fallo—,
 * aplicando las mismas expresiones de la migración, y mirando si el instante
 * que sale es el que era.
 *
 * ── Los tres bloques ──
 *
 *   1. **La base miente antes de migrar.** Si esta parte NO falla, el ensayo se
 *      está corriendo en UTC y no está probando nada. Es la misma guarda que
 *      lleva `probar-reloj-sesion.mjs`.
 *   2. **Las tres conversiones** (Bogotá, UTC y la mixta) devuelven el instante
 *      correcto.
 *   3. **El SQL y el esquema de Drizzle dicen lo mismo.** Se migra de verdad y
 *      se le pregunta a `information_schema` columna por columna: las 35 de
 *      instante tienen que haber quedado `timestamptz` y las 6 fechas civiles
 *      tienen que seguir SIN zona. Es lo que detecta que alguien añada una
 *      columna en el esquema y se olvide de la migración, o al revés.
 *
 * ── Por qué es un guion y no una prueba de Jest ────────────────────────────
 *
 * PGlite carga su binario con `import()` dinámico y Jest lo prohíbe sin
 * `--experimental-vm-modules`. Misma razón que sus dos vecinos de carpeta.
 */

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { join } from 'node:path';

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
 * PROCESO, que no es lo que hace Drizzle y además cambia según la máquina —el
 * ensayo daría distinto en Bogotá y en un runner en UTC—. Leyendo el texto y
 * aplicando el convenio a mano, esto prueba lo mismo en cualquier sitio.
 */
const comoLeeDrizzleSinZona = (texto) => new Date(texto.replace(' ', 'T') + 'Z');

/**
 * Cómo lee Drizzle una columna **con zona**: el texto ya trae el
 * desplazamiento, así que sale el instante sin tener que suponer nada.
 *
 * Postgres lo escribe como `2026-08-31 09:12:00.123-05`, con el huso en dos
 * dígitos. `new Date()` no acepta ese `-05` suelto —quiere `-05:00`— y devuelve
 * `Invalid Date` sin quejarse, así que el desplazamiento se completa a mano.
 */
function comoLeeDrizzleConZona(texto) {
  const iso = texto.replace(' ', 'T');
  return new Date(/[+-]\d{2}$/.test(iso) ? `${iso}:00` : iso);
}

/**
 * Las columnas que la 0012 NO convierte, y que tienen que seguir sin zona.
 *
 * No son un olvido: son días del calendario, no instantes. Si alguna aparece
 * aquí como `timestamptz`, es que alguien la convirtió sin darse cuenta de que
 * un cumpleaños no ocurre a una hora.
 */
const FECHAS_CIVILES = [
  ['users', 'birth_date'],
  ['pending_registrations', 'birth_date'],
  ['subscriptions', 'starts_at'],
  ['subscriptions', 'ends_at'],
  ['user_subscriptions', 'starts_at'],
  ['user_subscriptions', 'ends_at'],
];

const pg = new PGlite(); // en memoria

// ══════════════════════════════════════════════════════════════════════════
console.log('\n1. La base, en la zona del VPS');
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
    last_sent_at  timestamp
  )
`);

const antes = new Date();

// (a) Fila del alta normal: la base pone `created_at` y `updated_at`; la
//     aplicación pone `last_sent_at`. Es el caso de la inmensa mayoría.
await pg.query(`insert into ensayo (quien, last_sent_at) values ('base', $1)`, [
  antes.toISOString(),
]);

// (b) Fila que la aplicación actualizó después: `updated_at` pasa a UTC y deja
//     de coincidir con `created_at`. Es el caso mixto que persigue el CASE.
await pg.query(`insert into ensayo (quien, last_sent_at) values ('tocada', $1)`, [
  antes.toISOString(),
]);
await pg.query(`update ensayo set updated_at = $1 where quien = 'tocada'`, [
  new Date().toISOString(),
]);

const { rows: crudas } = await pg.query(
  `select quien, (created_at)::text as created_at, (last_sent_at)::text as last_sent_at
     from ensayo order by id`,
);
const base = crudas.find((f) => f.quien === 'base');

// El cliente lee una columna sin zona como si fuera UTC. Lo que escribió la
// base era hora de pared de Bogotá, así que sale cinco horas en el pasado.
const desvioBase = desvioMin(comoLeeDrizzleSinZona(base.created_at), antes);
comprobar(
  `lo que escribió la base se lee ${desvioBase} min desviado (debe ser ≈ -300)`,
  desvioBase <= -295 && desvioBase >= -305,
  'si esto da 0, el ensayo corre en UTC y no está probando nada',
);
comprobar(
  'lo que escribió la aplicación ya se leía bien',
  Math.abs(desvioMin(comoLeeDrizzleSinZona(base.last_sent_at), antes)) < 2,
);

// ══════════════════════════════════════════════════════════════════════════
console.log('\n3. Las tres conversiones de la 0012');

// Las mismas expresiones que la migración, palabra por palabra. Si se cambian
// allí, hay que cambiarlas aquí — y si solo se cambian en un sitio, este
// bloque lo dice.
await pg.query(`
  alter table ensayo
    alter column created_at type timestamptz
      using created_at at time zone '${ZONA}',
    alter column updated_at type timestamptz
      using case
        when updated_at - created_at < interval '2 seconds'
          then updated_at at time zone '${ZONA}'
        else updated_at at time zone 'UTC'
      end,
    alter column last_sent_at type timestamptz
      using last_sent_at at time zone 'UTC'
`);

const { rows: convertidas } = await pg.query(
  `select quien,
          (created_at)::text   as created_at,
          (updated_at)::text   as updated_at,
          (last_sent_at)::text as last_sent_at
     from ensayo order by id`,
);
const conv = Object.fromEntries(
  convertidas.map((f) => [
    f.quien,
    {
      created_at: comoLeeDrizzleConZona(f.created_at),
      updated_at: comoLeeDrizzleConZona(f.updated_at),
      last_sent_at: comoLeeDrizzleConZona(f.last_sent_at),
    },
  ]),
);

comprobar(
  'grupo A · lo de `DEFAULT now()` queda en su instante real',
  Math.abs(conv.base.created_at.getTime() - antes.getTime()) < MARGEN_MS,
  `desvío ${desvioMin(conv.base.created_at, antes)} min`,
);
comprobar(
  'grupo B · lo de `new Date()` no se movió',
  Math.abs(conv.base.last_sent_at.getTime() - antes.getTime()) < MARGEN_MS,
  `desvío ${desvioMin(conv.base.last_sent_at, antes)} min`,
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
  `select (created_at)::text as created_at from ensayo where quien = 'despues'`,
);
const recien = comoLeeDrizzleConZona(nuevas[0].created_at);
comprobar(
  '`DEFAULT now()` sobre `timestamptz` ya guarda el instante correcto',
  Math.abs(recien.getTime() - Date.now()) < MARGEN_MS,
  `desvío ${desvioMin(recien, new Date())} min`,
);

// ══════════════════════════════════════════════════════════════════════════
console.log('\n4. El SQL de la migración y el esquema de Drizzle, ¿dicen lo mismo?');

await migrate(drizzle(pg), {
  migrationsFolder: join(process.cwd(), 'drizzle', 'migrations'),
  migrationsSchema: 'ecosystem',
});

const { rows: columnas } = await pg.query(`
  select table_name, column_name, data_type
    from information_schema.columns
   where table_schema = 'ecosystem'
     and data_type like 'timestamp%'
   order by table_name, column_name
`);

const civiles = new Set(FECHAS_CIVILES.map(([t, c]) => `${t}.${c}`));
const sinZona = columnas.filter((c) => !c.data_type.includes('with time zone'));
const conZona = columnas.filter((c) => c.data_type.includes('with time zone'));

const coladas = sinZona.filter((c) => !civiles.has(`${c.table_name}.${c.column_name}`));
comprobar(
  `las ${conZona.length} columnas de instante quedaron con zona`,
  coladas.length === 0,
  coladas.map((c) => `${c.table_name}.${c.column_name}`).join(', '),
);

const perdidas = FECHAS_CIVILES.filter(
  ([t, c]) => !sinZona.some((x) => x.table_name === t && x.column_name === c),
);
comprobar(
  'las 6 fechas civiles siguen SIN zona, como debe ser',
  perdidas.length === 0,
  perdidas.map(([t, c]) => `${t}.${c}`).join(', '),
);

await pg.close();

if (fallos) {
  console.error(`\n✘ El ensayo de zonas falla en ${fallos} punto(s).\n`);
  process.exit(1);
}
console.log(
  `\n✔ El ensayo de zonas pasa entero — ${conZona.length} columnas con zona, ${sinZona.length} sin ella.\n`,
);
