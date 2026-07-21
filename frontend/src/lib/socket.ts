"use client";

import { io, Socket } from "socket.io-client";

// El tiempo real habla DIRECTO con el backend (puerto 5000, mismo host que la
// página) en vez de pasar por el proxy de Next (3000). El proxy solo soporta
// long-polling y, con muchos dispositivos, sus conexiones colgadas lo
// convierten en un punto único de falla: jueces "sin conexión" y pantallas
// atascadas en "Cargando" aunque el backend siga vivo. Directo, la conexión
// sube a WebSocket real (una sola conexión TCP persistente por dispositivo).
// El firewall del puerto 5000 ya lo abre abrir-firewall.bat.
const BACKEND_PORT = process.env.NEXT_PUBLIC_BACKEND_PORT || "5000";

function resolverSocketUrl(): string {
  if (process.env.NEXT_PUBLIC_SOCKET_URL) return process.env.NEXT_PUBLIC_SOCKET_URL;
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:${BACKEND_PORT}`;
  }
  return "http://localhost:5000";
}

const SOCKET_URL = resolverSocketUrl();

let socket: Socket | null = null;
let socketKey: string | null = null;

export function getSocket(
  tatamiId: number | string,
  rol: string,
  token?: string | null,
  nombre?: string
): Socket {
  const nextKey = JSON.stringify({ tatamiId: String(tatamiId), rol, token: token || "", nombre: nombre || "" });

  // Si ya existe una conexión con los mismos params, reutilizarla.
  if (socket && socketKey === nextKey) {
    return socket;
  }

  // Desconectar socket previo
  if (socket) {
    socket.disconnect();
    socket = null;
    socketKey = null;
  }

  const query: Record<string, string> = {
    tatami_id: String(tatamiId),
    rol,
  };
  if (nombre) query.nombre = nombre;

  socket = io(`${SOCKET_URL}/combate`, {
    query,
    // El token viaja en el payload `auth` (no en la URL, donde quedaría
    // registrado en logs de servidores y proxies).
    auth: token ? { token } : undefined,
    // Handshake por polling (funciona en cualquier red) y upgrade inmediato a
    // WebSocket. rememberUpgrade: al reconectar entra directo por WebSocket.
    transports: ["polling", "websocket"],
    upgrade: true,
    rememberUpgrade: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 3000,
    reconnectionAttempts: Infinity,
    timeout: 8000,
  });
  socketKey = nextKey;

  socket.on("connect", () => {
    console.log("[Socket.IO] Conectado al tatami", tatamiId);
  });

  socket.on("disconnect", (reason) => {
    console.log("[Socket.IO] Desconectado:", reason);
  });

  socket.on("connect_error", (err) => {
    console.error("[Socket.IO] Error de conexion:", err.message);
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
    socketKey = null;
  }
}

export function getExistingSocket(): Socket | null {
  return socket;
}
