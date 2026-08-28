#!/usr/bin/env node
/**
 * Ensayo de `restaurar-membresia.mjs`, con la avería de verdad dentro.
 *
 * ── Por qué existe ──
 *
 * Ese guion se ejecuta UNA vez, contra la base de producción, el día que algo
 * ya salió mal. Un guion así no se puede estrenar apuntando a producción: si la
 * consulta está torcida, lo que se descubre es que también estaba mal la
 * reparación.
 *
 * Aquí se levanta un PostgreSQL de verdad (en WebAssembly), se le aplican las
 * migraciones reales, se monta un club con su maestro y su alumna, **se comete
 * el accidente** —borrar la fila del maestro— y se comprueba que el guion lo
 * devuelve a su sitio y que no hace nada raro cuando se le pide otra cosa.
 *
 *   pnpm --filter @dinamyt/ecosystem-api restaurar:ensayo
 */

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { join } from 'node:path';
import { NoSePuede, restaurar } from './lib/restaurar-membresia.mjs';

// ── Adaptador: plantillas al estilo postgres.js sobre PGlite ────────────────
// El mismo de `probar-reconciliacion.mjs`, sin el SET dinámico —que aquí no se
// usa— y con `tx(array)` para las listas de `IN`.

function adaptador(pg) {
  return function tx(...args) {
    const [primero] = args;

    // Forma `tx([a, b, c])`: una lista para un `IN`.
    if (!Array.isArray(primero) || !('raw' in primero)) {
      return { __lista: primero };
    }

    const [trozos, ...valores] = args;
    const parametros = [];
    let texto = '';

    trozos.forEach((trozo, i) => {
      texto += trozo;
      if (i >= valores.length) return;
      const valor = valores[i];
      if (valor && typeof valor === 'object' && '__lista' in valor) {
        texto +=
          '(' +
          valor.__lista
            .map((v) => {
              parametros.push(v);
              return `$${parametros.length}`;
            })
            .join(', ') +
          ')';
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

const pg = new PGlite();
const db = drizzle(pg);

console.log('\n1. Migraciones reales del ecosystem');
await migrate(db, {
  migrationsFolder: join(import.meta.dirname, '..', 'drizzle', 'migrations'),
  migrationsSchema: 'ecosystem',
});
console.log('  ✔ aplicadas');

const tx = adaptador(pg);

console.log('\n2. Un club con su maestro y su alumna');
const [club] = await tx`
  INSERT INTO ecosystem.organizations (name, slug, type)
  VALUES ('Club de Pablo', 'club-de-pablo', 'CLUB')
  RETURNING id
`;
const [otroClub] = await tx`
  INSERT INTO ecosystem.organizations (name, slug, type)
  VALUES ('Club de Pablo Segundo', 'club-de-pablo-2', 'CLUB')
  RETURNING id
`;
const [maestro] = await tx`
  INSERT INTO ecosystem.users (email, full_name)
  VALUES ('pablo@ejemplo.com', 'Pablo Bustamante')
  RETURNING id
`;
const [alumna] = await tx`
  INSERT INTO ecosystem.users (email, full_name)
  VALUES ('ana@ejemplo.com', 'Ana Gómez')
  RETURNING id
`;
await tx`
  INSERT INTO ecosystem.org_members (org_id, user_id, role, role_membresias, joined_at)
  VALUES (${club.id}, ${maestro.id}, 'maestro', 'owner', '2024-03-01T12:00:00Z')
`;
await tx`
  INSERT INTO ecosystem.org_members (org_id, user_id, role, role_membresias)
  VALUES (${club.id}, ${alumna.id}, 'student', 'student')
`;
console.log('  ✔ montado');

console.log('\n3. El accidente: la ✕ borra la fila del maestro');
await tx`
  DELETE FROM ecosystem.org_members
   WHERE org_id = ${club.id} AND user_id = ${maestro.id}
`;
const huerfano = await tx`
  SELECT 1 FROM ecosystem.org_members
   WHERE org_id = ${club.id} AND role IN ('admin', 'owner', 'maestro')
`;
comprobar('el club se quedó sin nadie que lo mande', huerfano.length === 0);

console.log('\n4. La restauración');
const informe = await restaurar(tx, {
  persona: 'pablo@ejemplo.com',
  club: 'club-de-pablo',
  rol: 'maestro',
  desde: '2024-03-01',
});
comprobar('dice que creó la fila', informe.accion === 'creada', informe.accion);
comprobar('antes no mandaba nadie', informe.gestoresAntes.length === 0);
comprobar(
  'después manda Pablo',
  informe.gestoresDespues.length === 1 &&
    informe.gestoresDespues[0].nombre === 'Pablo Bustamante' &&
    informe.gestoresDespues[0].rol === 'maestro',
  informe.gestoresDespues,
);

const [fila] = await tx`
  SELECT role, role_membresias, joined_at
    FROM ecosystem.org_members
   WHERE org_id = ${club.id} AND user_id = ${maestro.id}
`;
comprobar('el rol general es maestro', fila.role === 'maestro', fila.role);
comprobar(
  'y en Membresías queda como owner, que es como se llama allí',
  fila.role_membresias === 'owner',
  fila.role_membresias,
);
comprobar(
  '--desde respeta la fecha de entrada original',
  fila.joined_at.toISOString().slice(0, 10) === '2024-03-01',
  fila.joined_at,
);

console.log('\n5. Correrlo dos veces no hace nada la segunda');
const otraVez = await restaurar(tx, {
  persona: 'pablo@ejemplo.com',
  club: 'club-de-pablo',
  rol: 'maestro',
});
comprobar('lo dice en vez de duplicar', otraVez.accion === 'sin-cambios', otraVez.accion);
const cuantas = await tx`
  SELECT count(*)::int AS n FROM ecosystem.org_members
   WHERE org_id = ${club.id} AND user_id = ${maestro.id}
`;
comprobar('sigue habiendo una sola fila', cuantas[0].n === 1, cuantas[0].n);

console.log('\n6. Lo que NO hace por su cuenta');

// Un nombre a medias que cuadra con dos clubes: no elige, se planta.
let saltó = null;
try {
  await restaurar(tx, { persona: 'pablo@ejemplo.com', club: 'Club de Pablo' });
} catch (e) {
  saltó = e;
}
comprobar(
  'con dos clubes que cuadran, no elige: se planta y los enseña',
  saltó instanceof NoSePuede && /2 organizaciones/.test(saltó.message),
  saltó?.message,
);

// A alguien que YA es miembro no se le pisa el rol sin decirlo.
saltó = null;
try {
  await restaurar(tx, {
    persona: 'ana@ejemplo.com',
    club: 'club-de-pablo',
    rol: 'maestro',
  });
} catch (e) {
  saltó = e;
}
comprobar(
  'no asciende a la alumna a maestra sin --forzar-rol',
  saltó instanceof NoSePuede && /--forzar-rol/.test(saltó.message),
  saltó?.message,
);
const [anaSigue] = await tx`
  SELECT role FROM ecosystem.org_members
   WHERE org_id = ${club.id} AND user_id = ${alumna.id}
`;
comprobar('y su rol sigue intacto', anaSigue.role === 'student', anaSigue.role);

// Con --forzar-rol sí, porque ya se dijo a propósito.
const forzada = await restaurar(tx, {
  persona: 'ana@ejemplo.com',
  club: 'club-de-pablo',
  rol: 'coach',
  forzarRol: true,
});
comprobar('con --forzar-rol corrige', forzada.accion === 'corregida', forzada.accion);
comprobar('y dice cuál era el rol de antes', forzada.rolAnterior === 'student', forzada.rolAnterior);

saltó = null;
try {
  await restaurar(tx, { persona: 'nadie@ejemplo.com', club: 'club-de-pablo' });
} catch (e) {
  saltó = e;
}
comprobar(
  'a quien no existe lo dice claro',
  saltó instanceof NoSePuede && /Nadie cuadra/.test(saltó.message),
  saltó?.message,
);

// El otro club sigue sin tocar: nada se coló de lado.
const enElOtro = await tx`
  SELECT count(*)::int AS n FROM ecosystem.org_members WHERE org_id = ${otroClub.id}
`;
comprobar('el club de al lado sigue vacío', enElOtro[0].n === 0, enElOtro[0].n);

// ── Final ───────────────────────────────────────────────────────────────────

await pg.close();

console.log(
  fallos === 0
    ? '\n✔ Todo en verde: el guion devuelve al maestro a su club y no hace nada más.\n'
    : `\n✘ ${fallos} comprobación(es) en rojo.\n`,
);
process.exit(fallos === 0 ? 0 : 1);
