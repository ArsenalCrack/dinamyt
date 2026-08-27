#!/usr/bin/env node
/**
 * Ensayo del reloj de la sesión, con la base en OTRA ZONA.
 *
 *     node scripts/probar-reloj-sesion.mjs
 *
 * ── El fallo que esto existe para no repetir ───────────────────────────────
 *
 * `sessions.created_at` y `sessions.last_seen_at` nacieron con `DEFAULT now()`.
 * Las columnas son `timestamp` **sin zona**: Postgres escribe `now()` como la
 * hora de pared de LA BASE, y Drizzle lee las columnas sin zona dando por hecho
 * que lo guardado es UTC. Mientras las dos coincidan no se nota nada.
 *
 * En local no se notaba: PGlite arranca en GMT y cuadraba por casualidad. En el
 * VPS no cuadra —PostgreSQL sigue al sistema, que está en `America/Bogota`— así
 * que una sesión recién creada se leía con `last_seen_at` **cinco horas en el
 * pasado**. El guard la daba por muerta de inactividad y echaba a quien acababa
 * de escribir su contraseña, diciéndole que llevaba veinte minutos quieto.
 *
 * ── Por qué es un guion y no una prueba de Jest ────────────────────────────
 *
 * PGlite carga su binario con `import()` dinámico, y Jest lo prohíbe sin
 * `--experimental-vm-modules`. Es la misma razón por la que el ensayo de la
 * reconciliación vive aquí al lado y no en un `.spec.ts`.
 *
 * Y por qué no basta `sesiones.spec.ts`: aquella prueba `juzgarSesion` con
 * fechas de mentira, y esa función era CORRECTA. El fallo estaba en el viaje a
 * la base y de vuelta, y un fallo de ida y vuelta solo lo ve algo que haga la
 * ida y la vuelta — con la base en una zona distinta de UTC, que es la
 * condición que lo destapa.
 */

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { join } from 'node:path';

const HORAS = 12; // SessionsService.MAXIMO_HORAS
const INACTIVIDAD_MIN = 20; // SessionsService.INACTIVIDAD_MINUTOS

let fallos = 0;
function comprobar(nombre, condicion, detalle = '') {
  if (condicion) {
    console.log(`  ✔ ${nombre}`);
  } else {
    fallos++;
    console.log(`  ✘ ${nombre}${detalle ? ` — ${detalle}` : ''}`);
  }
}

/** La misma regla que `juzgarSesion`, en 6 líneas, para no importar TypeScript. */
function juzgar(s, ahora) {
  if (s.revoked_at) return 'revocada';
  if (new Date(s.expires_at + 'Z').getTime() <= ahora) return 'caducada';
  const parado = ahora - new Date(s.last_seen_at + 'Z').getTime();
  return parado > INACTIVIDAD_MIN * 60_000 ? 'inactividad' : 'viva';
}

const pg = new PGlite(); // en memoria
await migrate(drizzle(pg), {
  migrationsFolder: join(process.cwd(), 'drizzle', 'migrations'),
  migrationsSchema: 'ecosystem',
});

console.log('\n1. La base, en la zona del VPS');
// **La línea que hace útil a todo este ensayo.** Sin ella PGlite corre en GMT,
// cuadra con lo que espera Drizzle y el fallo no aparece — que es exactamente
// por lo que se coló hasta producción.
await pg.query("SET TIME ZONE 'America/Bogota'");
const zona = (await pg.query('show timezone')).rows[0].TimeZone;
comprobar(`la base corre en ${zona}, no en UTC`, zona === 'America/Bogota');

const { rows: usuarios } = await pg.query(
  `insert into ecosystem.users (email, full_name) values ('reloj@dinamyt.org','RELOJ') returning id`,
);
const usuario = usuarios[0].id;

console.log('\n2. Una sesión recién abierta, con las fechas puestas por JS');
const ahoraJs = new Date();
const { rows: creadas } = await pg.query(
  `insert into ecosystem.sessions (user_id, created_at, last_seen_at, expires_at)
   values ($1, $2, $3, $4)
   returning (created_at)::text, (last_seen_at)::text, (expires_at)::text, revoked_at`,
  [
    usuario,
    ahoraJs.toISOString(),
    ahoraJs.toISOString(),
    new Date(ahoraJs.getTime() + HORAS * 3600_000).toISOString(),
  ],
);
const s = creadas[0];

const desfaseMin = Math.round(
  (Date.now() - new Date(s.last_seen_at + 'Z').getTime()) / 60_000,
);
comprobar(
  'la fecha que se guarda es la que se lee (desfase de segundos, no de horas)',
  Math.abs(desfaseMin) < 2,
  `desfase real: ${desfaseMin} min`,
);
comprobar('el veredicto es «viva»', juzgar(s, Date.now()) === 'viva', juzgar(s, Date.now()));

const horasRestantes =
  (new Date(s.expires_at + 'Z').getTime() - Date.now()) / 3600_000;
comprobar(
  `el tope de ${HORAS} h se lee entero, no recortado por la zona`,
  Math.abs(horasRestantes - HORAS) < 0.1,
  `quedan ${horasRestantes.toFixed(2)} h`,
);

console.log('\n3. Y con `now()` de la base —lo que se hacía antes— se rompe');
const { rows: conNow } = await pg.query(
  `select (now()::timestamp)::text as guardado`,
);
const comoLoLeeDrizzle = new Date(conNow[0].guardado.replace(' ', 'T') + 'Z');
const desfaseNow = Math.round((Date.now() - comoLoLeeDrizzle.getTime()) / 60_000);
comprobar(
  `un now() de la base se leería ${desfaseNow} min en el pasado (por eso no se usa)`,
  Math.abs(desfaseNow) > INACTIVIDAD_MIN,
  'si esto falla, la base está en UTC y el ensayo no está probando nada',
);

console.log('\n4. La base ya no rellena estas fechas por su cuenta');
let rechazado = false;
try {
  await pg.query(
    `insert into ecosystem.sessions (user_id, expires_at)
     values ($1, now() + interval '12 hours')`,
    [usuario],
  );
} catch {
  rechazado = true;
}
comprobar(
  'un INSERT sin las fechas es rechazado (la migración 0011 quitó el DEFAULT)',
  rechazado,
  'el DEFAULT volvió: el desfase puede reaparecer por cualquier camino',
);

console.log('\n5. El latido revive una sesión que iba a morir');
const vieja = new Date(Date.now() - (INACTIVIDAD_MIN + 5) * 60_000);
await pg.query(
  `update ecosystem.sessions set last_seen_at = $1 where user_id = $2`,
  [vieja.toISOString(), usuario],
);
const { rows: v1 } = await pg.query(
  `select (last_seen_at)::text, (expires_at)::text, revoked_at from ecosystem.sessions where user_id = $1`,
  [usuario],
);
comprobar('sin latido, muere por inactividad', juzgar(v1[0], Date.now()) === 'inactividad');

await pg.query(
  `update ecosystem.sessions set last_seen_at = $1 where user_id = $2`,
  [new Date().toISOString(), usuario],
);
const { rows: v2 } = await pg.query(
  `select (last_seen_at)::text, (expires_at)::text, revoked_at from ecosystem.sessions where user_id = $1`,
  [usuario],
);
comprobar('con latido, vuelve a estar viva', juzgar(v2[0], Date.now()) === 'viva');

await pg.close();

if (fallos) {
  console.error(`\n✘ El ensayo del reloj falla en ${fallos} punto(s).\n`);
  process.exit(1);
}
console.log('\n✔ El ensayo del reloj pasa entero.\n');
