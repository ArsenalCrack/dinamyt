import { crearServidorCombate } from './server';

const port = parseInt(process.env.PORT ?? '3005', 10);
crearServidorCombate(port);
console.log(`DINAMYT Campeonatos Combat (WebSocket) en ws://localhost:${port}`);
