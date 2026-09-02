'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';
import { api, mensajeError, type Rol } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n, type ClaveTexto } from '@/lib/i18n';
import { claseEstado, claveEstado, fmtFecha, fmtMoneda, hoyISO } from '@/lib/formato';
import {
  LIM,
  PROPS_CORREO,
  TIPOS_SANGRE,
  correoValido,
  dominioSugerido,
  nombreCompletoValido,
  enMayusculas,
  soloDigitos,
  soloTelefono,
  telefonoValido,
} from '@/lib/campos';
import { CINTURONES, fondoCinturon } from '@/lib/cinturones';
import { avisoError, avisoOk } from '@/lib/toast';
import { Avatar } from '@/components/Avatar';
import { CampoContrasena } from '@/components/CampoContrasena';
import { CampoFecha } from '@/components/CampoFecha';
import { CampoImagen } from '@/components/CampoImagen';
import { Contador } from '@/components/Contador';
import { Etiqueta, LeyendaObligatorios } from '@/components/Etiqueta';
import { Carnet } from '@/components/Carnet';
import { AccesoQR } from '@/components/AccesoQR';
import { Cinturon } from '@/components/Cinturon';
import { SelectMenu } from '@/components/SelectMenu';
import { CampoDinero } from '@/components/CampoDinero';
import { VerMas } from '@/components/Paginacion';

interface Persona {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  belt: string | null;
  trainsSince: string | null;
  birthDate: string | null;
  /** Cuándo se le expidió el carnet. Ver `POST /users/:id/carnet`. */
  carnetEmitidoEl: string | null;
  bloodType: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  role: Rol;
  isActive: boolean;
  /**
   * Si la ficha de esta persona la gobierna el portal DINAMYT: aquí se lee y
   * allí se edita. Ver `lib/ecosistema.ts` en la API.
   */
  enElEcosistema: boolean;
  /** Su id en el portal, para enlazar derecho a su ficha de allí. */
  ecoSub: string | null;
}
interface Membership {
  userId: string;
  fullName: string;
  estado: string;
  status: string | null;
  currentPlanId: string | null;
  venceEl: string | null;
  clasesRestantes: number | null;
  diasFaltantes: number | null;
  checkinPin: string | null;
  /** En qué clase del club entrena. `null` = sin repartir. */
  groupId: string | null;
  groupName: string | null;
}
/** Una clase del club, para el desplegable de asignación. */
interface Clase {
  id: string;
  name: string;
}
interface Plan {
  id: string;
  name: string;
  type: string;
  price: string;
}
interface Payment {
  id: string;
  amount: string;
  method: string;
  status: string;
  paidAt: string;
}
interface Attendance {
  id: string;
  checkinDate: string;
  method: string;
}

/** Portal DINAMYT: es donde se editan los datos de la persona. Ver más abajo. */
const PORTAL_URL = process.env.NEXT_PUBLIC_ECOSYSTEM_PORTAL_URL || '';

const ESTADOS_MEM = ['activo', 'inactivo', 'suspendido', 'retirado'] as const;
const METODOS = ['efectivo', 'transferencia', 'nequi', 'daviplata'] as const;

/**
 * Un PIN de cuatro dígitos al azar, para el botón del dado.
 *
 * No comprueba si está libre: eso lo sabe el servidor, que tiene el índice
 * único por club y contesta con el nombre de quien ya lo tiene. Aquí sirve
 * para no quedarse mirando el teclado pensando un número.
 */
function pinAlAzar(): string {
  return String(Math.floor(Math.random() * 10000)).padStart(4, '0');
}

/** Cuántas filas de historial destapa cada «ver más». */
const PASO_HISTORIAL = 20;

/**
 * Ficha del alumno, vista por el maestro. Es la pantalla donde se hace TODO lo
 * que le concierne a una persona: corregir sus datos, ponerle plan, cobrarle,
 * darle su carnet y, si hace falta, abrirle la sesión con un QR.
 *
 * Antes solo mostraba y dejaba cambiar la contraseña: para asignar un plan
 * había que ir al panel del club y adivinar que el desplegable de una fila
 * servía para eso.
 */
export default function Ficha() {
  const router = useRouter();
  const params = useParams();
  const id = String(params.id ?? '');
  const { t, idioma } = useI18n();
  const { user, club, cargando: cargandoSesion, esStaff, refrescar } = useAuth();
  const esMaestro = user?.role === 'owner' || user?.isSuperAdmin;
  /** Esta ficha es la mía: la del maestro, que ya no sale en el listado. */
  const esMiFicha = Boolean(user && user.id === id);

  const [persona, setPersona] = useState<Persona | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  /** Solo para fallos al CARGAR la ficha; lo demás va por la nube flotante. */
  const [error, setError] = useState('');
  const [nuevaPass, setNuevaPass] = useState('');

  const [datos, setDatos] = useState({
    fullName: '',
    // El correo se edita AQUÍ, y no solo en el alta: es la llave con la que
    // esta persona entra, y un dedazo el día de la inscripción la deja fuera.
    // Antes solo se podía corregir desde el listado, del que el maestro ya no
    // forma parte — así que el suyo no había forma de tocarlo.
    email: '',
    phone: '',
    belt: '',
    trainsSince: '',
    birthDate: '',
    bloodType: '',
    emergencyName: '',
    emergencyPhone: '',
  });
  /**
   * El cinturón con el que se abrió la ficha.
   *
   * Sirve para una sola cosa: darse cuenta de que acaba de subir de grado. El
   * carnet que el alumno lleva encima dice el cinturón anterior, y eso —al
   * revés que corregirle el tipo de sangre— no se arregla en la próxima
   * impresión: hay que reexpedirlo y darle el nuevo.
   */
  const [gradoGuardado, setGradoGuardado] = useState<string | null>(null);
  const [plan, setPlan] = useState({
    currentPlanId: '',
    status: 'activo',
    checkinPin: '',
    venceEl: '',
    clasesRestantes: '',
    /** Su clase. Vive con el plan porque, como él, es de la MEMBRESÍA. */
    groupId: '',
  });
  const [clases, setClases] = useState<Clase[]>([]);
  const [cobro, setCobro] = useState({
    planId: '',
    amount: '',
    method: 'efectivo',
    paidAt: hoyISO(),
    periodos: '1',
  });
  const [guardando, setGuardando] = useState('');
  /** Pago que la API considera repetido y espera que se confirme. */
  const [repetido, setRepetido] = useState('');
  const cobroRef = useRef<HTMLFormElement | null>(null);
  const saltoHecho = useRef(false);
  /**
   * Cuánto historial se enseña de golpe. La API los manda completos —son de un
   * solo alumno—, así que «ver más» solo destapa lo que ya está aquí.
   *
   * Antes las asistencias se cortaban con un `.slice(0, 30)` y punto: un alumno
   * con dos años venía enseñando treinta de sus trescientas, sin un número que
   * dijera que faltaba nada.
   */
  const [verPagos, setVerPagos] = useState(PASO_HISTORIAL);
  const [verAsistencias, setVerAsistencias] = useState(PASO_HISTORIAL);

  const cargar = useCallback(async () => {
    try {
      const [pe, mem, pl, pays, ats] = await Promise.all([
        api.get<Persona>(`/users/${id}`),
        // UNA membresía, no el club entero. Antes se descargaba el roster
        // completo para hacerle un `find` aquí: con el roster ya paginado eso
        // habría dejado de encontrar a nadie que no cupiera en la primera
        // página, además de traer doscientas filas para usar una.
        api.get<{ items: Membership[] }>('/memberships', { params: { userId: id } }),
        api.get<Plan[]>('/plans'),
        api.get<Payment[]>(`/payments?userId=${id}`),
        api.get<Attendance[]>(`/attendances?userId=${id}`),
      ]);
      const m = mem.data.items[0] ?? null;
      setPersona(pe.data);
      setMembership(m);
      setPlanes(pl.data);
      setPayments(pays.data);
      setAttendances(ats.data);

      setDatos({
        fullName: pe.data.fullName,
        email: pe.data.email,
        phone: pe.data.phone ?? '',
        belt: pe.data.belt ?? '',
        trainsSince: pe.data.trainsSince ?? '',
        birthDate: pe.data.birthDate ?? '',
        bloodType: pe.data.bloodType ?? '',
        emergencyName: pe.data.emergencyName ?? '',
        emergencyPhone: pe.data.emergencyPhone ?? '',
      });
      setPlan({
        currentPlanId: m?.currentPlanId ?? '',
        status: m?.status ?? 'activo',
        checkinPin: m?.checkinPin ?? '',
        venceEl: m?.venceEl ?? '',
        clasesRestantes: m?.clasesRestantes != null ? String(m.clasesRestantes) : '',
        groupId: m?.groupId ?? '',
      });
    } catch (e) {
      setError(mensajeError(e, t('comun.ninguno')));
    }
  }, [id, t]);

  useEffect(() => {
    if (cargandoSesion) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!esStaff) {
      router.replace('/mi');
      return;
    }
    if (id) void cargar();
    // Las clases del club, para el desplegable de asignación. Aparte de la
    // ficha porque no cambian al guardar nada de esta pantalla.
    void api
      .get<{ grupos: Clase[] }>('/schedule')
      .then((r) => setClases(r.data.grupos ?? []))
      .catch(() => setClases([]));
  }, [cargandoSesion, user, esStaff, id, router, cargar]);

  /**
   * El salto a «Registrar un pago» cuando se llega desde el botón «Cobrar» del
   * panel, que enlaza a `…/alumnos/:id#cobrar`.
   *
   * El navegador busca el ancla en cuanto carga la página, y en ese momento el
   * formulario todavía NO existe: nace después, cuando vuelven la sesión y los
   * datos del alumno. Al no encontrar nada, la página se quedaba arriba del
   * todo. En un portátil casi no se nota —el formulario cae en la segunda
   * columna, a la vista—, pero en el celular todo va en una sola columna y el
   * cobro queda a más de dos mil píxeles de scroll: parecía que el botón no
   * había hecho nada.
   *
   * Así que el salto se repite aquí, ya con el formulario montado. Una sola
   * vez (`saltoHecho`): si no, cualquier recarga de datos —guardar el plan,
   * registrar el pago— devolvería la pantalla a este punto de un tirón.
   *
   * El hueco de la barra pegajosa lo pone `scroll-padding-top` en globals.css,
   * que `scrollIntoView` también respeta.
   */
  useEffect(() => {
    if (saltoHecho.current) return;
    if (window.location.hash !== '#cobrar') return;
    const form = cobroRef.current;
    if (!form) return;
    saltoHecho.current = true;
    form.scrollIntoView({ block: 'start' });
  }, [persona, esMaestro]);

  async function guardarDatos(e: FormEvent) {
    e.preventDefault();
    if (!nombreCompletoValido(datos.fullName)) {
      avisoError(t('comun.nombreIncompleto'));
      return;
    }
    if (!correoValido(datos.email)) {
      avisoError(t('comun.correoInvalido'));
      return;
    }
    if (!telefonoValido(datos.phone) || !telefonoValido(datos.emergencyPhone)) {
      avisoError(t('comun.telefonoCorto'));
      return;
    }
    const subioDeGrado = (datos.belt || null) !== (persona?.belt ?? null) && Boolean(datos.belt);
    setGuardando('datos');
    try {
      await api.patch(`/users/${id}`, {
        fullName: datos.fullName,
        email: datos.email,
        phone: datos.phone || null,
        belt: datos.belt || null,
        trainsSince: datos.trainsSince || null,
        // Solo la manda el maestro: la API rechaza con un 403 al auxiliar que
        // lo intente, así que enviarla desde su pantalla sería un error seguro
        // en un guardado que por lo demás es suyo.
        ...(esMaestro ? { birthDate: datos.birthDate || null } : {}),
        bloodType: datos.bloodType || null,
        emergencyName: datos.emergencyName || null,
        emergencyPhone: datos.emergencyPhone || null,
      });
      // Cambió de cinturón: el aviso de reexpedir se queda en pantalla hasta
      // que se reexpide o se recarga la ficha.
      setGradoGuardado(subioDeGrado ? (datos.belt || null) : null);
      await cargar();
      // Si es MI ficha, la sesión en memoria acaba de quedarse vieja: sin
      // esto, «Mi grado» seguía enseñando el cinturón anterior —o ninguno—
      // hasta recargar la aplicación entera.
      if (esMiFicha) await refrescar();
      // La nube sale al final: con la ficha ya releída del servidor. Antes se
      // anunciaba «guardado» antes de recargar, y desde el final del
      // formulario —que es donde está el botón— no se veía nada de nada.
      avisoOk(t('ficha.guardado'));
    } catch (err) {
      avisoError(mensajeError(err, t('ficha.datos')));
    } finally {
      setGuardando('');
    }
  }

  /**
   * Reexpedir el carnet: le pone la fecha de hoy y con ella otro año.
   *
   * Es lo ÚNICO que mueve la vigencia. Imprimir no la toca: dos copias del
   * mismo carnet tienen que decir lo mismo, y hasta hace poco no era así
   * —cada impresión se fechaba sola en el día en que se hacía, así que el
   * carnet no vencía nunca.
   */
  async function reexpedirCarnet() {
    try {
      await api.post(`/users/${id}/carnet`, {});
      setGradoGuardado(null);
      await cargar();
      if (esMiFicha) await refrescar();
      avisoOk(t('carnet.reexpedido'));
    } catch (err) {
      avisoError(mensajeError(err, t('carnet.reexpedir')));
    }
  }

  /**
   * La foto va sola a la API: `CampoFoto` avisa cuando ya la recortó y la
   * comprimió. Si falla, el error sube al componente, que es quien lo enseña
   * pegado al botón — donde el maestro está mirando.
   */
  async function guardarFoto(avatarUrl: string | null) {
    await api.patch(`/users/${id}`, { avatarUrl });
    await cargar();
    avisoOk(t('ficha.guardado'));
  }

  async function guardarPlan(e: FormEvent) {
    e.preventDefault();
    setGuardando('plan');
    try {
      await api.patch(`/memberships/${id}`, {
        ...(plan.currentPlanId ? { currentPlanId: plan.currentPlanId } : {}),
        status: plan.status,
        checkinPin: plan.checkinPin || null,
        venceEl: plan.venceEl || null,
        clasesRestantes: plan.clasesRestantes === '' ? null : Number(plan.clasesRestantes),
        // Viaja aunque esté vacía: sacar a alguien de su clase es una decisión
        // tan legítima como meterlo, y con `undefined` no habría forma de
        // distinguirla de «no la toques».
        groupId: plan.groupId || null,
      });
      await cargar();
      avisoOk(t('ficha.guardado'));
    } catch (err) {
      avisoError(mensajeError(err, t('ficha.planYEstado')));
    } finally {
      setGuardando('');
    }
  }

  /**
   * Registra el pago. `confirmarRepetido` solo viaja cuando el maestro insiste
   * tras el aviso de la API: es el guardarraíl contra el pago que se registra
   * dos veces por ir y volver entre pantallas.
   */
  async function registrarPago(e: FormEvent, confirmarRepetido = false) {
    e.preventDefault();
    setRepetido('');
    const elegido = planes.find((p) => p.id === cobro.planId);
    if (!elegido) return;
    setGuardando('pago');
    try {
      await api.post(`/memberships/${id}/payments`, {
        planId: elegido.id,
        amount: cobro.amount || elegido.price,
        method: cobro.method,
        paidAt: cobro.paidAt,
        periodos: Number(cobro.periodos) || 1,
        ...(confirmarRepetido ? { confirmarRepetido: true } : {}),
      });
      setCobro({
        planId: '',
        amount: '',
        method: 'efectivo',
        paidAt: hoyISO(),
        periodos: '1',
      });
      // Con el estado del alumno ya releído: el aviso y el vencimiento nuevo
      // aparecen a la vez. Cobrar es justo donde más caro sale dudar de si se
      // registró — dos veces es dinero cobrado dos veces.
      await cargar();
      avisoOk(t('pago.registrado'));
    } catch (err) {
      const mensaje = mensajeError(err, t('pago.titulo'));
      // 409 con código PAGO_REPETIDO: no es un error, es una pregunta. Se queda
      // pegada al formulario porque hay que responderla ahí mismo.
      if (axios.isAxiosError(err) && err.response?.status === 409) setRepetido(mensaje);
      else avisoError(mensaje);
    } finally {
      setGuardando('');
    }
  }

  async function cambiarPassword(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post(`/users/${id}/password`, { password: nuevaPass });
      setNuevaPass('');
      avisoOk(t('alumnos.contrasenaCambiada'));
    } catch (err) {
      avisoError(mensajeError(err, t('alumnos.nuevaContrasena')));
    }
  }

  const nombre = persona?.fullName ?? membership?.fullName ?? '—';
  /**
   * ¿Esta ficha es de alguien que paga mensualidad?
   *
   * En «Alumnos» está también el maestro, sus auxiliares y los acudientes: hay
   * que poder corregirles el correo, el teléfono o la contraseña. Pero
   * mensualidad no tienen —el roster del club solo lista alumnos—, así que su
   * ficha les enseñaba un estado «Sin plan» perpetuo, un selector de plan que
   * no les corresponde y un formulario para cobrarles. Todo eso se guarda para
   * quien sí paga; lo demás de la ficha sigue igual para todos.
   */
  const esAlumno = persona?.role === 'student';
  /** Quien no pasa por el kiosco: su carnet no marca asistencia, acredita. */
  const esDelStaff = persona?.role === 'owner' || persona?.role === 'staff';
  const planCobro = planes.find((p) => p.id === cobro.planId) ?? null;
  /** El plan que el alumno tiene puesto: va impreso en su carnet. */
  const planActual = planes.find((p) => p.id === membership?.currentPlanId) ?? null;

  /**
   * Qué cobertura tiene sentido tocar a mano, según el plan elegido.
   *
   * El formulario enseñaba SIEMPRE los dos campos —la fecha de vencimiento y
   * las clases disponibles— con una nota debajo de cada uno diciendo para qué
   * tipo de plan valía. En un alumno de clase suelta eso es un cuadro de fecha
   * pidiendo que alguien escriba a mano algo que no existe: su plan no vence,
   * se le acaban las clases. Y lo que se escriba ahí manda, así que un dedazo
   * ahí lo deja «Vencido» aunque acabe de pagar.
   *
   * Sin plan elegido se enseñan los dos: es el alumno que llega de otro sistema
   * y al que hay que cuadrarle la situación antes de ponerle nada.
   */
  const tipoPlanElegido = planes.find((p) => p.id === plan.currentPlanId)?.type ?? null;
  const mostrarVence =
    tipoPlanElegido === null || tipoPlanElegido === 'mensual' || tipoPlanElegido === 'semanal';
  const mostrarClases =
    tipoPlanElegido === null || tipoPlanElegido === 'clase' || tipoPlanElegido === 'paquete';

  /** Precio del plan por el número de periodos, sin decimales de más. */
  function montoSugerido(planId: string, periodos: string): string {
    const p = planes.find((x) => x.id === planId);
    if (!p) return '';
    const n = Math.max(1, Number(periodos) || 1);
    const total = parseFloat(p.price) * (p.type === 'matricula' ? 1 : n);
    return String(Math.round(total * 100) / 100);
  }

  /** Cómo se llama «uno más» según el plan: un mes, una semana, una clase. */
  function clavePeriodos(tipo: string): ClaveTexto {
    if (tipo === 'semanal') return 'pago.periodos.semanal';
    // Una clase suelta se lleva de a una: pedir «paquetes que lleva» donde se
    // están vendiendo tres clases sueltas es preguntar por otra cosa.
    if (tipo === 'clase') return 'pago.periodos.clase';
    if (tipo === 'paquete') return 'pago.periodos.paquete';
    return 'pago.periodos.mensual';
  }

  const opcionesPlan = planes.map((p) => ({
    valor: p.id,
    etiqueta: `${p.name} · ${fmtMoneda(p.price)}`,
  }));
  const opcionesCinturon = [
    { valor: '', etiqueta: t('comun.sinCinturon') },
    ...CINTURONES.map((c) => ({
      valor: c.nombre,
      etiqueta: c.nombre,
      punto: fondoCinturon(c),
    })),
  ];

  return (
    <main style={{ maxWidth: 1000, margin: '0 auto', padding: '1.5rem' }}>
      <header
       
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.25rem',
          gap: '0.75rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
          <Avatar src={persona?.avatarUrl} nombre={nombre} size={52} ampliable />
          <div>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 800 }}>{nombre}</h1>
            <p className="muted" style={{ fontSize: '0.78rem' }}>
              {persona?.email}
            </p>
            <div style={{ marginTop: '0.2rem' }}>
              <Cinturon nombre={persona?.belt} />
            </div>
          </div>
        </div>
        <Link href="/alumnos" className="btn btn-outline btn-sm">
          {t('comun.volver')}
        </Link>
      </header>

      {/* Solo un fallo al CARGAR la ficha se queda escrito aquí: es permanente
          y explica por qué la pantalla está vacía. El resultado de una acción
          se avisa con la nube flotante (ver lib/toast.ts). */}
      {error && (
        <p className="msg-error" style={{ marginBottom: '1rem' }}>
          {error}
        </p>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(min(280px, 100%), 1fr))',
          gap: '1rem',
          marginBottom: '1.25rem',
        }}
      >
        {/* ── El carnet: el motivo por el que existe esta pantalla ─────────── */}
        <div className="card" style={{ padding: '1rem' }}>
          <h2 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.3rem' }}>
            {t(`carnet.tipo.${persona?.role ?? 'student'}` as ClaveTexto)}
          </h2>
          {/* «Lo trae a clase y el maestro lo escanea» solo vale para quien
              entrena. La ficha de un auxiliar enseña el mismo carnet, pero el
              suyo no marca asistencia: acredita. */}
          <p className="muted" style={{ fontSize: '0.75rem', marginBottom: '0.9rem' }}>
            {t(esDelStaff ? 'qr.descripcionStaff' : 'qr.descripcion')}
          </p>

          {/* ── Subió de cinturón: hay que darle otro carnet ──
              El resto de la ficha se refleja sola en la próxima impresión —el
              carnet se pinta con los datos de AHORA—, así que corregir una
              sangre o un teléfono no obliga a reexpedir nada. El grado sí: el
              papel que el alumno lleva en el bolsillo dice el anterior, y ese
              papel es el que enseña. */}
          {gradoGuardado && (
            <div
              className="card"
              style={{
                padding: '0.75rem',
                marginBottom: '0.9rem',
                borderColor: 'var(--gold-dim)',
              }}
            >
              <p style={{ fontSize: '0.8rem', color: 'var(--gold)', fontWeight: 700 }}>
                ⚠ {t('carnet.gradoCambio')}
              </p>
              <p className="muted" style={{ fontSize: '0.72rem', marginTop: '0.2rem' }}>
                {t('carnet.gradoCambioAyuda')}
              </p>
              {esMaestro && (
                <button
                  type="button"
                  className="btn btn-gold btn-sm"
                  style={{ marginTop: '0.5rem' }}
                  onClick={reexpedirCarnet}
                >
                  {t('carnet.reexpedir')}
                </button>
              )}
            </div>
          )}

          <Carnet
            id={id}
            nombre={nombre}
            club={club?.name}
            maestro={club?.ownerName}
            logoClub={club?.logoUrl}
            role={persona?.role}
            rol={t(`rol.${persona?.role ?? 'student'}` as ClaveTexto)}
            tipo={t(`carnet.tipo.${persona?.role ?? 'student'}` as ClaveTexto)}
            foto={persona?.avatarUrl}
            cinturon={persona?.belt}
            sangre={persona?.bloodType}
            emergenciaNombre={persona?.emergencyName}
            emergenciaTelefono={persona?.emergencyPhone}
            pin={membership?.checkinPin}
            emitidoEl={persona?.carnetEmitidoEl}
            desde={persona?.trainsSince}
            // Reexpedir vale para el carnet perdido y para el vencido: es lo
            // único que renueva el año. Solo el maestro, que es quien lo firma.
            onReexpedir={esMaestro ? reexpedirCarnet : undefined}
          />
          <p className="muted" style={{ fontSize: '0.7rem', marginTop: '0.6rem' }}>
            {t('carnet.datosAlDia')}
          </p>
        </div>

        <div style={{ display: 'grid', gap: '1rem', alignContent: 'start' }}>
          {/* Para un alumno, su mensualidad. Para el maestro o un auxiliar, sus
              datos de contacto a secas: ver `esAlumno` arriba. */}
          <div className="card" style={{ padding: '1rem' }}>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.6rem' }}>
              {esAlumno ? t('ficha.membresia') : t('ficha.contacto')}
            </h2>
            {esAlumno ? (
              <>
                <p>
                  <span className="muted">{t('comun.estado')}: </span>
                  <span className={claseEstado(membership?.estado ?? '')}>
                    {t(claveEstado(membership?.estado ?? ''))}
                  </span>
                </p>
                {/* Cada línea solo si dice algo. Un alumno de clase suelta no
                    tiene fecha de vencimiento y uno de mensualidad no tiene
                    saldo de clases: enseñarles «—» era invitar a pensar que
                    faltaba por llenar un dato. */}
                {membership?.venceEl && (
                  <p>
                    <span className="muted">{t('mi.vence')}: </span>
                    {fmtFecha(membership.venceEl, idioma)}
                    {membership.diasFaltantes != null ? ` (${membership.diasFaltantes} d)` : ''}
                  </p>
                )}
                {membership?.clasesRestantes != null && (
                  <p>
                    <span className="muted">{t('mi.clasesRestantes')}: </span>
                    {membership.clasesRestantes}
                  </p>
                )}
              </>
            ) : (
              <p>
                <span className="muted">{t('comun.rol')}: </span>
                {t(`rol.${persona?.role ?? 'student'}` as ClaveTexto)}
              </p>
            )}
            <p>
              <span className="muted">{t('comun.telefono')}: </span>
              {persona?.phone || '—'}
            </p>
            <p>
              <span className="muted">{t('comun.correo')}: </span>
              <span style={{ overflowWrap: 'anywhere' }}>{persona?.email || '—'}</span>
            </p>
          </div>

          {/* ── Las dos formas de devolverle la entrada a alguien ──
              El QR abre la sesión sin teclear nada y la contraseña nueva se la
              dicta el maestro: son la misma conversación («no puedo entrar»),
              así que van juntas y no una arriba y otra al final de la página.
              Las dos son del ACCESO, no de la ficha: siguen aquí aunque los
              datos de la persona los mantenga el portal. */}
          {esMaestro && <AccesoQR userId={id} />}

          {/* Con cuenta de DINAMYT, la contraseña NO se escribe aquí: es una
              sola para todo el ecosistema y se fija en el portal, que la copia
              hasta esta app (`POST /sync/contrasena`). Dejar el formulario
              puesto sería ofrecer un botón que el servidor rechaza con un 409
              —y, si no lo rechazara, esa persona acabaría con una contraseña
              para el club y otra para DINAMYT—. Para lo que el maestro necesita
              AHORA, en la puerta, está el QR de aquí arriba. */}
          {esMaestro && persona?.enElEcosistema && (
            <div className="card" style={{ padding: '1rem' }}>
              <h2 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.6rem' }}>
                {t('alumnos.nuevaContrasena')}
              </h2>
              <p className="muted" style={{ fontSize: '0.78rem', margin: 0 }}>
                Su contraseña es la de DINAMYT y vive en el portal: la cambia
                ella misma desde su perfil, o la recupera con «¿Olvidaste tu
                contraseña?». Si necesita entrar ahora, usa el acceso por QR.
              </p>
            </div>
          )}

          {esMaestro && !persona?.enElEcosistema && (
            <form onSubmit={cambiarPassword} className="card" style={{ padding: '1rem' }}>
              <h2 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.6rem' }}>
                {t('alumnos.nuevaContrasena')}
              </h2>
              {/* Arranca VISIBLE: el maestro la está fijando y se la tiene que
                  dictar al alumno. El ojo está para taparla cuando hay gente
                  mirando la pantalla. */}
              <CampoContrasena
                verInicial
                autoComplete="new-password"
                minLength={8}
                maxLength={LIM.password}
                required
                value={nuevaPass}
                onChange={(e) => setNuevaPass(e.target.value)}
                placeholder={t('mi.contrasenaNueva')}
              />
              <Contador valor={nuevaPass} max={LIM.password} />
              <p className="muted" style={{ fontSize: '0.7rem', margin: '0.35rem 0 0.6rem' }}>
                {t('alumnos.contrasenaAyuda')}
              </p>
              <button type="submit" className="btn btn-outline btn-sm">
                {t('comun.guardar')}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* ── Los datos de la PERSONA ──
          Cuando el club vive en DINAMYT esto es una tarjeta de lectura con un
          enlace al portal, y no un formulario. La misma cuenta entra también a
          Campeonatos y a Academy: editable por los dos lados, ganaba el último
          que guardara y el mismo alumno acababa con dos nombres y dos fotos
          según por dónde se mirara. Lo del CLUB —plan, PIN, clase, cobros,
          carnet, acceso— se sigue haciendo aquí abajo.

          Un club que usa Membresías por su cuenta no tiene portal detrás: para
          él `enElEcosistema` es falso y el formulario de siempre sigue en pie.
          Ver `lib/ecosistema.ts` en la API, que es quien lo hace cumplir. */}
      {esMaestro && persona?.enElEcosistema && (
        <div className="card" style={{ padding: '1rem', marginBottom: '1.25rem' }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.6rem',
              marginBottom: '0.2rem',
            }}
          >
            <h2 style={{ fontSize: '0.95rem', fontWeight: 700 }}>
              {t(esAlumno ? 'ficha.datos' : 'ficha.datosMiembro')}
            </h2>
            {PORTAL_URL && (
              <a
                className="btn btn-outline btn-sm"
                href={
                  persona.ecoSub
                    ? `${PORTAL_URL}/mi-organizacion/miembro/${persona.ecoSub}`
                    : `${PORTAL_URL}/mi-organizacion`
                }
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('eco.editarEnPortal')} ↗
              </a>
            )}
          </div>
          <p className="muted" style={{ fontSize: '0.72rem', marginBottom: '0.9rem' }}>
            {t('eco.fichaDelPortal')}
          </p>

          {/* Dos columnas: son ocho datos de una línea cada uno, y en fila
              india dejaban media tarjeta en blanco. */}
          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(min(220px, 100%), 1fr))',
              gap: '0.6rem 1.5rem',
              fontSize: '0.85rem',
            }}
          >
            <div>
              <dt className="muted" style={{ fontSize: '0.72rem' }}>{t('comun.nombre')}</dt>
              <dd style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{persona.fullName}</dd>
            </div>
            <div>
              <dt className="muted" style={{ fontSize: '0.72rem' }}>{t('comun.correo')}</dt>
              <dd style={{ overflowWrap: 'anywhere' }}>{persona.email}</dd>
            </div>
            <div>
              <dt className="muted" style={{ fontSize: '0.72rem' }}>{t('comun.telefono')}</dt>
              <dd>{persona.phone || '—'}</dd>
            </div>
            <div>
              <dt className="muted" style={{ fontSize: '0.72rem' }}>{t('comun.cinturon')}</dt>
              <dd><Cinturon nombre={persona.belt} /></dd>
            </div>
            <div>
              <dt className="muted" style={{ fontSize: '0.72rem' }}>
                {t('ficha.entrenaDesde')}
              </dt>
              <dd className="mono">
                {persona.trainsSince ? fmtFecha(persona.trainsSince, idioma) : '—'}
              </dd>
            </div>
            <div>
              <dt className="muted" style={{ fontSize: '0.72rem' }}>{t('ficha.nacimiento')}</dt>
              <dd className="mono">
                {persona.birthDate ? fmtFecha(persona.birthDate, idioma) : '—'}
              </dd>
            </div>
            <div>
              <dt className="muted" style={{ fontSize: '0.72rem' }}>{t('ficha.sangre')}</dt>
              <dd>{persona.bloodType || '—'}</dd>
            </div>
            <div>
              <dt className="muted" style={{ fontSize: '0.72rem' }}>
                {t('ficha.emergenciaNombre')}
              </dt>
              <dd style={{ overflowWrap: 'anywhere' }}>{persona.emergencyName || '—'}</dd>
            </div>
            <div>
              <dt className="muted" style={{ fontSize: '0.72rem' }}>
                {t('ficha.emergenciaTelefono')}
              </dt>
              <dd>{persona.emergencyPhone || '—'}</dd>
            </div>
          </dl>

        </div>
      )}

      {esMaestro && !persona?.enElEcosistema && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(min(280px, 100%), 1fr))',
            gap: '1rem',
            marginBottom: '1.25rem',
          }}
        >
          {/* ── Datos del alumno ── */}
          <form onSubmit={guardarDatos} className="card" style={{ padding: '1rem' }}>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.35rem' }}>
              {t(esAlumno ? 'ficha.datos' : 'ficha.datosMiembro')}
            </h2>
            <LeyendaObligatorios />
            {/* La foto se guarda al elegirla, sin esperar al botón: es lo que
                se espera de una foto, y además la vista previa del carnet la
                necesita ya puesta para enseñar cómo va a quedar. */}
            <div style={{ marginBottom: '0.9rem' }}>
              <CampoImagen
                src={persona?.avatarUrl}
                nombre={nombre}
                onCambiar={guardarFoto}
              />
            </div>
            <Etiqueta obligatorio>{t('comun.nombre')}</Etiqueta>
            <input
              value={datos.fullName}
              onChange={(e) => setDatos({ ...datos, fullName: enMayusculas(e.target.value) })}
              maxLength={LIM.nombrePersona}
              required
              style={{
                margin: '0.25rem 0 0.2rem',
                borderColor: nombreCompletoValido(datos.fullName) ? undefined : 'var(--danger)',
              }}
            />
            {!nombreCompletoValido(datos.fullName) && (
              <p className="msg-error" style={{ fontSize: '0.7rem', marginBottom: '0.4rem' }}>
                {t('comun.nombreIncompleto')}
              </p>
            )}
            <Contador valor={datos.fullName} max={LIM.nombrePersona} />

            {/* El correo, aquí. Es con lo que entra: si está mal escrito, la
                cuenta no la puede usar nadie —y esta es la única pantalla
                desde la que el maestro puede arreglar el suyo. */}
            <Etiqueta obligatorio>{t('comun.correo')}</Etiqueta>
            <input
              {...PROPS_CORREO}
              value={datos.email}
              onChange={(e) => setDatos({ ...datos, email: e.target.value })}
              maxLength={LIM.correo}
              required
              style={{
                margin: '0.25rem 0 0.2rem',
                borderColor: correoValido(datos.email) ? undefined : 'var(--danger)',
              }}
            />
            {!correoValido(datos.email) && (
              <p className="msg-error" style={{ fontSize: '0.7rem', marginBottom: '0.4rem' }}>
                {t('comun.correoInvalido')}
              </p>
            )}
            {correoValido(datos.email) && dominioSugerido(datos.email) && (
              <p className="muted" style={{ fontSize: '0.7rem', marginBottom: '0.4rem' }}>
                {t('comun.correoSugerencia')}{' '}
                <button
                  type="button"
                  className="enlace"
                  onClick={() => setDatos({ ...datos, email: dominioSugerido(datos.email)! })}
                >
                  {dominioSugerido(datos.email)}
                </button>
                ?
              </p>
            )}
            <Contador valor={datos.email} max={LIM.correo} />

            <Etiqueta>{t('comun.telefono')}</Etiqueta>
            <input
              type="tel"
              inputMode="tel"
              value={datos.phone}
              onChange={(e) => setDatos({ ...datos, phone: soloTelefono(e.target.value) })}
              maxLength={LIM.telefono}
              style={{
                margin: '0.25rem 0 0.2rem',
                borderColor: telefonoValido(datos.phone) ? undefined : 'var(--danger)',
              }}
            />
            {!telefonoValido(datos.phone) && (
              <p className="msg-error" style={{ fontSize: '0.7rem', marginBottom: '0.4rem' }}>
                {t('comun.telefonoCorto')}
              </p>
            )}
            <Etiqueta>{t('comun.cinturon')}</Etiqueta>
            <div style={{ margin: '0.25rem 0 0.9rem' }}>
              <SelectMenu
                valor={datos.belt}
                onChange={(v) => setDatos({ ...datos, belt: v })}
                etiquetaAria={t('comun.cinturon')}
                placeholder={t('comun.sinCinturon')}
                opciones={opcionesCinturon}
              />
            </div>

            {/* La antigüedad real: un club que estrena la app trae alumnos con
                años encima, y su cuenta es de esta semana. Por eso el
                calendario propio: es una fecha de hace décadas, y el nativo de
                Android obliga a cruzarlas mes a mes. */}
            <Etiqueta>{t('ficha.entrenaDesde')}</Etiqueta>
            <div style={{ margin: '0.25rem 0 0.2rem' }}>
              <CampoFecha
                valor={datos.trainsSince}
                onChange={(v) => setDatos({ ...datos, trainsSince: v })}
                min="1950-01-01"
                max={hoyISO()}
                ariaLabel={t('ficha.entrenaDesde')}
              />
            </div>
            <p className="muted" style={{ fontSize: '0.7rem', marginBottom: '0.7rem' }}>
              {t('ficha.entrenaDesdeAyuda')}
            </p>

            {/* La fecha de nacimiento la corrige el MAESTRO. Al auxiliar se le
                enseña, porque es parte de la ficha que él consulta, pero sin
                editar: la API le responde 403, y un campo que rebota al guardar
                es peor que uno que se ve y no se toca. */}
            <Etiqueta>{t('ficha.nacimiento')}</Etiqueta>
            {esMaestro ? (
              <>
                <div style={{ margin: '0.25rem 0 0.2rem' }}>
                  <CampoFecha
                    valor={datos.birthDate}
                    onChange={(v) => setDatos({ ...datos, birthDate: v })}
                    min="1900-01-01"
                    max={hoyISO()}
                    ariaLabel={t('ficha.nacimiento')}
                  />
                </div>
                <p className="muted" style={{ fontSize: '0.7rem', marginBottom: '0.7rem' }}>
                  {t('ficha.nacimientoAyuda')}
                </p>
              </>
            ) : (
              <p style={{ margin: '0.25rem 0 0.9rem' }}>
                {datos.birthDate ? (
                  <strong className="mono">{fmtFecha(datos.birthDate, idioma)}</strong>
                ) : (
                  <span className="muted">{t('ficha.sinSangre')}</span>
                )}
              </p>
            )}

            <Etiqueta>{t('ficha.sangre')}</Etiqueta>
            <div style={{ margin: '0.25rem 0 0.9rem' }}>
              <SelectMenu
                valor={datos.bloodType}
                onChange={(v) => setDatos({ ...datos, bloodType: v })}
                etiquetaAria={t('ficha.sangre')}
                placeholder={t('ficha.sinSangre')}
                opciones={[
                  { valor: '', etiqueta: t('ficha.sinSangre') },
                  ...TIPOS_SANGRE.map((s) => ({ valor: s, etiqueta: s })),
                ]}
              />
            </div>

            <Etiqueta>{t('ficha.emergenciaNombre')}</Etiqueta>
            <input
              value={datos.emergencyName}
              onChange={(e) =>
                setDatos({ ...datos, emergencyName: enMayusculas(e.target.value) })
              }
              maxLength={LIM.nombrePersona}
              style={{ margin: '0.25rem 0 0.2rem' }}
            />
            <Contador valor={datos.emergencyName} max={LIM.nombrePersona} />
            <Etiqueta>{t('ficha.emergenciaTelefono')}</Etiqueta>
            <input
              type="tel"
              inputMode="tel"
              value={datos.emergencyPhone}
              onChange={(e) =>
                setDatos({ ...datos, emergencyPhone: soloTelefono(e.target.value) })
              }
              maxLength={LIM.telefono}
              style={{
                margin: '0.25rem 0 0.2rem',
                borderColor: telefonoValido(datos.emergencyPhone) ? undefined : 'var(--danger)',
              }}
            />
            <Contador valor={datos.emergencyPhone} max={LIM.telefono} />
            <p className="muted" style={{ fontSize: '0.7rem', marginBottom: '0.7rem' }}>
              {t('ficha.emergenciaAyuda')}
            </p>

            <button type="submit" className="btn btn-gold btn-sm" disabled={guardando === 'datos'}>
              {guardando === 'datos' ? t('comun.guardando') : t('comun.guardar')}
            </button>
          </form>
        </div>
      )}

      {/* ── Lo del CLUB: su plan y su cobro, uno al lado del otro ──
          Los dos en su propia rejilla de dos columnas, y no mezclados con la
          ficha de la persona. Antes iban los tres en la misma (datos, plan y
          cobro): en 900 píxeles no caben tres columnas de 280, así que el cobro
          bajaba a la segunda fila y quedaba debajo de los datos personales, en
          la otra punta de la pantalla que el plan al que pertenece. Y son la
          misma operación: se le pone el plan y se le cobra.

          Solo para alumnos: al maestro y a los auxiliares no se les asigna plan
          ni entran por el kiosco (ver `esAlumno`). */}
      {esMaestro && esAlumno && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(min(320px, 100%), 1fr))',
            gap: '1rem',
            marginBottom: '1.25rem',
          }}
        >
          <form onSubmit={guardarPlan} className="card" style={{ padding: '1rem' }}>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.7rem' }}>
              {t('ficha.planYEstado')}
            </h2>
            <label className="muted" style={{ fontSize: '0.75rem' }}>
              {t('ficha.planActual')}
            </label>
            <div style={{ margin: '0.25rem 0 0.7rem' }}>
              <SelectMenu
                valor={plan.currentPlanId}
                onChange={(v) => setPlan({ ...plan, currentPlanId: v })}
                etiquetaAria={t('ficha.planActual')}
                placeholder={t('ficha.sinPlanAsignado')}
                opciones={opcionesPlan}
                disabled={planes.length === 0}
              />
            </div>
            {/* Su clase. Vive aquí y no arriba, con los datos personales,
                porque no es de la persona: es de su membresía EN ESTE club,
                igual que el plan y el estado, y se guarda en el mismo gesto.
                Solo se dibuja si el club tiene clases. */}
            {clases.length > 0 && (
              <>
                <label className="muted" style={{ fontSize: '0.75rem' }}>
                  {t('grupos.asignar')}
                </label>
                <div style={{ margin: '0.25rem 0 0.7rem' }}>
                  <SelectMenu
                    valor={plan.groupId}
                    onChange={(v) => setPlan({ ...plan, groupId: v })}
                    etiquetaAria={t('grupos.asignar')}
                    placeholder={t('grupos.sinAsignar')}
                    opciones={[
                      { valor: '', etiqueta: t('grupos.sinAsignar') },
                      ...clases.map((c) => ({ valor: c.id, etiqueta: c.name })),
                    ]}
                  />
                </div>
              </>
            )}
            <label className="muted" style={{ fontSize: '0.75rem' }}>
              {t('comun.estado')}
            </label>
            <div style={{ margin: '0.25rem 0 0.7rem' }}>
              <SelectMenu
                valor={plan.status}
                onChange={(v) => setPlan({ ...plan, status: v })}
                etiquetaAria={t('comun.estado')}
                opciones={ESTADOS_MEM.map((s) => ({
                  valor: s,
                  etiqueta: t(`memb.${s}` as ClaveTexto),
                }))}
              />
            </div>
            {/* ── La cobertura, a mano ──
                Solo la que le corresponde al plan elegido (ver `mostrarVence`
                y `mostrarClases` arriba). Esto es el paracaídas: el alumno que
                llega de otro sistema o que pagó por fuera. Lo normal es no
                tocarlo — el vencimiento y las clases los calcula el cobro de
                abajo, y ahí no hay dedazo posible. */}
            {mostrarVence && (
              <>
                <label className="muted" style={{ fontSize: '0.75rem' }}>
                  {t('ficha.venceEl')}
                </label>
                <div style={{ margin: '0.25rem 0 0.2rem' }}>
                  <CampoFecha
                    valor={plan.venceEl}
                    onChange={(v) => setPlan({ ...plan, venceEl: v })}
                    min="2000-01-01"
                    max="2100-12-31"
                    ariaLabel={t('ficha.venceEl')}
                  />
                </div>
                <p className="muted" style={{ fontSize: '0.7rem', marginBottom: '0.7rem' }}>
                  {t('ficha.venceAyuda')}{' '}
                  {tipoPlanElegido === null && <em>{t('ficha.soloPorTiempo')}</em>}
                </p>
              </>
            )}

            {mostrarClases && (
              <>
                <label className="muted" style={{ fontSize: '0.75rem' }}>
                  {t('ficha.clases')}
                </label>
                <input
                  inputMode="numeric"
                  value={plan.clasesRestantes}
                  onChange={(e) =>
                    setPlan({
                      ...plan,
                      clasesRestantes: soloDigitos(e.target.value, LIM.clases),
                    })
                  }
                  maxLength={LIM.clases}
                  style={{ margin: '0.25rem 0 0.2rem' }}
                />
                <p className="muted" style={{ fontSize: '0.7rem', marginBottom: '0.7rem' }}>
                  {tipoPlanElegido === null
                    ? t('ficha.soloPorClases')
                    : t('ficha.clasesAyuda')}
                </p>
              </>
            )}

            {/* La matrícula no es cobertura: no da tiempo ni clases. Sin esta
                línea, el formulario se quedaba sin ningún campo y parecía
                roto. */}
            {tipoPlanElegido === 'matricula' && (
              <p className="muted" style={{ fontSize: '0.7rem', marginBottom: '0.7rem' }}>
                {t('planes.ayuda.matricula')}
              </p>
            )}

            {/* El PIN lo pone la app sola al inscribir al alumno; esto es para
                corregirlo —el que le tocó es difícil de teclear, o se lo contó
                a un compañero—. Si el nuevo ya es de otro, la API responde 409
                diciendo de quién, en vez de reventar contra el índice único. */}
            <label className="muted" style={{ fontSize: '0.75rem' }}>
              {t('ficha.pin')}
            </label>
            <div style={{ display: 'flex', gap: '0.4rem', margin: '0.25rem 0 0.2rem' }}>
              <input
                inputMode="numeric"
                value={plan.checkinPin}
                onChange={(e) =>
                  setPlan({ ...plan, checkinPin: soloDigitos(e.target.value, LIM.checkinPin) })
                }
                maxLength={LIM.checkinPin}
                className="mono"
                style={{ letterSpacing: '0.18em' }}
              />
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setPlan({ ...plan, checkinPin: pinAlAzar() })}
                title={t('ficha.pinOtro')}
                style={{ flexShrink: 0 }}
              >
                🎲
              </button>
            </div>
            <p className="muted" style={{ fontSize: '0.7rem', marginBottom: '0.7rem' }}>
              {t('ficha.pinAyuda')}
            </p>
            <button type="submit" className="btn btn-gold btn-sm" disabled={guardando === 'plan'}>
              {guardando === 'plan' ? t('comun.guardando') : t('comun.guardar')}
            </button>
          </form>

          {/* ── Registrar un pago ──
              El ÚNICO sitio donde se cobra. Antes también se podía desde la
              tabla del panel, y entre las dos pantallas era fácil registrar el
              mismo pago tres veces sin notarlo. Aquí, además, se elige el día
              y cuántos meses cubre. */}
          <form
            id="cobrar"
            ref={cobroRef}
            onSubmit={(e) => registrarPago(e)}
            className="card"
            style={{ padding: '1rem' }}
          >
            <h2 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.7rem' }}>
              {t('pago.titulo')}
            </h2>
            <label className="muted" style={{ fontSize: '0.75rem' }}>
              {t('pago.plan')}
            </label>
            <div style={{ margin: '0.25rem 0 0.7rem' }}>
              <SelectMenu
                valor={cobro.planId}
                // Elegir el plan rellena el monto con su precio por el número
                // de periodos: es lo que se cobra el 99 % de las veces, y se
                // puede corregir a mano.
                onChange={(v) =>
                  setCobro({
                    ...cobro,
                    planId: v,
                    amount: montoSugerido(v, cobro.periodos),
                  })
                }
                etiquetaAria={t('pago.plan')}
                placeholder={t('pago.plan')}
                opciones={opcionesPlan}
                disabled={planes.length === 0}
              />
            </div>

            <label className="muted" style={{ fontSize: '0.75rem' }}>
              {t('pago.fecha')}
            </label>
            <div style={{ margin: '0.25rem 0 0.2rem' }}>
              <CampoFecha
                valor={cobro.paidAt}
                onChange={(v) => setCobro({ ...cobro, paidAt: v })}
                min="2000-01-01"
                max={hoyISO()}
                ariaLabel={t('pago.fecha')}
                // El día del pago no se deja en blanco: sin él no hay pago
                // que registrar (la API lo exige).
                borrable={false}
              />
            </div>
            <p className="muted" style={{ fontSize: '0.7rem', marginBottom: '0.7rem' }}>
              {t('pago.fechaAyuda')}
            </p>

            {/* Cuántos periodos cubre. Es la respuesta correcta a «pagó tres
                meses»: uno solo pago de tres, no tres pagos. La matrícula no
                lo lleva, porque se paga una vez y ya. */}
            {planCobro && planCobro.type !== 'matricula' && (
              <>
                <label className="muted" style={{ fontSize: '0.75rem' }}>
                  {t(clavePeriodos(planCobro.type))}
                </label>
                <input
                  inputMode="numeric"
                  value={cobro.periodos}
                  onChange={(e) => {
                    const periodos = soloDigitos(e.target.value, 2) || '1';
                    setCobro({
                      ...cobro,
                      periodos,
                      amount: montoSugerido(cobro.planId, periodos),
                    });
                  }}
                  maxLength={2}
                  style={{ margin: '0.25rem 0 0.2rem' }}
                />
                <p className="muted" style={{ fontSize: '0.7rem', marginBottom: '0.7rem' }}>
                  {t(`pago.efecto.${planCobro.type}` as ClaveTexto)}
                </p>
              </>
            )}

            <label className="muted" style={{ fontSize: '0.75rem' }}>
              {t('pago.monto')}
            </label>
            <div style={{ margin: '0.25rem 0 0.2rem' }}>
              <CampoDinero
                valor={cobro.amount}
                onChange={(amount) => setCobro({ ...cobro, amount })}
                ariaLabel={t('pago.monto')}
              />
            </div>
            <p className="muted" style={{ fontSize: '0.7rem', marginBottom: '0.7rem' }}>
              {t('pago.montoSugerido')}
            </p>

            <label className="muted" style={{ fontSize: '0.75rem' }}>
              {t('pago.metodo')}
            </label>
            <div style={{ margin: '0.25rem 0 0.7rem' }}>
              <SelectMenu
                valor={cobro.method}
                onChange={(v) => setCobro({ ...cobro, method: v })}
                etiquetaAria={t('pago.metodo')}
                opciones={METODOS.map((m) => ({
                  valor: m,
                  etiqueta: t(`pago.metodo.${m}` as ClaveTexto),
                }))}
              />
            </div>
            <p className="muted" style={{ fontSize: '0.7rem', marginBottom: '0.7rem' }}>
              {t('ficha.cobrarAyuda')}
            </p>

            {/* La API cree que este pago ya se registró. No es un error: es una
                pregunta, y por eso lleva su propio botón en vez de un aviso
                rojo que no deja seguir. */}
            {repetido && (
              <div
                className="card"
                style={{
                  padding: '0.7rem',
                  marginBottom: '0.7rem',
                  borderColor: 'var(--gold-dim)',
                }}
              >
                <p style={{ fontSize: '0.78rem', color: 'var(--gold)' }}>⚠ {repetido}</p>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  style={{ marginTop: '0.5rem' }}
                  disabled={guardando === 'pago'}
                  onClick={(e) => registrarPago(e as unknown as FormEvent, true)}
                >
                  {t('pago.repetidoConfirmar')}
                </button>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-cta btn-sm"
              disabled={!cobro.planId || guardando === 'pago'}
            >
              {guardando === 'pago' ? t('comun.guardando') : t('pago.registrar')}
            </button>
          </form>
        </div>
      )}

      {/* El historial de pagos va con la mensualidad: a quien no se le cobra,
          esta tabla le sale vacía para siempre. */}
      {esAlumno && (
        <div
          className="card tabla-scroll"
          style={{ padding: '0.5rem 1rem', marginBottom: '1.25rem' }}
        >
          <h2 style={{ fontSize: '0.95rem', fontWeight: 700, padding: '0.5rem 0' }}>
            {t('ficha.pagos')}
          </h2>
          <table>
            <thead>
              <tr>
                <th>{t('comun.fecha')}</th>
                <th>{t('pago.monto')}</th>
                <th>{t('pago.metodo')}</th>
                <th>{t('comun.estado')}</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted" style={{ padding: '0.75rem' }}>
                    {t('comun.ninguno')}
                  </td>
                </tr>
              )}
              {payments.slice(0, verPagos).map((p) => (
                <tr key={p.id}>
                  <td>{fmtFecha(p.paidAt?.slice(0, 10), idioma)}</td>
                  <td className="mono">{fmtMoneda(p.amount)}</td>
                  <td className="muted">{t(`pago.metodo.${p.method}` as ClaveTexto)}</td>
                  <td>{p.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <VerMas
            visibles={verPagos}
            total={payments.length}
            onMas={() => setVerPagos((n) => n + PASO_HISTORIAL)}
          />
        </div>
      )}

      {/* ── Asistencias ──
          Va con los pagos: solo para quien entrena. El maestro y sus auxiliares
          no marcan en el kiosco —el check-in es de alumnos—, así que aquí les
          salía un «Ninguno» permanente, como si les faltara algo por hacer. */}
      {esAlumno && (
        <div className="card" style={{ padding: '0.5rem 1rem' }}>
          <h2 style={{ fontSize: '0.95rem', fontWeight: 700, padding: '0.5rem 0' }}>
            {t('ficha.asistencias')}
          </h2>
          <div
            style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', paddingBottom: '0.75rem' }}
          >
            {attendances.length === 0 && (
              <span className="muted" style={{ fontSize: '0.85rem' }}>
                {t('comun.ninguno')}
              </span>
            )}
            {attendances.slice(0, verAsistencias).map((a) => (
              <span key={a.id} className="badge">
                {fmtFecha(a.checkinDate, idioma)} ·{' '}
                {t(`asistencia.metodo.${a.method}` as ClaveTexto)}
              </span>
            ))}
          </div>
          <VerMas
            visibles={verAsistencias}
            total={attendances.length}
            onMas={() => setVerAsistencias((n) => n + PASO_HISTORIAL)}
          />
        </div>
      )}
    </main>
  );
}
