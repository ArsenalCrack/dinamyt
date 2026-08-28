#!/usr/bin/env node
/**
 * Devolver a alguien a su organización después de haberlo sacado sin querer.
 *
 * La lógica vive en `lib/restaurar-membresia.mjs`; esto es el guion que la
 * conecta, la envuelve en una transacción y cuenta lo que pasó.
 *
 * ── Por qué hace falta un guion ──
 *
 * Quitar a un miembro BORRA su fila de `ecosystem.org_members`. No hay papelera
 * ni bandera de «dado de baja»: la fila deja de existir, y con ella el rol, la
 * fecha de entrada y quién lo había invitado.
 *
 * Y no se arregla desde el portal cuando el que salió es el MAESTRO, que es
 * justo el caso que hizo falta la primera vez: el alta de miembros ya no mete a
 * nadie a mano —es una invitación que la persona acepta— y quien tendría que
 * invitarlo es él mismo, que acaba de quedarse sin panel. Ese círculo solo lo
 * rompe el super-admin, o esto.
 *
 * (Que el accidente vuelva a ocurrir ya no depende de la suerte: lo impide
 * `OrganizationsService.exigirQueNoSeQuedeSinGestor`. Este guion repara lo que
 * pasó ANTES de esa regla.)
 *
 * ── Qué NO restaura ──
 *
 * La fecha de entrada original y quién lo invitó se fueron con la fila. La
 * primera se puede fijar con `--desde`; si no, entra con la de hoy. **Lo fiel
 * de verdad es el respaldo** (OPERAR.md §2.5): si tienes el volcado anterior al
 * accidente, saca de ahí los valores y pásalos.
 *
 * ── CÓMO SE USA ─────────────────────────────────────────────────────────────
 *
 *   # 1. Mirar sin tocar (por defecto). Hace TODO el trabajo y lo deshace.
 *   sudo -u postgres RESTAURAR_DATABASE_URL=postgresql:///dinamyt \
 *     node scripts/restaurar-membresia.mjs \
 *     --persona "pablo.bustamante@correo.com" --club "Club de Pablo"
 *
 *   # 2. Si lo que dice es lo que esperabas, otra vez con --aplicar.
 *   ... node scripts/restaurar-membresia.mjs --persona … --club … --aplicar
 *
 * `--persona` acepta el correo, el documento o el nombre; `--club`, el id, el
 * slug o el nombre. Si lo tecleado cuadra con más de uno, el guion **no elige**:
 * los enseña y se planta.
 *
 * Es idempotente: si la persona ya está en el club con ese rol, no escribe nada.
 */

import postgres from 'postgres';
import { NoSePuede, restaurar } from './lib/restaurar-membresia.mjs';

// ── Argumentos ──────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const valorDe = (bandera) => {
  const i = argv.indexOf(bandera);
  return i >= 0 ? argv[i + 1] : undefined;
};

const opciones = {
  persona: valorDe('--persona'),
  club: valorDe('--club'),
  rol: valorDe('--rol') ?? 'maestro',
  rolMembresias: valorDe('--rol-membresias'),
  desde: valorDe('--desde'),
  aplicar: argv.includes('--aplicar'),
  forzarRol: argv.includes('--forzar-rol'),
  url: valorDe('--url') ?? process.env.RESTAURAR_DATABASE_URL,
};

if (argv.includes('--ayuda') || argv.includes('-h') || argv.length === 0) {
  console.log(
    [
      'Uso: node scripts/restaurar-membresia.mjs --persona <…> --club <…> [opciones]',
      '',
      '  --persona <correo|documento|nombre>  a quién se devuelve',
      '  --club    <id|slug|nombre>           a dónde',
      '  --rol     <rol>                      rol general (por defecto: maestro)',
      '  --rol-membresias <rol>               owner | staff | guardian | student',
      '                                       (si no se pasa, sale del rol general)',
      '  --desde   <AAAA-MM-DD>               fecha de entrada (por defecto: hoy)',
      '  --aplicar                            escribe de verdad; sin esto, ensayo',
      '  --forzar-rol                         si YA es miembro, corrígele el rol',
      '  --url <cadena>                       conexión (o RESTAURAR_DATABASE_URL)',
      '',
      'Ejemplo:',
      '  sudo -u postgres RESTAURAR_DATABASE_URL=postgresql:///dinamyt \\',
      '    node scripts/restaurar-membresia.mjs --persona pablo@correo.com \\',
      '    --club "Club de Pablo" --rol maestro',
    ].join('\n'),
  );
  process.exit(0);
}

if (!opciones.persona || !opciones.club) {
  console.error('Faltan --persona y/o --club. Usa --ayuda para ver los ejemplos.');
  process.exit(1);
}
if (!opciones.url) {
  console.error(
    'Falta la cadena de conexión. Ponla en RESTAURAR_DATABASE_URL o pásala con --url.',
  );
  process.exit(1);
}
if (opciones.desde && !/^\d{4}-\d{2}-\d{2}$/.test(opciones.desde)) {
  console.error('--desde tiene que ser una fecha AAAA-MM-DD.');
  process.exit(1);
}

// ── Conexión ────────────────────────────────────────────────────────────────

/**
 * `postgresql:///dinamyt` es «por el socket Unix» para psql, pero TCP para este
 * driver — y por TCP hasta `postgres` necesita contraseña. Misma trampa (y
 * mismo remedio) que en `reconciliar-identidades.mjs`.
 */
function socketSiNoHayHost(cadena) {
  const autoridad = /^[a-z+]+:\/\/([^/?]*)/i.exec(cadena)?.[1] ?? '';
  const host = autoridad.slice(autoridad.indexOf('@') + 1);
  return host ? null : (process.env.PGHOST ?? '/var/run/postgresql');
}

const socket = socketSiNoHayHost(opciones.url);
const sql = postgres(opciones.url, {
  onnotice: () => {},
  max: 1,
  ...(socket ? { host: socket } : {}),
});

/** Marca para deshacer la transacción del ensayo sin que parezca un fallo. */
class Ensayo extends Error {}

let informe = null;
let fallo = null;

try {
  await sql.begin(async (tx) => {
    informe = await restaurar(tx, opciones);
    if (!opciones.aplicar) {
      // El ensayo hace TODO el trabajo y aquí lo deshace entero: es la única
      // forma de que cuente la verdad y no una aproximación.
      throw new Ensayo();
    }
  });
} catch (err) {
  if (!(err instanceof Ensayo)) fallo = err;
}

await sql.end();

if (fallo) {
  console.error(`\n✗ ${fallo.message}`);
  if (!(fallo instanceof NoSePuede)) {
    console.error('\n  No se cambió nada: la transacción se deshizo entera.');
  }
  process.exit(1);
}

// ── Informe ─────────────────────────────────────────────────────────────────

const lista = (g) =>
  g.length ? g.map((x) => `${x.nombre} (${x.rol})`).join(', ') : '⚠ NADIE';

console.log(`
  Persona : ${informe.persona.full_name} · ${informe.persona.email ?? 'sin correo'}
            ${informe.persona.id}
  Club    : ${informe.club.name} · ${informe.club.type}${
    informe.club.is_active === false ? ' · DESACTIVADO' : ''
  }
            ${informe.club.id}
  Rol     : ${informe.rol}${
    informe.rolMembresias ? ` (en Membresías: ${informe.rolMembresias})` : ''
  }

  Mandaban antes : ${lista(informe.gestoresAntes)}
  Mandan después : ${lista(informe.gestoresDespues)}
`);

if (informe.accion === 'sin-cambios') {
  console.log('✔ Ya estaba dentro con ese rol. No había nada que hacer.\n');
  process.exit(0);
}

if (!opciones.aplicar) {
  console.log(
    '· ENSAYO EN SECO: se hizo el trabajo entero y se deshizo. No se escribió nada.\n' +
      '  Si esto es lo que esperabas, repite el mismo comando con --aplicar.\n',
  );
  process.exit(0);
}

console.log(
  informe.accion === 'creada'
    ? '✔ Devuelto al club.\n'
    : `✔ Corregido: «${informe.rolAnterior}» → «${informe.rol}».\n`,
);
console.log(
  '  Falta una cosa: que vuelva a ENTRAR. El rol viaja dentro del token, así\n' +
    '  que hasta que cierre sesión y la vuelva a abrir (o pasen los 30 min del\n' +
    '  pase) su navegador sigue creyendo lo de antes.\n',
);
