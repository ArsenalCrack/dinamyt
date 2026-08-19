import { randomBytes, timingSafeEqual } from 'crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../../config';

/**
 * Sesión en cookie httpOnly.
 *
 * Por qué no `localStorage`: cualquier script que llegue a ejecutarse en la
 * página lo lee entero y se lleva el token. Una cookie httpOnly no es visible
 * desde JavaScript, así que un XSS puede actuar mientras la víctima tiene la
 * pestaña abierta, pero no robar la sesión y usarla desde otro sitio.
 *
 * Lo que cuesta: las cookies viajan solas en cada petición, y eso abre la
 * puerta al CSRF. De ahí el token de doble envío de más abajo.
 */

export const COOKIE_SESION = 'membresias_session';
export const COOKIE_CSRF = 'membresias_csrf';

/** Métodos que cambian estado y por tanto exigen comprobación de CSRF. */
const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

function opcionesBase() {
  return {
    path: '/',
    sameSite: config.cookieSameSite,
    secure: config.cookieSecure,
    maxAge: config.jwtExpiresIn,
  } as const;
}

/**
 * Deja la sesión en el navegador: el token en cookie httpOnly y, al lado, un
 * valor de CSRF que SÍ es legible por JavaScript — el cliente tiene que poder
 * copiarlo a una cabecera.
 */
export function darSesion(reply: FastifyReply, token: string): string {
  const csrf = randomBytes(32).toString('base64url');
  reply.setCookie(COOKIE_SESION, token, { ...opcionesBase(), httpOnly: true });
  reply.setCookie(COOKIE_CSRF, csrf, { ...opcionesBase(), httpOnly: false });
  return csrf;
}

export function cerrarSesion(reply: FastifyReply) {
  const { maxAge: _ignorado, ...opciones } = opcionesBase();
  reply.clearCookie(COOKIE_SESION, opciones);
  reply.clearCookie(COOKIE_CSRF, opciones);
}

/** Token del request: cabecera Authorization si viene, si no la cookie. */
export function tokenDelRequest(req: FastifyRequest): string | null {
  const cabecera = req.headers.authorization;
  if (cabecera?.startsWith('Bearer ')) return cabecera.slice(7);
  return req.cookies?.[COOKIE_SESION] ?? null;
}

function igualesEnTiempoConstante(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Comprobación de CSRF por doble envío.
 *
 * Solo aplica a lo que se autentica POR COOKIE: si el request trae
 * `Authorization`, el navegador no la pone solo en una petición de otro sitio,
 * así que ahí no hay CSRF que valga.
 *
 * La idea: el atacante puede provocar que el navegador ENVÍE la cookie, pero no
 * puede leerla desde su dominio, así que no sabe qué poner en la cabecera.
 */
export function csrfValido(req: FastifyRequest): boolean {
  if (METODOS_SEGUROS.has(req.method)) return true;
  if (req.headers.authorization?.startsWith('Bearer ')) return true;
  if (!req.cookies?.[COOKIE_SESION]) return true; // no hay sesión por cookie

  const enCookie = req.cookies?.[COOKIE_CSRF];
  const enCabecera = req.headers['x-csrf-token'];
  if (!enCookie || typeof enCabecera !== 'string' || !enCabecera) return false;
  return igualesEnTiempoConstante(enCookie, enCabecera);
}
