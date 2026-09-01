#!/usr/bin/env node
/**
 * Manda a Membresías el alta de TODA la gente que ya pertenece a un club.
 *
 *     pnpm --filter @dinamyt/ecosystem-api espejo:sembrar          # ensayo
 *     pnpm --filter @dinamyt/ecosystem-api espejo:sembrar --aplicar
 *
 * ── Por qué hace falta correrlo UNA vez ──
 *
 * La pertenencia al club ya viaja en los dos sentidos, pero solo desde ahora:
 * el aviso de alta (`espejarAlta`) se dispara cuando alguien ENTRA. La gente
 * que entró ANTES de este cambio se quedó como estaba — en el club según el
 * portal, invisible en Membresías hasta que cada uno abriera la app por su
 * cuenta.
 *
 * Eso es exactamente lo que se venía a arreglar, así que un arreglo que solo
 * vale para los que lleguen mañana no arregla el club de nadie. Esto repasa lo
 * que ya hay y manda el mismo aviso que habrían recibido.
 *
 * ── Es seguro repetirlo ──
 *
 * Al otro lado no se duplica nada (`asegurarFicha`): a quien ya tiene ficha se
 * le devuelve, a quien la tiene con su correo sin enlazar se le ata, y a quien
 * no tiene se la crea. Correrlo dos veces da el mismo resultado que correrlo
 * una.
 *
 * ── Lo que NO hace ──
 *
 * No manda a quien no tiene rol en Membresías (un `judge` de una federación):
 * sin rol allí no hay ficha que crear, misma regla que `espejarAlta`. No toca
 * NADA en esta base: solo lee y llama a la otra API. Y no reactiva a quien su
 * maestro apagó a propósito en Membresías — esa gente sale de `org_members`
 * marcada con `membresias_activo = false` y se salta, porque devolverle el
 * acceso a alguien a quien se lo quitaron sería justo lo contrario de lo que
 * se pidió.
 *
 * ── Cómo se corre en el VPS ──
 *
 *     cd /srv/dinamyt/apps/ecosystem-api
 *     pnpm espejo:sembrar              # dice qué haría, sin hacer nada
 *     pnpm espejo:sembrar --aplicar
 *
 * Usa las variables del `.env` de la API: `DATABASE_URL`, `MEMBRESIAS_SYNC_URL`
 * y `ECOSYSTEM_SYNC_SECRET`. Si el espejo está apagado, lo dice y se para.
 */

import 'dotenv/config';

const APLICAR = process.argv.includes('--aplicar');
const SOLO_ORG = (() => {
  const i = process.argv.indexOf('--org');
  return i >= 0 ? process.argv[i + 1] : null;
})();

const destino = (process.env.MEMBRESIAS_SYNC_URL ?? '').replace(/\/+$/, '');
const secreto = process.env.ECOSYSTEM_SYNC_SECRET ?? '';

if (!destino || !secreto) {
  console.error(`
✗ El espejo está apagado: falta MEMBRESIAS_SYNC_URL o ECOSYSTEM_SYNC_SECRET.

  Sin las dos, este guion no tendría a quién avisar. Ver OPERAR.md §1.4 — el
  secreto tiene que ser EL MISMO en ecosystem-api y en membresias-api.
`);
  process.exit(1);
}
/**
 * Un ejecutor de consultas, venga de PGlite o de postgres-js.
 *
 * Las dos ramas y no solo la remota, por el mismo motivo que en
 * `diagnostico-bd.mjs`: en desarrollo la base es PGlite y sin esto el guion no
 * se puede ni probar antes de correrlo en producción, que es exactamente
 * cuando no se quiere descubrir una consulta mal escrita.
 */
async function abrir() {
  if (process.env.PGLITE_DATA) {
    const { PGlite } = await import('@electric-sql/pglite');
    const pg = new PGlite(process.env.PGLITE_DATA);
    console.log(`
── Base LOCAL embebida (PGlite) ──
  ${process.env.PGLITE_DATA}`);
    return {
      consultar: async (texto, params = []) => (await pg.query(texto, params)).rows,
      cerrar: () => pg.close(),
    };
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('✗ No hay ni PGLITE_DATA ni DATABASE_URL en el .env de la API.');
    process.exit(1);
  }
  const { default: postgres } = await import('postgres');
  const sql = postgres(url, { prepare: false });
  const host = url.replace(/^.*@/, '').replace(/\/.*$/, '');
  console.log(`
── Base REMOTA ──
  ${host}`);
  return {
    consultar: (texto, params = []) => sql.unsafe(texto, params),
    cerrar: () => sql.end(),
  };
}

let bd;
try {
  bd = await abrir();
} catch (e) {
  console.error(`✗ No se pudo abrir la base: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}

/**
 * El rol de Membresías de un miembro.
 *
 * `role_membresias` es el que manda. Cuando está vacío se deduce del general,
 * igual que hace `rolParaApp` en la API: quien entró antes de que existieran
 * los roles por app no tiene ninguno escrito, y dejarlo fuera por eso sería
 * saltarse justo a la gente más antigua del club.
 */
function rolDeMembresias(m) {
  if (m.role_membresias) return m.role_membresias;
  switch (m.role) {
    case 'owner':
    case 'admin':
    case 'maestro':
      return 'owner';
    case 'staff':
      return 'staff';
    case 'coach':
      return 'guardian';
    case 'student':
    case 'competitor':
      return 'student';
    default:
      // `judge` y compañía: de otra app. Sin equivalente aquí no se manda nada.
      return null;
  }
}

let miembros;
try {
  miembros = await bd.consultar(
    `SELECT m.user_id, m.org_id, m.role, m.role_membresias, m.membresias_activo,
            u.email, u.full_name, o.name AS org_name
       FROM ecosystem.org_members m
       JOIN ecosystem.users u ON u.id = m.user_id
       JOIN ecosystem.organizations o ON o.id = m.org_id
      WHERE o.is_active
        AND u.is_active
        AND ($1::uuid IS NULL OR m.org_id = $1::uuid)
      ORDER BY o.name, u.full_name`,
    [SOLO_ORG],
  );
} catch (e) {
  console.error(`✗ No se pudo leer la gente: ${e instanceof Error ? e.message : e}`);
  await bd.cerrar();
  process.exit(1);
}

const candidatos = [];
const saltados = { sinRol: 0, sinAcceso: 0, sinCorreo: 0 };

for (const m of miembros) {
  if (m.membresias_activo === false) {
    saltados.sinAcceso++;
    continue;
  }
  if (!m.email) {
    saltados.sinCorreo++;
    continue;
  }
  const rol = rolDeMembresias(m);
  if (!rol) {
    saltados.sinRol++;
    continue;
  }
  candidatos.push({ ...m, rol });
}

console.log(`\n── Lo que hay ──`);
console.log(`  Miembros mirados      : ${miembros.length}`);
console.log(`  A los que se avisará  : ${candidatos.length}`);
console.log(`  Saltados sin rol      : ${saltados.sinRol}`);
console.log(`  Saltados sin acceso   : ${saltados.sinAcceso}  (se lo quitaron a propósito)`);
console.log(`  Saltados sin correo   : ${saltados.sinCorreo}`);

if (!APLICAR) {
  console.log(`
── Ensayo: no se ha mandado nada ──

  Los primeros que se avisarían:`);
  for (const c of candidatos.slice(0, 15)) {
    console.log(`    · ${c.full_name} (${c.email}) → ${c.org_name} como ${c.rol}`);
  }
  if (candidatos.length > 15) console.log(`    … y ${candidatos.length - 15} más`);
  console.log(`
  Para mandarlos de verdad:  pnpm espejo:sembrar --aplicar
`);
  await bd.cerrar();
  process.exit(0);
}

/**
 * ── El cerrojo: ¿la otra punta entiende el alta? ──────────────────────────
 *
 * **Sin esto, correr el repaso contra un Membresías sin actualizar da de BAJA
 * a todo el mundo.** La ruta vieja lee `{ecoSub, ecoOrgId}` y no mira `activo`:
 * el mismo cuerpo que aquí significa «entró» allí significa «salió», y el
 * resultado sería exactamente lo contrario de lo que se venía a hacer, sobre
 * la gente entera de todos los clubes.
 *
 * Es el fallo clásico de desplegar en el orden equivocado, y avisarlo en un
 * documento no basta: lo comprueba el guion, y se niega a seguir.
 *
 * La sonda es un aviso que NO TOCA NADA: un `ecoSub` inventado —que no es de
 * nadie— con `activo: true` y sin correo. La ruta nueva llega a mirar el correo,
 * no lo encuentra y lo dice; la vieja ni sabe que hay un alta, busca una ficha
 * que no existe y se calla. Esa diferencia es la firma.
 */
async function entiendeElAlta(ecoOrgId) {
  const res = await fetch(`${destino}/sync/pertenencia`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-dinamyt-sync': secreto },
    body: JSON.stringify({
      ecoSub: '00000000-0000-4000-8000-000000000000',
      ecoOrgId,
      activo: true,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return { ok: false, detalle: `HTTP ${res.status}` };
  const d = await res.json();
  return {
    ok: typeof d.motivo === 'string' && d.motivo.includes('correo'),
    detalle: JSON.stringify(d),
  };
}

const sonda = await entiendeElAlta(candidatos[0].org_id);
if (!sonda.ok) {
  console.error(`
✗ ME NIEGO A SEGUIR: Membresías todavía no entiende el alta.

  Contestó: ${sonda.detalle}

  Esa versión lee el aviso SIN mirar \`activo\`, así que el mensaje que dice
  «entró al club» lo leería como «salió del club» — y este repaso dejaría sin
  acceso a las ${candidatos.length} personas que iba a dar de alta.

  Despliega Membresías PRIMERO y vuelve a correr esto.
`);
  await bd.cerrar();
  process.exit(1);
}

console.log(`\n── Avisando a ${destino} ──`);

const cuenta = { creada: 0, enlazada: 0, yaEstaba: 0, sinClub: 0, fallo: 0 };

for (const c of candidatos) {
  try {
    const res = await fetch(`${destino}/sync/pertenencia`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dinamyt-sync': secreto },
      body: JSON.stringify({
        ecoSub: c.user_id,
        ecoOrgId: c.org_id,
        activo: true,
        email: c.email,
        fullName: c.full_name,
        role: c.rol,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      cuenta.fallo++;
      console.log(`  ✗ ${c.email}: HTTP ${res.status}`);
      continue;
    }
    const d = await res.json();
    if (d.encontrada === false) {
      // Casi siempre: ese club del portal no tiene espejo en Membresías.
      cuenta.sinClub++;
    } else if (d.creada) {
      cuenta.creada++;
      console.log(`  + ${c.full_name} → ${c.org_name} (ficha nueva)`);
    } else if (d.enlazada) {
      cuenta.enlazada++;
      console.log(`  ~ ${c.full_name} → ${c.org_name} (ficha que ya existía, atada)`);
    } else {
      cuenta.yaEstaba++;
    }
  } catch (e) {
    cuenta.fallo++;
    console.log(`  ✗ ${c.email}: ${e instanceof Error ? e.message : 'error'}`);
  }
}

console.log(`
── Resultado ──
  Fichas nuevas         : ${cuenta.creada}
  Atadas a la que había : ${cuenta.enlazada}
  Ya estaban bien       : ${cuenta.yaEstaba}
  Club sin espejo       : ${cuenta.sinClub}  (esa organización no usa Membresías)
  Fallaron              : ${cuenta.fallo}
`);

await bd.cerrar();
if (cuenta.fallo) process.exit(1);
