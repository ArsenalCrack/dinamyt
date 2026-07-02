'use client';

import axios from 'axios';
import type {
  EstadoCombate,
  CategoriasConfig,
} from '@dinamyt/campeonatos-core';

export type { CategoriasConfig, CategoriaConfig } from '@dinamyt/campeonatos-core';

// La API de Campeonatos expone sus rutas en la raíz (sin prefijo /api).
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
// El login se delega al ecosystem (valida credenciales y emite el JWT).
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

const eco = axios.create({
  baseURL: ECOSYSTEM_API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 60000,
});

export async function loginAPI(email: string, password: string) {
  const res = await eco.post('/auth/login', { email, password });
  return res.data as { access_token: string };
}

// ── Tipos y catálogos (espejo de los enums del dominio) ──────────────────────
export type EstadoCampeonato = 'BORRADOR' | 'LISTO' | 'EN_CURSO' | 'FINALIZADO';

export interface CampeonatoPublico {
  id: string;
  nombre: string;
  estado: EstadoCampeonato;
  ciudad?: string | null;
  pais?: string | null;
  alcance?: string | null;
  esPublico?: boolean | null;
  fechaInicio: string | null;
  fechaFin: string | null;
}
export interface Campeonato extends CampeonatoPublico {
  descripcion: string | null;
  costoBase: string | null;
}

export const MODALIDADES = [
  'figura_manos_libres',
  'figura_armas',
  'defensa_personal',
  'salto_altura',
  'salto_longitud',
  'combate',
] as const;
export type Modalidad = (typeof MODALIDADES)[number];

export const GRUPOS_CINTURON = [
  'BLANCO',
  'PRINCIPIANTE',
  'INTERMEDIO',
  'AVANZADO',
  'NEGRO',
] as const;
export const GENEROS = ['MASCULINO', 'FEMENINO'] as const;

// ── Endpoints ────────────────────────────────────────────────────────────────
export async function listCampeonatosPublicoAPI(): Promise<CampeonatoPublico[]> {
  const res = await api.get('/campeonatos/publico');
  return res.data as CampeonatoPublico[];
}

export async function listCampeonatosAPI(): Promise<Campeonato[]> {
  const res = await api.get('/campeonatos');
  return res.data as Campeonato[];
}

export interface CrearCampeonatoInput {
  nombre: string;
  descripcion?: string;
  ubicacion?: string;
  pais?: string;
  ciudad?: string;
  alcance?: string;
  numTatamis?: number;
  maxParticipantes?: number;
  esPublico?: boolean;
  codigo?: string;
  fechaInicio?: string;
  fechaFin?: string;
  costoBase?: string;
  modalidades?: { modalidad: Modalidad; costoExtra?: string }[];
}
export async function crearCampeonatoAPI(data: CrearCampeonatoInput) {
  const res = await api.post('/campeonatos', data);
  return res.data as Campeonato;
}

export interface InscribirInput {
  documento: string;
  nombreCompleto: string;
  fechaNacimiento: string;
  genero: (typeof GENEROS)[number];
  grupoCinturon: (typeof GRUPOS_CINTURON)[number];
  pesoActual?: string;
  academiaClub?: string;
  modalidades: Modalidad[];
}
export async function inscribirAPI(campId: string, data: InscribirInput) {
  const res = await api.post(`/campeonatos/${campId}/inscripciones`, data);
  return res.data;
}

// ── Detalle, estado y configuración de categorías ────────────────────────────
export interface ModalidadCampeonato {
  id: string;
  campeonatoId: string;
  modalidad: Modalidad;
  costoExtra: string | null;
  activa: boolean | null;
  categorias: CategoriasConfig | null;
}
export interface CampeonatoDetalle extends Campeonato {
  ubicacion: string | null;
  pais: string | null;
  ciudad: string | null;
  alcance: string | null;
  numTatamis: number | null;
  maxParticipantes: number | null;
  esPublico: boolean | null;
  codigo: string | null;
  modalidades: ModalidadCampeonato[];
}

export async function getCampeonatoAPI(id: string): Promise<CampeonatoDetalle> {
  const res = await api.get(`/campeonatos/${id}`);
  return res.data as CampeonatoDetalle;
}

/** Edita el campeonato (solo en BORRADOR o LISTO); sincroniza tatamis y modalidades. */
export async function editarCampeonatoAPI(
  id: string,
  data: Partial<CrearCampeonatoInput>,
): Promise<Campeonato> {
  const res = await api.patch(`/campeonatos/${id}`, data);
  return res.data as Campeonato;
}

/** Avanza el estado del campeonato (BORRADOR→LISTO→EN_CURSO→FINALIZADO). */
export async function cambiarEstadoAPI(
  id: string,
  estado: EstadoCampeonato,
): Promise<Campeonato> {
  const res = await api.patch(`/campeonatos/${id}/estado`, { estado });
  return res.data as Campeonato;
}

/** Guarda la config de categorías (rangos) de una modalidad del campeonato. */
export async function guardarCategoriasAPI(
  id: string,
  modalidad: Modalidad,
  categorias: CategoriasConfig,
) {
  const res = await api.put(`/campeonatos/${id}/modalidades/${modalidad}`, {
    categorias,
  });
  return res.data;
}

/** Estado siguiente del ciclo de vida, o null si ya está FINALIZADO. */
export function siguienteEstadoUI(e: EstadoCampeonato): EstadoCampeonato | null {
  const orden: EstadoCampeonato[] = ['BORRADOR', 'LISTO', 'EN_CURSO', 'FINALIZADO'];
  const i = orden.indexOf(e);
  return i >= 0 && i < orden.length - 1 ? orden[i + 1] : null;
}

// ── Secciones y llaves (brackets) ────────────────────────────────────────────
export interface Seccion {
  id: string;
  campeonatoId: string;
  modalidad: Modalidad;
  genero: 'MASCULINO' | 'FEMENINO' | 'MIXTO' | null;
  cinturon: string | null;
  rangoEdad: string | null;
  rangoPeso: string | null;
  clave: string | null;
  nombre: string;
  estado: 'EN_ESPERA' | 'EN_CURSO' | 'FINALIZADA';
}

/** Genera (o regenera) las secciones del campeonato desde su config de categorías. */
export async function generarSeccionesAPI(
  campId: string,
): Promise<{ total: number }> {
  const res = await api.post(`/campeonatos/${campId}/generar-secciones`);
  return res.data as { total: number };
}

/** Lista las secciones de un campeonato. */
export async function listSeccionesAPI(campId: string): Promise<Seccion[]> {
  const res = await api.get(`/campeonatos/${campId}/secciones`);
  return res.data as Seccion[];
}

/** Asigna cada inscripción a la sección que le corresponde (por cinturón/peso/edad/género). */
export async function asignarSeccionesAPI(
  campId: string,
): Promise<{ asignadas: number }> {
  const res = await api.post(`/campeonatos/${campId}/asignar-secciones`);
  return res.data as { asignadas: number };
}

/** Genera la llave (bracket) de una sección de combate. Requiere ≥ 2 competidores. */
export async function generarBracketAPI(seccionId: string) {
  const res = await api.post(`/secciones/${seccionId}/bracket`);
  return res.data;
}

// ── Pantalla pública: detalle en vivo de un campeonato ───────────────────────
export interface PantallaTatami {
  id: string;
  numero: number;
  estado: 'LIBRE' | 'OCUPADO';
  enCurso: { nombre: string; modalidad: Modalidad } | null;
  enEspera: number;
}
export interface PantallaResultado {
  seccion: string;
  modalidad: Modalidad;
  ganador: 'hong' | 'chung' | 'empate' | null;
  marcadorHong: string | null;
  marcadorChung: string | null;
  hong: string | null;
  creadoAt: string | null;
}
export interface PantallaJuez {
  nombre: string;
  rol: string;
  tatami: number | null;
}
export interface PantallaSeccion {
  id: string;
  nombre: string;
  modalidad: Modalidad;
  estado: 'EN_ESPERA' | 'EN_CURSO' | 'FINALIZADA';
  competidores: { nombre: string; club: string | null }[];
}
export interface PantallaDetalle {
  jueces: PantallaJuez[];
  secciones: PantallaSeccion[];
  campeonato: CampeonatoPublico & {
    descripcion: string | null;
    ubicacion: string | null;
    ciudad: string | null;
    pais: string | null;
    alcance: string | null;
    costoBase: string | null;
    maxParticipantes: number | null;
  };
  modalidades: { modalidad: Modalidad; costoExtra: string | null }[];
  tatamis: PantallaTatami[];
  resultados: PantallaResultado[];
}
export async function pantallaAPI(
  campId: string,
  codigo?: string,
): Promise<PantallaDetalle> {
  const res = await api.get(`/campeonatos/${campId}/publico`, {
    params: codigo ? { codigo } : undefined,
  });
  return res.data as PantallaDetalle;
}

export interface SeccionPublico {
  seccion: {
    id: string;
    nombre: string;
    modalidad: Modalidad;
    estado: 'EN_ESPERA' | 'EN_CURSO' | 'FINALIZADA';
  };
  competidores: { nombre: string; club: string | null }[];
  llave: unknown | null;
}
/** Detalle público de una sección: competidores + llave (árbol de combates). */
export async function seccionPublicoAPI(seccionId: string): Promise<SeccionPublico> {
  const res = await api.get(`/secciones/${seccionId}/publico`);
  return res.data as SeccionPublico;
}

/** True si el error del detalle público es "privado: requiere código". */
export function esErrorPrivado(e: unknown): boolean {
  return axios.isAxiosError(e) && (e.response?.data as { privado?: boolean })?.privado === true;
}

// ── Invitaciones (flujo de PROJECT: email + aceptación in-app) ───────────────
export interface Invitacion {
  id: string;
  email: string;
  estado: 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA';
  createdAt: string | null;
  correoEnviado?: boolean;
}
export interface MiInvitacion {
  id: string;
  estado: 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA';
  createdAt: string | null;
  campeonatoId: string;
  campeonato: string;
  fechaInicio: string | null;
  ciudad: string | null;
  estadoCampeonato: EstadoCampeonato;
}

export async function invitarAPI(campId: string, email: string): Promise<Invitacion> {
  const res = await api.post(`/campeonatos/${campId}/invitaciones`, { email });
  return res.data as Invitacion;
}
export async function listInvitacionesAPI(campId: string): Promise<Invitacion[]> {
  const res = await api.get(`/campeonatos/${campId}/invitaciones`);
  return res.data as Invitacion[];
}
export async function misInvitacionesAPI(): Promise<MiInvitacion[]> {
  const res = await api.get('/invitaciones/mias');
  return res.data as MiInvitacion[];
}
export interface AceptarInvitacionInput {
  documento: string;
  fechaNacimiento: string;
  genero: (typeof GENEROS)[number];
  grupoCinturon: (typeof GRUPOS_CINTURON)[number];
  pesoActual?: string;
  academiaClub?: string;
  modalidades: Modalidad[];
}
export async function aceptarInvitacionAPI(id: string, data: AceptarInvitacionInput) {
  const res = await api.post(`/invitaciones/${id}/aceptar`, data);
  return res.data;
}
export async function rechazarInvitacionAPI(id: string) {
  const res = await api.post(`/invitaciones/${id}/rechazar`);
  return res.data;
}

// ── Revisión de inscripciones (admin) y "mis inscripciones" (competidor) ────
export interface InscripcionRevision {
  id: string;
  estado: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';
  pesoInscripcion: string | null;
  grupoCinturon: string | null;
  montoTotal: string | null;
  createdAt: string | null;
  nombreCompleto: string;
  documento: string;
  correo: string | null;
  fechaNacimiento: string | null;
  genero: string | null;
  academiaClub: string | null;
  modalidades: Modalidad[];
}
export async function listInscripcionesCampAPI(
  campId: string,
): Promise<InscripcionRevision[]> {
  const res = await api.get(`/campeonatos/${campId}/inscripciones`);
  return res.data as InscripcionRevision[];
}
/** Aprueba (y auto-asigna a su sección) o rechaza una inscripción. */
export async function revisarInscripcionAPI(
  id: string,
  estado: 'APROBADA' | 'RECHAZADA',
) {
  const res = await api.patch(`/inscripciones/${id}/estado`, { estado });
  return res.data as { seccionesAsignadas: number };
}

export interface MiInscripcion {
  id: string;
  estado: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';
  pesoInscripcion: string | null;
  grupoCinturon: string | null;
  montoTotal: string | null;
  estadoPago: string;
  createdAt: string | null;
  campeonatoId: string;
  campeonato: string;
  estadoCampeonato: EstadoCampeonato;
  fechaInicio: string | null;
  ciudad: string | null;
  modalidades: Modalidad[];
}
/** Historial inmutable del competidor: sus inscripciones con el cinturón y
 *  peso DEL MOMENTO en que participó. */
export async function misInscripcionesAPI(): Promise<MiInscripcion[]> {
  const res = await api.get('/inscripciones/mias');
  return res.data as MiInscripcion[];
}

// ── Catálogo geográfico (país / ciudad) ──────────────────────────────────────
export interface Pais {
  iso2: string;
  nombre: string;
}
export async function listPaisesAPI(): Promise<Pais[]> {
  const res = await api.get('/geo/paises');
  return res.data as Pais[];
}
export async function listCiudadesAPI(iso2: string): Promise<string[]> {
  const res = await api.get('/geo/ciudades', { params: { pais: iso2 } });
  return res.data as string[];
}

// ── Tatamis y cola FIFO (§8.1, lógica de DINAMYT-PROJECT) ────────────────────
export interface ColaItem {
  id: string;
  orden: number;
  estado: 'EN_ESPERA' | 'EN_CURSO' | 'FINALIZADA';
  inicio: string | null;
  fin: string | null;
  seccion: {
    id: string;
    nombre: string;
    modalidad: Modalidad;
    estado: 'EN_ESPERA' | 'EN_CURSO' | 'FINALIZADA';
  };
}
export const ROLES_TATAMI = [
  'arbitro',
  'j1',
  'j2',
  'j3',
  'j4',
  'j5',
  'j6',
  'j7',
] as const;
export type RolTatami = (typeof ROLES_TATAMI)[number];

export interface JuezTatami {
  rolTatami: RolTatami;
  nombreDisplay: string;
  userEmail: string | null;
}

export interface Tatami {
  id: string;
  numero: number;
  estado: 'LIBRE' | 'OCUPADO';
  activo: boolean | null;
  jueces: JuezTatami[];
  cola: ColaItem[];
}

/** Activa o desactiva un tatami (desactivado no acepta ni inicia secciones). */
export async function activarTatamiAPI(tatamiId: string, activo: boolean) {
  const res = await api.patch(`/tatamis/${tatamiId}`, { activo });
  return res.data;
}

// ── Panel del juez (estilo COMBAT /juez y /tatami/[id]) ─────────────────────
export interface MiTatami {
  tatamiId: string;
  numero: number;
  rolTatami: RolTatami;
  campeonatoId: string;
  campeonato: string;
  estadoCampeonato: EstadoCampeonato;
}
/** Tatamis donde el admin me asignó como juez (por email del token). */
export async function misTatamisAPI(): Promise<MiTatami[]> {
  const res = await api.get('/tatamis/mios');
  return res.data as MiTatami[];
}

export interface TatamiActual {
  id: string;
  numero: number;
  estado: 'LIBRE' | 'OCUPADO';
  campeonatoId: string;
  seccionEnCurso: { seccionId: string; nombre: string; modalidad: Modalidad } | null;
  jueces: JuezTatami[];
}
/** Estado actual del tatami: sección en curso + jueces asignados. */
export async function tatamiActualAPI(tatamiId: string): Promise<TatamiActual> {
  const res = await api.get(`/tatamis/${tatamiId}/actual`);
  return res.data as TatamiActual;
}

/** Asigna (o reemplaza) el juez de un rol del tatami. */
export async function asignarJuezAPI(
  tatamiId: string,
  rol: RolTatami,
  data: { nombreDisplay: string; userEmail?: string },
) {
  const res = await api.put(`/tatamis/${tatamiId}/jueces/${rol}`, data);
  return res.data;
}

/** Quita la asignación de un rol del tatami. */
export async function quitarJuezAPI(tatamiId: string, rol: RolTatami) {
  await api.delete(`/tatamis/${tatamiId}/jueces/${rol}`);
}

/** Tatamis del campeonato con su cola (los materializa si aún no existen). */
export async function listTatamisAPI(campId: string): Promise<Tatami[]> {
  const res = await api.get(`/campeonatos/${campId}/tatamis`);
  return res.data as Tatami[];
}

/** Encola una sección al final de la cola del tatami. */
export async function encolarSeccionAPI(tatamiId: string, seccionId: string) {
  const res = await api.post(`/tatamis/${tatamiId}/cola`, { seccionId });
  return res.data;
}

/** Inicia la siguiente sección en espera del tatami. */
export async function iniciarTatamiAPI(tatamiId: string) {
  const res = await api.post(`/tatamis/${tatamiId}/iniciar`);
  return res.data;
}

/** Finaliza la sección en curso del tatami. */
export async function finalizarTatamiAPI(tatamiId: string) {
  const res = await api.post(`/tatamis/${tatamiId}/finalizar`);
  return res.data;
}

/** Mueve una sección en espera al frente de su cola. */
export async function promoverColaAPI(colaId: string) {
  const res = await api.post(`/cola/${colaId}/promover`);
  return res.data;
}

/** "Robo de modalidades": mueve una sección en espera a otro tatami. */
export async function robarColaAPI(colaId: string, tatamiId: string) {
  const res = await api.post(`/cola/${colaId}/robar`, { tatamiId });
  return res.data;
}

/** Quita una sección en espera de la cola (vuelve a estar disponible). */
export async function quitarColaAPI(colaId: string) {
  await api.delete(`/cola/${colaId}`);
}

/** Persiste el resultado final de un combate (lo envía el juez de mesa al recuperar red). */
export async function guardarCombateAPI(
  seccionId: string,
  data: {
    competidorHongId?: string;
    competidorChungId?: string;
    estado: EstadoCombate;
  },
) {
  const res = await api.post(`/secciones/${seccionId}/combates`, data);
  return res.data;
}

/** Mensaje de error del backend; concatena los motivos de R1-R5 si vienen. */
export function extraerError(e: unknown, fallback: string): string {
  if (axios.isAxiosError(e)) {
    const data = e.response?.data as
      | { error?: string; detalles?: { modalidad: string; motivo: string }[] }
      | undefined;
    if (data?.detalles?.length) {
      return data.detalles.map((d) => d.motivo).join(' ');
    }
    return data?.error ?? fallback;
  }
  return fallback;
}

export default api;
