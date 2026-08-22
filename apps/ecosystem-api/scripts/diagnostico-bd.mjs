// Diagnóstico de la base del ecosistema. **Solo lee: no escribe nada.**
//
// Existe porque `db:migrate` falla de tres formas distintas que dan errores muy
// parecidos —y ninguno dice cuál de las tres es—:
//
//   1. El `.env` apunta a una base que ya no existe (proyecto de Supabase
//      borrado, contraseña rotada, host cambiado).
//   2. El diario de migraciones está en el esquema equivocado. Un respaldo
//      restaurado lo trae en `drizzle`; este proyecto lo lleva DENTRO de
//      `ecosystem` (ver `drizzle.config.ts`). Con el diario en el sitio de al
//      lado, Drizzle cree que no hay ninguna migración aplicada y reintenta la
//      0000 contra tablas que ya existen.
//   3. Al usuario de la aplicación le falta `CREATE` sobre la base. Drizzle
//      lanza `CREATE SCHEMA IF NOT EXISTS` antes de cada migración y PostgreSQL
//      comprueba el permiso ANTES de mirar si el esquema ya está.
//
// Uso:  pnpm db:diagnostico
import 'dotenv/config';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const CARPETA = join(process.cwd(), 'drizzle', 'migrations');
const enDisco = readdirSync(CARPETA)
  .filter((f) => f.endsWith('.sql'))
  .sort();

console.log('── Migraciones en disco ──');
console.log(`  ${enDisco.length}: ${enDisco.map((f) => f.slice(0, 4)).join(' ')}`);

/** Un ejecutor de consultas, venga de PGlite o de postgres-js. */
async function abrir() {
  if (process.env.PGLITE_DATA) {
    const { PGlite } = await import('@electric-sql/pglite');
    const pg = new PGlite(process.env.PGLITE_DATA);
    console.log(`\n── Base LOCAL embebida (PGlite) ──\n  ${process.env.PGLITE_DATA}`);
    return {
      destino: 'pglite',
      consultar: async (texto, params = []) => (await pg.query(texto, params)).rows,
      cerrar: () => pg.close(),
    };
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('No hay ni PGLITE_DATA ni DATABASE_URL en el .env.');

  const { default: postgres } = await import('postgres');
  const host = url.replace(/^.*@/, '').replace(/\/.*$/, '');
  console.log(`\n── Base REMOTA ──\n  ${host}`);
  if (host.endsWith(':6543')) {
    console.log(
      '  ⚠ Puerto 6543 = pooler en modo transacción de Supabase.\n' +
        '    La aplicación funciona (usa `prepare: false`), pero `drizzle-kit\n' +
        '    migrate` NO: necesita una sesión de verdad. Para migrar, usa el\n' +
        '    puerto 5432 del mismo host.',
    );
  }
  // `prepare: false` es obligatorio contra el pooler.
  const sql = postgres(url, { prepare: false, max: 1, idle_timeout: 5 });
  return {
    destino: 'remota',
    consultar: (texto, params = []) => sql.unsafe(texto, params),
    cerrar: () => sql.end({ timeout: 5 }),
  };
}

let bd;
try {
  bd = await abrir();

  const usuario = await bd.consultar('select current_user as u, current_database() as d');
  console.log(`  usuario: ${usuario[0].u} · base: ${usuario[0].d}`);

  const esquemas = await bd.consultar(
    `select nspname from pg_namespace
     where nspname in ('ecosystem','drizzle','membresias','campeonatos','academy','public')
     order by nspname`,
  );
  console.log('\n── Esquemas ──');
  console.log('  ' + (esquemas.map((e) => e.nspname).join(', ') || '(ninguno)'));

  const diarios = await bd.consultar(
    `select table_schema from information_schema.tables
     where table_name = '__drizzle_migrations' order by table_schema`,
  );
  console.log('\n── Diario de migraciones ──');
  if (!diarios.length) {
    console.log('  (ninguno) → la base está sin estrenar: `db:migrate` la creará entera.');
  }
  for (const d of diarios) {
    const n = await bd.consultar(
      `select count(*)::int as n from "${d.table_schema}".__drizzle_migrations`,
    );
    const marca = d.table_schema === 'ecosystem' ? '✔ en su sitio' : '✖ EN EL SITIO EQUIVOCADO';
    console.log(`  ${d.table_schema}: ${n[0].n} aplicadas  ${marca}`);
  }
  if (diarios.length && !diarios.some((d) => d.table_schema === 'ecosystem')) {
    console.log(
      '\n  → Este proyecto lleva el diario DENTRO de `ecosystem` (drizzle.config.ts).\n' +
        '    Con el diario en otro esquema, Drizzle reintentará la 0000 y fallará\n' +
        '    con «ya existe». Hay que moverlo ANTES de migrar:\n' +
        '      ALTER TABLE drizzle.__drizzle_migrations SET SCHEMA ecosystem;',
    );
  }

  const tablas = await bd.consultar(
    `select table_name from information_schema.tables
     where table_schema = 'ecosystem' order by table_name`,
  );
  console.log(`\n── Tablas en \`ecosystem\` (${tablas.length}) ──`);
  console.log('  ' + (tablas.map((t) => t.table_name).join(', ') || '(ninguna)'));

  const tienePendientes = tablas.some((t) => t.table_name === 'pending_registrations');
  console.log('\n── Lo que vinimos a mirar ──');
  console.log(
    tienePendientes
      ? '  ✔ `ecosystem.pending_registrations` existe: la 0007 ya está aplicada.'
      : '  ✖ Falta `ecosystem.pending_registrations`: el registro por correo\n' +
        '    responderá 500 hasta que corras la migración 0007.',
  );

  if (bd.destino === 'remota') {
    const permiso = await bd.consultar(
      `select has_database_privilege(current_user, current_database(), 'CREATE') as puede`,
    );
    console.log(
      permiso[0].puede
        ? '  ✔ El usuario puede CREATE sobre la base (lo exige cada migración).'
        : '  ✖ Al usuario le FALTA CREATE sobre la base. `db:migrate` fallará sin\n' +
          '    decir por qué. Como postgres:\n' +
          `      GRANT CREATE ON DATABASE ${usuario[0].d} TO ${usuario[0].u};`,
    );
  }
} catch (e) {
  console.error('\n✖ No se pudo mirar la base:', e.message);
  if (e.code) console.error('  código:', e.code);
  if (/tenant .* not found|ENOTFOUND|ECONNREFUSED/i.test(`${e.message} ${e.code ?? ''}`)) {
    console.error(
      '\n  Ese host o ese proyecto ya no existe. Revisa `DATABASE_URL` en el .env,\n' +
        '  o usa la base local embebida descomentando `PGLITE_DATA`.',
    );
  }
  process.exitCode = 1;
} finally {
  await bd?.cerrar();
}
