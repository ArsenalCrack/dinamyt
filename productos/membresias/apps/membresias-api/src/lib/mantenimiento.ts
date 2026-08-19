import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { appSettings, users, type Db } from '@dinamyt/membresias-db';
import { tokenDelRequest } from './auth/cookies';
import { sinFiltroDeClub } from './db-contexto';

/**
 * Modo mantenimiento: cerrar la aplicación mientras se sube una actualización.
 *
 * Lo enciende el SUPERADMIN con un botón. Mientras está activo, la API responde
 * 503 a todo el mundo menos a él, y la web enseña una pantalla de «estamos
 * actualizando» en vez de dejar a la gente a medias.
 *
 * Por qué existe: un despliegue reinicia la API y reemplaza la web. Quien
 * estaba registrando un pago o pasando lista en ese momento se encontraba
 * errores sueltos, formularios que no guardaban y una pantalla con código viejo
 * hablando con un servidor nuevo. Avisar antes y cerrar la puerta un minuto es
 * la diferencia entre una actualización y un susto.
 *
 * Qué NO hace: no cierra la sesión de nadie. Al apagarlo, cada quien sigue
 * donde estaba — las pantallas vuelven solas.
 *
 * ── Dónde vive el interruptor ──
 * En la base de datos (`app_settings`), no en memoria: el proceso se reinicia
 * justo durante la actualización, y un interruptor en memoria se apagaría solo
 * en el peor momento posible, con la versión nueva arrancando y la puerta
 * abierta.
 *
 * En memoria hay solo una caché de unos segundos para no consultar la tabla en
 * cada petición. Escribir la invalida, así que el botón hace efecto al instante
 * en el proceso que lo pulsa; con varias instancias, el resto tarda como mucho
 * `CACHE_MS`.
 */

/** Clave de la fila en `app_settings`. */
export const CLAVE = 'mantenimiento';

/** Cuánto se reutiliza el valor leído. Es un techo, no un retardo. */
const CACHE_MS = 5000;

export interface EstadoMantenimiento {
  activo: boolean;
  /** Aviso que escribió el superadmin, o `null` para el texto por defecto. */
  mensaje: string | null;
  /** ISO-8601 de cuándo se encendió, o `null` si está apagado. */
  desde: string | null;
}

const APAGADO: EstadoMantenimiento = { activo: false, mensaje: null, desde: null };

/**
 * Rutas que siguen funcionando con el mantenimiento puesto. Son las mínimas
 * para que el superadmin pueda entrar y apagarlo, y para que la web sepa que el
 * corte es un mantenimiento y no un servidor caído:
 *   · el propio estado, que es lo que consulta la pantalla de aviso;
 *   · el login y el logout, o el superadmin se quedaría fuera de su botón;
 *   · `/auth/me`, porque la web lo llama al arrancar y un fallo ahí cierra la
 *     sesión de todos — justo lo que este modo intenta evitar;
 *   · `/health`, que es como se comprueba desde fuera que el servicio vive.
 */
const RUTAS_LIBRES = new Set([
  '/health',
  '/maintenance',
  '/auth/login',
  '/auth/logout',
  '/auth/me',
  '/auth/config',
]);

// La caché guarda de qué BD salió el valor: los tests construyen varias apps,
// cada una con su PGlite, y sin esto la segunda heredaría el estado de la
// primera.
let cache: { db: Db; valor: EstadoMantenimiento; leidoEn: number } | null = null;

/** Olvida el valor cacheado. Lo llama quien escribe el ajuste (y los tests). */
export function invalidarCache(): void {
  cache = null;
}

function normalizar(valor: unknown): EstadoMantenimiento {
  if (!valor || typeof valor !== 'object') return { ...APAGADO };
  const v = valor as Partial<EstadoMantenimiento>;
  return {
    activo: Boolean(v.activo),
    mensaje: v.mensaje || null,
    desde: v.desde || null,
  };
}

/**
 * Estado actual del mantenimiento.
 *
 * Nunca lanza: si la tabla todavía no existe o la base no responde, se
 * responde «apagado». Un fallo aquí no puede cerrar la aplicación entera —
 * sería exactamente lo contrario de lo que este módulo viene a hacer.
 */
export async function estado(db: Db): Promise<EstadoMantenimiento> {
  const ahora = Date.now();
  if (cache && cache.db === db && ahora - cache.leidoEn < CACHE_MS) {
    return cache.valor;
  }

  let valor: EstadoMantenimiento;
  try {
    // Sin filtro de club: este ajuste no es de ninguno (ver la política de RLS
    // en `0012_modo_mantenimiento.sql`).
    const [fila] = await sinFiltroDeClub(db, (tx) =>
      tx.select().from(appSettings).where(eq(appSettings.key, CLAVE)).limit(1),
    );
    valor = normalizar(fila?.value);
  } catch {
    valor = { ...APAGADO };
  }

  cache = { db, valor, leidoEn: ahora };
  return valor;
}

/** Enciende o apaga el mantenimiento. Devuelve el estado resultante. */
export async function fijar(
  db: Db,
  activo: boolean,
  mensaje: string | null,
  usuarioId: string | null,
): Promise<EstadoMantenimiento> {
  const anterior = await estado(db);
  // `desde` marca cuándo se encendió ESTA vez. Volver a guardar con el
  // mantenimiento ya puesto (p. ej. para cambiar el aviso) no reinicia el
  // reloj: si no, el aviso mentiría sobre cuánto lleva cerrado.
  const valor: EstadoMantenimiento = {
    activo,
    mensaje: (mensaje ?? '').trim() || null,
    desde: activo ? (anterior.desde ?? new Date().toISOString()) : null,
  };

  await sinFiltroDeClub(db, (tx) =>
    tx
      .insert(appSettings)
      .values({ key: CLAVE, value: valor, updatedById: usuarioId, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: valor, updatedById: usuarioId, updatedAt: new Date() },
      }),
  );

  invalidarCache();
  return valor;
}

/**
 * `true` si quien hace el request es el superadmin.
 *
 * Se relee de la BD y no se cree al token: si a alguien le quitaron el
 * superadmin ayer, su token de hoy todavía lo diría. Solo se llama cuando el
 * mantenimiento está puesto, así que no pesa en el uso normal.
 */
export async function esSuperAdminDelRequest(
  app: FastifyInstance,
  req: FastifyRequest,
): Promise<boolean> {
  const token = tokenDelRequest(req);
  if (!token) return false;
  try {
    const payload = await app.verifyToken(token);
    const correo = (payload.email ?? '').toLowerCase();
    if (!correo) return false;
    const [fila] = await sinFiltroDeClub(app.db, (tx) =>
      tx
        .select({ isSuperAdmin: users.isSuperAdmin, isActive: users.isActive })
        .from(users)
        .where(eq(users.email, correo))
        .limit(1),
    );
    return Boolean(fila?.isActive && fila.isSuperAdmin);
  } catch {
    return false;
  }
}

/** Cuerpo del 503 que ve todo el que no es el superadmin. */
export function cuerpo503(actual: EstadoMantenimiento) {
  return {
    error:
      actual.mensaje ??
      'La aplicación está en mantenimiento. Vuelve a intentarlo en unos minutos.',
    // Lo que distingue esto de un servidor caído: la web lo mira para enseñar
    // la pantalla de mantenimiento en vez de un error de conexión.
    mantenimiento: true,
    desde: actual.desde,
  };
}

/** Cierra la API mientras el mantenimiento esté puesto. */
export function registrarModoMantenimiento(app: FastifyInstance): void {
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.method === 'OPTIONS') return;
    const ruta = req.routeOptions?.url ?? req.url.split('?')[0];
    if (RUTAS_LIBRES.has(ruta)) return;

    const actual = await estado(app.db);
    if (!actual.activo) return;
    if (await esSuperAdminDelRequest(app, req)) return;

    return reply.code(503).header('Retry-After', '60').send(cuerpo503(actual));
  });
}
