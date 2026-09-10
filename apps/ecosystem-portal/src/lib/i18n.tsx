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
  // ⚠️ `>= 2` y no `> 2`. Aquí estaba el fallo de «el tema y el idioma no se
  // sincronizan»: el portal vive en `dinamyt.org` —DOS etiquetas—, así que era
  // la única de las cuatro webs que escribía esta cookie SIN dominio, y una
  // cookie sin dominio es de ese host y de nadie más. Elegir el modo claro o el
  // inglés EN EL PORTAL —que es justo donde está Configuración, o sea donde se
  // elige de verdad— no llegaba a Membresías ni a Campeonatos. Al revés sí
  // funcionaba, porque los subdominios tienen tres etiquetas: de ahí el «unas
  // veces cruza y otras no».
  return partes.length >= 2 ? `; domain=.${partes.slice(-2).join('.')}` : '';
}

/** Lo que eligio esta persona en CUALQUIERA de las cuatro webs, o `null`. */
/**
 * La firma de la cookie: `en~<id>`. Es el mismo mecanismo que el del tema, y
 * está por lo mismo — la cookie es del NAVEGADOR y no de la cuenta, así que sin
 * firma quien salía de una cuenta y entraba en otra se encontraba el idioma de
 * la anterior. Ver el bloque «DE QUIÉN ES LA ELECCIÓN» en el módulo del tema.
 */
const ANON = 'anon';

/** Quién está dentro AHORA. Lo fija `AplicarApariencia` al montar. */
let cuentaActual: string | null = null;

export function fijarCuentaIdioma(id: string | null): void {
  cuentaActual = id || null;
}

function brutoIdioma(): string | null {
  if (typeof document === 'undefined') return null;
  const m = new RegExp(`(?:^|; )${COOKIE_IDIOMA}=([^;]*)`).exec(document.cookie);
  return m ? decodeURIComponent(m[1]) : null;
}

function partesIdioma(bruto: string | null): { valor: string; de: string } {
  if (!bruto) return { valor: '', de: '' };
  const i = bruto.indexOf('~');
  return i === -1
    ? { valor: bruto, de: ANON }
    : { valor: bruto.slice(0, i), de: bruto.slice(i + 1) || ANON };
}

export function idiomaDeLaCookie(): Idioma | null {
  // Sin la firma: para PINTAR da igual de quién sea.
  const { valor } = partesIdioma(brutoIdioma());
  return valor === 'es' || valor === 'en' ? valor : null;
}

/**
 * Borra el idioma guardado EN ESTE NAVEGADOR. La usa la salida de sesión, por
 * lo mismo que su gemela del tema: la siguiente persona que entre aquí no debe
 * heredar el idioma de la anterior. `users.locale` no se toca.
 */
export function olvidarIdiomaDeEsteNavegador(): void {
  if (typeof document === 'undefined') return;
  const dominio = dominioDeLaCookie();
  if (dominio) document.cookie = `${COOKIE_IDIOMA}=; path=/; max-age=0`;
  document.cookie = `${COOKIE_IDIOMA}=; path=/; max-age=0${dominio}`;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* modo incógnito: no había copia que borrar */
  }
}

function guardarIdiomaEnCookie(i: Idioma) {
  if (typeof document === 'undefined') return;
  const dominio = dominioDeLaCookie();
  // Y antes de escribir, se borra la copia SIN dominio que dejó la versión
  // anterior en `dinamyt.org`. Si no, quedan DOS cookies con este nombre —la
  // de host y la de dominio— y `document.cookie` devuelve las dos: el portal
  // seguiría leyendo la vieja para siempre, que es el fallo de arriba con otro
  // disfraz. Borrar sin dominio solo afecta a la de host: la identidad de una
  // cookie es (nombre, dominio, ruta).
  if (dominio) document.cookie = `${COOKIE_IDIOMA}=; path=/; max-age=0`;
  // Firmada con quien está dentro, como la del tema.
  document.cookie = `${COOKIE_IDIOMA}=${i}~${cuentaActual ?? ANON}; path=/; max-age=31536000; samesite=lax${dominio}`;
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
  const { valor, de } = partesIdioma(brutoIdioma());
  if (valor !== 'es' && valor !== 'en') return false;
  // De OTRA cuenta no cuenta: que exista una elección en este navegador no
  // significa que sea de quien está dentro ahora.
  return de === ANON || !cuentaActual || de === cuentaActual;
}

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
  // Sin emojis: se quitaron de los menús de las otras tres webs y el portal se
  // había quedado atrás. Un emoji delante de «Modo claro» no dice nada que la
  // palabra no diga, y en Android se pinta con otra fuente y otro tamaño.
  'menu.modoClaro': 'Modo claro',
  'menu.modoOscuro': 'Modo oscuro',
  'menu.modoSistema': 'Como el sistema',
  'menu.idioma': 'Idioma',
  // ── La barra del portal ──
  'menu.ecosistema': 'Ecosistema',
  'menu.navegacion': 'Ir a',
  'menu.abrir': 'Abrir el menú',
  'menu.cerrar': 'Cerrar el menú',

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

  // ── Configuración ──
  // Lo que NO es el perfil. Ver `app/configuracion/page.tsx`: el perfil es
  // quién eres —lo que las apps leen de ti—, y esto es cómo quieres usar la
  // cuenta. Estaban mezclados en la misma pantalla.
  'config.titulo': 'Configuración',
  'config.eyebrow': 'Una cuenta, la misma en todas partes',
  'config.desc':
    'Lo que elijas aquí vale en DINAMYT, en Campeonatos, en Membresías y en Academy, y en cualquier dispositivo donde entres.',
  'config.seguridad': 'Seguridad',
  'config.seguridadDesc':
    'Tu contraseña es una sola para todo DINAMYT, y las sesiones abiertas se cierran desde aquí.',
  // Sin flecha: en la cabecera hay DOS enlaces y solo uno es «atrás». Con
  // flecha los dos, parecían dos botones de volver y no se sabía cuál era cuál
  // — es la misma forma que ya tenía el perfil: al lado, «Configuración»
  // (lateral, sin flecha) y «← Mis aplicaciones» (el de volver).
  'config.irAlPerfil': 'Mi perfil',
  'config.desdeElPerfil': 'Configuración',
  'config.enElPerfilNo':
    'El tema, el idioma, tu hora y tus sesiones se cambian en Configuración.',

  // ── Textos que estaban escritos a mano en las pantallas ──
  'config.contrasenaActual': 'Contraseña actual',
  'config.contrasenaNueva': 'Nueva contraseña',
  'config.actualizarContrasena': 'Actualizar contraseña',
  'config.contrasenaLista': 'Contraseña actualizada.',
  'config.cargando': 'Cargando…',
  'panel.abrirAdmin': 'Abrir panel de administración',
  'panel.adminDesc': 'Organizaciones, miembros con su rol y suscripciones a planes.',
  'panel.membresiasCortado': 'Tu acceso a Membresías está desactivado',
  'perfil.sinDisciplinas': 'Aún no tienes disciplinas registradas.',
  'perfil.cinturon': 'Cinturón',
  'perfil.entrenaDesde': 'Entrena desde',
  'perfil.enTuCarnet': 'Va impresa en tu carnet de Membresías.',
  'perfil.notasMedicasEtq': 'Notas médicas (solo las ve tu maestro; se guardan cifradas)',
  'config.dispositivos': 'Dispositivos conectados',
  'config.dispositivosDesc': 'Dónde está abierta tu cuenta. Si ves algo que no reconoces, ciérralo.',
  'config.sinOtrasSesiones': 'No hay ninguna otra sesión abierta.',
  'comun.cerrarAviso': 'Cerrar el aviso',

  'menu.superAdmin': 'Super administrador',
  'club.sinClub': 'Aún no perteneces a un club.',
  'club.editarFicha': 'Editar la información del club',
  'club.logo': 'Logo del club',
  'club.nombre': 'Nombre del club *',
  'club.descripcion': 'Descripción',
  'club.descripcionPh': 'Qué se entrena, para quién, desde cuándo…',
  'club.horarios': 'Horarios de clase',
  'club.sede': 'Sede / dirección',
  'club.telefono': 'Teléfono',
  'club.telefonoContacto': 'Teléfono de contacto',
  'club.maestros': 'Maestros y administradores',
  'login.otraCuenta': 'Entrar con otra cuenta',
  'login.recordarme': 'Mantener la sesión iniciada en este dispositivo',
  'login.yaHaySesion': 'Ya hay una sesión abierta',
  'comun.codigo': 'Código',
  'recuperar.nuevaContrasena': 'Elige tu nueva contraseña',
  'comun.iniciarSesion': 'Iniciar sesión',
  'recuperar.volverAlLogin': 'Volver a iniciar sesión',
  'registro.eligeFecha': 'Elige tu fecha',
  'registro.iniciaSesion': 'Inicia sesión',
  'verificar.titulo': 'Confirma tu correo',
  'poner.enlaceIncompleto': 'Este enlace está incompleto. Ábrelo tal cual te llegó, sin recortarlo.',
  'poner.irAlLogin': 'Ir a iniciar sesión',
  'poner.titulo': 'Pon tu contraseña',
  'salir.cerrando': 'Cerrando tu sesión de DINAMYT…',
  'pie.obra': 'DINAMYT Ecosystem es una obra protegida por el derecho de autor.',
  // ── LA POLÍTICA DE PRIVACIDAD ────────────────────────────────────────────
  //
  // Es la política que el registro referencia al pedir el consentimiento, así
  // que su texto es el compromiso legal: no se adorna y no se acorta por gusto.
  //
  // Los nombres de la ley y de la figura jurídica se quedan en español también
  // en inglés («Ley 1581 de 2012», «habeas data»): son el instrumento concreto
  // que aplica, no una descripción que se pueda traducir.
  'priv.ley': 'Ley 1581 de 2012 · Colombia',
  'priv.titulo': 'Política de privacidad',
  'priv.actualizado': 'Última actualización: septiembre de 2026 · Responsable: DINAMYT Ecosystem',
  'priv.queDatos': 'Qué datos tratamos',
  'priv.identificacion': 'Identificación:',
  'priv.identificacionTexto': 'nombre, documento, correo, teléfono y fecha de nacimiento.',
  'priv.deportivos': 'Deportivos:',
  'priv.deportivosTexto': 'club, disciplina, grado (cinturón), peso, inscripciones, resultados de competencia y asistencia a clases.',
  'priv.sensibles': 'Sensibles (opcionales):',
  'priv.sensiblesA': 'contacto de emergencia y notas médicas. Se guardan',
  'priv.cifrados': 'cifrados',
  'priv.sensiblesB': '(AES-256-GCM) y solo los ve el maestro/administrador de tu club.',
  'priv.pago': 'De pago:',
  'priv.pagoA': 'registro de pagos hechos en el club (efectivo, transferencia, Nequi, Daviplata). DINAMYT',
  'priv.noProcesa': 'no procesa pagos en línea',
  'priv.pagoB': 'ni guarda datos de tarjetas.',
  'priv.paraQue': 'Para qué los usamos',
  'priv.uso1': 'Operar tu cuenta única del ecosistema (identidad y accesos por rol).',
  'priv.uso2': 'Gestionar campeonatos: inscripciones, categorías, llaves y resultados públicos.',
  'priv.uso3': 'Controlar mensualidades y asistencia del club, y enviarte recordatorios (correo y notificaciones push que tú activas).',
  'priv.uso4': 'Conservar tu historial deportivo: cada participación guarda el grado y club del momento en que competiste.',
  'priv.conQuien': 'Con quién se comparten',
  'priv.conQuienTexto': 'Con tu club/federación (sus administradores ven a sus propios miembros) y, en campeonatos, los resultados son públicos con tu nombre y club, como en cualquier evento deportivo. No vendemos ni cedemos datos a terceros.',
  'priv.derechos': 'Tus derechos (habeas data)',
  'priv.derechosA': 'Puedes conocer, actualizar, rectificar y suprimir tus datos, y revocar la autorización. La mayoría los editas tú en',
  'priv.miPerfil': 'Mi perfil',
  'priv.derechosB': '; para supresión de la cuenta o reclamos escribe a',
  'priv.derechosC': ', y si lo que tienes es un problema para entrar o usar tu cuenta, a',
  'priv.derechosD': '. Los menores de edad se registran y gestionan con autorización de su acudiente.',
  'priv.seguridad': 'Seguridad y conservación',
  'priv.seguridadTexto': 'Contraseñas con hash (bcrypt), datos sensibles cifrados, acceso por roles y comunicación por HTTPS. Los datos se conservan mientras tu cuenta exista; el historial deportivo es inmutable por diseño (registra lo que ocurrió en cada competencia).',
  'priv.volver': '← Volver al inicio',
  // ── LA PORTADA PÚBLICA ───────────────────────────────────────────────────
  //
  // Era la única pantalla grande del portal escrita entera a mano. Es la puerta
  // de entrada de todo el mundo, así que era también la más visible sin traducir.
  //
  // Lo que NO se traduce y no es descuido: «Hapkido», «Hong», «Chung»,
  // «KyongGo» y «GamJeum» son del arte, no del idioma; los nombres de las ligas
  // y de las personas del ejemplo son nombres propios.
  'portada.entrar': 'Iniciar sesión',
  'portada.eyebrow': 'Hapkido · Colombia',
  'portada.titulo1': 'Se acabó',
  'portada.titulo2': 'el cuaderno',
  'portada.titulo3': 'del club.',
  'portada.sub': 'Mensualidades, asistencia y campeonatos en un solo sitio. Tus alumnos entran con la misma cuenta que tú.',
  'portada.crearCuenta': 'Crear mi cuenta',
  'portada.verResultados': 'Ver resultados',
  'portada.gratis': 'La cuenta es gratis. Las apps van con la suscripción del club —',
  'portada.comoSeCobra': 'cómo se cobra',
  'portada.ahora': 'Sucediendo ahora',
  'portada.enVivo': 'En vivo',
  'portada.tiempoReal': 'Tatamis y resultados en tiempo real →',
  'portada.empieza': 'Empieza por tu club',
  'portada.empiezaSub': 'Creas tu cuenta, fundas tu club y le pasas el código a tus alumnos.',
  'portada.escribenos': 'Escríbenos',
  'portada.sinRed': 'Sin red',
  'portada.sinRedSub': 'Si se cae el internet del coliseo, el campeonato sigue. Si se cae el del salón, la clase también.',
  'portada.cadaQuien': 'Cada quien ve lo suyo',
  // Las cifras de la franja.
  'portada.cifra.tatamis': 'tatamis a la vez',
  'portada.cifra.jueces': 'jueces por tatami',
  'portada.cifra.planes': 'tipos de plan',
  'portada.cifra.marcar': 'formas de marcar',
  'portada.cifra.sinSenal': 'días sin señal',
  // Los papeles que reconoce el ecosistema.
  'rol.federacion': 'Federación',
  'rol.maestro': 'Maestro',
  'rol.auxiliar': 'Auxiliar',
  'rol.acudiente': 'Acudiente',
  'rol.alumno': 'Alumno',
  'rol.juez': 'Juez',
  // El selector de aplicaciones.
  'apps.eyebrow': 'El ecosistema',
  'apps.titulo': 'Una cuenta, tus apps',
  'apps.aria': 'Aplicaciones',
  'apps.noSeOfrece': 'Todavía no se ofrece.',
  'apps.teAvisamos': 'si la quieres para tu club y te avisamos.',
  'apps.proximamente': 'Próximamente',
  'apps.enProduccion': 'En producción',
  'apps.memb.titulo': 'El club, al día',
  'apps.memb.l1': 'Sabes quién está al día y quién debe',
  'apps.memb.l2': 'Cobras, y el vencimiento se actualiza solo',
  'apps.memb.l3': 'Pasas lista en la puerta, sin papel',
  'apps.memb.l4': 'Tus alumnos se enteran antes de que se les venza',
  'apps.memb.l5': 'Ves el recaudo y la asistencia del mes',
  'apps.memb.cta': 'Entrar a Membresías',
  'apps.camp.titulo': 'El torneo, de punta a punta',
  'apps.camp.l1': 'Montas el campeonato y armas las llaves',
  'apps.camp.l2': 'Los maestros inscriben a su gente y tú apruebas',
  'apps.camp.l3': 'Cada juez puntúa desde su tatami',
  'apps.camp.l4': 'El público sigue el marcador en vivo',
  'apps.camp.l5': 'Al terminar, los resultados quedan publicados',
  'apps.camp.cta': 'Ver campeonatos',
  'apps.acad.titulo': 'La formación del practicante',
  'apps.acad.l1': 'Cada alumno ve qué le falta para el próximo cinturón',
  'apps.acad.l2': 'Sus evaluaciones de grado quedan en su historial',
  'apps.acad.l3': 'El maestro sigue el avance de todo su grupo',
  'apps.acad.cta': 'Entrar a Academy',
  // Las dos maquetas de ejemplo.
  'demo.camp': 'Campeonatos · el marcador',
  'demo.tatami': 'Tatami 1 · Semifinal',
  'demo.jueces': '4 jueces + central',
  'demo.memb': 'Membresías · pasar lista',
  'demo.marco': 'Ana Gómez marcó asistencia',
  'demo.conCarnet': 'Entró con su carnet',
  'demo.alDia': 'Al día',
  // El paso de páginas, el mismo de las cuatro webs.
  'pag.de': 'de',
  'pag.anterior': '‹ Anterior',
  'pag.siguiente': 'Siguiente ›',
  'avisos.deTuClub': 'Avisos de tu club',
  'avisos.listo': 'Listo. Te escribiremos cuando alguien quiera entrar a tu club.',
  'avisos.pedir': '¿Te avisamos cuando pase algo en tu club?',
  'avisos.marcarLeido': 'Marcar como leído',
  'sesion.sigoAqui': 'Sigo aquí',
  'sesion.porCerrarse': 'Tu sesión está a punto de cerrarse',
  'club.entrarTitulo': 'Entrar a un club',
  'club.codigo': 'Código del club',
  'club.codigoPh': 'Código del club (p. ej. K7QM3XPD)',
  'club.mensajeMaestro': 'Mensaje para el maestro',
  'club.esperando': 'Esperando al maestro',
  'geo.escribeCiudad': 'Escribe la ciudad',
  'geo.volverLista': 'Volver a la lista de ciudades',
  'geo.eligePais': '— Elige el país —',
  'org.eresTu': 'Eres tú: tu propio rol no lo cambias desde aquí',
  'fecha.cambiarVista': 'Cambiar entre días y años',

  'org.sinOrganizacion': 'No gestionas ninguna organización.',
  'org.invitarClub': 'Invitar un club existente',
  'org.buscarGente': 'Buscar entre la gente del club',
  'org.buscarPh': 'Buscar por nombre o correo…',
  'org.quitarDelClub': 'Quitar del club',
  'org.noTeSacas': 'No puedes sacarte de tu propio club. Si de verdad quieres salir, que te saque otra persona que lo administre, o el super administrador.',
  'org.quitarBaja': 'Quitar esta baja de la lista',
  'org.eliminarClub': 'Eliminar club (solo si no tiene miembros ni suscripciones)',
  'org.escudo': 'Escudo del club',
  'org.correoContacto': 'Correo de contacto',
  'org.direccion': 'Dirección / sede',
  'org.telefonoDigitos': 'Teléfono (solo números)',
  'org.enDirectorio': 'Mostrar este club en el directorio público de DINAMYT',
  'miembro.edicionStaff': 'Edición del staff',
  'miembro.cinturonPromocion': 'Cinturón (promoción)',
  'miembro.emergencia': 'Contacto de emergencia',
  'miembro.nacimiento': 'Fecha de nacimiento',
  'miembro.genero': 'Género',
  'miembro.notasMedicas': 'Notas médicas (se guardan cifradas)',
  'miembro.telefono': 'Teléfono',
  'miembro.tipoSangre': 'Tipo de sangre',
  // Una línea que diga QUÉ se hace en esta pantalla, y nada más. Lo demás —los
  // dos caminos, qué pasa al aceptar— se ve en los dos apartados de abajo.
  'codigo.intro': 'Aquí decides quién entra a tu club: comparte tu código o envía una invitación.',
  'codigo.tuCodigo': '1 · Tu código',
  'codigo.pidenEntrar': 'Piden entrar',
  'codigo.aceptar': 'Aceptar',
  'codigo.rechazar': 'Rechazar',
  'codigo.verElMio': 'Ver el código de mi club',
  'codigo.generar': 'Generar un código',
  'codigo.regenerar': 'Genera uno nuevo. Quien ya entró sigue dentro.',
  'codigo.sinCodigo': 'Tu club no admite entradas por código.',
  'codigo.pasaEnlace': 'Pásale este enlace:',
  'codigo.nadieEspera': 'Nadie está esperando.',
  'codigo.sinContrasena': 'Aún no ha puesto su contraseña',
  'codigo.correoInvitado': 'Correo de quien invitas',
  'codigo.nombreSiNoTiene': 'Nombre completo — solo si todavía no tiene cuenta',
  'codigo.mensajeOpcional': 'Un mensaje para ella (opcional)',
  'codigo.ejemploMensaje': '«eres del grupo de los martes»',
  'codigo.leLlega': 'Le llega un correo y le aparece en su DINAMYT.',
  'zona.deEsteDispositivo': 'Zona de este dispositivo',
  'zona.usarLaDeAqui': 'Usar la de este dispositivo',
  'panel.abrirOrganizacion2': 'Abrir mi organización',
  'club.logo2': 'Logo del club',
  'comun.iniciarSesion2': 'Iniciar sesión',
  'login.olvidada2': '¿Olvidaste tu contraseña?',
  'comun.codigo2': 'Código',
  'avisos.deTuClub2': 'Avisos de tu club',
  'avisos.marcarLeido2': 'Marcar como leído',
  'club.mensajePh': 'Opcional: «soy el papá de Ana», «entreno los martes»',
  'avisos.apagar': 'Puedes apagarlos cuando quieras desde la campana.',

  'club.cargando': 'Cargando la información de tu club…',
  'org.cargando': 'Cargando tu organización…',

  'perfil.cargando': 'Cargando tu perfil…',

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
  'menu.modoClaro': 'Light mode',
  'menu.modoOscuro': 'Dark mode',
  'menu.modoSistema': 'Match system',
  'menu.idioma': 'Language',
  'menu.ecosistema': 'Ecosystem',
  'menu.navegacion': 'Go to',
  'menu.abrir': 'Open menu',
  'menu.cerrar': 'Close menu',

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

  'config.titulo': 'Settings',
  'config.eyebrow': 'One account, the same everywhere',
  'config.desc':
    'What you choose here applies in DINAMYT, Championships, Memberships and Academy, and on any device you sign in from.',
  'config.seguridad': 'Security',
  'config.seguridadDesc':
    'You have a single password for all of DINAMYT, and open sessions are closed from here.',
  'config.irAlPerfil': 'My profile',
  'config.desdeElPerfil': 'Settings',
  'config.enElPerfilNo':
    'Theme, language, your time zone and your sessions are changed in Settings.',

  'config.contrasenaActual': 'Current password',
  'config.contrasenaNueva': 'New password',
  'config.actualizarContrasena': 'Update password',
  'config.contrasenaLista': 'Password updated.',
  'config.cargando': 'Loading…',
  'panel.abrirAdmin': 'Open the admin panel',
  'panel.adminDesc': 'Organizations, members with their role, and plan subscriptions.',
  'panel.membresiasCortado': 'Your access to Memberships is switched off',
  'perfil.sinDisciplinas': 'You have no disciplines registered yet.',
  'perfil.cinturon': 'Belt',
  'perfil.entrenaDesde': 'Training since',
  'perfil.enTuCarnet': 'It is printed on your Memberships card.',
  'perfil.notasMedicasEtq': 'Medical notes (only your master sees them; stored encrypted)',
  'config.dispositivos': 'Connected devices',
  'config.dispositivosDesc': 'Where your account is open. If you see something you do not recognize, close it.',
  'config.sinOtrasSesiones': 'No other session is open.',
  'comun.cerrarAviso': 'Dismiss',
  'menu.superAdmin': 'Super administrator',
  'club.sinClub': 'You do not belong to a club yet.',
  'club.editarFicha': 'Edit the club information',
  'club.logo': 'Club logo',
  'club.nombre': 'Club name *',
  'club.descripcion': 'Description',
  'club.descripcionPh': 'What is trained, for whom, since when…',
  'club.horarios': 'Class schedule',
  'club.sede': 'Venue / address',
  'club.telefono': 'Phone',
  'club.telefonoContacto': 'Contact phone',
  'club.maestros': 'Masters and administrators',
  'login.otraCuenta': 'Sign in with another account',
  'login.recordarme': 'Keep me signed in on this device',
  'login.yaHaySesion': 'You are already signed in',
  'comun.codigo': 'Code',
  'recuperar.nuevaContrasena': 'Choose your new password',
  'comun.iniciarSesion': 'Sign in',
  'recuperar.volverAlLogin': 'Back to sign in',
  'registro.eligeFecha': 'Pick your date',
  'registro.iniciaSesion': 'Sign in',
  'verificar.titulo': 'Confirm your email',
  'poner.enlaceIncompleto': 'This link is incomplete. Open it exactly as you received it, without trimming it.',
  'poner.irAlLogin': 'Go to sign in',
  'poner.titulo': 'Set your password',
  'salir.cerrando': 'Signing you out of DINAMYT…',
  'pie.obra': 'DINAMYT Ecosystem is a work protected by copyright.',
  'priv.ley': 'Ley 1581 de 2012 · Colombia',
  'priv.titulo': 'Privacy policy',
  'priv.actualizado': 'Last updated: September 2026 · Data controller: DINAMYT Ecosystem',
  'priv.queDatos': 'What data we process',
  'priv.identificacion': 'Identification:',
  'priv.identificacionTexto': 'name, ID number, email, phone and date of birth.',
  'priv.deportivos': 'Sporting:',
  'priv.deportivosTexto': 'club, discipline, grade (belt), weight, entries, competition results and class attendance.',
  'priv.sensibles': 'Sensitive (optional):',
  'priv.sensiblesA': 'emergency contact and medical notes. They are stored',
  'priv.cifrados': 'encrypted',
  'priv.sensiblesB': '(AES-256-GCM) and only your club master/administrator can see them.',
  'priv.pago': 'Payment:',
  'priv.pagoA': 'a record of payments made at the club (cash, transfer, Nequi, Daviplata). DINAMYT',
  'priv.noProcesa': 'does not process online payments',
  'priv.pagoB': 'and does not store card details.',
  'priv.paraQue': 'What we use them for',
  'priv.uso1': 'Running your single ecosystem account (identity and role-based access).',
  'priv.uso2': 'Managing championships: entries, categories, brackets and public results.',
  'priv.uso3': 'Tracking club memberships and attendance, and sending you reminders (email and push notifications you turn on yourself).',
  'priv.uso4': 'Keeping your sporting history: every entry records the grade and club you held when you competed.',
  'priv.conQuien': 'Who we share them with',
  'priv.conQuienTexto': 'With your club/federation (its administrators see their own members) and, in championships, results are public with your name and club, as at any sporting event. We do not sell or transfer data to third parties.',
  'priv.derechos': 'Your rights (habeas data)',
  'priv.derechosA': 'You may access, update, correct and delete your data, and withdraw your authorisation. You edit most of it yourself in',
  'priv.miPerfil': 'My profile',
  'priv.derechosB': '; to delete the account or to make a complaint, write to',
  'priv.derechosC': ', and if what you have is trouble signing in or using your account, to',
  'priv.derechosD': '. Minors are registered and managed with their guardian\'s authorisation.',
  'priv.seguridad': 'Security and retention',
  'priv.seguridadTexto': 'Hashed passwords (bcrypt), encrypted sensitive data, role-based access and HTTPS. Data is kept for as long as your account exists; the sporting history is immutable by design (it records what happened at each competition).',
  'priv.volver': '← Back to home',
  'portada.entrar': 'Sign in',
  'portada.eyebrow': 'Hapkido · Colombia',
  'portada.titulo1': 'No more',
  'portada.titulo2': 'paper',
  'portada.titulo3': 'ledgers.',
  'portada.sub': 'Memberships, attendance and championships in one place. Your students sign in with the same account you do.',
  'portada.crearCuenta': 'Create my account',
  'portada.verResultados': 'See results',
  'portada.gratis': 'The account is free. The apps come with the club subscription —',
  'portada.comoSeCobra': 'how pricing works',
  'portada.ahora': 'Happening now',
  'portada.enVivo': 'Live',
  'portada.tiempoReal': 'Mats and results in real time →',
  'portada.empieza': 'Start with your club',
  'portada.empiezaSub': 'Create your account, set up your club and share the code with your students.',
  'portada.escribenos': 'Write to us',
  'portada.sinRed': 'No connection needed',
  'portada.sinRedSub': 'If the arena loses its internet, the championship carries on. If the dojang loses its own, so does the class.',
  'portada.cadaQuien': 'Everyone sees their own',
  'portada.cifra.tatamis': 'mats at once',
  'portada.cifra.jueces': 'judges per mat',
  'portada.cifra.planes': 'plan types',
  'portada.cifra.marcar': 'ways to check in',
  'portada.cifra.sinSenal': 'days without signal',
  'rol.federacion': 'Federation',
  'rol.maestro': 'Master',
  'rol.auxiliar': 'Assistant',
  'rol.acudiente': 'Guardian',
  'rol.alumno': 'Student',
  'rol.juez': 'Judge',
  'apps.eyebrow': 'The ecosystem',
  'apps.titulo': 'One account, your apps',
  'apps.aria': 'Applications',
  'apps.noSeOfrece': 'Not offered yet.',
  'apps.teAvisamos': 'if you want it for your club and we will let you know.',
  'apps.proximamente': 'Coming soon',
  'apps.enProduccion': 'In production',
  'apps.memb.titulo': 'The club, up to date',
  'apps.memb.l1': 'You know who is paid up and who owes',
  'apps.memb.l2': 'You take payment and the due date updates itself',
  'apps.memb.l3': 'You take attendance at the door, no paper',
  'apps.memb.l4': 'Your students hear about it before they fall behind',
  'apps.memb.l5': "You see the month's income and attendance",
  'apps.memb.cta': 'Go to Memberships',
  'apps.camp.titulo': 'The tournament, end to end',
  'apps.camp.l1': 'You set up the championship and build the brackets',
  'apps.camp.l2': 'Masters enter their people and you approve',
  'apps.camp.l3': 'Each judge scores from their own mat',
  'apps.camp.l4': 'The public follows the scoreboard live',
  'apps.camp.l5': 'When it ends, the results stay published',
  'apps.camp.cta': 'See championships',
  'apps.acad.titulo': "The practitioner's training",
  'apps.acad.l1': 'Every student sees what is left for the next belt',
  'apps.acad.l2': 'Their grading assessments stay in their history',
  'apps.acad.l3': 'The master follows the whole group',
  'apps.acad.cta': 'Go to Academy',
  'demo.camp': 'Championships · the scoreboard',
  'demo.tatami': 'Mat 1 · Semi-final',
  'demo.jueces': '4 judges + centre',
  'demo.memb': 'Memberships · taking attendance',
  'demo.marco': 'Ana Gómez checked in',
  'demo.conCarnet': 'She used her card',
  'demo.alDia': 'Paid up',
  'pag.de': 'of',
  'pag.anterior': '‹ Previous',
  'pag.siguiente': 'Next ›',
  'avisos.deTuClub': 'Your club notifications',
  'avisos.listo': 'Done. We will write to you when someone asks to join your club.',
  'avisos.pedir': 'Shall we let you know when something happens in your club?',
  'avisos.marcarLeido': 'Mark as read',
  'sesion.sigoAqui': 'I am still here',
  'sesion.porCerrarse': 'Your session is about to close',
  'club.entrarTitulo': 'Join a club',
  'club.codigo': 'Club code',
  'club.codigoPh': 'Club code (e.g. K7QM3XPD)',
  'club.mensajeMaestro': 'Message for the master',
  'club.esperando': 'Waiting for the master',
  'geo.escribeCiudad': 'Type the city',
  'geo.volverLista': 'Back to the city list',
  'geo.eligePais': '— Choose the country —',
  'org.eresTu': 'This is you: you do not change your own role here',
  'fecha.cambiarVista': 'Switch between days and years',
  'org.sinOrganizacion': 'You do not manage any organization.',
  'org.invitarClub': 'Invite an existing club',
  'org.buscarGente': 'Search the club members',
  'org.buscarPh': 'Search by name or email…',
  'org.quitarDelClub': 'Remove from the club',
  'org.noTeSacas': 'You cannot remove yourself from your own club. If you really want to leave, ask another administrator or the super administrator to do it.',
  'org.quitarBaja': 'Remove this leaver from the list',
  'org.eliminarClub': 'Delete club (only if it has no members or subscriptions)',
  'org.escudo': 'Club crest',
  'org.correoContacto': 'Contact email',
  'org.direccion': 'Address / venue',
  'org.telefonoDigitos': 'Phone (digits only)',
  'org.enDirectorio': 'Show this club in the public DINAMYT directory',
  'miembro.edicionStaff': 'Staff editing',
  'miembro.cinturonPromocion': 'Belt (promotion)',
  'miembro.emergencia': 'Emergency contact',
  'miembro.nacimiento': 'Date of birth',
  'miembro.genero': 'Gender',
  'miembro.notasMedicas': 'Medical notes (stored encrypted)',
  'miembro.telefono': 'Phone',
  'miembro.tipoSangre': 'Blood type',
  'codigo.intro': 'Here you decide who joins your club: share your code or send an invitation.',
  'codigo.tuCodigo': '1 · Your code',
  'codigo.pidenEntrar': 'Waiting to join',
  'codigo.aceptar': 'Accept',
  'codigo.rechazar': 'Decline',
  'codigo.verElMio': 'See my club code',
  'codigo.generar': 'Generate a code',
  'codigo.regenerar': 'Generates a new one. Whoever already joined stays in.',
  'codigo.sinCodigo': 'Your club does not accept code entries.',
  'codigo.pasaEnlace': 'Send them this link:',
  'codigo.nadieEspera': 'Nobody is waiting.',
  'codigo.sinContrasena': 'They have not set their password yet',
  'codigo.correoInvitado': 'Email of the person you invite',
  'codigo.nombreSiNoTiene': 'Full name — only if they do not have an account yet',
  'codigo.mensajeOpcional': 'A message for them (optional)',
  'codigo.ejemploMensaje': '“you are in the Tuesday group”',
  'codigo.leLlega': 'They get an email and it shows up in their DINAMYT.',
  'zona.deEsteDispositivo': 'This device time zone',
  'zona.usarLaDeAqui': 'Use this device time zone',
  'panel.abrirOrganizacion2': 'Open my organization',
  'club.logo2': 'Club logo',
  'comun.iniciarSesion2': 'Sign in',
  'login.olvidada2': 'Forgot your password?',
  'comun.codigo2': 'Code',
  'avisos.deTuClub2': 'Your club notifications',
  'avisos.marcarLeido2': 'Mark as read',
  'club.mensajePh': 'Optional: “I am Ana’s father”, “I train on Tuesdays”',
  'avisos.apagar': 'You can switch them off any time from the bell.',
  'club.cargando': 'Loading your club information…',
  'org.cargando': 'Loading your organization…',
  'perfil.cargando': 'Loading your profile…',
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
