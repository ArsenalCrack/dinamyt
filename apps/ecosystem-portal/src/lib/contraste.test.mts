/**
 * El contraste de la paleta compartida (`packages/shared/estilos.css`), medido
 * con la fórmula de WCAG 2.x en los dos temas.
 *
 * Existe porque cada arreglo de color se comprobaba a mano y se olvidaba: el
 * oro de texto del tema claro pasaba sobre la tarjeta y no sobre el fondo de
 * la página (4.49:1), y el borde de los campos daba 1.22:1. Si alguien toca un
 * token, esto lo dice antes del despliegue.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const css = readFileSync(
  new URL('../../../../packages/shared/estilos.css', import.meta.url),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');

/** Los `--token: #hex;` del primer bloque que abre con ese selector. */
function tokens(selector: string): Record<string, string> {
  const inicio = css.indexOf(`${selector} {`);
  assert.ok(inicio >= 0, `no encuentro el bloque ${selector}`);
  const bloque = css.slice(inicio, css.indexOf('\n}', inicio));
  const t: Record<string, string> = {};
  for (const m of bloque.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) t[m[1]] = m[2];
  return t;
}

function luminancia(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(a: string, b: string): number {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (oscuro + 0.05);
}

const oscuro = tokens(':root');
const claro = { ...oscuro, ...tokens("html[data-theme='light']") };

for (const [tema, c] of [
  ['oscuro', oscuro],
  ['claro', claro],
] as const) {
  test(`tema ${tema}: el texto pasa 4.5:1 en la página y en la tarjeta`, () => {
    for (const fondo of ['bg', 'bg-card']) {
      for (const letra of ['text', 'text-muted', 'gold']) {
        const r = contraste(c[letra], c[fondo]);
        assert.ok(r >= 4.5, `--${letra} sobre --${fondo}: ${r.toFixed(2)}:1`);
      }
    }
  });

  test(`tema ${tema}: el borde de los campos pasa 3:1 (WCAG 1.4.11)`, () => {
    for (const fondo of ['bg', 'bg-card', 'bg-input']) {
      const r = contraste(c['border-campo'], c[fondo]);
      assert.ok(r >= 3, `--border-campo sobre --${fondo}: ${r.toFixed(2)}:1`);
    }
  });
}
