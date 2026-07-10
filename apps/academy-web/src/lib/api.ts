'use client';

import axios from 'axios';

// API de Academy (rutas en la raíz, sin prefijo). El login se delega al ecosystem.
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3007';
const ECOSYSTEM_API_URL =
  process.env.NEXT_PUBLIC_ECOSYSTEM_API_URL || 'http://localhost:3001';

const TOKEN_KEY = 'dinamyt_token';

export function guardarToken(token: string) {
  if (typeof window !== 'undefined') localStorage.setItem(TOKEN_KEY, token);
}
export function obtenerToken(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
}
export function cerrarSesion() {
  if (typeof window !== 'undefined') localStorage.removeItem(TOKEN_KEY);
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
    cerrarSesion();
    window.location.href = '/login';
  }
  return Promise.reject(error);
}
api.interceptors.response.use((r) => r, manejar401);

/** Inicia sesión contra el ecosystem y guarda el token. */
export async function login(email: string, password: string): Promise<string> {
  const res = await axios.post(`${ECOSYSTEM_API_URL}/auth/login`, {
    email,
    password,
  });
  const token = res.data.access_token as string;
  guardarToken(token);
  return token;
}

/** Mensaje de error legible desde una respuesta axios. */
export function extraerError(err: unknown, porDefecto = 'Algo salió mal.'): string {
  const e = err as { response?: { data?: { error?: string; message?: string | string[] } } };
  const m = e.response?.data?.message;
  return (
    e.response?.data?.error ?? (Array.isArray(m) ? m.join(' ') : m) ?? porDefecto
  );
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
export interface Pregunta {
  id: string;
  type: 'opcion_multiple' | 'evidencia';
  prompt: string;
  points: number;
  orderIndex: number;
  opciones: OpcionPregunta[];
}
export interface Evaluacion {
  id: string;
  martialArtId: string;
  gradeId: string;
  title: string;
  description: string | null;
  maxAttempts: number;
  availableFrom: string | null;
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
  submittedAt: string | null;
  fullName?: string | null;
  email?: string | null;
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
  suspended: boolean;
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
) => (await api.post(`/attempts/${attemptId}/grade`, { calificaciones })).data as Intento;

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

export interface EstudiantePanel {
  id: string;
  studentUserId: string;
  fullName: string | null;
  email: string | null;
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

export const getUsuariosAdminAPI = async () =>
  (await api.get('/admin/users')).data as UsuarioLocal[];
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
