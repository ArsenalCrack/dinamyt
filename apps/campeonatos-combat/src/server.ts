import { WebSocketServer, WebSocket } from 'ws';
import type { EventoCombate } from '@dinamyt/campeonatos-core';
import { Salas } from './rooms';

/**
 * Crea el servidor WebSocket de combate. Cada conexión indica su combate por
 * query (`?combate=<id>`); recibe el estado actual al conectar y, ante cada
 * evento, el servidor aplica el motor y reenvía el nuevo estado a toda la sala.
 */
export function crearServidorCombate(port: number): WebSocketServer {
  const wss = new WebSocketServer({ port });
  const salas = new Salas();
  const clientes = new Map<string, Set<WebSocket>>();

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const combateId = url.searchParams.get('combate') ?? 'default';

    let sala = clientes.get(combateId);
    if (!sala) {
      sala = new Set();
      clientes.set(combateId, sala);
    }
    sala.add(ws);

    ws.send(JSON.stringify({ tipo: 'estado', estado: salas.obtener(combateId) }));

    ws.on('message', (data) => {
      let ev: EventoCombate;
      try {
        ev = JSON.parse(data.toString()) as EventoCombate;
      } catch {
        return; // mensaje inválido: ignorar
      }
      const estado = salas.aplicar(combateId, ev);
      const payload = JSON.stringify({ tipo: 'estado', estado });
      for (const cliente of sala!) {
        if (cliente.readyState === WebSocket.OPEN) cliente.send(payload);
      }
    });

    ws.on('close', () => sala!.delete(ws));
  });

  return wss;
}
