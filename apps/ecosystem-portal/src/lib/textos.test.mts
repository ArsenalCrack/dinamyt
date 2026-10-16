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

const valores = [...fuente.matchAll(/^\s*'([\w.]+)':\s*(['"`])(.*?)\2,?\s*$/gm)].map(
  ([, clave, , texto]) => ({ clave, texto }),
);

test('se leen los textos', () => {
  assert.ok(valores.length > 500, `solo ${valores.length}`);
});

test('ningún texto lleva raya larga', () => {
  const conRaya = valores.filter((v) => v.texto.includes('—')).map((v) => v.clave);
  assert.deepEqual(conRaya, []);
});

test('cada clave está en los dos idiomas', () => {
  const cuantas = new Map<string, number>();
  for (const { clave } of valores) cuantas.set(clave, (cuantas.get(clave) ?? 0) + 1);
  const cojas = [...cuantas].filter(([, n]) => n % 2 !== 0).map(([c]) => c);
  assert.deepEqual(cojas, []);
});
