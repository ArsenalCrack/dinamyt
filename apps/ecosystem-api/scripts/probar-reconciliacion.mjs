#!/usr/bin/env node
/**
 * Ensayo de la reconciliación (§2.4) sobre un PostgreSQL de mentira.
 *
 *     node scripts/probar-reconciliacion.mjs
 *
 * El plan pide «guion escrito y ensayado sobre una copia antes de tocar nada».
 * Esto es el ensayo que se puede repetir sin copia y sin servidor: levanta un
 * PostgreSQL de verdad compilado a WebAssembly (PGlite), le aplica las
 * migraciones reales del ecosystem, le siembra los tres censos con los casos
 * que duelen —el que está en las dos apps, el que no tiene correo, el hash que
 * no es bcrypt, el club escrito a mano que no cruza— y corre la reconciliación
 * entera. Después la corre OTRA VEZ, que es la única forma de demostrar que es
 * idempotente.
 *
 * No necesita red ni base de datos: si esto pasa, el guion está listo para el
 * ensayo en seco contra la copia del VPS.
 */

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import bcrypt from 'bcryptjs';
import { join } from 'node:path';
import { reconciliar } from './lib/reconciliacion.mjs';

// ── Adaptador: plantillas al estilo postgres.js sobre PGlite ────────────────
//
// `lib/reconciliacion.mjs` habla el dialecto de postgres.js (plantilla
// etiquetada + `sql(objeto)` para un SET dinámico). PGlite habla `query(texto,
// parametros)`. Cincuenta líneas de traducción valen más que un guion partido
// en dos versiones que se van separando.

const DINAMICO = Symbol('set-dinamico');

function adaptador(pg) {
  return function tx(...args) {
    const [primero] = args;

    // Forma `tx({ columna: valor })`: marcador para un SET dinámico.
    if (!Array.isArray(primero) || !('raw' in primero)) {
      return { [DINAMICO]: primero };
    }

    const [trozos, ...valores] = args;
    const parametros = [];
    let texto = '';

    trozos.forEach((trozo, i) => {
      texto += trozo;
      if (i >= valores.length) return;
      const valor = valores[i];
      if (valor && typeof valor === 'object' && DINAMICO in valor) {
        texto += Object.entries(valor[DINAMICO])
          .map(([col, v]) => {
            parametros.push(v);
            return `"${col}" = $${parametros.length}`;
          })
          .join(', ');
      } else {
        parametros.push(valor);
        texto += `$${parametros.length}`;
      }
    });

    return pg.query(texto, parametros).then((r) => r.rows);
  };
}

// ── Comprobaciones ──────────────────────────────────────────────────────────

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

// ── El escenario ────────────────────────────────────────────────────────────

const HASH_MEMB = bcrypt.hashSync('la-de-membresias', 10);
const HASH_CAMP = bcrypt.hashSync('la-de-campeonatos', 10);
const HASH_ROTO = 'pbkdf2:sha256:600000$abc$deadbeef'; // el de otra librería

const pg = new PGlite();
const db = drizzle(pg);

console.log('\n1. Migraciones reales del ecosystem');
await migrate(db, {
  migrationsFolder: join(import.meta.dirname, '..', 'drizzle', 'migrations'),
  migrationsSchema: 'ecosystem',
});
console.log('  ✔ aplicadas');

console.log('\n2. Los tres censos de mentira');

// El ecosistema arranca como en el VPS: solo el super-admin sembrado.
await pg.query(
  `INSERT INTO ecosystem.users (email, document_id, full_name, password_hash, is_email_verified, is_active, is_super_admin, origen)
   VALUES ('admin@dinamyt.org', '1000000000', 'SUPER ADMINISTRADOR DINAMYT', $1, true, true, true, 'registro')`,
  [bcrypt.hashSync('admin', 10)],
);

await pg.query(`CREATE SCHEMA membresias`);
await pg.query(`
  CREATE TABLE membresias.orgs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(120) NOT NULL,
    slug varchar(60) NOT NULL UNIQUE,
    city varchar(80), country varchar(80),
    logo_url text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp DEFAULT now()
  )`);
await pg.query(`
  CREATE TABLE membresias.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email varchar(255) NOT NULL UNIQUE,
    full_name varchar(150) NOT NULL,
    password_hash varchar(255) NOT NULL,
    phone varchar(40), birth_date date, blood_type varchar(8),
    emergency_name varchar(150), emergency_phone varchar(40),
    role varchar(20) NOT NULL DEFAULT 'student',
    is_super_admin boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,
    org_id uuid REFERENCES membresias.orgs(id),
    created_at timestamp DEFAULT now()
  )`);

const [clubSur] = (
  await pg.query(
    `INSERT INTO membresias.orgs (name, slug, city, country) VALUES ('DOJANG SUR', 'dojang-sur', 'Cali', 'Colombia') RETURNING id`,
  )
).rows;

await pg.query(
  `INSERT INTO membresias.users (email, full_name, password_hash, phone, blood_type, role, org_id) VALUES
     ('maestro@dinamyt.org', 'Juan Pérez',   $1, '3001112233', 'O+', 'owner',   $2),
     ('alumno@dinamyt.org',  'Ana Gómez',    $1, NULL,         NULL, 'student', $2),
     ('mayus@dinamyt.org',   'Luis Ramírez', $1, NULL,         NULL, 'student', $2),
     ('no-tiene-correo',     'Niño Sin Correo', $1, NULL,      NULL, 'student', $2),
     ('admin@dinamyt.org',   'Super Administrador', $1, '3009998877', NULL, 'owner', NULL)`,
  [HASH_MEMB, clubSur.id],
);
await pg.query(`UPDATE membresias.users SET is_super_admin = true WHERE email = 'admin@dinamyt.org'`);

await pg.query(`CREATE SCHEMA campeonatos`);
await pg.query(`
  CREATE TABLE campeonatos.usuarios (
    id serial PRIMARY KEY,
    email varchar(255) NOT NULL UNIQUE,
    nombre varchar(150) NOT NULL,
    password_hash varchar(255) NOT NULL,
    rol varchar(20) NOT NULL DEFAULT 'juez',
    es_superadmin boolean DEFAULT false,
    activo boolean NOT NULL DEFAULT true,
    club varchar(80), clubes json, delegacion varchar(120), pais_delegacion varchar(80),
    eliminado_at timestamp,
    created_at timestamp NOT NULL DEFAULT now()
  )`);

await pg.query(
  `INSERT INTO campeonatos.usuarios (email, nombre, password_hash, rol, clubes, club, delegacion) VALUES
     ('maestro@dinamyt.org', 'JUAN PEREZ', $1, 'maestro',
      '[{"nombre":"Dojang Sur","ciudad":"Cali","pais":"Colombia"},{"nombre":"DOJANG NORTE","ciudad":"Popayán","pais":"Colombia"}]',
      'Dojang Sur', 'Cali'),
     ('juez@dinamyt.org',    'PEDRO JUEZ',  $1, 'juez',    NULL, NULL, NULL),
     ('MAYUS@dinamyt.org',   'LUIS RAMIREZ', $1, 'juez',   NULL, NULL, NULL),
     ('viejo@dinamyt.org',   'HASH DE OTRA LIBRERIA', $2, 'juez', NULL, NULL, NULL),
     ('borrado@dinamyt.org', 'YA NO ESTA',  $1, 'juez',    NULL, NULL, NULL)`,
  [HASH_CAMP, HASH_ROTO],
);
await pg.query(
  `UPDATE campeonatos.usuarios SET eliminado_at = now() WHERE email = 'borrado@dinamyt.org'`,
);
console.log('  ✔ sembrados');

// ── Primera pasada ──────────────────────────────────────────────────────────

const tx = adaptador(pg);

console.log('\n3. Primera pasada (sin crear clubes de Campeonatos)');
const uno = await reconciliar(tx, { aplicar: true });

comprobar('crea el club de Membresías', uno.clubes.creados.length === 1, uno.clubes.creados);
comprobar(
  'cruza «Dojang Sur» de Campeonatos con el club ya creado',
  uno.clubes.enlazados.some((c) => c.campeonatos === 'Dojang Sur'),
  uno.clubes.enlazados,
);
comprobar(
  'deja «DOJANG NORTE» sin cruzar, para que lo confirme el maestro',
  uno.clubes.campeonatosSinCruce.length === 1 &&
    uno.clubes.campeonatosSinCruce[0].nombre === 'DOJANG NORTE',
  uno.clubes.campeonatosSinCruce,
);

comprobar(
  'crea 5 cuentas (maestro, alumno, luis, juez, hash-roto)',
  uno.personas.creadas.length === 5,
  uno.personas.creadas.map((p) => p.correo),
);
comprobar(
  'enlaza al admin que ya tenía cuenta, sin duplicarlo',
  uno.personas.enlazadas.length === 1 &&
    uno.personas.enlazadas[0].correo === 'admin@dinamyt.org',
  uno.personas.enlazadas,
);
comprobar(
  'le rellena al admin el teléfono que solo tenía en Membresías',
  uno.personas.enlazadas[0]?.huecosRellenados.includes('phone'),
  uno.personas.enlazadas[0],
);
comprobar(
  'deja sin cuenta a quien no tiene correo utilizable',
  uno.personas.sinCorreo.length === 1 && uno.personas.sinCorreo[0].nombre === 'Niño Sin Correo',
  uno.personas.sinCorreo,
);
comprobar(
  'crea sin contraseña a quien traía un hash de otra librería',
  uno.personas.sinContrasena.length === 1 &&
    uno.personas.sinContrasena[0].correo === 'viejo@dinamyt.org',
  uno.personas.sinContrasena,
);
comprobar(
  'detecta al superadmin pero NO se lo concede',
  uno.personas.superadminsDetectados.length === 1,
  uno.personas.superadminsDetectados,
);
comprobar(
  'el juez sin club se queda sin pertenencia',
  uno.pertenencias.sinClub.some((p) => p.correo === 'juez@dinamyt.org'),
  uno.pertenencias.sinClub,
);

const { rows: maestro } = await pg.query(
  `SELECT * FROM ecosystem.users WHERE email = 'maestro@dinamyt.org'`,
);
comprobar('el maestro queda como importado de las dos apps', maestro[0]?.origen === 'importado-ambas', maestro[0]?.origen);
comprobar('se queda con el hash de Membresías', maestro[0]?.password_hash === HASH_MEMB);
comprobar('y anota de dónde vino esa contraseña', maestro[0]?.password_origen === 'membresias');
comprobar(
  'su contraseña de siempre sigue sirviendo',
  bcrypt.compareSync('la-de-membresias', maestro[0]?.password_hash ?? ''),
);
comprobar('no se inventa un documento', maestro[0]?.document_id === null, maestro[0]?.document_id);
comprobar('puede iniciar sesión (correo dado por verificado)', maestro[0]?.is_email_verified === true);
comprobar('el nombre se guarda en mayúsculas', maestro[0]?.full_name === 'JUAN PÉREZ', maestro[0]?.full_name);
comprobar('NO hereda el superadmin de ninguna app', maestro[0]?.is_super_admin === false);

const { rows: luis } = await pg.query(
  `SELECT id, origen FROM ecosystem.users WHERE email = 'mayus@dinamyt.org'`,
);
comprobar(
  'MAYUS@ y mayus@ son la misma persona: una sola cuenta',
  luis.length === 1 && luis[0].origen === 'importado-ambas',
  luis,
);

const { rows: enlaces } = await pg.query(`
  SELECT m.eco_sub AS memb, c.eco_sub AS camp
    FROM membresias.users m
    JOIN campeonatos.usuarios c ON lower(c.email) = lower(m.email)
   WHERE m.email = 'maestro@dinamyt.org'`);
comprobar(
  'el enlace queda guardado a los dos lados y apunta al mismo sitio',
  enlaces[0]?.memb && enlaces[0]?.memb === enlaces[0]?.camp && enlaces[0].memb === maestro[0].id,
  enlaces[0],
);

const { rows: espejoClub } = await pg.query(`SELECT eco_org_id FROM membresias.orgs`);
comprobar('el club de Membresías guarda su espejo', Boolean(espejoClub[0]?.eco_org_id));

const { rows: pertenencia } = await pg.query(
  `SELECT role, role_membresias, role_campeonatos FROM ecosystem.org_members WHERE user_id = $1`,
  [maestro[0].id],
);
comprobar(
  'el maestro entra al portal como gestor de su club',
  pertenencia[0]?.role === 'maestro',
  pertenencia[0],
);
comprobar(
  'y lleva un rol distinto por app, como en cada app',
  pertenencia[0]?.role_membresias === 'owner' && pertenencia[0]?.role_campeonatos === 'maestro',
  pertenencia[0],
);

const { rows: alumno } = await pg.query(
  `SELECT om.role, om.role_membresias, om.role_campeonatos
     FROM ecosystem.org_members om JOIN ecosystem.users u ON u.id = om.user_id
    WHERE u.email = 'alumno@dinamyt.org'`,
);
comprobar(
  'la alumna entra como alumna, y sin rol de Campeonatos',
  alumno[0]?.role === 'student' &&
    alumno[0]?.role_membresias === 'student' &&
    alumno[0]?.role_campeonatos === null,
  alumno[0],
);

// ── Segunda pasada: idempotencia ───────────────────────────────────────────

console.log('\n4. Segunda pasada — tiene que no hacer nada');
const dos = await reconciliar(tx, { aplicar: true });
comprobar('no crea ninguna cuenta', dos.personas.creadas.length === 0, dos.personas.creadas);
comprobar('no crea ningún club', dos.clubes.creados.length === 0, dos.clubes.creados);
comprobar(
  'no crea ninguna pertenencia',
  dos.pertenencias.creadas.length === 0,
  dos.pertenencias.creadas,
);
comprobar(
  'no vuelve a rellenar huecos ya rellenados',
  dos.personas.enlazadas.every((p) => p.huecosRellenados.length === 0),
  dos.personas.enlazadas,
);

const { rows: total } = await pg.query(`SELECT count(*)::int AS n FROM ecosystem.users`);
comprobar('siguen siendo 6 cuentas en total', total[0].n === 6, total[0]);

// ── Tercera pasada: crear los clubes de Campeonatos ────────────────────────

console.log('\n5. Tercera pasada — con --crear-clubes-campeonatos');
const tres = await reconciliar(tx, { aplicar: true, crearClubesCampeonatos: true });
comprobar(
  'ahora sí crea «DOJANG NORTE»',
  tres.clubes.creados.length === 1 && tres.clubes.creados[0].nombre === 'DOJANG NORTE',
  tres.clubes.creados,
);
comprobar(
  'y mete al maestro también en ese club',
  tres.pertenencias.creadas.length === 1 &&
    tres.pertenencias.creadas[0].campeonatos === 'maestro',
  tres.pertenencias.creadas,
);

const { rows: norte } = await pg.query(
  `SELECT slug FROM ecosystem.organizations WHERE name = 'DOJANG NORTE'`,
);
comprobar('con su slug derivado del nombre', norte[0]?.slug === 'dojang-norte', norte[0]);

// ── Guardia: sin la migración 0004 no arranca ──────────────────────────────

console.log('\n6. Guardia: sin la migración 0004 se planta');
const pg2 = new PGlite();
await pg2.query('CREATE SCHEMA ecosystem');
await pg2.query('CREATE TABLE ecosystem.users (id uuid PRIMARY KEY, email varchar(200))');
let mensaje = '';
try {
  await reconciliar(adaptador(pg2), { aplicar: true });
} catch (err) {
  mensaje = err.message;
}
comprobar('avisa de que falta la migración', mensaje.includes('0004_identidad_importada'), mensaje);

// ── Resultado ───────────────────────────────────────────────────────────────

await pg.close();
await pg2.close();

console.log(
  fallos === 0
    ? '\n✔ El ensayo pasa entero.\n'
    : `\n✘ ${fallos} comprobación(es) fallaron.\n`,
);
process.exit(fallos === 0 ? 0 : 1);
