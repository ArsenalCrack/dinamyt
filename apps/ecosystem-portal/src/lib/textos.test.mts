/**
 * Los textos de la interfaz (`i18n.tsx`), en los dos idiomas.
 *
 * Sin rayas largas (—): la auditoría antislop del 15 oct 2026 quitó doce, y
 * es de las primeras cosas que delatan un texto escrito por una máquina. Y
 * cada clave tiene que estar en los dos idiomas.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const fuente = readFileSync(new URL('./i18n.tsx', import.meta.url), 'utf8')
  // Los comentarios pueden llevar rayas: son para quien programa.
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

// Las claves, tengan el valor en su renglón o en el siguiente.
const claves = [...fuente.matchAll(/^\s*'([\w.]+)':/gm)].map((m) => m[1]);

test('se leen las claves', () => {
  assert.ok(claves.length > 500, `solo ${claves.length}`);
});

test('ningún texto lleva raya larga', () => {
  // Sobre todo el archivo sin comentarios, no solo sobre los valores de un
  // renglón: un texto partido en dos líneas también se ve.
  const renglones = fuente.split(/\r?\n/).filter((l) => l.includes('—'));
  assert.deepEqual(renglones, []);
});

test('cada clave está en los dos idiomas', () => {
  const cuantas = new Map<string, number>();
  for (const clave of claves) cuantas.set(clave, (cuantas.get(clave) ?? 0) + 1);
  const cojas = [...cuantas].filter(([, n]) => n % 2 !== 0).map(([c]) => c);
  assert.deepEqual(cojas, []);
});
