'use client';

/**
 * Idiomas de la interfaz (i18n ligero, sin librerías externas).
 *
 * - Español es el idioma por defecto y la fuente de verdad: las claves nuevas
 *   se agregan primero al diccionario `es` y TypeScript exige su versión en
 *   los demás idiomas (`Record<ClaveTexto, string>`).
 * - La elección persiste en localStorage y aplica al instante en toda la app
 *   vía Context, sin recargar.
 * - Para agregar un idioma: añadirlo a IDIOMAS y crear su diccionario.
 * - En componentes: `const { t } = useI18n(); ... t('menu.panel')`
 */

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type Idioma = 'es' | 'en';

export const IDIOMAS: { codigo: Idioma; etiqueta: string }[] = [
  { codigo: 'es', etiqueta: 'Español' },
  { codigo: 'en', etiqueta: 'English' },
];

const STORAGE_KEY = 'membresias_lang';

// ─── Diccionario base (español) ──────────────────────────────────────────────
const es = {
  // Navegación
  'menu.panel': 'Panel del club',
  'menu.alumnos': 'Alumnos',
  'menu.asistencia': 'Asistencia',
  'menu.kiosco': 'Kiosco',
  'menu.planes': 'Planes',
  'menu.calendario': 'Calendario',
  'menu.miEstado': 'Mi estado',
  'menu.miMembresia': 'Mi membresía',
  'menu.admin': 'Clubes y maestros',
  'menu.abrir': 'Abrir menú',
  'menu.cerrar': 'Cerrar menú',
  'menu.salir': 'Salir',
  'menu.modoClaro': '☀️ Modo claro',
  'menu.modoOscuro': '🌙 Modo oscuro',
  'menu.idioma': 'Idioma',
  'menu.apariencia': 'Tema e idioma',

  // Roles
  'rol.superadmin': 'Super admin',
  'rol.owner': 'Maestro',
  'rol.staff': 'Auxiliar',
  'rol.guardian': 'Acudiente',
  'rol.student': 'Alumno',
  'rol.miembro': 'Miembro',

  // Login
  'login.eyebrow': 'Control de mensualidades',
  'login.titulo': 'Membresías',
  'login.tituloAcento': 'del club',
  'login.subtitulo': 'Ingresa con la cuenta que te dio tu maestro.',
  'login.correo': 'Correo',
  'login.contrasena': 'Contraseña',
  'login.entrar': 'Ingresar',
  'login.entrando': 'Ingresando…',
  'login.error': 'No se pudo iniciar sesión.',
  'login.sinCuenta':
    '¿No tienes cuenta? Pídesela a tu maestro: aquí no hay registro abierto.',
  'login.olvide':
    '¿Olvidaste la contraseña? Tu maestro puede ponerte una nueva.',
  'login.sso': 'Entrar con el portal DINAMYT',
  'login.o': 'o',

  // Comunes
  'comun.cargando': 'Cargando…',
  'comun.guardar': 'Guardar',
  'comun.guardando': 'Guardando…',
  'comun.cancelar': 'Cancelar',
  'comun.crear': 'Crear',
  'comun.editar': 'Editar',
  'comun.eliminar': 'Quitar',
  'comun.buscar': 'Buscar',
  'comun.nombre': 'Nombre',
  'comun.correo': 'Correo',
  'comun.telefono': 'Teléfono',
  'comun.rol': 'Rol',
  'comun.estado': 'Estado',
  'comun.activo': 'Activo',
  'comun.inactivo': 'Inactivo',
  'comun.acciones': 'Acciones',
  'comun.ninguno': 'Sin resultados.',
  'comun.confirmar': '¿Seguro?',
  'comun.volver': '← Volver',
  'comun.cerrar': 'Cerrar',
  'comun.imprimir': 'Imprimir',
  'comun.fecha': 'Fecha',

  // Ficha del alumno vista por el maestro (no es «mi» nada: es de otra persona)
  'ficha.membresia': 'Membresía en el club',
  'ficha.pagos': 'Pagos',
  'ficha.asistencias': 'Asistencias',

  // Estados de membresía
  'estado.al_dia': 'Al día',
  'estado.por_vencer': 'Por vencer',
  'estado.vencido': 'Vencido',
  'estado.sin_plan': 'Sin plan',

  // Panel del club
  'panel.titulo': 'Panel del club',
  'panel.alumnos': 'Alumnos',
  'panel.alDia': 'Al día',
  'panel.porVencer': 'Por vencer',
  'panel.vencidos': 'Vencidos',
  'panel.roster': 'Alumnos del club',
  'panel.registrarPago': 'Registrar pago',
  'panel.verFicha': 'Ver ficha',
  'panel.sinAlumnos': 'Todavía no hay alumnos. Agrégalos desde «Alumnos».',
  'panel.vence': 'Vence',
  'panel.clases': 'Clases',
  'panel.avisos': 'Generar avisos',

  // Alumnos (CRUD del maestro)
  'alumnos.titulo': 'Alumnos del club',
  'alumnos.nuevo': 'Nuevo alumno',
  'alumnos.crearTitulo': 'Dar de alta',
  'alumnos.contrasenaInicial': 'Contraseña inicial',
  'alumnos.contrasenaAyuda': 'Mínimo 8 caracteres. Se la entregas al alumno.',
  'alumnos.rolAyuda': 'Alumno, acudiente o auxiliar del club.',
  'alumnos.creado': 'Alumno creado.',
  'alumnos.actualizado': 'Datos actualizados.',
  'alumnos.desactivar': 'Desactivar acceso',
  'alumnos.activar': 'Reactivar acceso',
  'alumnos.nuevaContrasena': 'Poner contraseña nueva',
  'alumnos.contrasenaCambiada': 'Contraseña actualizada.',
  'alumnos.incluirInactivos': 'Ver también los inactivos',

  // Carnet QR
  'qr.titulo': 'Carnet QR',
  'qr.descripcion':
    'Imprímelo y entrégaselo al alumno. Lo trae a clase y el maestro lo escanea con la cámara del celular.',
  'qr.descripcionMia':
    'Imprímelo y llévalo a clase: el maestro lo escanea con su celular y queda registrada tu asistencia.',
  'qr.imprimir': 'Imprimir carnet',
  'qr.pin': 'PIN de respaldo',
  'qr.sinPin': 'Sin PIN asignado',
  'qr.instruccion': 'Presenta este carnet al entrar a clase',

  // Kiosco / check-in
  'kiosco.titulo': 'Check-in de clase',
  'kiosco.escanear': '📷 Escanear carnet QR',
  'kiosco.pin': 'Marcar con PIN',
  'kiosco.manual': 'Marcar manualmente',
  'kiosco.apunta': 'Apunta al carnet QR del alumno.',
  'kiosco.sinCamara':
    'Este navegador no puede escanear con la cámara. Usa el PIN del alumno o el marcado manual.',
  'kiosco.permisoCamara':
    'No se pudo abrir la cámara. Revisa los permisos del navegador.',
  'kiosco.registrado': 'Asistencia registrada',
  'kiosco.yaMarco': 'Este alumno ya registró asistencia hoy.',
  'kiosco.bloqueado': 'Acceso bloqueado: mensualidad vencida.',
  'kiosco.sinClase': 'Hoy el club no tiene clase programada.',
  'kiosco.ayuda':
    'Sin cámara: usa el PIN del alumno o márcalo en la lista manual.',

  // Asistencia
  'asistencia.titulo': 'Asistencia de hoy',
  'asistencia.presentes': 'Presentes',
  'asistencia.marcar': 'Marcar',
  'asistencia.marcado': 'Marcado',
  'asistencia.instruccion':
    'Marca a cada alumno, o deja que entren con su carnet QR o su PIN en el kiosco.',
  'asistencia.metodo.qr': '📇 carnet QR',
  'asistencia.metodo.pin': '🔢 PIN',
  'asistencia.metodo.manual': '✍ manual',
  'asistencia.metodo.fingerprint': '🖐 huella',

  // Planes
  'planes.titulo': 'Planes y tarifas',
  'planes.nuevo': 'Nuevo plan',
  'planes.nombre': 'Nombre del plan',
  'planes.tipo': 'Tipo',
  'planes.precio': 'Precio',
  'planes.clases': 'Nº de clases',
  'planes.sinPlanes': 'Todavía no hay planes. Crea el primero.',
  'planes.tipo.mensual': 'Mensual',
  'planes.tipo.semanal': 'Semanal',
  'planes.tipo.clase': 'Clase suelta',
  'planes.tipo.paquete': 'Paquete de clases',
  'planes.tipo.matricula': 'Matrícula',

  // Calendario
  'calendario.titulo': 'Días de clase',
  'calendario.diasSemana': 'Días de la semana',
  'calendario.excepciones': 'Excepciones (festivos y cierres)',
  'calendario.agregarExcepcion': 'Agregar excepción',
  'calendario.cerrado': 'Cerrado',
  'calendario.abierto': 'Abierto extra',
  'calendario.nota': 'Motivo',
  'calendario.sinExcepciones': 'Sin excepciones registradas.',

  // Mi membresía
  'mi.titulo': 'Mi membresía',
  'mi.estado': 'Estado',
  'mi.vence': 'Vence el',
  'mi.diasFaltantes': 'Días restantes',
  'mi.clasesRestantes': 'Clases restantes',
  'mi.plan': 'Plan actual',
  'mi.pagos': 'Mis pagos',
  'mi.asistencias': 'Mis asistencias',
  'mi.miCarnet': 'Mi carnet QR',
  'mi.sinPlan': 'Todavía no tienes un plan activo. Habla con tu maestro.',
  'mi.activarPush': 'Activar avisos',
  'mi.pushActivo': 'Avisos activados',
  'mi.miPerfil': 'Mi perfil',
  'mi.cambiarContrasena': 'Cambiar contraseña',
  'mi.contrasenaActual': 'Contraseña actual',
  'mi.contrasenaNueva': 'Contraseña nueva',
  'mi.contrasenaOk': 'Contraseña actualizada.',

  // Pagos
  'pago.titulo': 'Registrar pago',
  'pago.plan': 'Plan',
  'pago.monto': 'Monto',
  'pago.metodo': 'Método',
  'pago.notas': 'Notas',
  'pago.registrar': 'Registrar',
  'pago.registrado': 'Pago registrado.',
  'pago.metodo.efectivo': 'Efectivo',
  'pago.metodo.transferencia': 'Transferencia',
  'pago.metodo.nequi': 'Nequi',
  'pago.metodo.daviplata': 'Daviplata',

  // Avisos (los genera el job diario de la API)
  'aviso.titulo': 'Avisos',
  'aviso.misAvisos': 'Mis avisos',
  'aviso.delClub': 'Avisos del club',
  'aviso.sinAvisos': 'Sin avisos por ahora.',
  'aviso.pre_venc': 'Mensualidad próxima a vencer',
  'aviso.venc': 'La mensualidad vence hoy',
  'aviso.mora': 'Mensualidad vencida',
  'aviso.maestro': 'Resumen del club',

  // Panel del superadmin
  'admin.titulo': 'Clubes y maestros',
  'admin.subtitulo':
    'Aquí decides qué clubes existen y quién tiene acceso a la plataforma.',
  'admin.nuevoClub': 'Nuevo club',
  'admin.nombreClub': 'Nombre del club',
  'admin.ciudad': 'Ciudad',
  'admin.pais': 'País',
  'admin.clubCreado': 'Club creado.',
  'admin.suspender': 'Suspender acceso',
  'admin.reactivar': 'Reactivar acceso',
  'admin.suspendido': 'Suspendido',
  'admin.usuarios': 'usuarios activos',
  'admin.verGente': 'Ver su gente',
  'admin.nuevoMaestro': 'Nombrar maestro',
  'admin.maestroCreado': 'Maestro creado.',
  'admin.sinClubes': 'Todavía no hay clubes. Crea el primero.',
  'admin.gente': 'Gente de',
  'admin.restablecer': 'Restablecer contraseña',
} as const;

export type ClaveTexto = keyof typeof es;

const en: Record<ClaveTexto, string> = {
  'menu.panel': 'Club dashboard',
  'menu.alumnos': 'Students',
  'menu.asistencia': 'Attendance',
  'menu.kiosco': 'Kiosk',
  'menu.planes': 'Plans',
  'menu.calendario': 'Calendar',
  'menu.miEstado': 'My status',
  'menu.miMembresia': 'My membership',
  'menu.admin': 'Clubs and masters',
  'menu.abrir': 'Open menu',
  'menu.cerrar': 'Close menu',
  'menu.salir': 'Sign out',
  'menu.modoClaro': '☀️ Light mode',
  'menu.modoOscuro': '🌙 Dark mode',
  'menu.idioma': 'Language',
  'menu.apariencia': 'Theme and language',

  'rol.superadmin': 'Super admin',
  'rol.owner': 'Master',
  'rol.staff': 'Assistant',
  'rol.guardian': 'Guardian',
  'rol.student': 'Student',
  'rol.miembro': 'Member',

  'login.eyebrow': 'Membership tracking',
  'login.titulo': 'Memberships',
  'login.tituloAcento': 'for your club',
  'login.subtitulo': 'Sign in with the account your master gave you.',
  'login.correo': 'Email',
  'login.contrasena': 'Password',
  'login.entrar': 'Sign in',
  'login.entrando': 'Signing in…',
  'login.error': 'Could not sign in.',
  'login.sinCuenta': "No account? Ask your master — there's no open sign-up here.",
  'login.olvide': 'Forgot your password? Your master can set a new one.',
  'login.sso': 'Sign in with the DINAMYT portal',
  'login.o': 'or',

  'comun.cargando': 'Loading…',
  'comun.guardar': 'Save',
  'comun.guardando': 'Saving…',
  'comun.cancelar': 'Cancel',
  'comun.crear': 'Create',
  'comun.editar': 'Edit',
  'comun.eliminar': 'Remove',
  'comun.buscar': 'Search',
  'comun.nombre': 'Name',
  'comun.correo': 'Email',
  'comun.telefono': 'Phone',
  'comun.rol': 'Role',
  'comun.estado': 'Status',
  'comun.activo': 'Active',
  'comun.inactivo': 'Inactive',
  'comun.acciones': 'Actions',
  'comun.ninguno': 'No results.',
  'comun.confirmar': 'Are you sure?',
  'comun.volver': '← Back',
  'comun.cerrar': 'Close',
  'comun.imprimir': 'Print',
  'comun.fecha': 'Date',

  'ficha.membresia': 'Club membership',
  'ficha.pagos': 'Payments',
  'ficha.asistencias': 'Attendance',

  'estado.al_dia': 'Up to date',
  'estado.por_vencer': 'Due soon',
  'estado.vencido': 'Overdue',
  'estado.sin_plan': 'No plan',

  'panel.titulo': 'Club dashboard',
  'panel.alumnos': 'Students',
  'panel.alDia': 'Up to date',
  'panel.porVencer': 'Due soon',
  'panel.vencidos': 'Overdue',
  'panel.roster': 'Club students',
  'panel.registrarPago': 'Record payment',
  'panel.verFicha': 'View profile',
  'panel.sinAlumnos': 'No students yet. Add them from "Students".',
  'panel.vence': 'Due',
  'panel.clases': 'Classes',
  'panel.avisos': 'Generate notices',

  'alumnos.titulo': 'Club students',
  'alumnos.nuevo': 'New student',
  'alumnos.crearTitulo': 'Add someone',
  'alumnos.contrasenaInicial': 'Initial password',
  'alumnos.contrasenaAyuda': 'At least 8 characters. Hand it to the student.',
  'alumnos.rolAyuda': 'Student, guardian or club assistant.',
  'alumnos.creado': 'Student created.',
  'alumnos.actualizado': 'Details updated.',
  'alumnos.desactivar': 'Disable access',
  'alumnos.activar': 'Re-enable access',
  'alumnos.nuevaContrasena': 'Set a new password',
  'alumnos.contrasenaCambiada': 'Password updated.',
  'alumnos.incluirInactivos': 'Show inactive too',

  'qr.titulo': 'QR card',
  'qr.descripcion':
    'Print it and hand it to the student. They bring it to class and the master scans it with a phone camera.',
  'qr.descripcionMia':
    'Print it and bring it to class: your master scans it with their phone and your attendance is recorded.',
  'qr.imprimir': 'Print card',
  'qr.pin': 'Backup PIN',
  'qr.sinPin': 'No PIN assigned',
  'qr.instruccion': 'Show this card when you arrive at class',

  'kiosco.titulo': 'Class check-in',
  'kiosco.escanear': '📷 Scan QR card',
  'kiosco.pin': 'Check in with PIN',
  'kiosco.manual': 'Check in manually',
  'kiosco.apunta': "Point at the student's QR card.",
  'kiosco.sinCamara':
    "This browser can't scan with the camera. Use the student's PIN or manual check-in.",
  'kiosco.permisoCamara': "Couldn't open the camera. Check browser permissions.",
  'kiosco.registrado': 'Attendance recorded',
  'kiosco.yaMarco': 'This student already checked in today.',
  'kiosco.bloqueado': 'Access blocked: membership overdue.',
  'kiosco.sinClase': 'No class scheduled today.',
  'kiosco.ayuda': "No camera: use the student's PIN or the manual list.",

  'asistencia.titulo': "Today's attendance",
  'asistencia.presentes': 'Present',
  'asistencia.marcar': 'Check in',
  'asistencia.marcado': 'Checked in',
  'asistencia.instruccion':
    'Check students in, or let them use their QR card or PIN at the kiosk.',
  'asistencia.metodo.qr': '📇 QR card',
  'asistencia.metodo.pin': '🔢 PIN',
  'asistencia.metodo.manual': '✍ manual',
  'asistencia.metodo.fingerprint': '🖐 fingerprint',

  'planes.titulo': 'Plans and fees',
  'planes.nuevo': 'New plan',
  'planes.nombre': 'Plan name',
  'planes.tipo': 'Type',
  'planes.precio': 'Price',
  'planes.clases': 'Number of classes',
  'planes.sinPlanes': 'No plans yet. Create the first one.',
  'planes.tipo.mensual': 'Monthly',
  'planes.tipo.semanal': 'Weekly',
  'planes.tipo.clase': 'Single class',
  'planes.tipo.paquete': 'Class pack',
  'planes.tipo.matricula': 'Enrolment fee',

  'calendario.titulo': 'Class days',
  'calendario.diasSemana': 'Days of the week',
  'calendario.excepciones': 'Exceptions (holidays and closures)',
  'calendario.agregarExcepcion': 'Add exception',
  'calendario.cerrado': 'Closed',
  'calendario.abierto': 'Extra opening',
  'calendario.nota': 'Reason',
  'calendario.sinExcepciones': 'No exceptions recorded.',

  'mi.titulo': 'My membership',
  'mi.estado': 'Status',
  'mi.vence': 'Due on',
  'mi.diasFaltantes': 'Days left',
  'mi.clasesRestantes': 'Classes left',
  'mi.plan': 'Current plan',
  'mi.pagos': 'My payments',
  'mi.asistencias': 'My attendance',
  'mi.miCarnet': 'My QR card',
  'mi.sinPlan': "You don't have an active plan yet. Talk to your master.",
  'mi.activarPush': 'Enable notifications',
  'mi.pushActivo': 'Notifications enabled',
  'mi.miPerfil': 'My profile',
  'mi.cambiarContrasena': 'Change password',
  'mi.contrasenaActual': 'Current password',
  'mi.contrasenaNueva': 'New password',
  'mi.contrasenaOk': 'Password updated.',

  'pago.titulo': 'Record payment',
  'pago.plan': 'Plan',
  'pago.monto': 'Amount',
  'pago.metodo': 'Method',
  'pago.notas': 'Notes',
  'pago.registrar': 'Record',
  'pago.registrado': 'Payment recorded.',
  'pago.metodo.efectivo': 'Cash',
  'pago.metodo.transferencia': 'Bank transfer',
  'pago.metodo.nequi': 'Nequi',
  'pago.metodo.daviplata': 'Daviplata',

  'aviso.titulo': 'Notices',
  'aviso.misAvisos': 'My notices',
  'aviso.delClub': 'Club notices',
  'aviso.sinAvisos': 'No notices right now.',
  'aviso.pre_venc': 'Membership about to expire',
  'aviso.venc': 'Membership expires today',
  'aviso.mora': 'Membership overdue',
  'aviso.maestro': 'Club summary',

  'admin.titulo': 'Clubs and masters',
  'admin.subtitulo': 'Here you decide which clubs exist and who gets access.',
  'admin.nuevoClub': 'New club',
  'admin.nombreClub': 'Club name',
  'admin.ciudad': 'City',
  'admin.pais': 'Country',
  'admin.clubCreado': 'Club created.',
  'admin.suspender': 'Suspend access',
  'admin.reactivar': 'Restore access',
  'admin.suspendido': 'Suspended',
  'admin.usuarios': 'active users',
  'admin.verGente': 'View its people',
  'admin.nuevoMaestro': 'Appoint master',
  'admin.maestroCreado': 'Master created.',
  'admin.sinClubes': 'No clubs yet. Create the first one.',
  'admin.gente': 'People of',
  'admin.restablecer': 'Reset password',
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
  // localStorage, y renderizar otro idioma aquí rompería la hidratación.
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

  return <Ctx.Provider value={{ idioma, setIdioma, t }}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nContexto {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useI18n debe usarse dentro de <I18nProvider>');
  return ctx;
}
