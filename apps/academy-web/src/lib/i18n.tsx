'use client';

/**
 * Idiomas de la interfaz de Academy (i18n ligero, sin librerías externas).
 *
 * Mismo mecanismo y misma forma de clave que el portal y que Membresías: el
 * español es la fuente de verdad, TypeScript exige la versión inglesa de cada
 * clave, y la elección vive en `users.locale` —en el servidor— porque
 * `localStorage` no cruza subdominios. El diccionario sí es propio: las
 * pantallas de Academy hablan de cinturones, tareas y evaluaciones, y eso no
 * lo comparte con nadie.
 *
 * En un componente:  `const { t } = useI18n(); … t('menu.aprender')`
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

export type Idioma = 'es' | 'en';

export const IDIOMAS: { codigo: Idioma; etiqueta: string }[] = [
  { codigo: 'es', etiqueta: 'Español' },
  { codigo: 'en', etiqueta: 'English' },
];

const STORAGE_KEY = 'dinamyt_lang';

/** `es-CO` → `es`. La columna guarda el locale entero; aquí basta el idioma. */
export function idiomaDeLocale(locale: string | null | undefined): Idioma {
  return (locale ?? '').toLowerCase().startsWith('en') ? 'en' : 'es';
}

// ─── Diccionario base (español) ──────────────────────────────────────────────
const es = {
  'app.nombre': 'DINAMYT Academy',

  // ── Navegación ──
  'menu.tablero': 'Tablero',
  'menu.aprender': 'Aprender',
  'menu.progreso': 'Progreso',
  'menu.evaluaciones': 'Evaluaciones',
  'menu.figuras': 'Figuras',
  'menu.notas': 'Notas',
  'menu.calendario': 'Calendario',
  'menu.maestro': 'Panel del maestro',
  'menu.admin': 'Administración',
  'menu.perfil': 'Mi perfil',
  'menu.salir': 'Salir',
  'menu.ecosistema': 'Ir a DINAMYT',
  'menu.abrir': 'Abrir menú',
  'menu.cerrar': 'Cerrar menú',
  'menu.apariencia': 'Tema e idioma',
  'menu.modoClaro': '☀️ Modo claro',
  'menu.modoOscuro': '🌙 Modo oscuro',
  'menu.modoSistema': '🖥️ Como el sistema',
  'menu.idioma': 'Idioma',

  // ── Login ──
  'login.titulo': 'Iniciar sesión',
  'login.correo': 'Correo',
  'login.contrasena': 'Contraseña',
  'login.entrar': 'Entrar',
  'login.entrando': 'Entrando…',
  'login.error': 'No se pudo iniciar sesión.',
  'login.sso': 'Entrar con el portal DINAMYT',

  // ── Lo del arte marcial ──
  'academy.cinturon': 'Cinturón',
  'academy.grado': 'Grado',
  'academy.disciplina': 'Disciplina',
  'academy.estudiante': 'Estudiante',
  'academy.maestro': 'Maestro',
  'academy.tarea': 'Tarea',
  'academy.tareas': 'Tareas',
  'academy.evaluacion': 'Evaluación',
  'academy.nota': 'Nota',
  'academy.historial': 'Historial',
  'academy.pendiente': 'Pendiente',
  'academy.aprobado': 'Aprobado',
  'academy.entregado': 'Entregado',

  // ── Comunes ──
  'comun.cargando': 'Cargando…',
  'comun.guardar': 'Guardar',
  'comun.guardando': 'Guardando…',
  'comun.guardado': 'Guardado.',
  'comun.cancelar': 'Cancelar',
  'comun.cerrar': 'Cerrar',
  'comun.volver': 'Volver',
  'comun.error': 'Algo salió mal.',
  'comun.reintentar': 'Reintentar',
  'comun.sinDatos': 'Todavía no hay nada aquí.',
} as const;

export type ClaveTexto = keyof typeof es;

// ─── Inglés ──────────────────────────────────────────────────────────────────
//
// «Cinturón» es *belt* y «maestro» es *Master*, no *Teacher*: son el vocabulario
// del arte marcial, y quien lee en inglés los espera así. «Figuras» son *forms*
// —el nombre que tienen en competición—, no *figures*, que sería una cifra.
const en: Record<ClaveTexto, string> = {
  'app.nombre': 'DINAMYT Academy',

  'menu.tablero': 'Dashboard',
  'menu.aprender': 'Learn',
  'menu.progreso': 'Progress',
  'menu.evaluaciones': 'Assessments',
  'menu.figuras': 'Forms',
  'menu.notas': 'Grades',
  'menu.calendario': 'Calendar',
  'menu.maestro': "Master's panel",
  'menu.admin': 'Administration',
  'menu.perfil': 'My profile',
  'menu.salir': 'Sign out',
  'menu.ecosistema': 'Go to DINAMYT',
  'menu.abrir': 'Open menu',
  'menu.cerrar': 'Close menu',
  'menu.apariencia': 'Theme and language',
  'menu.modoClaro': '☀️ Light mode',
  'menu.modoOscuro': '🌙 Dark mode',
  'menu.modoSistema': '🖥️ Match system',
  'menu.idioma': 'Language',

  'login.titulo': 'Sign in',
  'login.correo': 'Email',
  'login.contrasena': 'Password',
  'login.entrar': 'Sign in',
  'login.entrando': 'Signing in…',
  'login.error': 'Could not sign in.',
  'login.sso': 'Sign in with the DINAMYT portal',

  'academy.cinturon': 'Belt',
  'academy.grado': 'Rank',
  'academy.disciplina': 'Discipline',
  'academy.estudiante': 'Student',
  'academy.maestro': 'Master',
  'academy.tarea': 'Assignment',
  'academy.tareas': 'Assignments',
  'academy.evaluacion': 'Assessment',
  'academy.nota': 'Grade',
  'academy.historial': 'History',
  'academy.pendiente': 'Pending',
  'academy.aprobado': 'Passed',
  'academy.entregado': 'Submitted',

  'comun.cargando': 'Loading…',
  'comun.guardar': 'Save',
  'comun.guardando': 'Saving…',
  'comun.guardado': 'Saved.',
  'comun.cancelar': 'Cancel',
  'comun.cerrar': 'Close',
  'comun.volver': 'Back',
  'comun.error': 'Something went wrong.',
  'comun.reintentar': 'Try again',
  'comun.sinDatos': 'Nothing here yet.',
};

const DICCIONARIOS: Record<Idioma, Record<ClaveTexto, string>> = { es, en };

interface I18nContexto {
  idioma: Idioma;
  setIdioma: (i: Idioma) => void;
  t: (clave: ClaveTexto) => string;
}

const Ctx = createContext<I18nContexto | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [idioma, setIdiomaEstado] = useState<Idioma>('es');

  useEffect(() => {
    try {
      const guardado = localStorage.getItem(STORAGE_KEY);
      if (guardado === 'es' || guardado === 'en') setIdiomaEstado(guardado);
    } catch {
      /* modo incógnito: se queda en español */
    }
  }, []);

  const setIdioma = useCallback((i: Idioma) => {
    setIdiomaEstado(i);
    document.documentElement.lang = i;
    try {
      localStorage.setItem(STORAGE_KEY, i);
    } catch {
      /* la elección aplica solo a esta pestaña */
    }
  }, []);

  const t = useCallback(
    (clave: ClaveTexto) => DICCIONARIOS[idioma][clave] ?? es[clave] ?? clave,
    [idioma],
  );

  return (
    <Ctx.Provider value={{ idioma, setIdioma, t }}>{children}</Ctx.Provider>
  );
}

export function useI18n(): I18nContexto {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useI18n debe usarse dentro de <I18nProvider>');
  return ctx;
}
