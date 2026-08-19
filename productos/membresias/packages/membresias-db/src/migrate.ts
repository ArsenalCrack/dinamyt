import { join } from 'path';
import { sql } from 'drizzle-orm';
import { db } from './client';
import { ESQUEMA_DIARIO } from './diario';

/**
 * Aplica las migraciones pendientes.
 *
 * Se llama al arrancar la API, no como paso aparte del despliegue: así el
 * esquema y el código nunca quedan desfasados, y no hace falta acordarse de
 * correr un comando extra después de cada deploy.
 *
 * Drizzle lleva su propia tabla de control, de modo que repetirlo no hace nada.
 * Con varias instancias en paralelo podría haber una carrera en el primer
 * arranque; para eso habría que moverlo a un paso previo del despliegue.
 */
export async function migrarBd(): Promise<void> {
  const carpeta = join(__dirname, '..', 'drizzle', 'migrations');

  await mudarDiarioSiHaceFalta();

  if (process.env.MEMBRESIAS_PGLITE_DATA) {
    /* eslint-disable @typescript-eslint/no-var-requires */
    const { migrate } = require('drizzle-orm/pglite/migrator');
    /* eslint-enable @typescript-eslint/no-var-requires */
    await migrate(db as never, {
      migrationsFolder: carpeta,
      migrationsSchema: ESQUEMA_DIARIO,
    });
    return;
  }

  /* eslint-disable @typescript-eslint/no-var-requires */
  const { migrate } = require('drizzle-orm/postgres-js/migrator');
  /* eslint-enable @typescript-eslint/no-var-requires */
  await migrate(db as never, {
    migrationsFolder: carpeta,
    migrationsSchema: ESQUEMA_DIARIO,
  });
}

/**
 * Traslada el diario de `drizzle` a `membresias` si todavía está donde lo
 * dejaba la configuración por defecto.
 *
 * Sin esto, estrenar `migrationsSchema` en una base que YA funciona sería
 * catastrófico: el migrador no encontraría el diario, daría las 15 migraciones
 * por pendientes y moriría en la primera tabla que ya existe. Y no es un caso
 * hipotético — es exactamente lo que hay hoy en la base de producción y en el
 * PGlite de desarrollo.
 *
 * Es idempotente y no hace nada en una base nueva.
 */
async function mudarDiarioSiHaceFalta(): Promise<void> {
  // La migración 0000 ya lo crea, pero aquí hace falta ANTES: es el destino de
  // la mudanza. Usa IF NOT EXISTS, igual que ella, así que no chocan.
  await db.execute(sql.raw(`CREATE SCHEMA IF NOT EXISTS "${ESQUEMA_DIARIO}"`));

  try {
    await db.execute(
      sql.raw(
        `ALTER TABLE IF EXISTS drizzle.__drizzle_migrations ` +
          `SET SCHEMA "${ESQUEMA_DIARIO}"`,
      ),
    );
  } catch {
    // Solo puede fallar si el diario ya está en su sitio Y además quedó una
    // copia en `drizzle` (una mudanza a medias). El bueno es el de aquí; el
    // otro sobra. Se deja pasar y `migrate` lee el correcto.
  }
}
