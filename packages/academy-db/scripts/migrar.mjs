// Aplica las migraciones pendientes de Academy. Sirve en local y en el VPS.
//
// ── Por qué existe, si ya está `db:migrate` ──
//
// `db:migrate` es `drizzle-kit`, que es una **devDependency**: en un servidor
// instalado con `--prod` no está, y el comando falla con «drizzle-kit: not
// found» — un error que no dice nada de bases de datos. Este script usa el
// migrador de `drizzle-orm`, que es dependencia de producción y hace
// exactamente lo mismo: el mismo diario, el mismo orden, los mismos ficheros.
//
// Es el gemelo de `apps/ecosystem-api/scripts/migrar.mjs`, y existe por la
// misma razón que aquel: hasta ahora MONTAR-VPS decía «compilar, migrar y crear
// los servicios» sin decir CON QUÉ, y lo único que había era `db:migrate`, que
// en el VPS no puede correr. Una migración de Academy no tenía camino a
// producción.
//
// Es idempotente: lo ya aplicado no se repite.
//
// Uso:  pnpm --filter @dinamyt/academy-db db:migrar
import 'dotenv/config';
import { join } from 'node:path';

const CARPETA = join(process.cwd(), 'drizzle', 'migrations');

// El mismo esquema que declara `drizzle.config.ts`. **No es el `drizzle` por
// defecto**, y esa es la parte que importa: Academy comparte base con el
// ecosistema, así que con el diario global las dos apps escribirían en la MISMA
// tabla y cada una daría por aplicadas las migraciones de la otra.
const ESQUEMA_DIARIO = 'academy';

/**
 * `--mover-diario`: trae el diario desde el esquema `drizzle` al de Academy,
 * **antes** de migrar.
 *
 * Hace falta en las bases sembradas por la versión vieja de `pglite-setup.mjs`
 * (que no pasaba `migrationsSchema`) y en las restauradas de un volcado, que
 * traen el diario en `drizzle`. En las dos, migrar sin moverlo primero
 * reintenta la 0000 contra tablas que ya existen.
 *
 * Va detrás de una bandera y no automático a propósito: mueve una tabla de
 * sitio, y eso se hace mirando.
 */
const MOVER_DIARIO = process.argv.includes('--mover-diario');

/**
 * Mueve el diario de `drizzle` a `academy` si el de `academy` no tiene nada.
 *
 * **La condición es que esté VACÍO, no que no exista**, y esa distinción es la
 * que hace que esto sirva de algo: el propio migrador crea la tabla en
 * `academy` en cuanto arranca, así que después del primer intento fallido ya
 * hay un diario ahí — vacío. Comprobando solo la existencia, el rescate se
 * rendía justo en el único momento en que hace falta.
 */
async function moverDiario(consultar) {
  const donde = await consultar(
    `select table_schema from information_schema.tables
     where table_name = '__drizzle_migrations'`,
  );
  const esquemas = donde.map((d) => d.table_schema);

  if (!esquemas.includes('drizzle')) {
    console.log('[academy] no hay ningún diario que mover.');
    return;
  }

  const viejas = await consultar(
    'select count(*)::int as n from drizzle.__drizzle_migrations',
  );
  if (Number(viejas[0].n) === 0) {
    console.log('[academy] el diario de `drizzle` está vacío: nada que mover.');
    return;
  }

  if (esquemas.includes(ESQUEMA_DIARIO)) {
    const nuevas = await consultar(
      `select count(*)::int as n from ${ESQUEMA_DIARIO}.__drizzle_migrations`,
    );
    if (Number(nuevas[0].n) > 0) {
      console.log(
        `[academy] \`${ESQUEMA_DIARIO}\` ya lleva ${nuevas[0].n} migraciones anotadas: no se toca.`,
      );
      return;
    }
    // Vacío: es el que acaba de crear este mismo script. Se tira para dejar
    // sitio al bueno.
    await consultar(`DROP TABLE ${ESQUEMA_DIARIO}.__drizzle_migrations`);
  }

  await consultar(
    `ALTER TABLE drizzle.__drizzle_migrations SET SCHEMA ${ESQUEMA_DIARIO}`,
  );
  console.log(
    `[academy] diario movido de \`drizzle\` a \`${ESQUEMA_DIARIO}\` (${viejas[0].n} migraciones).`,
  );
}

if (process.env.ACADEMY_PGLITE_DATA) {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');

  const pg = new PGlite(process.env.ACADEMY_PGLITE_DATA);
  console.log('[academy] base local embebida:', process.env.ACADEMY_PGLITE_DATA);
  if (MOVER_DIARIO) {
    await moverDiario(async (texto) => (await pg.query(texto)).rows);
  }
  await migrate(drizzle(pg), {
    migrationsFolder: CARPETA,
    migrationsSchema: ESQUEMA_DIARIO,
  });
  console.log('[academy] migraciones al día.');
  await pg.close();
} else {
  const url = process.env.ACADEMY_DATABASE_URL;
  if (!url) {
    console.error(
      '[academy] Falta ACADEMY_DATABASE_URL (o ACADEMY_PGLITE_DATA) en packages/academy-db/.env.',
    );
    process.exit(1);
  }

  const { default: postgres } = await import('postgres');
  const { drizzle } = await import('drizzle-orm/postgres-js');
  const { migrate } = await import('drizzle-orm/postgres-js/migrator');

  const host = url.replace(/^.*@/, '').replace(/\/.*$/, '');
  console.log('[academy] base:', host);

  // `max: 1`: las migraciones van en serie y toman un bloqueo. Con varias
  // conexiones, dos procesos podrían intentar la misma migración a la vez.
  // `prepare: false` para que funcione también contra el pooler de Supabase.
  const cliente = postgres(url, { prepare: false, max: 1 });
  try {
    if (MOVER_DIARIO) await moverDiario((texto) => cliente.unsafe(texto));
    await migrate(drizzle(cliente), {
      migrationsFolder: CARPETA,
      migrationsSchema: ESQUEMA_DIARIO,
    });
    console.log('[academy] migraciones al día.');
  } catch (e) {
    console.error('\n[academy] FALLÓ:', e.message);
    if (/already exists|ya existe/i.test(e.message)) {
      console.error(
        '\n  Suena a diario de migraciones en el esquema equivocado: Drizzle cree\n' +
          '  que no hay nada aplicado y reintenta la primera contra tablas que ya\n' +
          '  están. Si el diario quedó en el esquema global:\n' +
          '    ALTER TABLE drizzle.__drizzle_migrations SET SCHEMA academy;',
      );
    }
    if (/permission denied|permiso denegado/i.test(e.message)) {
      console.error(
        '\n  Al usuario le falta CREATE sobre la base: Drizzle lanza\n' +
          '  `CREATE SCHEMA IF NOT EXISTS` antes de cada migración y PostgreSQL\n' +
          '  mira el permiso ANTES de comprobar si el esquema ya existe.\n' +
          '    GRANT CREATE ON DATABASE <base> TO dinamyt_acad;',
      );
    }
    process.exitCode = 1;
  } finally {
    await cliente.end({ timeout: 5 });
  }
}
