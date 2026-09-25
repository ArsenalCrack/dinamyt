/**
 * La lista blanca de vueltas del portal (`destinoSeguro`).
 *
 * Corre con el `node:test` de Node, sin dependencias: `pnpm test` en este
 * paquete. Es `.mts` para que Next no lo compile con la app (su `tsconfig`
 * mira `*.ts`/`*.tsx`), y Node le quita los tipos al importar `apps.ts`.
 *
 * Lo que se fija: a dónde PUEDE volver una sesión y, sobre todo, a dónde no.
 * Un hueco aquí es un redirector abierto que entrega el pase de DINAMYT.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

// Las direcciones de producción, antes de importar: `apps.ts` las lee al cargar.
process.env.NEXT_PUBLIC_CAMPEONATOS_URL = 'https://campeonatos.dinamyt.org';
process.env.NEXT_PUBLIC_MEMBRESIAS_URL = 'https://membresias.dinamyt.org';
process.env.NEXT_PUBLIC_ACADEMY_URL = 'https://academy.dinamyt.org';

const { destinoSeguro } = await import('./apps.ts');

test('vuelve a las apps del ecosistema', () => {
  assert.deepEqual(destinoSeguro('https://campeonatos.dinamyt.org/login'), {
    url: 'https://campeonatos.dinamyt.org/login',
    nombre: 'Campeonatos',
  });
  assert.equal(destinoSeguro('https://membresias.dinamyt.org/login')?.nombre, 'Membresías');
});

test('vuelve al PC del evento visto desde sí mismo (F8, opción A)', () => {
  for (const url of ['http://localhost:3000/login', 'http://127.0.0.1:3000/login']) {
    assert.deepEqual(destinoSeguro(url), { url, nombre: 'Campeonatos' }, url);
  }
});

test('NO vuelve al PC del evento desde la LAN, ni a otro puerto, ni cifrado raro', () => {
  const prohibidos = [
    'http://192.168.1.10:3000/login', // la IP de la LAN: suplantable en el evento
    'http://10.0.0.5:3000/login',
    'http://localhost:3001/login', // otro puerto es otro programa
    'http://localhost/login',
    'https://localhost:3000/login', // otro origen, aunque parezca más seguro
    'http://[::1]:3000/login',
  ];
  for (const url of prohibidos) assert.equal(destinoSeguro(url), null, url);
});

test('no se deja engañar por direcciones que se parecen', () => {
  const trampas = [
    'http://localhost:3000@malo.example/login', // usuario:clave@host
    'http://localhost.malo.example:3000/login',
    'http://127.0.0.1.malo.example:3000/login',
    'https://campeonatos.dinamyt.org.malo.example/login',
    'https://malo.example/?r=https://campeonatos.dinamyt.org',
    'javascript:alert(1)',
    '//malo.example/login',
    'no es una url',
    '',
  ];
  for (const url of trampas) assert.equal(destinoSeguro(url), null, url);
  assert.equal(destinoSeguro(null), null);
});
