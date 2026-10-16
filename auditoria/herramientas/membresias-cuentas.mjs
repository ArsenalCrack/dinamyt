// Cuentas de prueba para capturar Membresías en local. Con la API APAGADA
// (PGlite es monoproceso). Lista quién hay y, con --poner, le pone a un dueño,
// a un auxiliar y a un alumno del mismo club una contraseña de prueba nueva, y
// la guarda en cuentas.json (fuera de git).
// Uso: node auditoria/herramientas/membresias-cuentas.mjs [--poner "Dojo Peñalosa"]
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

const req = createRequire('D:/Repositorios/dinamyt-membresias/apps/membresias-api/package.json');
const { PGlite } = await import(pathToFileURL(req.resolve('@electric-sql/pglite')).href);
const bcrypt = req('bcryptjs');
const aqui = dirname(fileURLToPath(import.meta.url));

const pg = new PGlite('D:/Repositorios/dinamyt-membresias/.localdb');
const { rows } = await pg.query(`
  select u.id, u.email, u.role, u.is_active, u.org_id, o.name as club, (u.password_hash is not null) as con_clave
  from membresias.users u left join membresias.orgs o on o.id = u.org_id
  order by o.name nulls first, u.role, u.email`);
for (const r of rows) console.log([r.club ?? '—', r.role, r.email, r.is_active ? 'activo' : 'INACTIVO', r.con_clave ? 'clave' : 'sin clave'].join(' · '));

if (process.argv.includes('--poner')) {
  const club = process.argv[process.argv.indexOf('--poner') + 1];
  const del = rows.filter((r) => r.club === club && r.is_active);
  const elegir = (rol) => del.find((r) => r.role === rol);
  const clave = 'Prueba-' + randomBytes(6).toString('hex');
  const hash = await bcrypt.hash(clave, 10);
  const cuentasPath = join(aqui, 'cuentas.json');
  const cuentas = JSON.parse(readFileSync(cuentasPath, 'utf8'));
  cuentas.membresias = {};
  for (const [nombre, rol] of [['dueno', 'owner'], ['auxiliar', 'staff'], ['alumno', 'student']]) {
    const u = elegir(rol);
    if (!u) { console.log(`(no hay ${rol} activo en ${club})`); continue; }
    await pg.query('update membresias.users set password_hash = $1 where id = $2', [hash, u.id]);
    cuentas.membresias[nombre] = { correo: u.email, clave };
    console.log(`clave de prueba puesta: ${nombre} = ${u.email}`);
  }
  // El superadmin de prueba es el de la .env local de la API.
  const env = readFileSync('D:/Repositorios/dinamyt-membresias/apps/membresias-api/.env', 'utf8');
  const leer = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim().replace(/^"|"$/g, '');
  if (leer('SUPERADMIN_EMAIL')) cuentas.membresias.super = { correo: leer('SUPERADMIN_EMAIL'), clave: leer('SUPERADMIN_PASSWORD') };
  writeFileSync(cuentasPath, JSON.stringify(cuentas, null, 1));
}
await pg.close();
