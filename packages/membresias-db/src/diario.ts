/**
 * Esquema donde vive el diario de migraciones de Drizzle.
 *
 * Por defecto Drizzle lo pone en `drizzle.__drizzle_migrations`, un nombre
 * GLOBAL a la base de datos. Mientras Membresías tuvo base propia daba igual;
 * cuando comparte base con el ecosistema —una sola base, un esquema por app—
 * las dos apps escriben en la MISMA tabla y cada una ve las entradas de la
 * otra.
 *
 * El migrador de Drizzle decide qué aplicar comparando marcas de tiempo, así
 * que la app que llegue segunda da por aplicadas migraciones que nunca corrió,
 * arranca contra un esquema incompleto y revienta en la primera consulta. Es
 * un fallo silencioso hasta que alguien abre la app.
 *
 * Con el diario dentro de `membresias`, cada app lleva el suyo y no hay nada
 * que coordinar. Ver `mudarDiarioSiHaceFalta()` en `migrate.ts` para el
 * traslado de las bases que ya existen.
 */
export const ESQUEMA_DIARIO = 'membresias';
