// Demo: asigna al juez de esquina de prueba (juezesquina@dinamyt.com) como
// J1 del tatami 1 del campeonato MÁS RECIENTE de la base local (PGlite).
// Uso: `node scripts/asignar-juez-demo.mjs` (con la API de campeonatos APAGADA:
// PGlite es monoproceso). Idempotente.
import 'dotenv/config';
import { PGlite } from '@electric-sql/pglite';

const dir = process.env.CAMPEONATOS_PGLITE_DATA;
if (!dir) {
  console.error('[demo-juez] Falta CAMPEONATOS_PGLITE_DATA en packages/campeonatos-db/.env');
  process.exit(1);
}

const EMAIL = 'juezesquina@dinamyt.com';
const NOMBRE = 'JUEZ DE ESQUINA DEMO';
const ROL = 'j1';

const pg = new PGlite(dir);

const camp = (
  await pg.query(
    `select id, nombre from campeonatos.campeonatos order by created_at desc limit 1`,
  )
).rows[0];
if (!camp) {
  console.error('[demo-juez] No hay campeonatos en la base local: crea uno primero.');
  process.exit(1);
}

let tatami = (
  await pg.query(
    `select id, numero from campeonatos.tatamis where campeonato_id = $1 order by numero asc limit 1`,
    [camp.id],
  )
).rows[0];
if (!tatami) {
  tatami = (
    await pg.query(
      `insert into campeonatos.tatamis (campeonato_id, numero) values ($1, 1) returning id, numero`,
      [camp.id],
    )
  ).rows[0];
}

const previo = (
  await pg.query(
    `select id from campeonatos.jueces_tatami where tatami_id = $1 and rol_tatami = $2`,
    [tatami.id, ROL],
  )
).rows[0];
if (previo) {
  await pg.query(
    `update campeonatos.jueces_tatami set nombre_display = $2, user_email = $3 where id = $1`,
    [previo.id, NOMBRE, EMAIL],
  );
} else {
  await pg.query(
    `insert into campeonatos.jueces_tatami (tatami_id, rol_tatami, nombre_display, user_email)
     values ($1, $2, $3, $4)`,
    [tatami.id, ROL, NOMBRE, EMAIL],
  );
}
console.log(
  `[demo-juez] ${EMAIL} asignado como ${ROL} del Tatami ${tatami.numero} en «${camp.nombre}».`,
);
console.log('[demo-juez] Entra con esa cuenta: verá su tatami en /juez y puntúa desde /tatami/[id].');
await pg.close();
