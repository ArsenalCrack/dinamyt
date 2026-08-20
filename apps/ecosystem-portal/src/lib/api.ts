'use client';

import axios from 'axios';

const API_URL =
  process.env.NEXT_PUBLIC_ECOSYSTEM_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 60000,
});
api.interceptors.request.use((config) => {
  const t = obtenerToken();
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

/**
 * Sesión expirada / token inválido → limpiar sesión y volver al login (nunca
 * en el propio /auth/login ni si ya estás en /login).
 */
api.interceptors.response.use(
  (r) => r,
  (error: unknown) => {
    if (
      axios.isAxiosError(error) &&
      error.response?.status === 401 &&
      !error.config?.url?.includes('/auth/login') &&
      typeof window !== 'undefined' &&
      window.location.pathname !== '/login'
    ) {
      cerrarSesion();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

const TOKEN_KEY = 'dinamyt_token';
const PENDING_USER_KEY = 'dinamyt_pending_user';

/**
 * Margen contra el reloj del navegador. Un reloj adelantado unos segundos
 * respecto al servidor daría por viva una sesión que la API ya rechaza; es
 * preferible darla por muerta un poco antes de tiempo.
 */
const MARGEN_EXPIRACION_SEG = 30;

export function guardarToken(token: string) {
  if (typeof window !== 'undefined') localStorage.setItem(TOKEN_KEY, token);
}

/**
 * ¿Este token todavía vale como sesión?
 *
 * Solo mira la fecha de caducidad: la firma la comprueba la API, y aquí no hay
 * llave con la que hacerlo. Es suficiente para lo que se usa — no dejar pasar
 * como sesión algo que ya está muerto.
 */
export function tokenVigente(token: string): boolean {
  const p = decodificarToken(token);
  // Sin `exp` no es un token nuestro: todos los que firma el ecosystem lo
  // llevan (ver `jwt.service.ts`).
  if (!p || typeof p.exp !== 'number') return false;
  return p.exp * 1000 > Date.now() + MARGEN_EXPIRACION_SEG * 1000;
}

/**
 * El token de la sesión, o `null` si no hay o si ya caducó.
 *
 * **Que haya una cadena guardada no significa que haya sesión**, y confundir
 * las dos cosas es lo que provocaba el bucle: con un token de ayer en
 * `localStorage`, todas las pantallas se daban por autorizadas, pedían datos a
 * la API, recibían 401 y rebotaban al login… que volvía a encontrar el mismo
 * token y volvía a entregarlo. Un token caducado se borra aquí mismo, así que
 * el rebote pasa una vez y no vuelve.
 */
export function obtenerToken(): string | null {
  if (typeof window === 'undefined') return null;
  const t = localStorage.getItem(TOKEN_KEY);
  if (!t) return null;
  if (!tokenVigente(t)) {
    localStorage.removeItem(TOKEN_KEY);
    return null;
  }
  return t;
}

/** El payload de la sesión viva, o `null`. Para pintar quién está dentro. */
export function sesionActual(): TokenPayload | null {
  const t = obtenerToken();
  return t ? decodificarToken(t) : null;
}
export function cerrarSesion() {
  if (typeof window !== 'undefined') localStorage.removeItem(TOKEN_KEY);
}
export function guardarUsuarioPendiente(userId: string) {
  if (typeof window !== 'undefined')
    localStorage.setItem(PENDING_USER_KEY, userId);
}
export function obtenerUsuarioPendiente(): string | null {
  return typeof window !== 'undefined'
    ? localStorage.getItem(PENDING_USER_KEY)
    : null;
}

export interface TokenPayload {
  sub: string;
  email: string;
  fullName: string;
  org_id: string | null;
  app_scopes: string[];
  role_academy: string | null;
  role_campeonatos: string | null;
  role_membresias: string | null;
  is_super_admin: boolean;
  exp?: number;
}

/** Decodifica (sin verificar) el payload del JWT, solo para mostrar datos en UI. */
export function decodificarToken(token: string): TokenPayload | null {
  try {
    const base = token.split('.')[1];
    const json = atob(base.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as TokenPayload;
  } catch {
    return null;
  }
}

export async function loginAPI(email: string, password: string) {
  const res = await api.post('/auth/login', { email, password });
  return res.data as { access_token: string };
}

export async function registerAPI(data: {
  email: string;
  password: string;
  fullName: string;
  documentId: string;
  phone?: string;
  dataConsent: boolean;
}) {
  const res = await api.post('/auth/register', data);
  return res.data as { message: string; userId: string };
}

/**
 * Canjea el enlace de invitación del maestro (camino B): pone la contraseña y
 * da el correo por verificado en el mismo acto. No necesita sesión —quien lo
 * usa todavía no puede iniciar sesión—: lo que autoriza es el token del enlace.
 */
export async function ponerContrasenaAPI(token: string, password: string) {
  const res = await api.post('/auth/set-password', { token, password });
  return res.data as { message: string; email: string };
}

export async function verifyEmailAPI(userId: string, code: string) {
  const res = await api.post('/auth/verify-email', { userId, code });
  return res.data as { message: string };
}

export interface Plan {
  id: string;
  name: string;
  description: string | null;
  appsIncluded: string[];
  priceMonthly: string | null;
  priceAnnual: string | null;
  maxUsers: number | null;
}

export async function listPlanesAPI(): Promise<Plan[]> {
  const res = await api.get('/subscription-plans');
  return res.data as Plan[];
}

// ── Administración del ecosistema (solo super admin) ────────────────────────
export interface Organizacion {
  id: string;
  name: string;
  type: 'FEDERATION' | 'LEAGUE' | 'CLUB' | 'ACADEMY';
  city: string | null;
  country: string | null;
}
export interface Miembro {
  memberId: string;
  /** Rol GENERAL en la organización: el del portal, quién gestiona el club. */
  role: string;
  /**
   * Rol dentro de cada app, o `null` si no participa en ella. Es la verdad de
   * cada producto y NO tiene por qué coincidir con el general: la misma
   * persona es alumno de su club y juez en un campeonato. Se enseñan en
   * pantalla para que nadie tenga que adivinar cuál está mirando.
   */
  roleMembresias?: string | null;
  roleCampeonatos?: string | null;
  roleAcademy?: string | null;
  userId: string;
  email: string;
  fullName: string;
  avatarUrl?: string | null;
}
export interface SuscripcionOrg {
  id: string;
  status: string;
  startsAt: string;
  endsAt: string;
  totalAmount: string | null;
  paidAmount: string | null;
  paymentStatus: string;
  orgId: string;
  orgName: string;
  planName: string;
  appsIncluded: string[];
}
export interface SuscripcionPersonal {
  id: string;
  status: string;
  startsAt: string;
  endsAt: string;
  userEmail: string;
  userFullName: string;
  planName: string;
  appsIncluded: string[];
}

export interface UsuarioBusqueda {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean | null;
  membresias: { org: string; role: string }[];
}
export interface MiOrganizacion extends Organizacion {
  isActive: boolean | null;
  myRole: string;
  description: string | null;
  address: string | null;
  schedule: string | null;
  phone: string | null;
  email: string | null;
  logoUrl: string | null;
  socialLinks: string[] | null;
  hijas: (Organizacion & { isActive: boolean | null })[];
}

export const listOrganizacionesAPI = async (): Promise<Organizacion[]> =>
  (await api.get('/organizations')).data;
export const misOrganizacionesAPI = async (): Promise<MiOrganizacion[]> =>
  (await api.get('/organizations/mias')).data;
export const buscarUsuariosAPI = async (search: string): Promise<UsuarioBusqueda[]> =>
  (await api.get('/organizations/usuarios', { params: { search } })).data;
export const grantAccessAPI = async (
  orgId: string,
  data: { email: string; role: string; app: string },
): Promise<{ email: string; role: string; app: string; suscripcionCreada: boolean }> =>
  (await api.post(`/organizations/${orgId}/grant-access`, data)).data;
export const crearClubHijoAPI = async (
  parentId: string,
  data: { name: string; type: Organizacion['type']; city?: string },
) => (await api.post(`/organizations/${parentId}/hijas`, data)).data;
export const setOrgActivaAPI = async (orgId: string, isActive: boolean) =>
  (await api.patch(`/organizations/${orgId}`, { isActive })).data;
export const eliminarOrgAPI = async (orgId: string) =>
  (await api.delete(`/organizations/${orgId}`)).data;
export const crearOrganizacionAPI = async (data: {
  name: string;
  type: Organizacion['type'];
  city?: string;
  country?: string;
}): Promise<Organizacion> => (await api.post('/organizations', data)).data;
export const listMiembrosAPI = async (orgId: string): Promise<Miembro[]> =>
  (await api.get(`/organizations/${orgId}/members`)).data;
export const invitarMiembroAPI = async (
  orgId: string,
  email: string,
  role: string,
) => (await api.post(`/organizations/${orgId}/invite`, { email, role })).data;
export const cambiarRolMiembroAPI = async (
  orgId: string,
  userId: string,
  role: string,
) => (await api.patch(`/organizations/${orgId}/members/${userId}`, { role })).data;
export const quitarMiembroAPI = async (orgId: string, userId: string) =>
  (await api.delete(`/organizations/${orgId}/members/${userId}`)).data;
export const listSuscripcionesAPI = async (): Promise<SuscripcionOrg[]> =>
  (await api.get('/subscriptions')).data;
export const crearSuscripcionOrgAPI = async (data: {
  orgId: string;
  planId: string;
  startsAt: string;
  endsAt: string;
  totalAmount?: string;
}) => (await api.post('/subscriptions', data)).data;
export const activarSuscripcionAPI = async (id: string) =>
  (await api.patch(`/subscriptions/${id}/status`, { status: 'ACTIVE' })).data;
export const listSuscripcionesPersonalesAPI = async (): Promise<
  SuscripcionPersonal[]
> => (await api.get('/subscriptions/user')).data;
export const crearSuscripcionPersonalAPI = async (data: {
  userEmail: string;
  planId: string;
  startsAt: string;
  endsAt: string;
}) => (await api.post('/subscriptions/user', data)).data;

// ── Mi club (la ficha la llena el maestro; la ven todos sus miembros) ───────
export interface GestorClub {
  role: string;
  fullName: string;
  email: string;
  phone: string | null;
  avatarUrl?: string | null;
}
export interface MiClub extends Organizacion {
  description: string | null;
  address: string | null;
  schedule: string | null;
  email: string | null;
  phone: string | null;
  logoUrl: string | null;
  socialLinks: string[] | null;
  isActive: boolean | null;
  myRole: string;
  gestores: GestorClub[];
  organizacionPadre: string | null;
}
export interface ClubBusqueda {
  id: string;
  name: string;
  type: string;
  city: string | null;
  parentId: string | null;
}
export interface InvitacionClub {
  id: string;
  status: string;
  createdAt: string;
  orgId?: string;
  orgName?: string;
  orgType?: string;
  clubId?: string;
  clubName?: string;
  clubCity?: string;
  respondedAt?: string | null;
}

export const miClubAPI = async (): Promise<MiClub[]> =>
  (await api.get('/organizations/mi-club')).data;
export const crearMiClubAPI = async (data: {
  name: string;
  city?: string;
  country?: string;
  description?: string;
  phone?: string;
  logoUrl?: string;
  socialLinks?: string[];
}) => (await api.post('/organizations/mi-club', data)).data;

// ── Catálogo geográfico (lo sirve campeonatos-api; endpoint público) ────────
const CAMPEONATOS_API_URL =
  process.env.NEXT_PUBLIC_CAMPEONATOS_API_URL || 'http://localhost:3002';
export interface Pais {
  iso2: string;
  nombre: string;
}
export const listPaisesAPI = async (): Promise<Pais[]> =>
  (await axios.get(`${CAMPEONATOS_API_URL}/geo/paises`)).data;
export const listCiudadesAPI = async (iso2: string): Promise<string[]> =>
  (await axios.get(`${CAMPEONATOS_API_URL}/geo/ciudades`, { params: { pais: iso2 } }))
    .data;
export const listarClubesAPI = async (search?: string): Promise<ClubBusqueda[]> =>
  (await api.get('/organizations/clubes', { params: { search } })).data;
export const actualizarOrgInfoAPI = async (
  orgId: string,
  data: {
    name?: string;
    description?: string | null;
    address?: string | null;
    schedule?: string | null;
    phone?: string | null;
    email?: string | null;
    city?: string | null;
    country?: string | null;
    logoUrl?: string | null;
    socialLinks?: string[] | null;
  },
) => (await api.patch(`/organizations/${orgId}`, data)).data;
export const invitarClubAPI = async (orgId: string, clubId: string) =>
  (await api.post(`/organizations/${orgId}/invitar-club`, { clubId })).data;
export const invitacionesClubEnviadasAPI = async (
  orgId: string,
): Promise<InvitacionClub[]> =>
  (await api.get(`/organizations/${orgId}/invitaciones-club`)).data;
export const misInvitacionesClubAPI = async (): Promise<InvitacionClub[]> =>
  (await api.get('/organizations/invitaciones-club/mias')).data;
export const responderInvitacionClubAPI = async (id: string, aceptar: boolean) =>
  (await api.post(`/organizations/invitaciones-club/${id}/responder`, { aceptar })).data;

// ── Cuentas bloqueadas por intentos fallidos (panel super admin) ────────────
export interface CuentaBloqueada {
  id: string;
  email: string;
  fullName: string;
  failedLoginAttempts: number | null;
  lockedUntil: string | null;
}
export const listarBloqueadosAPI = async (): Promise<CuentaBloqueada[]> =>
  (await api.get('/users/bloqueados')).data;
export const desbloquearUsuarioAPI = async (userId: string) =>
  (await api.post(`/users/${userId}/desbloquear`)).data;

/** Extrae el mensaje de error del backend ({error} propio o {message} de Nest). */
/**
 * El mensaje que se le enseña a la persona cuando la API dice que no.
 *
 * **El orden importa, y estaba al revés.** NestJS responde así:
 *
 *     { "message": "Contraseña incorrecta. Te quedan 4 intentos…",
 *       "error": "Unauthorized", "statusCode": 401 }
 *
 * `error` es el nombre del código HTTP, no una explicación. Mirándolo primero,
 * TODOS los fallos del portal se veían como «Unauthorized» o «Bad Request», y
 * la explicación de verdad —la que dice si el correo no existe, si la
 * contraseña falló, si la cuenta está suspendida o cuántos intentos quedan— se
 * tiraba a la basura. Primero `message`; `error` solo como último recurso,
 * para las APIs que sí lo usan como texto (Membresías y Campeonatos).
 */
export function extraerError(e: unknown, fallback: string): string {
  if (axios.isAxiosError(e)) {
    const data = e.response?.data as
      | { error?: string; message?: string | string[] }
      | undefined;
    if (typeof data?.message === 'string' && data.message) return data.message;
    if (Array.isArray(data?.message) && data.message.length) {
      return data.message.join(' ');
    }
    // Solo si no hay mensaje: y nunca el nombre del código HTTP a secas, que no
    // le dice nada a nadie.
    const generico = ['Unauthorized', 'Bad Request', 'Forbidden', 'Not Found'];
    if (typeof data?.error === 'string' && !generico.includes(data.error)) {
      return data.error;
    }
  }
  return fallback;
}

export default api;
