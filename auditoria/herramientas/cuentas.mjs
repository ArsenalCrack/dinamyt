// Escribe `cuentas.json` (fuera de git) con las cuentas de prueba del
// `README.md` del monorepo, por rol y por web. Membresías tiene sus propias
// cuentas locales: después, `membresias-cuentas.mjs --poner "Dojo Peñalosa"`.
// Uso: node auditoria/herramientas/cuentas.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const readme = readFileSync(join(aqui, '..', '..', 'README.md'), 'utf8');

// Filas de la tabla «Usuario | Contraseña | Qué ve». Una fila puede juntar
// varios correos del mismo dominio: `alumno1@` · `alumno2@dinamyt.com`.
const claves = {};
for (const [, usuarios, clave] of readme.matchAll(/^\| (`[^|]+`) \| `([^`]+)` \|/gm)) {
  const nombres = [...usuarios.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  const dominio = nombres.map((n) => n.split('@')[1]).find(Boolean) ?? 'dinamyt.com';
  for (const n of nombres) claves[n.endsWith('@') ? n + dominio : n] = clave;
}
const c = (correo) => {
  if (!claves[correo]) throw new Error(`${correo} no está en la tabla del README`);
  return { correo, clave: claves[correo] };
};

const archivo = join(aqui, 'cuentas.json');
const previas = existsSync(archivo) ? JSON.parse(readFileSync(archivo, 'utf8')) : {};
const cuentas = {
  ...previas,
  portal: { super: c('admin@dinamyt.com'), orgadmin: c('orgadmin@dinamyt.com'), maestro: c('maestro@dinamyt.com'), alumno: c('alumno1@dinamyt.com') },
  campeonatos: { super: c('admin@dinamyt.com'), coach: c('coach@dinamyt.com'), juez: c('juez@dinamyt.com'), competidor: c('competidor@dinamyt.com') },
  academy: { super: c('admin@dinamyt.com'), profesor: c('profesor@dinamyt.com'), estudiante: c('estudiante@dinamyt.com') },
};
writeFileSync(archivo, JSON.stringify(cuentas, null, 1));
console.log(`cuentas.json: ${Object.keys(cuentas).join(', ')}`);
