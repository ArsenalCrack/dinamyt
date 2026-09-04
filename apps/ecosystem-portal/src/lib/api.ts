'use client';

import axios from 'axios';
import {
  cabecerasDeZona,
  decodificarToken,
  guardarToken,
  obtenerPaseCrudo,
  obtenerToken,
  olvidarToken,
  type TokenPayload,
} from './sesion';

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
  // Dónde está quien pregunta. El servidor no puede adivinarlo, y de esto
  // dependen las horas de los correos que le va a escribir.
  for (const [k, v] of Object.entries(cabecerasDeZona())) {
    config.headers[k] = v;
  }
  return config;
});

/**
 * Sesión expirada / token inválido → limpiar sesión y volver al login (nunca
 * en el propio /auth/login ni si ya estás en /login).
 *
 * El mensaje del servidor viaja hasta el login. Desde que las sesiones se
 * pueden cerrar, un 401 tiene motivos que a la persona le importan —«se cerró
 * sola tras 20 minutos», «la cerraste desde otro dispositivo», «cambiaste la
 * contraseña»— y tirarlos para enseñar «no autorizado» es lo que hace que la
 * gente crea que la aplicación falla.
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
      const motivo = extraerError(error, '');
      olvidarToken();
      window.location.href = motivo
        ? `/login?motivo=${encodeURIComponent(motivo)}`
        : '/login';
    }
    return Promise.reject(error);
  },
);

/**
 * El registro que espera su código. **Es el CORREO, no un id de usuario.**
 *
 * Antes se guardaba aquí el `userId` que devolvía el registro, y la pantalla de
 * verificación lo enseñaba en un campo etiquetado «ID de usuario» — un dato
 * interno, que no significa nada para quien lo lee y que nadie sabía de dónde
 * sacar si se perdía. Ahora ni existe: la cuenta no se crea hasta que el código
 * se teclea, así que lo único que hay que recordar entre las dos pantallas es a
 * qué correo salió y cuándo caduca.
 */
const PENDING_KEY = 'dinamyt_registro_pendiente';

/**
 * Dónde vive el pase y cuándo se muere: en `lib/sesion.ts`.
 *
 * Se re-exporta desde aquí porque medio portal lo importa de `@/lib/api` desde
 * antes de que existiera ese módulo, y mover cuarenta importaciones para
 * ganar una línea no arregla nada.
 */
export {
  guardarToken,
  obtenerToken,
  obtenerPaseCrudo,
  olvidarToken,
  tokenVigente,
  decodificarToken,
  seRecuerda,
  recordarEnEsteEquipo,
  vigilarSesion,
  marcarActividad,
  INACTIVIDAD_MINUTOS,
  AVISO_SEGUNDOS,
  type TokenPayload,
} from './sesion';

/** El payload de la sesión viva, o `null`. Para pintar quién está dentro. */
export function sesionActual(): TokenPayload | null {
  const t = obtenerToken();
  return t ? decodificarToken(t) : null;
}

/**
 * Cerrar sesión **de verdad**.
 *
 * ── Lo que hacía antes ──
 *
 * Borrar la copia del navegador. Nada más. El pase original seguía siendo
 * válido en el servidor hasta caducar solo, así que quien lo hubiera copiado
 * —o quien se sentara en ese mismo computador y lo sacara del almacén— seguía
 * entrando. «Salir» era una palabra sin acción detrás.
 *
 * Ahora se avisa al servidor para que cierre la fila de la sesión, y a partir
 * de ese momento el pase no vale en ninguna app del ecosistema.
 *
 * ── Por qué se borra lo local ANTES de esperar al servidor ──
 *
 * Porque salir no puede depender de que haya red. Si la llamada falla, la
 * sesión ya no está en este navegador; el servidor la cerrará por inactividad
 * a los veinte minutos. Al revés —esperar y luego borrar— una API caída
 * dejaría a alguien dentro de una cuenta de la que está intentando salir.
 */
export async function cerrarSesion(): Promise<void> {
  // El pase CRUDO, no `obtenerToken()`: ese devuelve `null` en cuanto vence, y
  // sin pase el servidor no sabe qué fila cerrar. El pase dura media hora y la
  // sesión hasta doce, así que el caso «pestaña abierta desde hace un rato» era
  // justo el que dejaba la sesión viva después de salir. La API lo acepta
  // vencido y solo para esto (ver `verificarPaseParaCerrar` en el ecosystem).
  const token = obtenerPaseCrudo();
  olvidarToken();
  if (!token) return;
  try {
    await axios.post(
      `${API_URL}/auth/logout`,
      { token },
      { headers: { Authorization: `Bearer ${token}` }, timeout: 5000 },
    );
  } catch {
    // Ver arriba: el reloj de inactividad del servidor es la red de seguridad.
  }
}

export interface RegistroEnEspera {
  email: string;
  /** ISO. Pasada esta hora el registro ya no existe en el servidor. */
  expiresAt: string;
  /**
   * `false` = la API no tiene proveedor de correo configurado y el código NO
   * salió a ningún sitio (ver `MailerService`: sin `SMTP_HOST` la función de
   * correo no existe, y es un estado válido). Se guarda para poder DECIRLO en
   * la pantalla del código, en vez de dejar a alguien esperando un correo que
   * nadie mandó.
   */
  enviado?: boolean;
}

export function guardarRegistroPendiente(datos: RegistroEnEspera) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(PENDING_KEY, JSON.stringify(datos));
  }
}

/**
 * El registro a la espera, o `null` si no hay o si ya caducó.
 *
 * Caducado se descarta aquí mismo, igual que con el token: enseñar la pantalla
 * de «escribe tu código» para un registro que el servidor ya borró es mandar a
 * alguien a teclear seis dígitos que no van a servir.
 */
export function obtenerRegistroPendiente(): RegistroEnEspera | null {
  if (typeof window === 'undefined') return null;
  const crudo = localStorage.getItem(PENDING_KEY);
  if (!crudo) return null;
  try {
    const datos = JSON.parse(crudo) as RegistroEnEspera;
    if (!datos?.email) return null;
    if (datos.expiresAt && new Date(datos.expiresAt).getTime() < Date.now()) {
      localStorage.removeItem(PENDING_KEY);
      return null;
    }
    return datos;
  } catch {
    localStorage.removeItem(PENDING_KEY);
    return null;
  }
}

export function olvidarRegistroPendiente() {
  if (typeof window !== 'undefined') localStorage.removeItem(PENDING_KEY);
}

/**
 * `recordar` es la casilla «mantener la sesión iniciada en este dispositivo», y
 * ahora viaja hasta el servidor.
 *
 * Antes solo decidía en qué almacén del navegador se guardaba el pase —o sea,
 * si sobrevivía a cerrar la ventana— y nada más. El reloj de inactividad de
 * veinte minutos lo aplica el servidor, que no se enteraba de nada, así que la
 * casilla marcada no evitaba nada: a los veinte minutos parado, fuera. Ver
 * `sessions.recordada` en la API.
 *
 * La respuesta trae `sesion.inactividadMinutos`, y viene en `0` cuando la
 * sesión es recordada: es lo que le dice al vigilante del navegador que aquí
 * no hay reloj que vigilar.
 */
export async function loginAPI(
  email: string,
  password: string,
  recordar = false,
) {
  const res = await api.post('/auth/login', { email, password, recordar });
  return res.data as {
    access_token: string;
    sesion?: { expiraEl?: string; inactividadMinutos?: number; recordada?: boolean };
  };
}

/**
 * Vuelve a pedir el token con lo que la base dice AHORA, y lo guarda.
 *
 * ── Por qué hace falta ──
 *
 * Dentro del token van el club, los roles por app y `app_scopes`, y todo eso
 * lo cambia OTRA persona: el maestro que acepta tu solicitud, el admin que
 * activa la suscripción del club. Quien tenía la sesión abierta seguía con el
 * token viejo, así que el alumno recién aceptado abría DINAMYT y no veía ni su
 * club ni sus aplicaciones. La única cura era cerrar sesión y volver a entrar,
 * y eso desde fuera se ve como «la aplicación no me deja».
 *
 * Devuelve el contenido nuevo del token, o `null` si no se pudo (sin sesión,
 * o la API caída): quien llama sigue con lo que tenía en vez de quedarse en
 * blanco.
 */
export async function refrescarSesionAPI(): Promise<TokenPayload | null> {
  try {
    const res = await api.post('/auth/refresh');
    const token = (res.data as { access_token?: string }).access_token;
    if (!token) return null;
    guardarToken(token);
    return decodificarToken(token);
  } catch {
    return null;
  }
}

// ── Dispositivos conectados ─────────────────────────────────────────────────
//
// La cura del susto: alguien se acuerda del computador que dejó abierto en
// otro sitio, lo ve aquí y lo cierra desde su celular sin levantarse.

export interface SesionAbierta {
  id: string;
  /** «Chrome en Windows», «Safari en iPhone»… */
  dispositivo: string;
  ip: string | null;
  createdAt: string;
  lastSeenAt: string;
  /** La sesión desde la que se está mirando la lista. */
  actual: boolean;
}

export async function sesionesAbiertasAPI(): Promise<SesionAbierta[]> {
  const res = await api.get('/auth/sesiones');
  return res.data as SesionAbierta[];
}

/** Cierra UNA de la lista. */
export async function cerrarSesionAPI(id: string) {
  const res = await api.delete(`/auth/sesiones/${id}`);
  return res.data as { message: string };
}

/** Cierra todas menos esta. El botón de «me la dejé abierta en otro lado». */
export async function cerrarLasDemasAPI() {
  const res = await api.post('/auth/logout-all');
  return res.data as { cerradas: number; message: string };
}

/**
 * Crear cuenta. **No crea la cuenta**: crea un registro a la espera del código.
 *
 * La API ya no devuelve un `userId` —no hay usuario todavía— sino el correo al
 * que salió el código y cuándo caduca. Es justo lo que la pantalla siguiente
 * necesita enseñar.
 */
export async function registerAPI(data: {
  email: string;
  password: string;
  fullName: string;
  documentId: string;
  phone?: string;
  /** ISO 'YYYY-MM-DD'. Campeonatos categoriza por edad; el club felicita. */
  birthDate?: string;
  /** `MASCULINO` | `FEMENINO`. Campeonatos separa las llaves con esto. */
  gender?: string;
  dataConsent: boolean;
}) {
  const res = await api.post('/auth/register', data);
  return res.data as RegistroPendiente;
}

export interface RegistroPendiente {
  message: string;
  email: string;
  /** ISO. Cuando pase, el registro se borra y hay que empezar de nuevo. */
  expiresAt: string;
  codigoDigitos: number;
  /** `false` = el servidor no tiene proveedor de correo configurado. */
  enviado: boolean;
}

/**
 * ¿Está libre este correo / este documento?
 *
 * Se pregunta mientras se llena el formulario para no descubrir el choque al
 * pulsar «crear cuenta», que era lo que pasaba. Un fallo aquí NO es un error de
 * la pantalla: si la red falla, el formulario sigue funcionando y quien decide
 * es el servidor al enviar.
 */
export async function disponibilidadAPI(params: {
  email?: string;
  documentId?: string;
}): Promise<{
  email?: { libre: boolean; motivo?: string };
  documentId?: { libre: boolean; motivo?: string };
}> {
  const res = await api.get('/auth/disponibilidad', { params });
  return res.data;
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

/**
 * El código del correo. **Aquí es donde nace la cuenta**, así que la respuesta
 * trae ya la sesión: el código llegó a ese buzón y alguien lo tecleó, que es
 * toda la prueba que existe de que la dirección es suya. Pedirle además la
 * contraseña que acaba de elegir sería preguntar dos veces.
 */
export async function verifyEmailAPI(email: string, code: string) {
  const res = await api.post('/auth/verify-email', { email, code });
  return res.data as { message: string; email: string; access_token?: string };
}

export async function reenviarCodigoAPI(email: string) {
  const res = await api.post('/auth/resend-code', { email });
  return res.data as RegistroPendiente;
}

/** Manda el código de recuperación. Responde igual exista o no el correo. */
export async function olvideContrasenaAPI(email: string) {
  const res = await api.post('/auth/forgot-password', { email });
  return res.data as { message: string; codigoDigitos: number };
}

export async function resetearContrasenaAPI(
  email: string,
  code: string,
  newPassword: string,
) {
  const res = await api.post('/auth/reset-password', {
    email,
    code,
    newPassword,
  });
  return res.data as { message: string; email: string };
}

export interface Plan {
  id: string;
  name: string;
  description: string | null;
  appsIncluded: string[];
  priceMonthly: string | null;
  priceAnnual: string | null;
  maxUsers: number | null;
  /**
   * Precio por persona y mes. **`null` = este plan se cobra por
   * `priceMonthly`**, el modelo viejo de importe fijo.
   *
   * Ponerlo cambia cómo se factura este plan: pasa a cobrarse por el padrón del
   * club en cada renovación. Ver §4.18 de OPERAR.
   */
  pricePerUser: string | null;
  /** Mínimo facturable: por debajo se cobra igualmente por esta cifra. */
  minUsers: number | null;
}

export async function listPlanesAPI(): Promise<Plan[]> {
  const res = await api.get('/subscription-plans');
  return res.data as Plan[];
}

/** Lo que costaria hoy ese plan para ese club, sin crear nada. */
export interface Cotizacion {
  planName: string;
  /** `false` = plan de importe fijo; la cifra no depende del padrón. */
  porPersona: boolean;
  pricePerUser: string | null;
  minUsers: number | null;
  /** Gente activa que tiene el club hoy. */
  personas: number;
  /** Por cuántas se cobra: `personas`, o el mínimo si no llega. */
  facturadas: number;
  importe: number;
}

export async function cotizarSuscripcionAPI(
  orgId: string,
  planId: string,
): Promise<Cotizacion> {
  const res = await api.get('/subscriptions/cotizar', { params: { orgId, planId } });
  return res.data as Cotizacion;
}

/**
 * Vuelve a calcular lo que se debe, con el padrón de hoy.
 *
 * Solo hace algo si nadie ha pagado todavía: un importe pagado está congelado,
 * y una factura que se mueve después de pagarla no es una factura.
 */
export async function recalcularSuscripcionAPI(
  id: string,
): Promise<{ recalculado: boolean; motivo?: string; totalAmount: string | null }> {
  const res = await api.post(`/subscriptions/${id}/recalcular`, {});
  return res.data;
}

/** Cambia la tarifa de un plan. Solo super-admin. */
export async function actualizarPlanAPI(
  id: string,
  cambios: { pricePerUser?: string | null; minUsers?: number | null },
): Promise<Plan> {
  const res = await api.patch(`/subscription-plans/${id}`, cambios);
  return res.data as Plan;
}

// ── Administración del ecosistema (solo super admin) ────────────────────────
export interface Organizacion {
  id: string;
  name: string;
  type: 'FEDERATION' | 'LEAGUE' | 'CLUB' | 'ACADEMY';
  city: string | null;
  country: string | null;
  /**
   * De qué federación o liga cuelga, o `null` si de ninguna.
   *
   * `GET /organizations` siempre lo devolvió —selecciona la fila entera— pero
   * el tipo lo escondía, y por eso el panel del super-admin pintaba una lista
   * plana en la que un club afiliado y uno huérfano se veían igual. La
   * estructura es lo primero que hay que ver para poder cambiarla.
   */
  parentId: string | null;
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
  /**
   * Si Membresías le cortó el acceso a esta persona. `null`/`undefined` = no
   * consta, que es lo normal para quien no tiene ficha allí.
   *
   * Pertenecer al club y tener acceso a una de sus apps son cosas distintas, y
   * hasta ahora la lista solo enseñaba la primera: al alumno al que el maestro
   * le había cortado el acceso en Membresías se le veía aquí exactamente igual
   * que a los demás.
   */
  membresiasActivo?: boolean | null;
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
  /** Nota del super-admin (a qué corresponde el cobro, cómo se pagó…). */
  notes: string | null;
  orgId: string;
  orgName: string;
  /** El plan por id, para poder cambiarlo desde el editor. */
  planId: string;
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
  /** La delegación a la que responde el club, y el país de ESA delegación. */
  delegation: string | null;
  delegationCountry: string | null;
  /** Si el club sale en el directorio público de dinamyt.org. */
  isPublic: boolean | null;
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
  data: { name: string; type: Organizacion['type']; city?: string; country?: string },
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
  address?: string;
  delegation?: string;
  delegationCountry?: string;
  email?: string;
  phone?: string;
}): Promise<Organizacion> => (await api.post('/organizations', data)).data;
/** Una página de miembros, con el total para poder decir «21–40 de 137». */
export interface PaginaMiembros {
  items: Miembro[];
  total: number;
  limit: number;
  offset: number;
  /**
   * Cuántos hay ESCONDIDOS por no tener acceso a Membresías.
   *
   * No entran en `total` a propósito: el número de la lista es «cuánta gente
   * tiene el club», y quien su maestro apagó en Membresías ya no entrena. Éste
   * viaja aparte para que la pantalla pueda ofrecer verlos — una lista corta
   * sin explicación se lee como que faltan personas.
   */
  sinAcceso?: number;
}

/**
 * Miembros de una organización, de veinte en veinte.
 *
 * La búsqueda la hace el SERVIDOR y no el navegador: filtrar en el cliente
 * solo encuentra a quien ya se descargó, así que en un club de cien alumnos
 * buscar estando en la página 1 no encontraría a nadie de la 4.
 */
export const listMiembrosAPI = async (
  orgId: string,
  opciones: {
    search?: string;
    limit?: number;
    offset?: number;
    /** Ver también a quien perdió el acceso a Membresías. */
    incluirSinAcceso?: boolean;
  } = {},
): Promise<PaginaMiembros> =>
  (
    await api.get(`/organizations/${orgId}/members`, {
      params: {
        ...(opciones.search ? { search: opciones.search } : {}),
        ...(opciones.incluirSinAcceso ? { incluirSinAcceso: '1' } : {}),
        limit: opciones.limit ?? 20,
        offset: opciones.offset ?? 0,
      },
    })
  ).data;
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

/**
 * Quién salió del club.
 *
 * Antes la baja borraba la fila y la persona desaparecía sin dejar fecha ni
 * rastro: no se podía saber a quién le había pasado ni deshacerlo. Ahora la
 * baja se guarda y esto es lo que la enseña. Ver `org_member_bajas`.
 */
export interface BajaOrg {
  userId: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  role: string;
  roleMembresias: string | null;
  roleCampeonatos: string | null;
  roleAcademy: string | null;
  joinedAt: string | null;
  removedAt: string;
  /** Quién la dio de baja, por su nombre. `null` si la cuenta ya no existe. */
  removedByName: string | null;
}
export const bajasOrgAPI = async (orgId: string): Promise<BajaOrg[]> =>
  (await api.get(`/organizations/${orgId}/bajas`)).data;
/** Devuelve a la persona al club con los roles que tenía. */
export const readmitirMiembroAPI = async (orgId: string, userId: string) =>
  (await api.post(`/organizations/${orgId}/bajas/${userId}/readmitir`)).data;
/** Solo borra el recuerdo de la baja: la persona sigue fuera. */
export const olvidarBajaAPI = async (orgId: string, userId: string) =>
  (await api.delete(`/organizations/${orgId}/bajas/${userId}`)).data;
export const listSuscripcionesAPI = async (): Promise<SuscripcionOrg[]> =>
  (await api.get('/subscriptions')).data;
export const crearSuscripcionOrgAPI = async (data: {
  orgId: string;
  planId: string;
  startsAt: string;
  endsAt: string;
  /** El ciclo que compra: 1, 3, 6 o 12. Lo hereda cada renovación. */
  renewalMonths?: number;
  totalAmount?: string;
}) => (await api.post('/subscriptions', data)).data;
/** Estados que puede tener una suscripción, con su nombre en español. */
export const ESTADOS_SUSCRIPCION = [
  { valor: 'ACTIVE', etiqueta: 'Activa' },
  { valor: 'PENDING_REVIEW', etiqueta: 'Por revisar' },
  { valor: 'SUSPENDED', etiqueta: 'Suspendida' },
  { valor: 'EXPIRED', etiqueta: 'Vencida' },
] as const;

export const cambiarEstadoSuscripcionAPI = async (id: string, status: string) =>
  (await api.patch(`/subscriptions/${id}/status`, { status })).data;

/** Corrige plan, fechas, monto y notas. El ESTADO va por su propia ruta. */
export const editarSuscripcionAPI = async (
  id: string,
  data: {
    planId?: string;
    startsAt?: string;
    endsAt?: string;
    totalAmount?: string | null;
    notes?: string | null;
  },
) => (await api.patch(`/subscriptions/${id}`, data)).data;

export const abonarSuscripcionAPI = async (
  id: string,
  data: { paidAmount: string; notes?: string; method?: string },
) => (await api.patch(`/subscriptions/${id}/payment`, data)).data;

/**
 * Borra la suscripción. El servidor la rechaza si tiene pagos registrados:
 * borrarla borraría el único registro de que ese dinero entró.
 */
// ── Renovar, el historial y los vencimientos ────────────────────────────────

/** Las formas de pago que se pueden registrar. Las mismas que Membresías. */
export const METODOS_PAGO = [
  { valor: 'efectivo', etiqueta: 'Efectivo' },
  { valor: 'transferencia', etiqueta: 'Transferencia' },
  { valor: 'nequi', etiqueta: 'Nequi' },
  { valor: 'daviplata', etiqueta: 'Daviplata' },
  { valor: 'otro', etiqueta: 'Otro' },
] as const;

export const nombreMetodo = (m: string) =>
  METODOS_PAGO.find((x) => x.valor === m)?.etiqueta ?? m;

/** Una línea del historial de pagos. */
export interface PagoSuscripcion {
  id: string;
  amount: string;
  method: string;
  paidAt: string;
  /** Meses que compró. `0` = un abono suelto, que no mueve la fecha. */
  periodos: number;
  periodoDesde: string | null;
  periodoHasta: string | null;
  notes: string | null;
  registradoPor: string | null;
}

/** Una suscripción que vence pronto, o que ya venció. */
export interface Vencimiento {
  id: string;
  status: string;
  venceEl: string | null;
  /** Días que faltan. Negativo si ya pasó. */
  dias: number | null;
  estado: 'al_dia' | 'por_vencer' | 'vencida' | 'sin_fecha';
  totalAmount: string | null;
  paidAmount: string | null;
  paymentStatus: string;
  renewalMonths: number | null;
  lastReminderAt: string | null;
  lastReminderKind: string | null;
  orgId: string;
  orgName: string;
  orgType: string;
  orgEmail: string | null;
  orgPhone: string | null;
  planId: string;
  planName: string;
  priceMonthly: string | null;
}

export interface DatosRenovacion {
  meses?: number;
  /** Lo que cuesta el periodo. Sin decir nada, el precio del plan. */
  precio?: string;
  /** Lo que entregó. Sin decir nada, el precio. */
  amount?: string;
  method?: string;
  notes?: string;
}

export const renovarSuscripcionAPI = async (
  id: string,
  datos: DatosRenovacion,
): Promise<{ venceEl: string }> =>
  (await api.post(`/subscriptions/${id}/renovar`, datos)).data;

export const historialSuscripcionAPI = async (
  id: string,
): Promise<PagoSuscripcion[]> =>
  (await api.get(`/subscriptions/${id}/pagos`)).data;

export const renovarSuscripcionPersonalAPI = async (
  id: string,
  datos: DatosRenovacion,
): Promise<{ venceEl: string }> =>
  (await api.post(`/subscriptions/user/${id}/renovar`, datos)).data;

export const historialSuscripcionPersonalAPI = async (
  id: string,
): Promise<PagoSuscripcion[]> =>
  (await api.get(`/subscriptions/user/${id}/pagos`)).data;

/** Todo lo que hace falta para saber cómo va el negocio, en una sola consulta. */
export interface ResumenSuscripciones {
  /** 'YYYY-MM' del mes que se está mirando. */
  mes: string;
  dinero: {
    /** Lo que entró en CAJA este mes. */
    recaudadoMes: number;
    /** Lo que le CORRESPONDE a este mes (un pago de tres meses se reparte). */
    devengadoMes: number;
    pagosMes: number;
    /** Lo que entraría cada mes si todos renovaran su plan. */
    esperadoMensual: number;
    /** Facturado y sin cobrar. */
    porCobrarTotal: number;
    porMes: { mes: string; recaudado: number; devengado: number; pagos: number }[];
    porMetodo: { metodo: string; total: number; pagos: number }[];
  };
  clubes: {
    total: number;
    conSuscripcion: number;
    sinSuscripcion: number;
    al_dia: number;
    por_vencer: number;
    vencida: number;
    suspendida: number;
  };
  personas: { total: number };
  porCobrar: {
    subscriptionId: string;
    orgName: string;
    planName: string;
    debe: number;
    venceEl: string | null;
    estado: string;
  }[];
  porPlan: { planId: string; name: string; clubes: number; mensual: number }[];
}

export const resumenSuscripcionesAPI = async (
  mes?: string,
  meses?: number,
): Promise<ResumenSuscripciones> =>
  (
    await api.get('/subscriptions/resumen', {
      params: { ...(mes ? { mes } : {}), ...(meses ? { meses } : {}) },
    })
  ).data;

export const vencimientosAPI = async (dias?: number): Promise<Vencimiento[]> =>
  (
    await api.get('/subscriptions/vencimientos', {
      params: dias ? { dias } : undefined,
    })
  ).data;

export const avisarVencimientosAPI = async (opciones?: {
  soloId?: string;
  forzar?: boolean;
}): Promise<{
  revisadas: number;
  avisadas: number;
  omitidas: number;
  correoConfigurado: boolean;
}> => (await api.post('/subscriptions/avisos', opciones ?? {})).data;

/** Una línea del barrido de planes. Ver `ClubDelBarrido` en el ecosystem. */
export interface ClubDelBarrido {
  id: string;
  name: string;
  /** Si HOY abre Membresías, contando lo que hereda de su federación. */
  abre: boolean;
  /**
   * Por qué NO abre, en una frase. `null` cuando abre — y también cuando no
   * tiene ningún plan de Membresías, que no es una avería sino un club que no
   * la usa.
   */
  motivo: string | null;
  resultado: 'creado' | 'al-dia' | 'en-pausa' | 'sin-espejo' | 'no-llego';
}

export interface BarridoDePlanes {
  clubes: number;
  alDia: number;
  enPausa: number;
  /** Clubes que tenían plan y no existían en Membresías: nacieron ahora. */
  creados: number;
  /** Contestaron «no lo tengo» y no se pudo crear: sin plan, o sin nombre. */
  sinEspejo: number;
  /** Avisos que NO salieron. Si no es cero, el problema no es de datos. */
  noLlego: number;
  detalle: ClubDelBarrido[];
}

/**
 * Le dice a Membresías, club por club, si puede operar hoy — y trae el porqué.
 *
 * Es el mismo barrido que corre a las ocho de la mañana, disparado a mano. Se
 * usa cuando un club acaba de contratar y todavía no aparece allí: sin esto
 * había que esperar a mañana, y sin el detalle no había forma de saber si el
 * problema era la suscripción sin activar, el plan equivocado, o el espejo.
 */
export const sincronizarMembresiasAPI = async (): Promise<BarridoDePlanes> =>
  (await api.post('/subscriptions/membresias/sincronizar')).data;

export const eliminarSuscripcionAPI = async (id: string) =>
  (await api.delete(`/subscriptions/${id}`)).data;

export const cambiarEstadoSuscripcionPersonalAPI = async (
  id: string,
  status: string,
) => (await api.patch(`/subscriptions/user/${id}/status`, { status })).data;

export const eliminarSuscripcionPersonalAPI = async (id: string) =>
  (await api.delete(`/subscriptions/user/${id}`)).data;
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
  /** La delegación a la que responde el club, y el país de ESA delegación. */
  delegation: string | null;
  delegationCountry: string | null;
  /** Si el club sale en el directorio público de dinamyt.org. */
  isPublic: boolean | null;
  isActive: boolean | null;
  myRole: string;
  /**
   * Si Membresías me dejó fuera de ESTE club. `null` = no consta.
   *
   * El dashboard lo mira antes de ofrecer «Entrar a Membresías»: con el acceso
   * cortado, ese botón lleva a un 403 sin explicación, y quien lo pulsa cree
   * que se rompió la aplicación.
   */
  membresiasActivo: boolean | null;
  gestores: GestorClub[];
  organizacionPadre: string | null;
}
/** Una persona pidiendo entrar al club con su código. */
export interface SolicitudDeEntrada {
  id: string;
  status: 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA' | string;
  note: string | null;
  createdAt: string;
  respondedAt: string | null;
  userId: string;
  email: string;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  birthDate: string | null;
}

/** Lo que YO he pedido, para saber qué contarme en el dashboard. */
export interface MiSolicitud {
  id: string;
  status: 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA' | string;
  createdAt: string;
  respondedAt: string | null;
  orgId: string;
  orgName: string;
  orgType: string;
}

/** Lo que responde `POST /organizations/join`. Tres finales, no uno. */
export type ResultadoEntrada =
  | { estado: 'EN_ESPERA'; org: { id: string; name: string } }
  | { estado: 'YA_SOLICITADO'; org: { id: string; name: string } }
  | { estado: 'YA_ERES_MIEMBRO'; org: { id: string; name: string } };

export const entrarAClubAPI = async (
  code: string,
  note?: string,
): Promise<ResultadoEntrada> =>
  (await api.post('/organizations/join', { code, note })).data;

export const misSolicitudesAPI = async (): Promise<MiSolicitud[]> =>
  (await api.get('/organizations/solicitudes/mias')).data;

export const solicitudesDelClubAPI = async (
  orgId: string,
  todas = false,
): Promise<SolicitudDeEntrada[]> =>
  (await api.get(`/organizations/${orgId}/solicitudes`, {
    params: todas ? { todas: '1' } : undefined,
  })).data;

export const responderSolicitudAPI = async (
  id: string,
  datos: {
    aceptar: boolean;
    role?: string;
    roleMembresias?: string;
    roleCampeonatos?: string;
    roleAcademy?: string;
  },
) => (await api.post(`/organizations/solicitudes/${id}/responder`, datos)).data;

// ── Invitaciones del club a una persona (el maestro ofrece, la persona decide) ─

/** Una invitación vista desde el club que la mandó. */
export interface InvitacionDelClub {
  id: string;
  email: string;
  role: string;
  roleMembresias: string | null;
  status: 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA' | 'CANCELADA' | string;
  note: string | null;
  createdAt: string;
  respondedAt: string | null;
  /** `null` mientras no exista cuenta con ese correo. */
  userId: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  /** `false` = tiene cuenta pero todavía no ha puesto su contraseña. */
  cuentaLista: boolean;
}

/** Una invitación vista desde quien la recibe. */
export interface MiInvitacion {
  id: string;
  status: string;
  role: string;
  note: string | null;
  createdAt: string;
  orgId: string;
  orgName: string;
  orgType: string;
  orgCity: string | null;
  orgLogoUrl: string | null;
}

export interface ResultadoInvitacion {
  invitacion: InvitacionDelClub;
  cuenta: 'existente' | 'nueva' | 'invitada';
  aviso: {
    enviadoPorCorreo: boolean;
    /** Solo llega si el correo NO salió: la muleta para mandarlo a mano. */
    enlace?: string;
    venceEnDias?: number;
  };
}

export const invitarPersonaAPI = async (
  orgId: string,
  datos: {
    email: string;
    role?: string;
    roleMembresias?: string;
    note?: string;
    fullName?: string;
    phone?: string;
  },
): Promise<ResultadoInvitacion> =>
  (await api.post(`/organizations/${orgId}/invitaciones`, datos)).data;

export const invitacionesDelClubAPI = async (
  orgId: string,
  todas = false,
): Promise<InvitacionDelClub[]> =>
  (await api.get(`/organizations/${orgId}/invitaciones`, {
    params: todas ? { todas: '1' } : undefined,
  })).data;

export const cancelarInvitacionAPI = async (id: string) =>
  (await api.delete(`/organizations/invitaciones/${id}`)).data;

export const misInvitacionesAPI = async (): Promise<MiInvitacion[]> =>
  (await api.get('/organizations/invitaciones/mias')).data;

export const responderInvitacionAPI = async (id: string, aceptar: boolean) =>
  (await api.post(`/organizations/invitaciones/${id}/responder`, { aceptar }))
    .data;

export const verCodigoClubAPI = async (
  orgId: string,
): Promise<{ joinCode: string | null }> =>
  (await api.get(`/organizations/${orgId}/codigo`)).data;

export const rotarCodigoClubAPI = async (
  orgId: string,
): Promise<{ joinCode: string | null }> =>
  (await api.post(`/organizations/${orgId}/codigo`)).data;

export const quitarCodigoClubAPI = async (
  orgId: string,
): Promise<{ joinCode: string | null }> =>
  (await api.delete(`/organizations/${orgId}/codigo`)).data;

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

/**
 * ── La campana de quien lleva un club ──
 *
 * Un aviso de la organización: quién pidió entrar, quién entró, quién se fue.
 * `href` viene DEL SERVIDOR: el tipo de aviso y su destino se deciden juntos
 * (`common/avisos-org.ts` en la API), y así un tipo nuevo no puede salir aquí
 * sin sitio a donde llevar.
 */
export interface AvisoOrg {
  id: string;
  kind: string;
  orgId: string;
  orgName: string;
  subjectUserId: string | null;
  /** Nombre actual de la persona de la que habla, si sigue existiendo. */
  subjectName: string | null;
  subjectAvatarUrl: string | null;
  /** Lo que se copió cuando pasó: nombre, correo, rol, la nota que escribió. */
  data: {
    fullName?: string | null;
    email?: string | null;
    role?: string | null;
    note?: string | null;
    via?: string | null;
  } | null;
  readAt: string | null;
  createdAt: string;
  href: string;
}

export const misAvisosOrgAPI = async (): Promise<{
  items: AvisoOrg[];
  sinLeer: number;
}> => (await api.get('/organizations/avisos')).data;

// ── Avisos al celular (Web Push) ────────────────────────────────────────────
// Una fila por NAVEGADOR, no por persona: el permiso lo da el navegador. Ver
// `lib/push.ts`, que es quien habla con el navegador, y la tabla
// `push_subscriptions` de la API.

export const suscribirPushAPI = async (sub: {
  endpoint?: string;
  keys?: { p256dh: string; auth: string };
}): Promise<{ ok: true }> => (await api.post('/push/subscribe', sub)).data;

export const desuscribirPushAPI = async (
  endpoint: string,
): Promise<{ quitadas: number }> =>
  (await api.post('/push/unsubscribe', { endpoint })).data;

/** Todos de golpe: el botón «marcar todo como leído» del panel. */
export const marcarAvisosOrgLeidosAPI = async (): Promise<{ marcados: number }> =>
  (await api.post('/organizations/avisos/leidos')).data;

/** Éste, el que se acaba de abrir. El número baja en uno, no a cero. */
export const marcarAvisoOrgLeidoAPI = async (
  id: string,
): Promise<{ marcado: boolean }> =>
  (await api.post(`/organizations/avisos/${id}/leido`)).data;
export const crearMiClubAPI = async (data: {
  name: string;
  city?: string;
  country?: string;
  description?: string;
  phone?: string;
  logoUrl?: string;
  socialLinks?: string[];
}) => (await api.post('/organizations/mi-club', data)).data;

// ── Catálogo geográfico ─────────────────────────────────────────────────────
// Ya no se pide por HTTP. Estaba puesto contra `campeonatos-api` (`GET
// /geo/paises`, `/geo/ciudades`), rutas que ese backend nunca ha tenido: la
// llamada fallaba siempre y el `catch` de quien la usaba dejaba los
// desplegables vacíos. El catálogo vive ahora en `lib/geo.ts` y lo consume el
// componente `PaisCiudad`.
/**
 * El directorio de clubes, para los buscadores de afiliar e invitar.
 *
 * `libres` deja fuera a los que ya cuelgan de alguna federación. No es un
 * adorno: un club afiliado no se puede invitar ni afiliar —el servidor lo
 * rechaza— así que enseñarlo en una lista de la que solo se puede afiliar era
 * ofrecer un botón que contesta que no. Y con el tope de 100 resultados, los
 * que no servían empujaban fuera a los que sí.
 */
export const listarClubesAPI = async (
  search?: string,
  libres = false,
): Promise<ClubBusqueda[]> =>
  (
    await api.get('/organizations/clubes', {
      params: { search, libres: libres ? 1 : undefined },
    })
  ).data;
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
    delegation?: string | null;
    delegationCountry?: string | null;
    isPublic?: boolean;
    logoUrl?: string | null;
    socialLinks?: string[] | null;
  },
) => (await api.patch(`/organizations/${orgId}`, data)).data;
export const invitarClubAPI = async (orgId: string, clubId: string) =>
  (await api.post(`/organizations/${orgId}/invitar-club`, { clubId })).data;
/**
 * Afiliar un club **a dedo**, sin invitación. Solo el super-admin.
 *
 * Es el camino del panel de `/admin`. El de la federación sigue siendo
 * `invitarClubAPI`: ahí sí se le pregunta al maestro, y esa diferencia es la
 * regla, no un descuido. El porqué está en `afiliarClubDirecto` (ecosystem-api).
 */
export const afiliarClubAPI = async (orgId: string, clubId: string) =>
  (await api.post(`/organizations/${orgId}/afiliar-club`, { clubId })).data;
/** El deshacer del anterior: saca al club de su federación. */
export const desafiliarClubAPI = async (orgId: string, clubId: string) =>
  (await api.delete(`/organizations/${orgId}/clubes/${clubId}`)).data;
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
