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

/**
 * ── LA COOKIE DEL IDIOMA, que cruza las cuatro webs ──────────────────────────
 *
 * El mismo problema que el tema, y la misma solucion: `localStorage` es POR
 * ORIGEN y las apps viven en subdominios distintos, asi que elegir ingles aqui
 * no se notaba en las otras tres. La copia en `users.locale` solo llega cuando
 * hay sesion y cuando contesta el servidor.
 *
 * Una cookie en el dominio padre (`.dinamyt.org`) la leen las cuatro, y viaja
 * en el acto. Ver el bloque equivalente en el modulo del tema.
 */
const COOKIE_IDIOMA = 'dinamyt_idioma';

function dominioDeLaCookie(): string {
  if (typeof location === 'undefined') return '';
  const host = location.hostname;
  if (host === 'localhost' || /^[\d.]+$/.test(host)) return '';
  const partes = host.split('.');
  return partes.length > 2 ? `; domain=.${partes.slice(-2).join('.')}` : '';
}

/** Lo que eligio esta persona en CUALQUIERA de las cuatro webs, o `null`. */
export function idiomaDeLaCookie(): Idioma | null {
  if (typeof document === 'undefined') return null;
  const m = new RegExp(`(?:^|; )${COOKIE_IDIOMA}=([^;]*)`).exec(document.cookie);
  const v = m ? decodeURIComponent(m[1]) : null;
  return v === 'es' || v === 'en' ? v : null;
}

function guardarIdiomaEnCookie(i: Idioma) {
  if (typeof document === 'undefined') return;
  document.cookie = `${COOKIE_IDIOMA}=${i}; path=/; max-age=31536000; samesite=lax${dominioDeLaCookie()}`;
}

/**
 * `true` si esta persona ya eligio idioma EN ESTE navegador.
 *
 * Lo mira `AplicarApariencia` antes de imponer el de la cuenta: sin esto, la
 * respuesta del servidor —que puede ser mas vieja que el clic que se acaba de
 * dar— revertia la eleccion. En Campeonatos eso se veia clavado: se elegia
 * ingles y la pantalla volvia a espaniol sola, porque el idioma ni siquiera se
 * estaba guardando en la cuenta y el servidor contestaba `es-CO` cada vez.
 */
export function hayIdiomaElegido(): boolean {
  return idiomaDeLaCookie() !== null;
}

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
  /* Sin emojis, igual que en las otras tres: la palabra ya lo dice. */
  'menu.modoClaro': 'Modo claro',
  'menu.modoOscuro': 'Modo oscuro',
  'menu.modoSistema': '🖥️ Como el sistema',
  'menu.idioma': 'Idioma',

  // ── Login ──
  'login.eyebrow': 'Ecosistema DINAMYT',
  // Partido en dos: la segunda mitad va en oro, como en las otras tres.
  'login.titulo': 'Academy',
  'login.tituloAcento': 'del practicante',
  'login.subtitulo': 'Ingresa con tu cuenta del ecosistema.',
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
  'menu.modoClaro': 'Light mode',
  'menu.modoOscuro': 'Dark mode',
  'menu.modoSistema': '🖥️ Match system',
  'menu.idioma': 'Language',

  'login.eyebrow': 'DINAMYT ecosystem',
  'login.titulo': 'Academy',
  'login.tituloAcento': "for the practitioner",
  'login.subtitulo': 'Sign in with your ecosystem account.',
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

/**
 * El idioma del NAVEGADOR, reducido a los que hablamos. Es lo que se usa
 * mientras la persona no haya elegido: quien abre DINAMYT con el teléfono en
 * inglés no tiene por qué encontrarse la pantalla en español. Es lo mismo que
 * ya hace la zona horaria, que se detecta sola (§4.12).
 */
function idiomaDelNavegador(): Idioma {
  if (typeof navigator === 'undefined') return 'es';
  const lista = navigator.languages?.length
    ? navigator.languages
    : [navigator.language];
  for (const l of lista) {
    const corto = (l ?? '').toLowerCase().slice(0, 2);
    if (corto === 'en') return 'en';
    if (corto === 'es') return 'es';
  }
  return 'es';
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [idioma, setIdiomaEstado] = useState<Idioma>('es');

  useEffect(() => {
    // Lo ELEGIDO manda sobre lo detectado, como con la zona horaria: sin esto,
    // quien puso español a mano en un teléfono en inglés volvería al inglés.
    // La cookie primero: trae lo que se acaba de elegir en OTRA de las cuatro
    // webs, y `localStorage` no puede saberlo.
    const compartido = idiomaDeLaCookie();
    if (compartido) {
      setIdiomaEstado(compartido);
      // Y el `lang` del documento con él: sin esto la página se quedaba
      // anunciándose como española con el texto en inglés, que es lo que lee
      // un lector de pantalla y lo que usa el navegador para partir palabras.
      document.documentElement.lang = compartido;
      return;
    }
    try {
      const guardado = localStorage.getItem(STORAGE_KEY);
      if (guardado === 'es' || guardado === 'en') {
        setIdiomaEstado(guardado);
        return;
      }
    } catch {
      /* modo incógnito: se sigue con la detección */
    }
    setIdiomaEstado(idiomaDelNavegador());
  }, []);

  const setIdioma = useCallback((i: Idioma) => {
    setIdiomaEstado(i);
    document.documentElement.lang = i;
    guardarIdiomaEnCookie(i);
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
