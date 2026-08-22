// Aplica las migraciones pendientes. Sirve en local y en el VPS.
//
// ── Por qué existe, si ya está `db:migrate` ──
//
// `db:migrate` es `drizzle-kit`, que es una **devDependency**: en un servidor
// instalado con `--prod` no está, y el comando falla con «drizzle-kit: not
// found» — un error que no dice nada de bases de datos. Este script usa el
// migrador de `drizzle-orm`, que es dependencia de producción y hace
// exactamente lo mismo: el mismo diario, el mismo orden, los mismos ficheros.
//
// Además abre la conexión con `prepare: false`, así que funciona también contra
// el pooler de Supabase, donde `drizzle-kit` no puede.
//
// Es idempotente: lo ya aplicado no se repite.
//
// Uso:  pnpm db:migrar
import 'dotenv/config';
import { join } from 'node:path';

const CARPETA = join(process.cwd(), 'drizzle', 'migrations');
// El mismo esquema que declara `drizzle.config.ts`. Si esto y el config se
// separan, cada uno lleva su propio diario y las migraciones se repiten.
const ESQUEMA_DIARIO = 'ecosystem';

/**
 * `--mover-diario`: trae el diario desde el esquema `drizzle` al de este
 * proyecto, **antes** de migrar.
 *
 * Hace falta en dos casos reales: una base local sembrada por la versión vieja
 * de `pglite-setup.mjs` (que no pasaba `migrationsSchema`), y una base
 * restaurada de un volcado, que trae el diario en `drizzle`. En los dos, migrar
 * sin moverlo primero reintenta la 0000 contra tablas que ya existen.
 *
 * Va detrás de una bandera y no automático a propósito: mueve una tabla de
 * sitio, y eso se hace mirando. `pnpm db:diagnostico` dice si toca.
 */
const MOVER_DIARIO = process.argv.includes('--mover-diario');

/** Mueve el diario si está en `drizzle` y aquí todavía no hay ninguno. */
async function moverDiario(consultar) {
  const donde = await consultar(
    `select table_schema from information_schema.tables
     where table_name = '__drizzle_migrations'`,
  );
  const esquemas = donde.map((d) => d.table_schema);
  if (esquemas.includes(ESQUEMA_DIARIO)) {
    console.log(`[ecosystem] el diario ya está en \`${ESQUEMA_DIARIO}\`: nada que mover.`);
    return;
  }
  if (!esquemas.includes('drizzle')) {
    console.log('[ecosystem] no hay ningún diario que mover.');
    return;
  }
  await consultar(
    `ALTER TABLE drizzle.__drizzle_migrations SET SCHEMA ${ESQUEMA_DIARIO}`,
  );
  console.log(`[ecosystem] diario movido de \`drizzle\` a \`${ESQUEMA_DIARIO}\`.`);
}

if (process.env.PGLITE_DATA) {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');

  const pg = new PGlite(process.env.PGLITE_DATA);
  console.log('[ecosystem] base local embebida:', process.env.PGLITE_DATA);
  if (MOVER_DIARIO) {
    await moverDiario(async (texto) => (await pg.query(texto)).rows);
  }
  await migrate(drizzle(pg), {
    migrationsFolder: CARPETA,
    migrationsSchema: ESQUEMA_DIARIO,
  });
  console.log('[ecosystem] migraciones al día.');
  await pg.close();
} else {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('[ecosystem] Falta DATABASE_URL (o PGLITE_DATA) en el .env.');
    process.exit(1);
  }

  const { default: postgres } = await import('postgres');
  const { drizzle } = await import('drizzle-orm/postgres-js');
  const { migrate } = await import('drizzle-orm/postgres-js/migrator');

  const host = url.replace(/^.*@/, '').replace(/\/.*$/, '');
  console.log('[ecosystem] base:', host);

  // `max: 1`: las migraciones van en serie y toman un bloqueo. Con varias
  // conexiones, dos procesos podrían intentar la misma migración a la vez.
  const cliente = postgres(url, { prepare: false, max: 1 });
  try {
    if (MOVER_DIARIO) await moverDiario((texto) => cliente.unsafe(texto));
    await migrate(drizzle(cliente), {
      migrationsFolder: CARPETA,
      migrationsSchema: ESQUEMA_DIARIO,
    });
    console.log('[ecosystem] migraciones al día.');
  } catch (e) {
    console.error('\n[ecosystem] FALLÓ:', e.message);
    // Los dos fallos que de verdad ocurren, con su arreglo al lado. Ver
    // `scripts/diagnostico-bd.mjs`, que los distingue sin tocar nada.
    if (/already exists|ya existe/i.test(e.message)) {
      console.error(
        '\n  Suena a diario de migraciones en el esquema equivocado: Drizzle cree\n' +
          '  que no hay nada aplicado y reintenta la primera contra tablas que ya\n' +
          '  están. Comprueba con `pnpm db:diagnostico` y, si es eso:\n' +
          '    ALTER TABLE drizzle.__drizzle_migrations SET SCHEMA ecosystem;',
      );
    }
    if (/permission denied|permiso denegado/i.test(e.message)) {
      console.error(
        '\n  Al usuario le falta CREATE sobre la base: Drizzle lanza\n' +
          '  `CREATE SCHEMA IF NOT EXISTS` antes de cada migración y PostgreSQL\n' +
          '  mira el permiso ANTES de comprobar si el esquema ya existe.\n' +
          '    GRANT CREATE ON DATABASE <base> TO <usuario>;',
      );
    }
    process.exitCode = 1;
  } finally {
    await cliente.end({ timeout: 5 });
  }
}
