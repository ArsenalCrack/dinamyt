// Datos de prueba para el campeonato MÁS RECIENTE de la base local (PGlite):
// una sección por CADA modalidad habilitada, con competidores inscritos
// (aprobados) y jueces asignados a los tatamis. Idempotente por documento.
// Uso: `node scripts/sembrar-prueba.mjs` (con la API de campeonatos APAGADA).
import 'dotenv/config';
import { PGlite } from '@electric-sql/pglite';

const dir = process.env.CAMPEONATOS_PGLITE_DATA;
if (!dir) {
  console.error('[prueba] Falta CAMPEONATOS_PGLITE_DATA en packages/campeonatos-db/.env');
  process.exit(1);
}
const pg = new PGlite(dir);

const NOMBRE_MODALIDAD = {
  combate: 'Combate',
  figura_manos_libres: 'Figura a manos libres',
  figura_armas: 'Figura con armas',
  defensa_personal: 'Defensa personal',
  salto_altura: 'Salto alto',
  salto_longitud: 'Salto largo',
};

// Competidores de muestra (documento único → idempotente).
const COMPETIDORES = [
  { doc: '90000001', nombre: 'DIEGO TORRES', genero: 'MASCULINO', grupo: 'INTERMEDIO', cinturon: 'Verde', peso: '62.0', club: 'Club Demo DINAMYT' },
  { doc: '90000002', nombre: 'LAURA MEJÍA', genero: 'FEMENINO', grupo: 'INTERMEDIO', cinturon: 'Azul', peso: '58.0', club: 'Club Demo DINAMYT' },
  { doc: '90000003', nombre: 'CARLOS RUIZ', genero: 'MASCULINO', grupo: 'AVANZADO', cinturon: 'Rojo', peso: '70.0', club: 'Alfa y Omega' },
  { doc: '90000004', nombre: 'SOFÍA LÓPEZ', genero: 'FEMENINO', grupo: 'AVANZADO', cinturon: 'Marrón', peso: '55.0', club: 'Alfa y Omega' },
  { doc: '90000005', nombre: 'ANDRÉS GÓMEZ', genero: 'MASCULINO', grupo: 'PRINCIPIANTE', cinturon: 'Amarillo', peso: '65.0', club: 'Club Demo DINAMYT' },
  { doc: '90000006', nombre: 'VALENTINA DÍAZ', genero: 'FEMENINO', grupo: 'PRINCIPIANTE', cinturon: 'Naranja', peso: '60.0', club: 'Alfa y Omega' },
];

// Jueces por tatami (el email gatea su acceso en /juez).
const JUECES = [
  { email: 'juezesquina@dinamyt.com', nombre: 'JUEZ DE ESQUINA DEMO', rol: 'j1' },
  { email: 'juez@dinamyt.com', nombre: 'JUEZ DEMO', rol: 'arbitro' },
];

const camp = (
  await pg.query('select id, nombre, num_tatamis from campeonatos.campeonatos order by created_at desc limit 1')
).rows[0];
if (!camp) {
  console.error('[prueba] No hay campeonatos en la base local. Crea uno primero.');
  process.exit(1);
}
console.log(`[prueba] Campeonato: «${camp.nombre}»`);

const mods = (
  await pg.query('select modalidad from campeonatos.modalidades_campeonato where campeonato_id = $1', [camp.id])
).rows.map((r) => r.modalidad);
if (mods.length === 0) {
  console.error('[prueba] El campeonato no tiene modalidades habilitadas.');
  process.exit(1);
}
console.log(`[prueba] Modalidades: ${mods.join(', ')}`);

// 1) Una sección por modalidad (mixta, sin sub-división: para la demo basta).
const seccionPorMod = {};
for (const mod of mods) {
  const clave = `demo-${mod}`;
  let sec = (
    await pg.query('select id from campeonatos.secciones where campeonato_id = $1 and clave = $2', [camp.id, clave])
  ).rows[0];
  if (!sec) {
    sec = (
      await pg.query(
        `insert into campeonatos.secciones (campeonato_id, modalidad, genero, cinturon, rango_edad, rango_peso, clave, nombre, estado)
         values ($1, $2, 'MIXTO', 'Todos', 'Todas', null, $3, $4, 'EN_ESPERA') returning id`,
        [camp.id, mod, clave, `${NOMBRE_MODALIDAD[mod] ?? mod} · General`],
      )
    ).rows[0];
    console.log(`[prueba] sección creada: ${NOMBRE_MODALIDAD[mod] ?? mod}`);
  }
  seccionPorMod[mod] = sec.id;
}

// 2) Competidores + inscripción aprobada + modalidades + asignación a secciones.
for (const c of COMPETIDORES) {
  let comp = (
    await pg.query('select id from campeonatos.competidores where documento = $1', [c.doc])
  ).rows[0];
  if (!comp) {
    comp = (
      await pg.query(
        `insert into campeonatos.competidores (documento, nombre_completo, fecha_nacimiento, genero, grupo_cinturon, cinturon, peso_actual, academia_club)
         values ($1,$2,'2005-06-15',$3,$4,$5,$6,$7) returning id`,
        [c.doc, c.nombre, c.genero, c.grupo, c.cinturon, c.peso, c.club],
      )
    ).rows[0];
  }

  let ins = (
    await pg.query('select id from campeonatos.inscripciones where campeonato_id = $1 and competidor_id = $2', [camp.id, comp.id])
  ).rows[0];
  if (!ins) {
    ins = (
      await pg.query(
        `insert into campeonatos.inscripciones (campeonato_id, competidor_id, peso_inscripcion, grupo_cinturon_inscripcion, cinturon_inscripcion, estado, monto_total)
         values ($1,$2,$3,$4,$5,'APROBADA','0') returning id`,
        [camp.id, comp.id, c.peso, c.grupo, c.cinturon],
      )
    ).rows[0];
  }

  // Cada competidor entra en 2 modalidades (variadas) para poblar las secciones.
  const suyas = mods.filter((_, i) => (Number(c.doc) + i) % 2 === 0).slice(0, 3);
  const elegidas = suyas.length ? suyas : [mods[0]];
  for (const mod of elegidas) {
    await pg.query(
      `insert into campeonatos.inscripcion_modalidades (inscripcion_id, modalidad) values ($1,$2)
       on conflict do nothing`,
      [ins.id, mod],
    );
    const secId = seccionPorMod[mod];
    const ya = (
      await pg.query('select 1 from campeonatos.seccion_inscripciones where seccion_id = $1 and inscripcion_id = $2', [secId, ins.id])
    ).rows[0];
    if (!ya) {
      await pg.query(
        'insert into campeonatos.seccion_inscripciones (seccion_id, inscripcion_id) values ($1,$2)',
        [secId, ins.id],
      );
    }
  }
  console.log(`[prueba] competidor inscrito: ${c.nombre} (${elegidas.length} modalidad/es)`);
}

// 3) Jueces asignados al Tatami 1.
let tatami = (
  await pg.query('select id, numero from campeonatos.tatamis where campeonato_id = $1 order by numero asc limit 1', [camp.id])
).rows[0];
if (!tatami) {
  tatami = (
    await pg.query('insert into campeonatos.tatamis (campeonato_id, numero) values ($1, 1) returning id, numero', [camp.id])
  ).rows[0];
}
for (const j of JUECES) {
  const previo = (
    await pg.query('select id from campeonatos.jueces_tatami where tatami_id = $1 and rol_tatami = $2', [tatami.id, j.rol])
  ).rows[0];
  if (previo) {
    await pg.query('update campeonatos.jueces_tatami set nombre_display=$2, user_email=$3 where id=$1', [previo.id, j.nombre, j.email]);
  } else {
    await pg.query(
      'insert into campeonatos.jueces_tatami (tatami_id, rol_tatami, nombre_display, user_email) values ($1,$2,$3,$4)',
      [tatami.id, j.rol, j.nombre, j.email],
    );
  }
  console.log(`[prueba] juez ${j.rol} → Tatami ${tatami.numero}: ${j.email}`);
}

// 4) Encolar una sección de combate en el tatami (si hay) para verla "en cola".
const secCombate = seccionPorMod['combate'];
if (secCombate) {
  const enCola = (
    await pg.query('select 1 from campeonatos.cola_tatami where seccion_id = $1', [secCombate])
  ).rows[0];
  if (!enCola) {
    await pg.query(
      `insert into campeonatos.cola_tatami (tatami_id, seccion_id, orden, estado) values ($1,$2,1,'EN_ESPERA')`,
      [tatami.id, secCombate],
    );
    console.log('[prueba] sección de combate encolada en el Tatami 1');
  }
}

console.log('[prueba] Listo. Entra al campeonato y revisa secciones, competidores por sección y tatamis.');
await pg.close();
