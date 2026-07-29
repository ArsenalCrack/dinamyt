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
  // Nombre visible de la app. El alumno no entra a «gestionar su membresía»:
  // entra a su club. El vocabulario de cobro (mensualidad, plan, pago) se queda
  // dentro del panel del maestro, que es de quien sí es el asunto.
  'app.nombre': 'Mi Club',

  // Navegación
  'menu.panel': 'Panel del club',
  'menu.alumnos': 'Alumnos',
  'menu.asistencia': 'Asistencia',
  'menu.kiosco': 'Kiosco',
  'menu.planes': 'Planes',
  'menu.calendario': 'Calendario',
  'menu.miEstado': 'Mi estado',
  'menu.estadisticas': 'Estadísticas',
  'menu.admin': 'Clubes y maestros',
  'menu.navegacion': 'Ir a',
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

  // Login. Es la única pantalla que ven por igual el maestro y el alumno, así
  // que no habla de cuotas: habla del club.
  'login.eyebrow': 'DINAMYT',
  'login.titulo': 'Mi',
  'login.tituloAcento': 'Club',
  'login.subtitulo': 'Ingresa con la cuenta que te dio tu maestro.',
  'login.correo': 'Correo',
  'login.contrasena': 'Contraseña',
  'login.entrar': 'Ingresar',
  'login.entrando': 'Ingresando…',
  'login.error': 'No se pudo iniciar sesión.',
  'login.sso': 'Entrar con el portal DINAMYT',
  'login.o': 'o',
  'login.conQr': 'Entrando con tu código…',
  'login.qrCaducado': 'Ese código ya caducó. Pídele otro a tu maestro.',

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
  'comun.cinturon': 'Cinturón',
  'comun.sinCinturon': 'Sin cinturón',
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
  'comun.opcional': 'opcional',
  'comun.tope': 'no cabe más',
  'comun.telefonoCorto': 'Un teléfono tiene entre 7 y 15 dígitos.',

  // Ficha de seguridad: lo que hay que saber el día que pasa algo
  'ficha.entrenaDesde': 'Entrena desde',
  'ficha.entrenaDesdeAyuda':
    'Cuándo empezó a entrenar de verdad, aunque su cuenta sea de ayer. Si la dejas vacía se cuenta desde el día que lo inscribiste.',
  'ficha.sangre': 'Tipo de sangre',
  'ficha.sinSangre': 'Sin registrar',
  'ficha.emergencia': 'Contacto de emergencia',
  'ficha.emergenciaNombre': 'A quién llamar',
  'ficha.emergenciaTelefono': 'Teléfono de emergencia',
  'ficha.emergenciaAyuda': 'Va impreso en el reverso del carnet.',

  // Estado de la membresía en el club (lo pone el maestro a mano)
  'memb.activo': 'Activo',
  'memb.inactivo': 'Inactivo',
  'memb.suspendido': 'Suspendido',
  'memb.retirado': 'Retirado',

  // Ficha del alumno vista por el maestro (no es «mi» nada: es de otra persona)
  'ficha.membresia': 'Membresía en el club',
  'ficha.pagos': 'Pagos',
  'ficha.asistencias': 'Asistencias',
  'ficha.datos': 'Datos del alumno',
  'ficha.guardado': 'Cambios guardados.',
  'ficha.planYEstado': 'Plan y estado en el club',
  'ficha.planActual': 'Plan actual',
  'ficha.sinPlanAsignado': 'Sin plan asignado',
  // Encabezado de la tarjeta cuando la ficha NO es de un alumno: el maestro y
  // los auxiliares no tienen mensualidad que enseñar, solo cómo ubicarlos.
  'ficha.contacto': 'Contacto',
  'ficha.pin': 'PIN de check-in',
  'ficha.pinAyuda':
    'La app se lo asignó solo al inscribirlo. Cámbialo si hace falta: si el nuevo ya es de otro alumno, te lo dirá.',
  'ficha.pinOtro': 'Generar otro PIN',
  'ficha.venceEl': 'Vence el',
  'ficha.venceAyuda':
    'Ponla a mano si el alumno venía de otro lado o pagó por fuera. A partir de ahí, sus renovaciones caen ese día del mes.',
  'ficha.clases': 'Clases disponibles',
  'ficha.soloPorTiempo': 'Solo para planes por tiempo (mensual o semanal).',
  'ficha.soloPorClases': 'Solo para planes por clases (clase suelta o paquete).',
  'ficha.cobrar': 'Registrar el pago de este plan',
  'ficha.cobrarAyuda': 'Registrar el pago renueva el vencimiento o suma las clases.',
  'ficha.accesoTitulo': 'Acceso rápido con QR',
  'ficha.accesoDescripcion':
    'El alumno apunta la cámara de su celular a este código y entra sin escribir nada. Se muestra en pantalla y caduca en 10 minutos: no lo imprimas.',
  'ficha.accesoGenerar': 'Generar código de acceso',
  'ficha.accesoCaducaEn': 'Caduca en',
  'ficha.accesoCaducado': 'El código caducó. Genera otro.',

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
  // Qué hace el botón, dicho antes de pulsarlo: revisa mensualidades y crea
  // avisos. Nadie debería tener que pulsar un botón para averiguar qué hace.
  'panel.avisosAyuda':
    'Repasa las mensualidades del club y crea un aviso para quien esté por vencer o ya vencido. A quien tenga las notificaciones activadas le llega además al celular. Esto se hace solo cada mañana; el botón lo adelanta.',
  'panel.avisosCreados': 'Avisos creados',
  'panel.avisosPush': 'notificaciones enviadas',
  'panel.avisosNinguno':
    'Ningún aviso nuevo: hoy nadie está por vencer ni vencido, o ya se le avisó.',
  'panel.cobrar': 'Cobrar',
  'panel.enCaja': 'entró en caja',
  'panel.deEsperado': 'de lo esperado este mes',

  // Alumnos (CRUD del maestro)
  'alumnos.titulo': 'Alumnos del club',
  'alumnos.nuevo': 'Nuevo alumno',
  // «Dar de alta» es vocabulario de oficina: el maestro inscribe gente en su
  // club, no da de alta registros. Y dice «a alguien» porque por aquí entran
  // también acudientes y auxiliares, no solo alumnos.
  'alumnos.crearTitulo': 'Inscribir a alguien en el club',
  'alumnos.noTeDesactivas':
    'No puedes cortarte el acceso a ti mismo: el club se quedaría sin maestro.',
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

  // Paso de páginas y «ver más» (components/Paginacion.tsx)
  'pag.navegacion': 'Páginas',
  'pag.anterior': 'Anteriores',
  'pag.siguiente': 'Siguientes',
  'pag.de': 'de',
  'pag.verMas': 'Ver más',
  'pag.sinResultados': 'Nadie coincide con esa búsqueda.',
  'pag.buscarAlumno': 'Buscar por nombre o correo',

  // Foto de perfil (la misma que va al carnet)
  'foto.poner': 'Poner foto',
  'foto.cambiar': 'Cambiar foto',
  'foto.quitar': 'Quitar',
  'foto.procesando': 'Procesando…',
  // El aviso se lee ANTES de elegir el archivo: dice qué se acepta y qué va a
  // pasar con la imagen, para que nadie ande recortándola a mano por si acaso.
  'foto.ayuda':
    'Cualquier imagen (JPG, PNG, WebP…) de hasta 20 MB. Al elegirla podrás encuadrarla, y se reduce sola a 400 × 400 px: no tienes que prepararla. Es la foto que sale en el carnet.',
  'foto.errorTipo': 'Ese archivo no es una imagen. Elige un JPG, un PNG o un WebP.',
  'foto.errorLeer': 'No se pudo abrir esa imagen. Prueba con otra.',
  'foto.errorPesoArchivo':
    'Esa imagen pesa más de 20 MB y no se puede abrir. Elige una más liviana.',
  'foto.errorGuardar': 'No se pudo guardar la foto.',

  // Editor de encuadre (components/AjustarImagen.tsx)
  'encuadre.titulo': 'Ajusta el encuadre',
  'encuadre.ayudaFoto':
    'Arrastra la foto y usa el control para acercarla. El marco punteado es lo que se ve en el carnet: deja la cara dentro.',
  'encuadre.ayudaLogo':
    'Arrastra el escudo y usa el control para acercarlo o alejarlo. No se recorta nada: lo que sobra queda transparente.',
  'encuadre.zoom': 'Acercar',
  'encuadre.centrar': 'Volver al centro',
  'encuadre.enElCarnet': 'En el carnet',
  'encuadre.guardar': 'Usar así',

  // Escudo del club: lo pone el maestro y lo ven todos sus alumnos
  'logo.titulo': 'Escudo del club',
  'logo.poner': 'Poner escudo',
  'logo.cambiar': 'Cambiar escudo',
  'logo.ayuda':
    'Cualquier imagen de hasta 20 MB. Entra entera —no se recorta— y se reduce sola a 512 × 512 px; si tiene fondo transparente, se respeta. Al elegirla podrás moverla y ajustar su tamaño. Sale en el carnet de tus alumnos y en su panel.',
  'logo.guardado': 'Escudo actualizado.',

  // Días de clase, vistos por el alumno
  'clases.titulo': 'Clases del club',
  'clases.hoySi': 'Hoy hay clase',
  'clases.hoyNo': 'Hoy no hay clase',
  'clases.proxima': 'Próxima clase',

  // Carnet QR
  'qr.titulo': 'Carnet del alumno',
  'qr.descripcion':
    'Imprímelo y entrégaselo al alumno. Lo trae a clase y el maestro lo escanea con la cámara del celular.',
  'qr.descripcionMia':
    'Imprímelo y llévalo a clase: el maestro lo escanea con su celular y queda registrada tu asistencia.',
  // El del staff no sirve para marcar asistencia —ellos no pasan por el
  // kiosco—: es la credencial que los acredita ante quien la pida.
  'qr.descripcionStaff':
    'Tu credencial del club: te identifica como parte del equipo y vale un año desde que se expide.',
  'qr.imprimir': 'Imprimir carnet',
  'qr.pin': 'PIN de respaldo',
  'qr.sinPin': 'Sin PIN asignado',
  'qr.instruccion': 'Presenta este carnet al entrar a clase',

  // El carnet en sí (lo que se imprime, a tamaño de tarjeta de verdad)
  'carnet.frente': 'Frente',
  'carnet.reverso': 'Reverso',
  // Qué dice la cabecera del carnet. Depende del rol: el del maestro no puede
  // decir «Carnet de alumno».
  'carnet.tipo.student': 'Carnet de alumno',
  'carnet.tipo.owner': 'Carnet de maestro',
  'carnet.tipo.staff': 'Carnet de auxiliar',
  'carnet.tipo.guardian': 'Carnet de acudiente',
  'carnet.numero': 'N.º',
  /** Firma del carnet: quién lo expide. Va delante del nombre del maestro. */
  'carnet.expide': 'Expide',
  'carnet.emitido': 'Emitido',
  'carnet.vigenteHasta': 'Vigente hasta',
  'carnet.sangre': 'Sangre',
  'carnet.emergencia': 'En caso de emergencia',
  'carnet.pin': 'PIN de respaldo',
  /** Ocupa el sitio del PIN en el carnet del maestro y del auxiliar. */
  'carnet.enElClub': 'En el club desde',
  'carnet.instruccion': 'Presenta este carnet al entrar a clase.',
  // El del staff no se presenta, acredita: ni el maestro ni el auxiliar marcan
  // asistencia en el kiosco.
  'carnet.instruccion.owner': 'Acredita a su portador como maestro del club.',
  'carnet.instruccion.staff': 'Acredita a su portador como auxiliar del club.',
  'carnet.intransferible':
    'Personal e intransferible. Si lo encuentras, devuélvelo al club.',
  'carnet.recorta': 'Recorta por la línea punteada y pega las dos caras.',
  // Vigencia: la fecha la guarda la API y solo la mueve reexpedir el carnet.
  'carnet.vencido': 'Vencido. Reexpídelo antes de imprimirlo.',
  'carnet.reexpedir': 'Reexpedir',
  'carnet.reexpedido': 'Carnet reexpedido: vigente por un año más.',
  'carnet.formato': 'Cómo lo vas a imprimir',
  'carnet.formatoHoja': 'Hoja normal',
  'carnet.formatoTarjeta': 'Impresora de tarjetas',
  'carnet.formatoHojaAyuda':
    'Sale a tamaño real (85,6 × 54 mm) en una hoja carta o A4, con el borde marcado para recortarlo.',
  'carnet.formatoTarjetaAyuda':
    'Cada cara en su propia tarjeta de 85,6 × 54 mm, para impresoras de PVC.',

  // Kiosco / check-in
  'kiosco.titulo': 'Check-in de clase',
  'kiosco.escanear': '📷 Escanear carnet QR',
  'kiosco.pin': 'Marcar con PIN',
  'kiosco.manual': 'Marcar manualmente',
  'kiosco.afina': 'escribe para encontrar al resto',
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
  'calendario.notaEjemplo':
    'Ej.: cerrado por el campeonato departamental, volvemos el lunes.',

  // Pie legal
  'legal.derechos': 'Todos los derechos reservados.',
  'legal.nota': 'DINAMYT Membresías es una obra protegida por el derecho de autor.',

  // Mi estado
  'mi.titulo': 'Mi estado',
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
  'mi.nombreLoCambiaElMaestro':
    'Tu nombre lo cambia tu maestro. Pídeselo si está mal escrito.',
  'mi.comoVengo': 'Cómo vengo viniendo',
  'mi.esteMes': 'Clases este mes',
  'mi.totalClases': 'Clases en total',
  'mi.ultimaVez': 'Última vez',
  'mi.enElClub': 'En el club',
  // Lo que ve el maestro donde el alumno ve su asistencia. Él no marca en el
  // kiosco: sus números son los de la gente que enseña.
  'mi.miLabor': 'Mi labor en el club',
  'mi.misAlumnos': 'Alumnos activos',
  'mi.entrenaronHoy': 'Entrenaron hoy',
  'mi.esteMesClub': 'Asistencias este mes',
  'mi.laborAyuda':
    'Son los números de tu club. El detalle completo está en Estadísticas.',
  'mi.meses': 'meses',
  'mi.dias': 'días',
  'mi.desde': 'desde',
  'mi.miGrado': 'Mi grado',
  'mi.gradoAyuda': 'Tu cinturón lo cambia tu maestro cuando te lo ganas.',
  'mi.pinAyuda':
    'Dilo en el kiosco si el QR no lee o si dejaste el carnet en casa. Apréndetelo de memoria.',
  'mi.sinPin': 'Tu maestro todavía no te asignó un PIN. Pídeselo.',
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
  'pago.fecha': 'Fecha del pago',
  'pago.fechaAyuda': 'Si lo cobraste otro día, ponlo: el vencimiento se cuenta desde ahí.',
  'pago.periodos.mensual': 'Meses que paga',
  'pago.periodos.semanal': 'Semanas que paga',
  'pago.periodos.paquete': 'Paquetes que lleva',
  'pago.efecto.mensual': 'Se suman al vencimiento que ya tiene.',
  'pago.efecto.semanal': 'Se suman al vencimiento que ya tiene.',
  'pago.efecto.clase': 'Se suman a sus clases disponibles.',
  'pago.efecto.paquete': 'Se suman a sus clases disponibles.',
  'pago.efecto.matricula': 'Marca su matrícula como pagada. No mueve fechas.',
  'pago.repetidoConfirmar': 'Sí, es otro pago',
  'pago.montoSugerido': 'El monto se calcula solo; cámbialo si cobraste otra cosa.',
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
  'aviso.venc': 'La mensualidad venció',
  'aviso.mora': 'Mensualidad vencida',
  'aviso.maestro': 'Resumen del club',
  'aviso.venceEl': 'Vence el',
  'aviso.vencioEl': 'Venció el',
  'aviso.sinFecha': 'Sin fecha de vencimiento.',

  // Estadísticas del club
  'stats.titulo': 'Estadísticas del club',
  'stats.subtitulo': 'Cómo va tu club: dinero, gente y asistencia.',
  'stats.alumnos': 'Alumnos activos',
  'stats.nuevosMes': 'Nuevos este mes',
  'stats.inactivos': 'Con acceso cortado',
  'stats.recaudoMes': 'Entró en caja este mes',
  'stats.devengadoMes': 'Corresponde a este mes',
  'stats.esperado': 'de lo esperado',
  'stats.caja': 'Caja',
  'stats.devengado': 'Corresponde al mes',
  'stats.adelantos':
    'La caja es lo que entró; lo devengado es lo que le toca a cada mes. Se separan porque quien paga tres meses de golpe no recauda el triple ese mes.',
  'stats.pagosMes': 'pagos registrados',
  'stats.recaudo6': 'Recaudo de los últimos 6 meses',
  'stats.estados': 'Estado de las mensualidades',
  'stats.asistencia30': 'Asistencia de los últimos 30 días',
  'stats.promedioPorDia': 'Promedio por día con clase',
  'stats.diasConClase': 'Días con clase',
  'stats.masConstantes': 'Los más constantes',
  'stats.porPlan': 'Alumnos por plan',
  'stats.porCinturon': 'Alumnos por cinturón',
  'stats.sinDatos': 'Todavía no hay datos que mostrar aquí.',
  'stats.asistenciasCuenta': 'asistencias',
  'stats.alumnosCuenta': 'alumnos',

  // Panel del superadmin
  'admin.titulo': 'Clubes y maestros',
  'admin.subtitulo':
    'Aquí decides qué clubes existen y quién tiene acceso a la plataforma.',
  'admin.nuevoClub': 'Nuevo club',
  'admin.nombreClub': 'Nombre del club',
  'admin.ciudad': 'Ciudad',
  'admin.pais': 'País',
  'admin.selecciona': 'Selecciona…',
  'admin.buscaCiudad': 'Busca tu ciudad',
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
  'app.nombre': 'My Club',

  'menu.panel': 'Club dashboard',
  'menu.alumnos': 'Students',
  'menu.asistencia': 'Attendance',
  'menu.kiosco': 'Kiosk',
  'menu.planes': 'Plans',
  'menu.calendario': 'Calendar',
  'menu.miEstado': 'My status',
  'menu.estadisticas': 'Statistics',
  'menu.admin': 'Clubs and masters',
  'menu.navegacion': 'Go to',
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

  'login.eyebrow': 'DINAMYT',
  'login.titulo': 'My',
  'login.tituloAcento': 'Club',
  'login.subtitulo': 'Sign in with the account your master gave you.',
  'login.correo': 'Email',
  'login.contrasena': 'Password',
  'login.entrar': 'Sign in',
  'login.entrando': 'Signing in…',
  'login.error': 'Could not sign in.',
  'login.sso': 'Sign in with the DINAMYT portal',
  'login.o': 'or',
  'login.conQr': 'Signing you in with your code…',
  'login.qrCaducado': 'That code has expired. Ask your master for another one.',

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
  'comun.cinturon': 'Belt',
  'comun.sinCinturon': 'No belt',
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
  'comun.opcional': 'optional',
  'comun.tope': 'no room left',
  'comun.telefonoCorto': 'A phone number has between 7 and 15 digits.',

  'ficha.entrenaDesde': 'Training since',
  'ficha.entrenaDesdeAyuda':
    'When they actually started training, even if their account is from yesterday. Leave it empty and it counts from the day you enrolled them.',
  'ficha.sangre': 'Blood type',
  'ficha.sinSangre': 'Not recorded',
  'ficha.emergencia': 'Emergency contact',
  'ficha.emergenciaNombre': 'Who to call',
  'ficha.emergenciaTelefono': 'Emergency phone',
  'ficha.emergenciaAyuda': 'Printed on the back of the card.',

  'memb.activo': 'Active',
  'memb.inactivo': 'Inactive',
  'memb.suspendido': 'Suspended',
  'memb.retirado': 'Left the club',

  'ficha.membresia': 'Club membership',
  'ficha.pagos': 'Payments',
  'ficha.asistencias': 'Attendance',
  'ficha.datos': 'Student details',
  'ficha.guardado': 'Changes saved.',
  'ficha.planYEstado': 'Plan and club status',
  'ficha.planActual': 'Current plan',
  'ficha.sinPlanAsignado': 'No plan assigned',
  'ficha.contacto': 'Contact',
  'ficha.pin': 'Check-in PIN',
  'ficha.pinAyuda':
    'The app assigned it when you enrolled them. Change it if you need to: if the new one belongs to another student, it will tell you.',
  'ficha.pinOtro': 'Generate another PIN',
  'ficha.venceEl': 'Due on',
  'ficha.venceAyuda':
    'Set it by hand if the student came from somewhere else or paid outside the app. From then on, renewals land on that day of the month.',
  'ficha.clases': 'Available classes',
  'ficha.soloPorTiempo': 'Only for time-based plans (monthly or weekly).',
  'ficha.soloPorClases': 'Only for class-based plans (single class or pack).',
  'ficha.cobrar': 'Record a payment for this plan',
  'ficha.cobrarAyuda': 'Recording a payment renews the due date or adds the classes.',
  'ficha.accesoTitulo': 'Quick access QR',
  'ficha.accesoDescripcion':
    'The student points their phone camera at this code and gets in without typing anything. It shows on screen and expires in 10 minutes: do not print it.',
  'ficha.accesoGenerar': 'Generate access code',
  'ficha.accesoCaducaEn': 'Expires in',
  'ficha.accesoCaducado': 'The code expired. Generate another one.',

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
  'panel.avisosAyuda':
    "Goes through the club's memberships and creates a notice for anyone due soon or already overdue. Whoever turned notifications on also gets it on their phone. This runs on its own every morning; the button brings it forward.",
  'panel.avisosCreados': 'Notices created',
  'panel.avisosPush': 'notifications sent',
  'panel.avisosNinguno':
    'No new notices: nobody is due soon or overdue today, or they were told already.',
  'panel.cobrar': 'Charge',
  'panel.enCaja': 'came in',
  'panel.deEsperado': 'of what this month expects',

  'alumnos.titulo': 'Club students',
  'alumnos.nuevo': 'New student',
  'alumnos.crearTitulo': 'Enrol someone in the club',
  'alumnos.noTeDesactivas':
    "You can't cut off your own access: the club would be left without a master.",
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
  'pag.navegacion': 'Pages',
  'pag.anterior': 'Previous',
  'pag.siguiente': 'Next',
  'pag.de': 'of',
  'pag.verMas': 'Show more',
  'pag.sinResultados': 'Nobody matches that search.',
  'pag.buscarAlumno': 'Search by name or email',

  'foto.poner': 'Add photo',
  'foto.cambiar': 'Change photo',
  'foto.quitar': 'Remove',
  'foto.procesando': 'Working…',
  'foto.ayuda':
    'Any image (JPG, PNG, WebP…) up to 20 MB. You get to frame it after picking it, and it is shrunk to 400 × 400 px for you — no need to prepare it. This is the photo on the card.',
  'foto.errorTipo': 'That file is not an image. Pick a JPG, a PNG or a WebP.',
  'foto.errorLeer': "Couldn't open that image. Try another one.",
  'foto.errorPesoArchivo': "That image is over 20 MB and can't be opened. Pick a lighter one.",
  'foto.errorGuardar': "Couldn't save the photo.",

  'encuadre.titulo': 'Adjust the framing',
  'encuadre.ayudaFoto':
    'Drag the photo and use the slider to zoom in. The dashed frame is what the card shows: keep the face inside it.',
  'encuadre.ayudaLogo':
    'Drag the crest and use the slider to zoom in or out. Nothing is cropped: whatever is left over stays transparent.',
  'encuadre.zoom': 'Zoom',
  'encuadre.centrar': 'Back to centre',
  'encuadre.enElCarnet': 'On the card',
  'encuadre.guardar': 'Use it like this',

  'logo.titulo': 'Club crest',
  'logo.poner': 'Add crest',
  'logo.cambiar': 'Change crest',
  'logo.ayuda':
    "Any image up to 20 MB. It fits in whole — no cropping — and is shrunk to 512 × 512 px for you; a transparent background is kept. After picking it you can move it and resize it. It shows on your students' cards and in their panel.",
  'logo.guardado': 'Crest updated.',

  'clases.titulo': 'Club classes',
  'clases.hoySi': 'There is class today',
  'clases.hoyNo': 'No class today',
  'clases.proxima': 'Next class',

  'qr.titulo': 'Student card',
  'qr.descripcion':
    'Print it and hand it to the student. They bring it to class and the master scans it with a phone camera.',
  'qr.descripcionMia':
    'Print it and bring it to class: your master scans it with their phone and your attendance is recorded.',
  'qr.descripcionStaff':
    'Your club credential: it identifies you as part of the team and is valid for a year from the day it is issued.',
  'qr.imprimir': 'Print card',
  'qr.pin': 'Backup PIN',
  'qr.sinPin': 'No PIN assigned',
  'qr.instruccion': 'Show this card when you arrive at class',

  'carnet.frente': 'Front',
  'carnet.reverso': 'Back',
  'carnet.tipo.student': 'Student card',
  'carnet.tipo.owner': 'Master card',
  'carnet.tipo.staff': 'Assistant card',
  'carnet.tipo.guardian': 'Guardian card',
  'carnet.numero': 'No.',
  'carnet.expide': 'Issued by',
  'carnet.emitido': 'Issued',
  'carnet.vigenteHasta': 'Valid until',
  'carnet.sangre': 'Blood',
  'carnet.emergencia': 'In case of emergency',
  'carnet.pin': 'Backup PIN',
  'carnet.enElClub': 'At the club since',
  'carnet.instruccion': 'Show this card when you arrive at class.',
  'carnet.instruccion.owner': 'Certifies its bearer as master of the club.',
  'carnet.instruccion.staff': 'Certifies its bearer as assistant of the club.',
  'carnet.intransferible':
    'Personal and non-transferable. If found, please return it to the club.',
  'carnet.recorta': 'Cut along the dashed line and glue both sides together.',
  'carnet.vencido': 'Expired. Reissue it before printing.',
  'carnet.reexpedir': 'Reissue',
  'carnet.reexpedido': 'Card reissued: valid for another year.',
  'carnet.formato': 'How you will print it',
  'carnet.formatoHoja': 'Regular paper',
  'carnet.formatoTarjeta': 'Card printer',
  'carnet.formatoHojaAyuda':
    'Comes out at real size (85.6 × 54 mm) on a Letter or A4 sheet, with the edge marked for cutting.',
  'carnet.formatoTarjetaAyuda':
    'Each side on its own 85.6 × 54 mm card, for PVC printers.',

  'kiosco.titulo': 'Class check-in',
  'kiosco.escanear': '📷 Scan QR card',
  'kiosco.pin': 'Check in with PIN',
  'kiosco.manual': 'Check in manually',
  'kiosco.afina': 'type to find the rest',
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
  'calendario.notaEjemplo':
    'E.g. closed for the regional championship, back on Monday.',

  'legal.derechos': 'All rights reserved.',
  'legal.nota': 'DINAMYT Membresías is a work protected by copyright.',

  'mi.titulo': 'My status',
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
  'mi.nombreLoCambiaElMaestro':
    'Your master changes your name. Ask them if it is misspelled.',
  'mi.comoVengo': 'How my attendance is going',
  'mi.esteMes': 'Classes this month',
  'mi.totalClases': 'Classes in total',
  'mi.ultimaVez': 'Last time',
  'mi.enElClub': 'At the club',
  'mi.miLabor': 'My work at the club',
  'mi.misAlumnos': 'Active students',
  'mi.entrenaronHoy': 'Trained today',
  'mi.esteMesClub': 'Check-ins this month',
  'mi.laborAyuda': "These are your club's numbers. Full detail is in Statistics.",
  'mi.meses': 'months',
  'mi.dias': 'days',
  'mi.desde': 'since',
  'mi.miGrado': 'My grade',
  'mi.gradoAyuda': 'Your master changes your belt when you earn it.',
  'mi.pinAyuda':
    "Say it at the kiosk if the QR won't scan or you left your card at home. Learn it by heart.",
  'mi.sinPin': 'Your master has not assigned you a PIN yet. Ask them for one.',
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
  'pago.fecha': 'Payment date',
  'pago.fechaAyuda': 'If you took it another day, say so: the due date counts from there.',
  'pago.periodos.mensual': 'Months paid',
  'pago.periodos.semanal': 'Weeks paid',
  'pago.periodos.paquete': 'Packs bought',
  'pago.efecto.mensual': 'Added to the due date they already have.',
  'pago.efecto.semanal': 'Added to the due date they already have.',
  'pago.efecto.clase': 'Added to their available classes.',
  'pago.efecto.paquete': 'Added to their available classes.',
  'pago.efecto.matricula': 'Marks the enrolment as paid. Moves no dates.',
  'pago.repetidoConfirmar': 'Yes, it is another payment',
  'pago.montoSugerido': 'The amount is worked out for you; change it if you charged something else.',
  'pago.metodo.efectivo': 'Cash',
  'pago.metodo.transferencia': 'Bank transfer',
  'pago.metodo.nequi': 'Nequi',
  'pago.metodo.daviplata': 'Daviplata',

  'aviso.titulo': 'Notices',
  'aviso.misAvisos': 'My notices',
  'aviso.delClub': 'Club notices',
  'aviso.sinAvisos': 'No notices right now.',
  'aviso.pre_venc': 'Membership about to expire',
  'aviso.venc': 'Membership expired',
  'aviso.mora': 'Membership overdue',
  'aviso.maestro': 'Club summary',
  'aviso.venceEl': 'Due on',
  'aviso.vencioEl': 'Expired on',
  'aviso.sinFecha': 'No due date.',

  'stats.titulo': 'Club statistics',
  'stats.subtitulo': 'How your club is doing: money, people and attendance.',
  'stats.alumnos': 'Active students',
  'stats.nuevosMes': 'New this month',
  'stats.inactivos': 'Access disabled',
  'stats.recaudoMes': 'Cash in this month',
  'stats.devengadoMes': 'Belongs to this month',
  'stats.esperado': 'of the expected',
  'stats.caja': 'Cash in',
  'stats.devengado': 'Belongs to the month',
  'stats.adelantos':
    'Cash in is what arrived; the other is what each month is owed. They differ because paying three months at once is not triple income that month.',
  'stats.pagosMes': 'payments recorded',
  'stats.recaudo6': 'Income over the last 6 months',
  'stats.estados': 'Membership status',
  'stats.asistencia30': 'Attendance over the last 30 days',
  'stats.promedioPorDia': 'Average per class day',
  'stats.diasConClase': 'Days with class',
  'stats.masConstantes': 'Most consistent',
  'stats.porPlan': 'Students per plan',
  'stats.porCinturon': 'Students per belt',
  'stats.sinDatos': 'Nothing to show here yet.',
  'stats.asistenciasCuenta': 'check-ins',
  'stats.alumnosCuenta': 'students',

  'admin.titulo': 'Clubs and masters',
  'admin.subtitulo': 'Here you decide which clubs exist and who gets access.',
  'admin.nuevoClub': 'New club',
  'admin.nombreClub': 'Club name',
  'admin.ciudad': 'City',
  'admin.pais': 'Country',
  'admin.selecciona': 'Select…',
  'admin.buscaCiudad': 'Search your city',
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
