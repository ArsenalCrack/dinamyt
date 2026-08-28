#!/usr/bin/env node
/**
 * Diagnóstico del espejo a Membresías. **Solo lee: no cambia ninguna ficha.**
 *
 * ── Por qué existe ──
 *
 * El espejo (`common/espejo-membresias.ts`) se dispara sin esperarlo y se traga
 * cualquier fallo con un aviso en el log — a propósito: que Membresías esté
 * caída no puede impedir que el maestro corrija un apellido en el portal. El
 * precio de esa decisión es que **cuando el espejo no funciona, no se nota**.
 * Se nota una semana después, cuando el carnet sale con la foto vieja.
 *
 * Esto lo pregunta de frente: manda un aviso vacío —un `ecoSub` inventado y
 * ningún campo— y cuenta qué contestó Membresías. Ese aviso no toca ninguna
 * fila: sin campos que aplicar, la ruta de allí responde `encontrada:false` y
 * no llega a escribir.
 *
 *   pnpm --filter @dinamyt/ecosystem-api espejo:diagnostico
 */

import 'dotenv/config';
import { randomUUID } from 'node:crypto';

const destino = (process.env.MEMBRESIAS_SYNC_URL ?? '').replace(/\/+$/, '');
const secreto = process.env.ECOSYSTEM_SYNC_SECRET ?? '';

console.log('\n── Lo que dice el .env ──');
console.log(`  MEMBRESIAS_SYNC_URL    : ${destino || '(vacía)'}`);
console.log(
  `  ECOSYSTEM_SYNC_SECRET  : ${
    secreto ? `puesta (${secreto.length} caracteres)` : '(vacía)'
  }`,
);

if (!destino || !secreto) {
  console.log(`
✗ EL ESPEJO ESTÁ APAGADO en este despliegue.

  Con cualquiera de las dos vacía, \`espejoConfigurado()\` da false y el aviso
  no sale siquiera. Lo que se guarda en el portal —la foto, el cinturón, el
  escudo del club y la contraseña— se queda aquí, y Membresías sigue enseñando
  lo que tuviera.

  En local eso es NORMAL. En el VPS no: ver OPERAR.md §1.4. El secreto tiene
  que ser EL MISMO en ecosystem-api y en membresias-api.
`);
  process.exit(1);
}

console.log('\n── Llamando a Membresías ──');
console.log(`  POST ${destino}/sync/persona   (aviso vacío, no escribe nada)`);

let res;
try {
  res = await fetch(`${destino}/sync/persona`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-dinamyt-sync': secreto },
    body: JSON.stringify({ ecoSub: randomUUID() }),
    signal: AbortSignal.timeout(8000),
  });
} catch (e) {
  console.log(`
✗ NO SE LLEGA A ESA DIRECCIÓN (${e.message}).

  No es un problema de secretos: la petición ni siquiera llegó. Comprueba que
  membresias-api esté viva y que MEMBRESIAS_SYNC_URL sea su origen, sin barra
  final (por ejemplo https://membresias-api.dinamyt.org).
`);
  process.exit(1);
}

const cuerpo = await res.text();

if (res.status === 404) {
  console.log(`
✗ MEMBRESÍAS RESPONDE 404, y es a propósito.

  Allí la ruta /sync no existe mientras su ECOSYSTEM_SYNC_SECRET esté vacía:
  una ruta sin autenticar que reescribe fichas no puede quedarse abierta «por
  si acaso». Pon el MISMO secreto en el .env de membresias-api y reiníciala.
`);
  process.exit(1);
}

if (res.status === 401) {
  console.log(`
✗ SECRETO DISTINTO (401).

  Las dos apps tienen su ECOSYSTEM_SYNC_SECRET puesta, pero no es la misma.
  Copia una en la otra —tal cual, sin comillas ni espacios— y reinicia las dos.
`);
  process.exit(1);
}

if (!res.ok) {
  console.log(`\n✗ Membresías respondió ${res.status}: ${cuerpo.slice(0, 300)}\n`);
  process.exit(1);
}

console.log(`  ${res.status} ${cuerpo.slice(0, 200)}`);
console.log(`
✔ EL CANAL ESTÁ ABIERTO. Lo que el portal guarda llega a Membresías.

── Y ahora lo que el espejo NO lleva, que es lo que suele buscarse aquí ──

  El espejo tiene TRES avisos y solo tres (\`common/espejo-membresias.ts\`):

    /sync/persona     nombre, teléfono, foto, cinturón, desde cuándo entrena,
                      nacimiento, tipo de sangre y contacto de emergencia
    /sync/club        nombre, ciudad y escudo del club
    /sync/contrasena  el hash de la contraseña

  NO viaja **a qué club pertenece cada quien ni con qué rol**. Eso vive en
  \`ecosystem.org_members\` aquí y en \`membresias.users.org_id\` allí, y son dos
  tablas distintas que nadie sincroniza. Quitar a alguien de un club en el
  portal, o cambiarle el rol, **no se nota en Membresías**: allí sigue en su
  club, con su plan y su historial de pagos.

  Eso es deliberado —el dinero y la asistencia de un alumno no pueden
  desaparecer porque alguien pulse una ✕ en otra aplicación—, pero significa que
  las dos pueden decir cosas distintas. Si alguien sale de un club de verdad,
  hay que darlo de baja también en Membresías.
`);
