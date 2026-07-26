import { join } from 'path';
import { db } from './client';

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

  if (process.env.MEMBRESIAS_PGLITE_DATA) {
    /* eslint-disable @typescript-eslint/no-var-requires */
    const { migrate } = require('drizzle-orm/pglite/migrator');
    /* eslint-enable @typescript-eslint/no-var-requires */
    await migrate(db as never, { migrationsFolder: carpeta });
    return;
  }

  /* eslint-disable @typescript-eslint/no-var-requires */
  const { migrate } = require('drizzle-orm/postgres-js/migrator');
  /* eslint-enable @typescript-eslint/no-var-requires */
  await migrate(db as never, { migrationsFolder: carpeta });
}
