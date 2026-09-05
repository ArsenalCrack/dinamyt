#!/usr/bin/env node
/**
 * Mover al disco las fotos y los escudos que ya están incrustados en la fila.
 *
 * ── Qué hace y qué NO ──
 *
 * El código nuevo (`common/almacen-imagenes.ts`) manda al disco todo lo que se
 * suba **a partir de ahora**. Lo que ya estaba guardado como data-URL sigue ahí
 * y sigue funcionando —la validación acepta las tres formas—, pero no se lleva
 * ninguna de las ventajas: sigue pesando en cada listado y sigue metiéndose en
 * el volcado diario. Esto es lo que lo pasa.
 *
 * **No convierte ninguna imagen**: los bytes que salen del data-URL son los que
 * se escriben. Una foto de 2019 sigue siendo la misma foto, con su calidad y su
 * tamaño; lo único que cambia es dónde vive.
 *
 * ── Cómo se usa ──
 *
 *   pnpm --filter @dinamyt/ecosystem-api fotos:al-disco              # ensayo
 *   pnpm --filter @dinamyt/ecosystem-api fotos:al-disco --aplicar    # escribe
 *
 * Sin `--aplicar` hace todo el trabajo —incluido decodificar y comprobar cada
 * imagen— dentro de una transacción que se deshace, igual que la reconciliación
 * (§2.8) y que `limpiar-roles-de-app.sh`. Respalda antes de aplicar (§2.5).
 *
 * ── Los archivos se escriben también en el ensayo, y es a propósito ──
 *
 *   · Escribir un archivo cuyo nombre es el hash de su contenido **no puede
 *     estropear nada**: o no existe y se crea, o existe y ya es idéntico.
 *   · Así el ensayo prueba de verdad lo que va a pasar. Si un directorio no
 *     tiene permisos o el disco está lleno, se entera el ensayo y no el
 *     `--aplicar`.
 *
 * Lo único que separa el ensayo de la aplicación es el `UPDATE`. Un archivo
 * escrito cuya fila no se actualizó es basura inofensiva: nadie lo referencia y
 * la siguiente pasada lo reutiliza.
 *
 * ⚠️ **Correrlo con la variable puesta.** Sin `MEDIA_PUBLIC_URL` el almacén
 * está apagado, y mover las filas mientras el código las sigue guardando
 * incrustadas dejaría el despliegue a medias. Se comprueba antes de empezar.
 */

import 'dotenv/config';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { moverFotosAlDisco, nombreDe } from './lib/fotos-al-disco.mjs';

const args = process.argv.slice(2);
const aplicar = args.includes('--aplicar');
const url =
  args.find((a) => a.startsWith('--url='))?.slice(6) ??
  process.env.DATABASE_URL ??
  '';
const esquema = process.env.DB_SCHEMA || 'ecosystem';

if (!process.env.MEDIA_PUBLIC_URL) {
  console.error(`
✗ MEDIA_PUBLIC_URL no está puesta, así que el almacén está APAGADO.

  Mover las filas ahora dejaría el despliegue a medias: las fotos viejas en el
  disco y las nuevas volviendo a incrustarse. Pon la variable, reinicia el
  servicio y vuelve. Ver OPERAR.md §6.2.
`);
  process.exit(1);
}
if (!url) {
  console.error(
    'Falta la cadena de conexión. Ponla en DATABASE_URL o pásala con --url=…',
  );
  process.exit(1);
}

const dir = resolve(
  process.env.MEDIA_DIR ?? resolve(process.cwd(), '../../.uploads/ecosystem'),
);
mkdirSync(dir, { recursive: true });

/** Escribe la imagen y devuelve su ruta pública. Idempotente. */
function guardar(datos, tipo) {
  const nombre = nombreDe(datos, tipo);
  const destino = join(dir, nombre);
  if (!existsSync(destino)) {
    // Se escribe aparte y se mueve encima: `rename` es atómico dentro del mismo
    // sistema de archivos, así que Caddy nunca sirve un archivo a medio escribir
    // con la caché de un año puesta.
    const temporal = join(dir, `.${randomUUID()}.tmp`);
    writeFileSync(temporal, datos);
    renameSync(temporal, destino);
  }
  return `/media/${nombre}`;
}

// Igual que la reconciliación: sin host en la cadena se habla por el socket, y
// no hay ninguna contraseña que inventar.
const autoridad = /^[a-z+]+:\/\/([^/?]*)/i.exec(url)?.[1] ?? '';
const host = autoridad.slice(autoridad.indexOf('@') + 1);
const sql = postgres(url, {
  onnotice: () => {},
  max: 1,
  ...(host ? {} : { host: process.env.PGHOST ?? '/var/run/postgresql' }),
});

/** Marca para deshacer la transacción del ensayo sin que parezca un fallo. */
class Ensayo extends Error {}

let informe = null;
let fallo = null;

try {
  await sql.begin(async (tx) => {
    informe = await moverFotosAlDisco(
      (texto, parametros) => tx.unsafe(texto, parametros),
      { esquema, guardar },
    );
    if (!aplicar) throw new Ensayo();
  });
} catch (err) {
  if (!(err instanceof Ensayo)) fallo = err;
}

await sql.end();

if (fallo) {
  console.error(
    '\n✗ No se cambió ninguna fila: la transacción se deshizo entera.\n',
  );
  console.error(fallo.message);
  process.exit(1);
}

// ── Resumen ─────────────────────────────────────────────────────────────────

const kb = (b) => `${(b / 1024).toFixed(1)} KB`;

console.log(
  `\n── Fotos al disco ${aplicar ? '· APLICADO' : '· ENSAYO (no se cambió ninguna fila)'} ──`,
);
console.log(`   directorio: ${dir}\n`);

let ahorro = 0;
for (const r of informe) {
  console.log(`  ${r.que} (${r.tabla}.${r.columna})`);
  console.log(`    incrustadas encontradas : ${r.total}`);
  console.log(`    movidas al disco        : ${r.movidas}`);
  console.log(
    `    peso en la fila         : ${kb(r.bytesAntes)} → ${kb(r.bytesDespues)}`,
  );
  ahorro += r.bytesAntes - r.bytesDespues;
  if (r.rotas.length) {
    console.log(`    ⚠ sin tocar (revisar a mano): ${r.rotas.length}`);
    for (const x of r.rotas) console.log(`        ${x.id} — ${x.motivo}`);
  }
  console.log('');
}

console.log(
  `  Las tablas adelgazan ${kb(ahorro)}, y eso sale también del volcado diario.`,
);
if (!aplicar) {
  console.log(`
  Esto ha sido un ENSAYO: los archivos SÍ se escribieron (es inofensivo: el
  nombre es el hash del contenido), pero ninguna fila se cambió. Para aplicarlo,
  con respaldo delante (§2.5):

      pnpm --filter @dinamyt/ecosystem-api fotos:al-disco --aplicar
`);
}
