'use client';

import axios from 'axios';

// La API de Campeonatos expone sus rutas en la raíz (sin prefijo /api).
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 60000,
});

// El token lo emite el ecosystem; el portal lo guarda en localStorage.
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('dinamyt_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export type EstadoCampeonato = 'BORRADOR' | 'LISTO' | 'EN_CURSO' | 'FINALIZADO';

export interface CampeonatoPublico {
  id: string;
  nombre: string;
  estado: EstadoCampeonato;
  fechaInicio: string | null;
  fechaFin: string | null;
}

/** Pantalla pública: campeonatos en curso (no requiere autenticación). */
export async function listCampeonatosPublicoAPI(): Promise<CampeonatoPublico[]> {
  const res = await api.get('/campeonatos/publico');
  return res.data as CampeonatoPublico[];
}

/** Listado para el panel admin (requiere token con scope campeonatos). */
export async function listCampeonatosAPI() {
  const res = await api.get('/campeonatos');
  return res.data;
}

export default api;
