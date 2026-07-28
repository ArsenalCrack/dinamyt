import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

/**
 * El orden de las migraciones, vigilado.
 *
 * **Por qué existe este archivo.** El migrador de Drizzle no aplica las
 * migraciones por número de archivo: aplica las que tienen un `when` MAYOR que
 * el de la última que ya corrió, y guarda ese número en su tabla de control.
 * Si una migración nueva nace con un `when` más bajo que la anterior, el
 * migrador la da por aplicada y **no la ejecuta nunca**. Sin error, sin aviso:
 * la columna no aparece y la API revienta con un 500 en la primera consulta
 * que la use.
 *
 * Y pasa de verdad: las migraciones 0003 a 0005 llevan marcas escritas a mano
 * con fechas futuras, así que TODA migración generada por `drizzle-kit` desde
 * entonces nace por debajo y hay que subirle el `when` a mano.
 *
 * **Por qué no se renumeran esas tres y ya.** Porque bajarlas rompería las
 * bases que ya las aplicaron: la tabla de control guarda el número viejo, y
 * cualquier migración futura con un `when` menor que ese quedaría ignorada
 * para siempre. La marca de una migración publicada es historia, no
 * configuración.
 *
 * Así que la regla se vigila en vez de arreglarse: si este test falla, súbele
 * el `when` a la migración nueva por encima de la anterior y listo.
 */

const CARPETA = join(__dirname, '..', 'drizzle', 'migrations');

interface Entrada {
  idx: number;
  when: number;
  tag: string;
}

const journal = JSON.parse(
  readFileSync(join(CARPETA, 'meta', '_journal.json'), 'utf8'),
) as { entries: Entrada[] };

describe('migraciones', () => {
  it('cada `when` es mayor que el de la migración anterior', () => {
    const desordenadas = journal.entries
      .map((e, i) => ({ e, previa: journal.entries[i - 1] }))
      .filter(({ e, previa }) => previa && e.when <= previa.when)
      .map(
        ({ e, previa }) =>
          `${e.tag} (${e.when}) no supera a ${previa.tag} (${previa.when})`,
      );

    expect(
      desordenadas,
      'Drizzle ignoraría en silencio estas migraciones. Súbeles el `when` en meta/_journal.json.',
    ).toEqual([]);
  });

  it('los índices van correlativos desde cero', () => {
    expect(journal.entries.map((e) => e.idx)).toEqual(
      journal.entries.map((_, i) => i),
    );
  });

  it('cada entrada del journal tiene su archivo .sql, y al revés', () => {
    const enDisco = readdirSync(CARPETA)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => f.replace(/\.sql$/, ''))
      .sort();
    const enJournal = journal.entries.map((e) => e.tag).sort();
    expect(enDisco).toEqual(enJournal);
  });
});
