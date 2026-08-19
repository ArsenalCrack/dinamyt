/**
 * Límite de intentos de login (ventana deslizante, en memoria).
 *
 * Pensado para un proceso único, que es como se despliega esta API. Si algún
 * día corre con varios workers, el contador deja de ser global y habría que
 * moverlo a un backend compartido (Redis).
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

interface Registro {
  marcas: number[];
  ventanaMs: number;
}

const intentos = new Map<string, Registro>();

/** Tope de claves en memoria, para que no crezca sin control. */
const MAX_CLAVES = 10_000;

function podar(ahora: number) {
  if (intentos.size <= MAX_CLAVES) return;
  for (const [clave, reg] of intentos) {
    const vigentes = reg.marcas.filter((t) => ahora - t < reg.ventanaMs);
    if (vigentes.length) intentos.set(clave, { ...reg, marcas: vigentes });
    else intentos.delete(clave);
  }
}

/**
 * Registra un intento y devuelve `true` si la clave YA superó el límite.
 * `clave` identifica el sujeto: `login:correo@x.com` o `login-ip:1.2.3.4`.
 */
export function intentoBloqueado(
  clave: string,
  maxIntentos: number,
  ventanaSeg: number,
): boolean {
  const ahora = Date.now();
  const ventanaMs = ventanaSeg * 1000;
  const previo = intentos.get(clave);
  const marcas = (previo?.marcas ?? []).filter((t) => ahora - t < ventanaMs);

  if (marcas.length >= maxIntentos) {
    intentos.set(clave, { marcas, ventanaMs });
    return true;
  }

  marcas.push(ahora);
  intentos.set(clave, { marcas, ventanaMs });
  podar(ahora);
  return false;
}

/** Borra los intentos de una clave (tras un login correcto). */
export function limpiarIntentos(clave: string) {
  intentos.delete(clave);
}

/** Segundos que faltan para que la clave vuelva a admitir intentos. */
export function segundosRestantes(clave: string): number {
  const reg = intentos.get(clave);
  if (!reg?.marcas.length) return 0;
  const masViejo = Math.min(...reg.marcas);
  return Math.max(0, Math.ceil((reg.ventanaMs - (Date.now() - masViejo)) / 1000));
}

/** Solo para tests: deja el contador en blanco. */
export function reiniciarLimites() {
  intentos.clear();
}

// ─────────────────────────────────────────────────────────────────────────────
//  Límites de tráfico general (no solo login)
// ─────────────────────────────────────────────────────────────────────────────

function responder429(reply: FastifyReply, espera: number) {
  return reply
    .code(429)
    .header('Retry-After', String(espera))
    .send({ error: `Demasiadas peticiones. Intenta de nuevo en ${espera} segundos.` });
}

/**
 * preHandler que limita un endpoint por IP.
 *
 * Para lo que cuesta caro aunque venga con token (reportes, importaciones,
 * envío de avisos): el tope del login no cubre nada de eso.
 */
export function limitarPorIp(nombre: string, maxPeticiones: number, ventanaSeg: number) {
  return async function (req: FastifyRequest, reply: FastifyReply) {
    const clave = `rl:${nombre}:${req.ip || '?'}`;
    if (intentoBloqueado(clave, maxPeticiones, ventanaSeg)) {
      return responder429(reply, Math.max(segundosRestantes(clave), 1));
    }
  };
}

/**
 * Techo global por IP. Generoso a propósito: no busca afinar el uso normal,
 * sino que nadie barra la API entera ni martille una ruta que se nos pasara.
 */
export const GLOBAL_MAX_POR_MINUTO = 600;

export function registrarLimiteGlobal(app: FastifyInstance, max = GLOBAL_MAX_POR_MINUTO) {
  app.addHook('onRequest', async (req, reply) => {
    // El preflight de CORS lo manda el navegador solo: ni consume cupo ni
    // debería recibir un 429 que reviente la petición real que viene detrás.
    if (req.method === 'OPTIONS') return;
    const clave = `rl:global:${req.ip || '?'}`;
    if (intentoBloqueado(clave, max, 60)) {
      return responder429(reply, Math.max(segundosRestantes(clave), 1));
    }
  });
}
