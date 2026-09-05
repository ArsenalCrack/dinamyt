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
  // El título va partido en dos: la segunda mitad se pinta en oro, igual que
  // en Membresías («Mi Club»), Academy y Campeonatos. Es la firma de la
  // pantalla de entrar en todo el ecosistema.
  'login.titulo': 'Iniciar',
  'login.tituloAcento': 'sesión',
  'login.subtitulo': 'Una cuenta para todo el ecosistema.',
  'login.yVuelvesA': 'Al entrar, vuelves a',
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

  // ── Registro y recuperar: la misma familia que el login ──
  'registro.eyebrow': 'Tu cuenta DINAMYT',
  'registro.titulo': 'Crear',
  'registro.tituloAcento': 'cuenta',
  'registro.subtitulo': 'Una sola cuenta para Membresías, Campeonatos y Academy.',
  'recuperar.eyebrow': 'Tu cuenta DINAMYT',
  'recuperar.titulo': 'Recuperar',
  'recuperar.tituloAcento': 'contraseña',

  // ── Panel ──
  'panel.saludo': 'Hola,',
  'panel.tusApps': 'Tus aplicaciones',
  'panel.miOrganizacion': 'Mi organización',
  'panel.miOrganizacionDesc':
    'Gestiona tus clubes y tu gente, la ficha de tu club y las invitaciones entre organización y clubes.',
  'panel.abrirOrganizacion': 'Abrir mi organización',
  'panel.entrarA': 'Entrar a',
  'panel.sinApps': 'Todavía no tienes ninguna aplicación asignada.',
  'panel.miClub': 'Mi club',
  'panel.verMiClub': 'Ver la información de mi club',
  'panel.admin': 'Administración del ecosistema',
  'panel.verCampeonatos': 'Ver campeonatos y resultados',

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
  // ── Mi perfil ──
  // La pantalla donde vive el selector de idioma, asi que es la primera en la
  // que se NOTA que el idioma funciona: dejarla a medias era enseñar el boton
  // en una pagina que no cambia.
  'perfil.eyebrow': 'Una persona, un perfil',
  'perfil.documento': 'Documento',
  'perfil.misApps': '← Mis aplicaciones',
  'perfil.progreso': 'Tu perfil está al',
  'perfil.completo': '✓ Completo',
  'perfil.pendientes': 'pendiente(s)',
  'perfil.teFalta': 'Te falta:',
  'perfil.requisito':
    'Un perfil completo es requisito para inscribirte a campeonatos.',
  'perfil.foto': 'Foto de perfil',
  'perfil.fotoDesc':
    'Sube una foto desde tu computador o celular. Se recorta al centro y se guarda al presionar «Guardar cambios».',
  'perfil.tuFoto': 'Tu foto de perfil',
  'perfil.correoVerificado': 'Correo verificado',
  'perfil.miembroDesde': 'Miembro desde',
  'perfil.datosPersonales': 'Datos personales',
  'perfil.nombreCompleto': 'Nombre completo',
  'perfil.nombreSoloLetras': 'Nombre (solo letras)',
  'perfil.telefono': 'Teléfono',
  'perfil.nacimiento': 'Fecha de nacimiento',
  'perfil.genero': 'Género',
  'perfil.selecciona': '— Selecciona —',
  'perfil.tipoSangre': 'Tipo de sangre',
  'perfil.porRegistrar': '— Por registrar —',
  'perfil.emergencia': 'Contacto de emergencia',
  'perfil.parentesco': 'Parentesco',
  'perfil.parentescoContacto': 'Parentesco del contacto',
  'perfil.notasMedicas': 'Alergias, condiciones, medicamentos…',
  'perfil.disciplinas': 'Mis disciplinas y grado',
  'perfil.disciplinaGrado': 'Disciplina y grado (los asigna tu maestro)',
  'perfil.cambiarContrasena': 'Cambiar contraseña',
  'perfil.guardarCambios': 'Guardar cambios',
  'perfil.telefonoSoloNumeros': 'Teléfono (solo números)',
  'perfil.nombreLoCorrigeMaestro':
    'Solo tu maestro o un administrador puede corregirlo.',

  // ── Planes ──
  // El escaparate. Es publico: lo lee gente que todavia no tiene cuenta, y por
  // eso se traduce entero — la pagina que decide una compra no puede ser la
  // unica que solo habla un idioma.
  'planes.eyebrow': 'Suscripción por organización',
  'planes.titulo': 'Planes',
  'planes.inicio': '← Inicio',
  'planes.comoSeCobra': 'Cómo se cobra',
  'planes.porOrg': 'Por organización',
  'planes.porOrgDetalle': 'club, liga o federación — no por persona',
  'planes.cuentaGratis': 'La cuenta es gratis',
  'planes.cuentaGratisDetalle': 'se paga que el club use las apps',
  'planes.seCotiza': 'El precio se cotiza',
  'planes.seCotizaDetalle': 'depende del tamaño del club',
  'planes.sinPasarela': 'Sin pasarela',
  'planes.sinPasarelaDetalle': 'efectivo, transferencia, Nequi o Daviplata',
  'planes.pedirCotizacion': 'Pedir una cotización',
  'planes.pedirCotizacionCorta': 'Pedir cotización',
  'planes.asuntoGenerico': 'quiero una cotización',
  'planes.queEntra': 'Qué entra en cada plan',
  'planes.errorCargar': 'No se pudieron cargar los planes. Escríbenos a',
  'planes.errorCargar2': 'y te contamos por correo.',
  'planes.dudas': '¿Dudas sobre cuál te conviene, o necesitas algo que no está en esta lista?',
  // Lo que se lleva quien contrata cada aplicacion. Cada linea dice QUE
  // CONSIGUE, no con que mecanismo: nadie contrata un carnet QR, se contrata
  // dejar de perseguir a quien no pago.
  'planes.memb1': 'Sabes quién está al día y quién debe',
  'planes.memb2': 'Cobras, y el vencimiento se actualiza solo',
  'planes.memb3': 'Pasas lista en la puerta, con o sin internet',
  'planes.memb4': 'Tus alumnos se enteran antes de que se les venza',
  'planes.memb5': 'Ves el recaudo y la asistencia del mes',
  'planes.camp1': 'Montas el campeonato y armas las llaves',
  'planes.camp2': 'Los maestros inscriben a su gente y tú apruebas',
  'planes.camp3': 'Cada juez puntúa desde su tatami',
  'planes.camp4': 'El público sigue el marcador en vivo',
  'planes.camp5': 'Al terminar, resultados publicados y reportes listos',
  'planes.acad1': 'Cada alumno ve qué le falta para el próximo cinturón',
  'planes.acad2': 'Sus evaluaciones de grado quedan guardadas',

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
  'login.titulo': 'Sign',
  'login.tituloAcento': 'in',
  'login.subtitulo': 'One account for the whole ecosystem.',
  'login.yVuelvesA': 'When you sign in, you go back to',
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

  'registro.eyebrow': 'Your DINAMYT account',
  'registro.titulo': 'Create',
  'registro.tituloAcento': 'account',
  'registro.subtitulo': 'One account for Membresías, Campeonatos and Academy.',
  'recuperar.eyebrow': 'Your DINAMYT account',
  'recuperar.titulo': 'Reset',
  'recuperar.tituloAcento': 'password',

  'panel.saludo': 'Hello,',
  'panel.tusApps': 'Your apps',
  'panel.miOrganizacion': 'My organization',
  'panel.miOrganizacionDesc':
    'Manage your clubs and your people, your club profile, and invitations between organizations and clubs.',
  'panel.abrirOrganizacion': 'Open my organization',
  'panel.entrarA': 'Go to',
  'panel.sinApps': 'You do not have any apps assigned yet.',
  'panel.miClub': 'My club',
  'panel.verMiClub': "See my club's information",
  'panel.admin': 'Ecosystem administration',
  'panel.verCampeonatos': 'See championships and results',

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

  'perfil.eyebrow': 'One person, one profile',
  'perfil.documento': 'ID number',
  'perfil.misApps': '← My apps',
  'perfil.progreso': 'Your profile is',
  'perfil.completo': '✓ Complete',
  'perfil.pendientes': 'missing',
  'perfil.teFalta': 'Still missing:',
  'perfil.requisito':
    'A complete profile is required to enter championships.',
  'perfil.foto': 'Profile photo',
  'perfil.fotoDesc':
    'Upload a photo from your computer or phone. It is cropped to the centre and saved when you press «Save changes».',
  'perfil.tuFoto': 'Your profile photo',
  'perfil.correoVerificado': 'Email verified',
  'perfil.miembroDesde': 'Member since',
  'perfil.datosPersonales': 'Personal details',
  'perfil.nombreCompleto': 'Full name',
  'perfil.nombreSoloLetras': 'Name (letters only)',
  'perfil.telefono': 'Phone',
  'perfil.nacimiento': 'Date of birth',
  'perfil.genero': 'Gender',
  'perfil.selecciona': '— Select —',
  'perfil.tipoSangre': 'Blood type',
  'perfil.porRegistrar': '— Not recorded —',
  'perfil.emergencia': 'Emergency contact',
  'perfil.parentesco': 'Relationship',
  'perfil.parentescoContacto': "Contact's relationship",
  'perfil.notasMedicas': 'Allergies, conditions, medication…',
  'perfil.disciplinas': 'My disciplines and rank',
  'perfil.disciplinaGrado': 'Discipline and rank (your master assigns them)',
  'perfil.cambiarContrasena': 'Change password',
  'perfil.guardarCambios': 'Save changes',
  'perfil.telefonoSoloNumeros': 'Phone (digits only)',
  'perfil.nombreLoCorrigeMaestro':
    'Only your master or an administrator can correct it.',

  'planes.eyebrow': 'Subscription per organization',
  'planes.titulo': 'Plans',
  'planes.inicio': '← Home',
  'planes.comoSeCobra': 'How billing works',
  'planes.porOrg': 'Per organization',
  'planes.porOrgDetalle': 'club, league or federation — not per person',
  'planes.cuentaGratis': 'The account is free',
  'planes.cuentaGratisDetalle': 'you pay for the club to use the apps',
  'planes.seCotiza': 'Pricing is quoted',
  'planes.seCotizaDetalle': 'it depends on the size of the club',
  'planes.sinPasarela': 'No payment gateway',
  'planes.sinPasarelaDetalle': 'cash, bank transfer, Nequi or Daviplata',
  'planes.pedirCotizacion': 'Request a quote',
  'planes.pedirCotizacionCorta': 'Request a quote',
  'planes.asuntoGenerico': 'I would like a quote',
  'planes.queEntra': "What each plan includes",
  'planes.errorCargar': 'Plans could not be loaded. Write to us at',
  'planes.errorCargar2': 'and we will tell you by email.',
  'planes.dudas': 'Not sure which one fits, or need something that is not on this list?',
  'planes.memb1': 'You know who is up to date and who owes',
  'planes.memb2': 'You take payment, and the due date updates itself',
  'planes.memb3': 'You take attendance at the door, online or not',
  'planes.memb4': 'Your students hear about it before it runs out',
  'planes.memb5': "You see the month's revenue and attendance",
  'planes.camp1': 'You set up the championship and build the brackets',
  'planes.camp2': 'Masters enter their people and you approve',
  'planes.camp3': 'Each judge scores from their own mat',
  'planes.camp4': 'The audience follows the scoreboard live',
  'planes.camp5': 'When it ends, results published and reports ready',
  'planes.acad1': 'Each student sees what is left for the next belt',
  'planes.acad2': 'Their grading assessments are kept',

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

/**
 * El idioma del NAVEGADOR, reducido a los que hablamos.
 *
 * Es lo que se usa cuando la persona todavía no ha elegido. Un alumno que
 * abre DINAMYT con el teléfono en inglés no tiene por qué encontrarse la
 * pantalla en español y tener que ir a buscar dónde se cambia: eso es lo
 * mismo que ya hace la zona horaria (§4.12), que se detecta sola.
 *
 * `navigator.languages` antes que `navigator.language`: la lista trae el
 * orden de preferencia de verdad, y la primera que sepamos hablar es la que
 * gana. Si no hay ninguna, español, que es donde está todo el uso de hoy.
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
  // Se arranca en 'es' y se corrige tras montar: el servidor no puede leer
  // `localStorage` ni `navigator`, y renderizar otro idioma aquí rompería la
  // hidratación.
  const [idioma, setIdiomaEstado] = useState<Idioma>('es');

  useEffect(() => {
    // El orden importa, y es el mismo que el de la zona horaria: lo que la
    // persona ELIGIÓ manda sobre lo que se detecta. Sin esto, quien puso
    // español a mano en un teléfono en inglés volvería al inglés cada vez.
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
