'use client';

import axios from 'axios';
import {
  cabecerasDeZona,
  guardarToken,
  obtenerToken,
  olvidarToken,
} from './sesion';

// API de Academy (rutas en la raíz, sin prefijo). El login se delega al ecosystem.
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3007';
const ECOSYSTEM_API_URL =
  process.env.NEXT_PUBLIC_ECOSYSTEM_API_URL || 'http://localhost:3001';

/**
 * Dónde vive el pase, cuándo se renueva y cuándo se muere: en `lib/sesion.ts`.
 *
 * Se re-exporta desde aquí porque toda la app lo importa de `@/lib/api` desde
 * antes de que ese módulo existiera, y mover treinta importaciones para ganar
 * una línea no arregla nada.
 */
export {
  guardarToken,
  obtenerToken,
  olvidarToken,
  leerPase,
  seRecuerda,
  recordarEnEsteEquipo,
  vigilarSesion,
  marcarActividad,
  INACTIVIDAD_MINUTOS,
  AVISO_SEGUNDOS,
} from './sesion';

/**
 * Cerrar sesión **de verdad**.
 *
 * ── Lo que hacía antes ──
 *
 * Borrar la copia del navegador. El pase original seguía siendo válido hasta
 * caducar solo, así que quien se sentara después en ese mismo computador —o
 * quien lo hubiera copiado— seguía entrando. «Salir» era una palabra sin
 * acción detrás.
 *
 * Ahora se le pide al ecosystem que cierre la fila de la sesión, y desde ese
 * momento el pase no vale en ninguna app: ni aquí, ni en el portal, ni en
 * Campeonatos.
 *
 * Lo local se borra ANTES de esperar al servidor: salir no puede depender de
 * que haya red. Si la llamada falla, el reloj de inactividad del ecosystem
 * cierra la sesión en veinte minutos; al revés, una API caída dejaría a
 * alguien dentro de la cuenta de la que intenta salir.
 */
export async function cerrarSesion(): Promise<void> {
  const token = obtenerToken();
  olvidarToken();
  if (!token) return;
  try {
    await axios.post(
      `${ECOSYSTEM_API_URL}/auth/logout`,
      {},
      { headers: { Authorization: `Bearer ${token}` }, timeout: 5000 },
    );
  } catch {
    // Ver arriba: el reloj del ecosystem es la red de seguridad.
  }
}

/**
 * Vuelve a pedir el pase al ecosystem, que es el único que los firma.
 *
 * Academy no emite tokens y no puede: verifica la firma contra el JWKS y ya.
 * Por eso esto va al ecosystem y no a la API de aquí. Devuelve `false` si la
 * sesión ya no está abierta —cerrada desde otro dispositivo, caducada, o
 * porque su dueño cambió la contraseña—, y eso es lo que hace que una sesión
 * revocada muera también aquí sin que Academy tenga que consultar nada en cada
 * petición.
 */
export async function refrescarSesionAPI(): Promise<boolean> {
  const token = obtenerToken();
  if (!token) return false;
  try {
    const res = await axios.post(
      `${ECOSYSTEM_API_URL}/auth/refresh`,
      {},
      {
        headers: { Authorization: `Bearer ${token}`, ...cabecerasDeZona() },
        timeout: 15000,
      },
    );
    const nuevo = (res.data as { access_token?: string }).access_token;
    if (!nuevo) return false;
    guardarToken(nuevo);
    return true;
  } catch {
    return false;
  }
}

export const api = axios.create({ baseURL: API_URL });
api.interceptors.request.use((cfg) => {
  const t = obtenerToken();
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

/**
 * Sesión expirada / token inválido → limpiar sesión y volver al login (nunca
 * en el propio /auth/login ni si ya estás en /login).
 */
function manejar401(error: unknown) {
  if (
    axios.isAxiosError(error) &&
    error.response?.status === 401 &&
    !error.config?.url?.includes('/auth/login') &&
    typeof window !== 'undefined' &&
    window.location.pathname !== '/login'
  ) {
    // El motivo del servidor viaja hasta el login: desde que las sesiones se
    // pueden cerrar, un 401 tiene explicaciones que a la persona le importan
    // («se cerró sola tras 20 minutos», «la cerraste desde otro dispositivo»),
    // y tirarlas para enseñar «no autorizado» es lo que hace creer que la
    // aplicación falla.
    const motivo = extraerError(error, '');
    olvidarToken();
    window.location.href = motivo
      ? `/login?motivo=${encodeURIComponent(motivo)}`
      : '/login';
  }
  return Promise.reject(error);
}
api.interceptors.response.use((r) => r, manejar401);

/** Inicia sesión contra el ecosystem y guarda el token. */
export async function login(
  email: string,
  password: string,
  recordar?: boolean,
): Promise<string> {
  const res = await axios.post(
    `${ECOSYSTEM_API_URL}/auth/login`,
    { email, password },
    { headers: cabecerasDeZona() },
  );
  const token = res.data.access_token as string;
  guardarToken(token, recordar);
  return token;
}

/**
 * El mensaje que se le enseña a la persona cuando la API dice que no.
 *
 * **El orden importa, y estaba al revés.** NestJS responde así:
 *
 *     { "message": "Contraseña incorrecta. Te quedan 4 intentos…",
 *       "error": "Unauthorized", "statusCode": 401 }
 *
 * `error` es el nombre del código HTTP, no una explicación. Mirándolo primero,
 * todo fallo se veía como «Unauthorized» y se tiraba a la basura lo único que
 * sirve: si el correo no existe, si la contraseña falló o cuántos intentos
 * quedan. Primero `message`; `error` solo como último recurso, para las APIs
 * que sí lo usan como texto (Membresías y Campeonatos). Ver REGLAS §3.3.
 */
export function extraerError(err: unknown, porDefecto = 'Algo salió mal.'): string {
  const e = err as { response?: { data?: { error?: string; message?: string | string[] } } };
  const data = e.response?.data;
  if (typeof data?.message === 'string' && data.message) return data.message;
  if (Array.isArray(data?.message) && data.message.length) return data.message.join(' ');
  const generico = ['Unauthorized', 'Bad Request', 'Forbidden', 'Not Found'];
  if (typeof data?.error === 'string' && !generico.includes(data.error)) {
    return data.error;
  }
  return porDefecto;
}

// ── Tipos del dominio (espejo de academy-api) ────────────────────────────────
export interface Grado {
  id: string;
  martialArtId: string;
  name: string;
  groupName: string | null;
  orderIndex: number;
  isActive: boolean;
}
export interface Arte {
  id: string;
  name: string;
  description: string | null;
  federation: string | null;
  isActive: boolean;
  grados: Grado[];
  asignada: boolean;
}
export interface Contenido {
  id: string;
  martialArtId: string;
  gradeId: string;
  title: string;
  description: string | null;
  type: 'documento' | 'video' | 'imagen' | 'texto';
  url: string | null;
  body: string | null;
  orderIndex: number;
  visto?: boolean;
}
export interface OpcionPregunta {
  id: string;
  text: string;
  isCorrect: boolean | null;
  orderIndex: number;
}
export interface Criterio {
  id?: string;
  label: string;
  maxPoints: number;
}
export interface Pregunta {
  id: string;
  type: 'opcion_multiple' | 'evidencia';
  prompt: string;
  points: number;
  orderIndex: number;
  opciones: OpcionPregunta[];
  criterios?: Criterio[];
}
export interface Evaluacion {
  id: string;
  martialArtId: string;
  gradeId: string;
  title: string;
  description: string | null;
  kind: 'cuestionario' | 'tarea' | 'actividad';
  maxAttempts: number;
  availableFrom: string | null;
  dueAt: string | null;
  vencida?: boolean;
  mcWeight: number;
  preguntas?: Pregunta[];
  // extras del estudiante
  intentosUsados?: number;
  mejorNota?: number | null;
  pendienteRevision?: boolean;
  disponible?: boolean;
  puedeIntentar?: boolean;
  // extras del maestro
  intentos?: number;
  porRevisar?: number;
}
export interface Intento {
  id: string;
  evaluationId: string;
  studentUserId: string;
  attemptNumber: number;
  status: 'EN_CURSO' | 'ENVIADO' | 'CALIFICADO';
  mcScore: string | null;
  evidenceScore: string | null;
  finalScore: string | null;
  gradeNameSnapshot: string | null;
  teacherComment?: string | null;
  submittedAt: string | null;
  fullName?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
}
export interface Respuesta {
  id: string;
  questionId: string;
  selectedOptionId: string | null;
  evidenceUrl: string | null;
  isCorrect: boolean | null;
  score: string | null;
  feedback: string | null;
}
export interface UsuarioLocal {
  id: string;
  ecosystemUserId: string;
  fullName: string | null;
  email: string | null;
  localRole: 'admin' | 'teacher' | 'student' | null;
  avatarUrl?: string | null;
  suspended: boolean;
  deletedAt?: string | null;
  matriculas?: string[];
}
export interface MatriculaMe {
  id: string;
  martialArtId: string;
  currentGradeId: string;
  arteNombre: string;
  gradoNombre: string;
  gradoOrden: number;
  grupoNombre: string | null;
}
export interface Me {
  usuario: UsuarioLocal;
  rol: 'admin' | 'teacher' | 'student';
  matriculas: MatriculaMe[];
}

// ── Endpoints ────────────────────────────────────────────────────────────────
export const getMeAPI = async (): Promise<Me> => (await api.get('/me')).data;

export const getArtesAPI = async (): Promise<Arte[]> =>
  (await api.get('/martial-arts')).data;
export const crearArteAPI = async (body: {
  name: string;
  description?: string;
  federation?: string;
  grados: { name: string; groupName?: string }[];
}) => (await api.post('/martial-arts', body)).data;
export const patchArteAPI = async (id: string, body: Record<string, unknown>) =>
  (await api.patch(`/martial-arts/${id}`, body)).data;
export const getMaestrosAPI = async (arteId: string) =>
  (await api.get(`/martial-arts/${arteId}/teachers`)).data as {
    id: string;
    teacherUserId: string;
    fullName: string | null;
    email: string | null;
    avatarUrl: string | null;
  }[];
export const asignarMaestroAPI = async (arteId: string, email: string) =>
  (await api.post(`/martial-arts/${arteId}/teachers`, { email })).data;
export const quitarMaestroAPI = async (arteId: string, userId: string) =>
  (await api.delete(`/martial-arts/${arteId}/teachers/${userId}`)).data;

export const getContenidosAPI = async (martialArtId: string, gradeId?: string) =>
  (
    await api.get('/contents', { params: { martialArtId, gradeId } })
  ).data as {
    gradoActual?: Grado;
    gradosAccesibles?: Grado[];
    contenidos: Contenido[];
  };
export const crearContenidoAPI = async (body: Record<string, unknown>) =>
  (await api.post('/contents', body)).data as Contenido;
export const editarContenidoAPI = async (id: string, body: Record<string, unknown>) =>
  (await api.patch(`/contents/${id}`, body)).data as Contenido;
export const borrarContenidoAPI = async (id: string) =>
  (await api.delete(`/contents/${id}`)).data;
export const marcarVistoAPI = async (id: string) =>
  (await api.post(`/contents/${id}/view`)).data;

export const getEvaluacionesAPI = async (martialArtId: string) =>
  (await api.get('/evaluations', { params: { martialArtId } })).data as Evaluacion[];
export const getEvaluacionAPI = async (id: string) =>
  (await api.get(`/evaluations/${id}`)).data as Evaluacion & { preguntas: Pregunta[] };
export const crearEvaluacionAPI = async (body: Record<string, unknown>) =>
  (await api.post('/evaluations', body)).data as Evaluacion;
export const borrarEvaluacionAPI = async (id: string) =>
  (await api.delete(`/evaluations/${id}`)).data;
export const rendirAPI = async (
  id: string,
  respuestas: { questionId: string; selectedOptionId?: string; evidenceUrl?: string }[],
) => (await api.post(`/evaluations/${id}/attempts`, { respuestas })).data as Intento & {
  mensaje: string;
};
export const getIntentosAPI = async (evaluationId: string) =>
  (await api.get(`/evaluations/${evaluationId}/attempts`)).data as Intento[];
export const getIntentoAPI = async (id: string) =>
  (await api.get(`/attempts/${id}`)).data as Intento & {
    evaluacion: Evaluacion;
    preguntas: Pregunta[];
    respuestas: Respuesta[];
  };
export const calificarAPI = async (
  attemptId: string,
  calificaciones: { answerId: string; score: number; feedback?: string }[],
  comentario?: string,
) =>
  (await api.post(`/attempts/${attemptId}/grade`, { calificaciones, comentario }))
    .data as Intento;

// ── Libreta de notas del estudiante ──────────────────────────────────────────
export interface NotaFila {
  id: string;
  attemptNumber: number;
  status: 'EN_CURSO' | 'ENVIADO' | 'CALIFICADO';
  mcScore: string | null;
  evidenceScore: string | null;
  finalScore: string | null;
  teacherComment: string | null;
  gradeNameSnapshot: string | null;
  submittedAt: string | null;
  gradedAt: string | null;
  evaluacion: string;
  kind: 'cuestionario' | 'tarea' | 'actividad';
  maxAttempts: number;
  arteNombre: string;
}
export const getNotasAPI = async () =>
  (await api.get('/notas')).data as { evaluaciones: NotaFila[] };

export interface ProgresoArte {
  matriculaId: string;
  arte: Arte;
  gradoActual: Grado;
  progresoContenido: { total: number; vistos: number; pct: number };
  evaluaciones: {
    id: string;
    title: string;
    intentosUsados: number;
    maxAttempts: number;
    mejorNota: number | null;
    pendienteRevision: boolean;
  }[];
  historial: {
    id: string;
    fromGradeName: string | null;
    toGradeName: string;
    approvedByName: string | null;
    notes: string | null;
    advancedAt: string;
  }[];
}
export const getProgresoAPI = async (): Promise<ProgresoArte[]> =>
  (await api.get('/progress/me')).data;

export const matricularAPI = async (body: {
  martialArtId: string;
  email?: string;
  studentUserId?: string;
  gradeId?: string;
}) => (await api.post('/enrollments', body)).data;
export const avanzarGradoAPI = async (enrollmentId: string, notes?: string) =>
  (await api.post(`/enrollments/${enrollmentId}/advance`, { notes })).data;

/** Sube el certificado oficial (PDF o imagen) de un avance de grado. */
export const subirCertificadoAPI = async (avanceId: string, file: File) => {
  const form = new FormData();
  form.append('file', file);
  return (
    await api.post(`/avances/${avanceId}/certificado`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  ).data as { certificateUrl: string };
};

export interface EstudiantePanel {
  id: string;
  studentUserId: string;
  fullName: string | null;
  email: string | null;
  avatarUrl: string | null;
  gradoNombre: string;
  gradoOrden: number;
  progresoContenido: { total: number; vistos: number; pct: number };
  evaluacionesCompletadas: number;
  ultimoAvance: string | null;
}
export const getEstudiantesAPI = async (martialArtId: string, gradeId?: string) =>
  (
    await api.get('/progress/students', { params: { martialArtId, gradeId } })
  ).data as EstudiantePanel[];

export const getUsuariosAdminAPI = async (incluirEliminados = false) =>
  (
    await api.get('/admin/users', {
      params: incluirEliminados ? { incluirEliminados: '1' } : undefined,
    })
  ).data as UsuarioLocal[];
export const patchUsuarioAdminAPI = async (id: string, body: Record<string, unknown>) =>
  (await api.patch(`/admin/users/${id}`, body)).data as UsuarioLocal;
export const solicitarMaestroAPI = async (body: {
  martialArtId?: string;
  message?: string;
}) => (await api.post('/teacher-requests', body)).data;
export interface SolicitudMaestro {
  id: string;
  userId: string;
  fullName: string | null;
  arteNombre: string | null;
  message: string | null;
  status: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';
  createdAt: string;
}
export const getSolicitudesAPI = async () =>
  (await api.get('/teacher-requests')).data as SolicitudMaestro[];
export const resolverSolicitudAPI = async (id: string, aprobar: boolean) =>
  (await api.post(`/teacher-requests/${id}/resolve`, { aprobar })).data;
export const getReportesAPI = async (dias = 30) =>
  (await api.get('/admin/reports', { params: { dias } })).data as {
    periodoDias: number;
    usuariosPorArte: Record<string, number>;
    evaluacionesCompletadas: number;
    avancesDeGrado: number;
    tasaAvance: number;
    totales: {
      usuarios: number;
      matriculas: number;
      contenidos: number;
      evaluaciones: number;
    };
  };

// ── Utilidades de presentación ───────────────────────────────────────────────

/** URL embebible para el iframe (RF-ACA-12): YouTube y Google Drive. */
export function urlEmbed(url: string): string | null {
  const yt = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{6,})/,
  );
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const drive = url.match(/drive\.google\.com\/file\/d\/([\w-]+)/);
  if (drive) return `https://drive.google.com/file/d/${drive[1]}/preview`;
  return null;
}

/** URL pública de un archivo del almacén de Academy (videos, imágenes). */
export function archivoUrl(rel: string | null | undefined): string | null {
  return rel ? `${API_URL}/files/${rel}` : null;
}

/** ¿La URL es una ruta local del almacén (archivo subido) o un enlace externo? */
export function esArchivoLocal(url: string | null | undefined): boolean {
  return !!url && !/^https?:\/\//i.test(url);
}

/** URL final de un contenido/evidencia: externa tal cual, local vía /files. */
export function resolverArchivo(url: string | null | undefined): string | null {
  if (!url) return null;
  return esArchivoLocal(url) ? archivoUrl(url) : url;
}

/** Sube la evidencia de una tarea (video/imagen/PDF) y devuelve su ruta. */
export const subirEvidenciaAPI = async (file: File) => {
  const fd = new FormData();
  fd.append('archivo', file, file.name);
  return (await api.post('/uploads/evidencia', fd)).data as { url: string };
};

/** Crea una unidad de contenido SUBIENDO el archivo desde el dispositivo. */
export const crearContenidoArchivoAPI = async (datos: {
  martialArtId: string;
  gradeId: string;
  title: string;
  description?: string;
  orderIndex?: number;
  file: File;
}) => {
  const fd = new FormData();
  fd.append('martialArtId', datos.martialArtId);
  fd.append('gradeId', datos.gradeId);
  fd.append('title', datos.title);
  if (datos.description) fd.append('description', datos.description);
  fd.append('orderIndex', String(datos.orderIndex ?? 0));
  fd.append('archivo', datos.file, datos.file.name);
  return (await api.post('/contents/upload', fd)).data as Contenido;
};

// ── Notificaciones, tablero y anuncios ───────────────────────────────────────
export interface Notificacion {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}
export const getNotificacionesAPI = async () =>
  (await api.get('/notifications')).data as {
    notificaciones: Notificacion[];
    noLeidas: number;
  };
export const marcarLeidasAPI = async (ids?: string[]) =>
  (await api.post('/notifications/read', { ids })).data;

export const getDashboardAPI = async () => (await api.get('/dashboard')).data;

export interface Anuncio {
  id: string;
  martialArtId: string;
  gradeId: string | null;
  title: string;
  body: string | null;
  createdByName: string | null;
  createdAt: string;
  arte?: string;
}
export const getAnunciosAPI = async (martialArtId: string) =>
  (await api.get('/announcements', { params: { martialArtId } })).data as Anuncio[];
export const crearAnuncioAPI = async (body: {
  martialArtId: string;
  gradeId?: string | null;
  title: string;
  body?: string;
}) => (await api.post('/announcements', body)).data as Anuncio;
export const borrarAnuncioAPI = async (id: string) =>
  (await api.delete(`/announcements/${id}`)).data;

// ── Figuras (visión por computador) ──────────────────────────────────────────
export interface FiguraRef {
  id: string;
  martialArtId: string;
  gradeId: string;
  name: string;
  description: string | null;
  videoPath: string;
  detectionRate: string | null;
  createdAt: string;
}
export interface MomentoCorreccion {
  time: number;
  label: string;
  startLabel?: string;
  endLabel?: string;
  maxDiff: number;
  image: string | null;
}
export interface CorreccionFigura {
  joint: string;
  jointLabel: string;
  message: string;
  avgDiff: number;
  momentos: MomentoCorreccion[];
}
export interface ResultadoFigura {
  overallScore: number;
  qualityLabel: string;
  detectionRate: number;
  warning?: string | null;
  joints: Record<string, { score: number; avgDiff: number; quality: string }>;
  corrections: CorreccionFigura[];
  reportImg: string | null;
  annotatedVideo: string | null;
}
export interface IntentoFigura {
  id: string;
  referenceFigureId: string;
  status: 'PROCESANDO' | 'COMPLETADO' | 'ERROR';
  score: string | null;
  resultJson?: ResultadoFigura | null;
  videoPath?: string;
  reportImgPath?: string | null;
  annotatedVideoPath?: string | null;
  errorMsg?: string | null;
  gradeNameSnapshot: string | null;
  createdAt: string;
  nombre?: string;
  estudiante?: string | null;
  avatarUrl?: string | null;
  figura?: FiguraRef;
}
export const getFigurasRefAPI = async (martialArtId: string) =>
  (await api.get('/figuras/references', { params: { martialArtId } })).data as FiguraRef[];
export const subirFiguraRefAPI = async (datos: {
  martialArtId: string;
  gradeId: string;
  name: string;
  description?: string;
  video: File | Blob;
}) => {
  const fd = new FormData();
  fd.append('martialArtId', datos.martialArtId);
  fd.append('gradeId', datos.gradeId);
  fd.append('name', datos.name);
  if (datos.description) fd.append('description', datos.description);
  const nombre = datos.video instanceof File ? datos.video.name : 'figura.mp4';
  fd.append('video', datos.video, nombre);
  return (await api.post('/figuras/references', fd)).data as FiguraRef;
};
export const borrarFiguraRefAPI = async (id: string) =>
  (await api.delete(`/figuras/references/${id}`)).data;
export const intentarFiguraAPI = async (referenceId: string, video: File | Blob) => {
  const fd = new FormData();
  fd.append('video', video, video instanceof File ? video.name : 'intento.webm');
  return (await api.post(`/figuras/references/${referenceId}/attempts`, fd))
    .data as IntentoFigura;
};
export const getIntentoFiguraAPI = async (id: string) =>
  (await api.get(`/figuras/attempts/${id}`)).data as IntentoFigura;
export const getIntentosFiguraAPI = async (params: {
  martialArtId?: string;
  mine?: boolean;
}) =>
  (
    await api.get('/figuras/attempts', {
      params: { martialArtId: params.martialArtId, mine: params.mine ? '1' : undefined },
    })
  ).data as IntentoFigura[];

// ── Historial de actividad (bitácora del maestro) ────────────────────────────
export interface EventoHistorial {
  id: string;
  userId: string;
  type: 'ingreso' | 'contenido_visto' | 'entrega' | 'intento_figura' | 'avance_grado';
  detail: string | null;
  refId: string | null;
  createdAt: string;
  fullName: string | null;
  email: string | null;
  avatarUrl: string | null;
}
export const getHistorialAPI = async (
  martialArtId: string,
  filtros: { studentUserId?: string; type?: string } = {},
) =>
  (
    await api.get('/historial', {
      params: {
        martialArtId,
        studentUserId: filtros.studentUserId || undefined,
        type: filtros.type || undefined,
      },
    })
  ).data as EventoHistorial[];

/** Color aproximado del cinturón para la franja de grado. */
export function colorCinturon(nombre: string): string {
  const n = nombre.toLowerCase();
  if (n.includes('marrón/negro') || n.includes('negro')) return '#454545';
  if (n.includes('marrón')) return '#8b5a2b';
  if (n.includes('rojo')) return '#e8002a';
  if (n.includes('verde/azul') || n.includes('azul')) return '#2266ff';
  if (n.includes('naranja/verde') || n.includes('verde')) return '#3ecf8e';
  if (n.includes('naranja')) return '#ff8c00';
  if (n.includes('amarillo')) return '#f0b800';
  return '#f3f1e8';
}

// ── Banco de preguntas del maestro ───────────────────────────────────────────
export interface PreguntaBanco {
  id: string;
  type: 'opcion_multiple' | 'evidencia';
  prompt: string;
  points: number;
  opciones: { text: string; isCorrect?: boolean }[] | null;
  criterios: { label: string; maxPoints?: number }[] | null;
}
export const getBancoAPI = async (martialArtId: string) =>
  (await api.get('/banco', { params: { martialArtId } })).data as PreguntaBanco[];
export const guardarEnBancoAPI = async (body: Record<string, unknown>) =>
  (await api.post('/banco', body)).data as PreguntaBanco;
export const borrarDelBancoAPI = async (id: string) =>
  (await api.delete(`/banco/${id}`)).data;
export const getAvanceAPI = async (id: string) => (await api.get(`/avances/${id}`)).data;
