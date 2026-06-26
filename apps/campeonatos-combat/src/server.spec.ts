import { describe, it, expect } from 'vitest';
import { WebSocket } from 'ws';
import type { AddressInfo } from 'net';
import { crearServidorCombate } from './server';

describe('servidor de combate (WebSocket)', () => {
  it('envía el estado inicial y refleja una acción a la sala', async () => {
    const wss = crearServidorCombate(0); // puerto efímero
    await new Promise<void>((r) => wss.on('listening', () => r()));
    const port = (wss.address() as AddressInfo).port;

    const ws = new WebSocket(`ws://localhost:${port}?combate=t1`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mensajes: any[] = [];
    let resolverDos: (() => void) | null = null;
    ws.on('message', (d) => {
      mensajes.push(JSON.parse(d.toString()));
      if (mensajes.length >= 2 && resolverDos) resolverDos();
    });

    await new Promise<void>((r) => ws.on('open', () => r()));
    ws.send(
      JSON.stringify({
        accion: 'punto_juez',
        juez: 'j1',
        color: 'hong',
        pts: 2,
        nombre: 'Patada',
      }),
    );
    await new Promise<void>((res) => {
      resolverDos = res;
      if (mensajes.length >= 2) res();
    });

    expect(mensajes[0].estado.numJueces).toBe(4);
    expect(mensajes[1].estado.jueces.j1.hong).toBe(2);

    ws.close();
    await new Promise<void>((r) => wss.close(() => r()));
  });
});
