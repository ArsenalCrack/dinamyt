'use client';

/**
 * Idiomas de la interfaz (i18n ligero, sin librerías externas).
 *
 * Es el mismo mecanismo que ya usaba Membresías, traído aquí tal cual — hasta
 * la forma de las claves— para que añadir un texto sea el mismo gesto en las
 * cuatro webs, y para que una clave se pueda mover de una a otra copiándola.
 *
 * · El español es el idioma por defecto y **la fuente de verdad**: las claves
 *   nuevas se escriben primero en `es`, y TypeScript exige su versión en los
 *   demás (`Record<ClaveTexto, string>`). Sin esa exigencia, un idioma se queda
 *   a medias y nadie se entera hasta que alguien lo usa.
 * · La elección se guarda en `users.locale` —en el servidor— y se copia al
 *   navegador para poder pintar antes de saber quién eres. Ver `lib/tema.ts`:
 *   el motivo es el mismo, y es que `localStorage` no cruza subdominios.
 *
 * En un componente:  `const { t } = useI18n(); … t('menu.perfil')`
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

/** La copia local. La verdad vive en `users.locale`. */
const STORAGE_KEY = 'dinamyt_lang';

/**
 * `es-CO` → `es`. La columna guarda el locale completo porque de él dependen
 * las fechas y los números (§4.12); el diccionario solo distingue el idioma.
 */
export function idiomaDeLocale(locale: string | null | undefined): Idioma {
  return (locale ?? '').toLowerCase().startsWith('en') ? 'en' : 'es';
}

// ─── Diccionario base (español) ──────────────────────────────────────────────
const es = {
  // ── Cabecera y navegación ──
  'app.nombre': 'DINAMYT',
  'app.lema': 'El ecosistema digital del deporte marcial',
  'menu.perfil': 'Mi perfil',
  'menu.salir': 'Salir',
  'menu.panel': 'Mis aplicaciones',
  'menu.miClub': 'Mi club',
  'menu.miOrganizacion': 'Mi organización',
  'menu.admin': 'Administración',
  'menu.apariencia': 'Tema e idioma',
  'menu.modoClaro': '☀️ Modo claro',
  'menu.modoOscuro': '🌙 Modo oscuro',
  'menu.modoSistema': '🖥️ Como el sistema',
  'menu.idioma': 'Idioma',

  // ── Login ──
  'login.eyebrow': 'Tu cuenta DINAMYT',
  'login.titulo': 'Iniciar sesión',
  'login.subtitulo': 'Una cuenta para todo el ecosistema.',
  'login.correo': 'Correo',
  'login.contrasena': 'Contraseña',
  'login.entrar': 'Entrar',
  'login.entrando': 'Entrando…',
  'login.recordar': 'Mantener la sesión iniciada en este dispositivo',
  'login.olvidada': '¿Olvidaste tu contraseña?',
  'login.verContrasena': 'Ver contraseña',
  'login.sinCuenta': '¿No tienes cuenta?',
  'login.registrate': 'Regístrate',
  'login.error': 'No se pudo iniciar sesión.',

  // ── Panel ──
  'panel.saludo': 'Hola,',
  'panel.tusApps': 'Tus aplicaciones',
  'panel.miOrganizacion': 'Mi organización',
  'panel.miOrganizacionDesc':
    'Gestiona tus clubes y tu gente, la ficha de tu club y las invitaciones entre organización y clubes.',
  'panel.abrirOrganizacion': 'Abrir mi organización',
  'panel.entrarA': 'Entrar a',
  'panel.sinApps': 'Todavía no tienes ninguna aplicación asignada.',

  // ── Perfil: la pantalla de «cómo quiero ver DINAMYT» ──
  'perfil.titulo': 'Mi perfil',
  'perfil.apariencia': 'Cómo veo DINAMYT',
  'perfil.aparienciaDesc':
    'El tema, el idioma y tu hora. Se guardan en tu cuenta, así que valen en todas las aplicaciones y en cualquier dispositivo.',
  'perfil.tema': 'Tema',
  'perfil.temaSistema': 'Como el sistema',
  'perfil.temaClaro': 'Claro',
  'perfil.temaOscuro': 'Oscuro',
  'perfil.idioma': 'Idioma',
  'perfil.tuHora': 'Tu hora',
  'perfil.guardar': 'Guardar',
  'perfil.guardando': 'Guardando…',
  'perfil.guardado': 'Guardado.',

  // ── Cosas que salen en todas partes ──
  'comun.cargando': 'Cargando…',
  'comun.cancelar': 'Cancelar',
  'comun.aceptar': 'Aceptar',
  'comun.cerrar': 'Cerrar',
  'comun.volver': 'Volver',
  'comun.error': 'Algo salió mal.',
  'comun.reintentar': 'Reintentar',

  // ── Pie ──
  'pie.ayuda': '¿Necesitas ayuda?',
  'pie.planes': 'Planes',
  'pie.privacidad': 'Privacidad',
  'pie.resultados': 'Resultados',
} as const;

export type ClaveTexto = keyof typeof es;

// ─── Inglés ──────────────────────────────────────────────────────────────────
//
// Traducido, no calcado. Dos decisiones que se repiten en todo el archivo:
//
//   · «Maestro» se queda como *Master*, no *Teacher*: es el título del arte
//     marcial, y quien lo lee en inglés lo espera así.
//   · «Mi club» / «Mi organización» conservan el posesivo. Son la casa de
//     quien entra, y en inglés «The club» suena a directorio ajeno.
const en: Record<ClaveTexto, string> = {
  'app.nombre': 'DINAMYT',
  'app.lema': 'The digital ecosystem for martial arts',
  'menu.perfil': 'My profile',
  'menu.salir': 'Sign out',
  'menu.panel': 'My apps',
  'menu.miClub': 'My club',
  'menu.miOrganizacion': 'My organization',
  'menu.admin': 'Administration',
  'menu.apariencia': 'Theme and language',
  'menu.modoClaro': '☀️ Light mode',
  'menu.modoOscuro': '🌙 Dark mode',
  'menu.modoSistema': '🖥️ Match system',
  'menu.idioma': 'Language',

  'login.eyebrow': 'Your DINAMYT account',
  'login.titulo': 'Sign in',
  'login.subtitulo': 'One account for the whole ecosystem.',
  'login.correo': 'Email',
  'login.contrasena': 'Password',
  'login.entrar': 'Sign in',
  'login.entrando': 'Signing in…',
  'login.recordar': 'Keep me signed in on this device',
  'login.olvidada': 'Forgot your password?',
  'login.verContrasena': 'Show password',
  'login.sinCuenta': "Don't have an account?",
  'login.registrate': 'Sign up',
  'login.error': 'Could not sign in.',

  'panel.saludo': 'Hello,',
  'panel.tusApps': 'Your apps',
  'panel.miOrganizacion': 'My organization',
  'panel.miOrganizacionDesc':
    'Manage your clubs and your people, your club profile, and invitations between organizations and clubs.',
  'panel.abrirOrganizacion': 'Open my organization',
  'panel.entrarA': 'Go to',
  'panel.sinApps': 'You do not have any apps assigned yet.',

  'perfil.titulo': 'My profile',
  'perfil.apariencia': 'How I see DINAMYT',
  'perfil.aparienciaDesc':
    'Theme, language and your time. They are saved to your account, so they apply across every app and on any device.',
  'perfil.tema': 'Theme',
  'perfil.temaSistema': 'Match system',
  'perfil.temaClaro': 'Light',
  'perfil.temaOscuro': 'Dark',
  'perfil.idioma': 'Language',
  'perfil.tuHora': 'Your time',
  'perfil.guardar': 'Save',
  'perfil.guardando': 'Saving…',
  'perfil.guardado': 'Saved.',

  'comun.cargando': 'Loading…',
  'comun.cancelar': 'Cancel',
  'comun.aceptar': 'OK',
  'comun.cerrar': 'Close',
  'comun.volver': 'Back',
  'comun.error': 'Something went wrong.',
  'comun.reintentar': 'Try again',

  'pie.ayuda': 'Need help?',
  'pie.planes': 'Plans',
  'pie.privacidad': 'Privacy',
  'pie.resultados': 'Results',
};

const DICCIONARIOS: Record<Idioma, Record<ClaveTexto, string>> = { es, en };

interface I18nContexto {
  idioma: Idioma;
  setIdioma: (i: Idioma) => void;
  t: (clave: ClaveTexto) => string;
}

const Ctx = createContext<I18nContexto | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // Se arranca en 'es' y se corrige tras montar: el servidor no puede leer
  // `localStorage`, y renderizar otro idioma aquí rompería la hidratación.
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
