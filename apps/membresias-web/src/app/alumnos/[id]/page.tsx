'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';
import { api, mensajeError, type Rol } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n, type ClaveTexto } from '@/lib/i18n';
import { claseEstado, claveEstado, fmtFecha, fmtMoneda } from '@/lib/formato';
import { LIM, soloDigitos, soloTelefono, telefonoValido } from '@/lib/campos';
import { CINTURONES, fondoCinturon } from '@/lib/cinturones';
import { Avatar } from '@/components/Avatar';
import { CarnetQR } from '@/components/CarnetQR';
import { AccesoQR } from '@/components/AccesoQR';
import { Cinturon } from '@/components/Cinturon';
import { SelectMenu } from '@/components/SelectMenu';
import { CampoDinero } from '@/components/CampoDinero';

interface Persona {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  belt: string | null;
  role: Rol;
  isActive: boolean;
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

const ESTADOS_MEM = ['activo', 'inactivo', 'suspendido', 'retirado'] as const;
const METODOS = ['efectivo', 'transferencia', 'nequi', 'daviplata'] as const;

/** Hoy en formato de `<input type="date">`, en hora LOCAL (no UTC). */
function hoyISO(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

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
  const { user, club, cargando: cargandoSesion, esStaff } = useAuth();
  const esMaestro = user?.role === 'owner' || user?.isSuperAdmin;

  const [persona, setPersona] = useState<Persona | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');
  const [nuevaPass, setNuevaPass] = useState('');

  const [datos, setDatos] = useState({ fullName: '', phone: '', belt: '' });
  const [plan, setPlan] = useState({
    currentPlanId: '',
    status: 'activo',
    checkinPin: '',
    venceEl: '',
    clasesRestantes: '',
  });
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

  const cargar = useCallback(async () => {
    try {
      const [pe, mem, pl, pays, ats] = await Promise.all([
        api.get<Persona>(`/users/${id}`),
        api.get<Membership[]>('/memberships'),
        api.get<Plan[]>('/plans'),
        api.get<Payment[]>(`/payments?userId=${id}`),
        api.get<Attendance[]>(`/attendances?userId=${id}`),
      ]);
      const m = mem.data.find((x) => x.userId === id) ?? null;
      setPersona(pe.data);
      setMembership(m);
      setPlanes(pl.data);
      setPayments(pays.data);
      setAttendances(ats.data);

      setDatos({
        fullName: pe.data.fullName,
        phone: pe.data.phone ?? '',
        belt: pe.data.belt ?? '',
      });
      setPlan({
        currentPlanId: m?.currentPlanId ?? '',
        status: m?.status ?? 'activo',
        checkinPin: m?.checkinPin ?? '',
        venceEl: m?.venceEl ?? '',
        clasesRestantes: m?.clasesRestantes != null ? String(m.clasesRestantes) : '',
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
  }, [cargandoSesion, user, esStaff, id, router, cargar]);

  async function guardarDatos(e: FormEvent) {
    e.preventDefault();
    setError('');
    setAviso('');
    if (!telefonoValido(datos.phone)) {
      setError(t('comun.telefonoCorto'));
      return;
    }
    setGuardando('datos');
    try {
      await api.patch(`/users/${id}`, {
        fullName: datos.fullName,
        phone: datos.phone || null,
        belt: datos.belt || null,
      });
      setAviso(t('ficha.guardado'));
      await cargar();
    } catch (err) {
      setError(mensajeError(err, t('ficha.datos')));
    } finally {
      setGuardando('');
    }
  }

  async function guardarPlan(e: FormEvent) {
    e.preventDefault();
    setError('');
    setAviso('');
    setGuardando('plan');
    try {
      await api.patch(`/memberships/${id}`, {
        ...(plan.currentPlanId ? { currentPlanId: plan.currentPlanId } : {}),
        status: plan.status,
        checkinPin: plan.checkinPin || null,
        venceEl: plan.venceEl || null,
        clasesRestantes: plan.clasesRestantes === '' ? null : Number(plan.clasesRestantes),
      });
      setAviso(t('ficha.guardado'));
      await cargar();
    } catch (err) {
      setError(mensajeError(err, t('ficha.planYEstado')));
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
    setError('');
    setAviso('');
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
      setAviso(t('pago.registrado'));
      setCobro({
        planId: '',
        amount: '',
        method: 'efectivo',
        paidAt: hoyISO(),
        periodos: '1',
      });
      await cargar();
    } catch (err) {
      const mensaje = mensajeError(err, t('pago.titulo'));
      // 409 con código PAGO_REPETIDO: no es un error, es una pregunta.
      if (axios.isAxiosError(err) && err.response?.status === 409) setRepetido(mensaje);
      else setError(mensaje);
    } finally {
      setGuardando('');
    }
  }

  async function cambiarPassword(e: FormEvent) {
    e.preventDefault();
    setError('');
    setAviso('');
    try {
      await api.post(`/users/${id}/password`, { password: nuevaPass });
      setNuevaPass('');
      setAviso(t('alumnos.contrasenaCambiada'));
    } catch (err) {
      setError(mensajeError(err, t('alumnos.nuevaContrasena')));
    }
  }

  const nombre = persona?.fullName ?? membership?.fullName ?? '—';
  const planCobro = planes.find((p) => p.id === cobro.planId) ?? null;

  /** Precio del plan por el número de periodos, sin decimales de más. */
  function montoSugerido(planId: string, periodos: string): string {
    const p = planes.find((x) => x.id === planId);
    if (!p) return '';
    const n = Math.max(1, Number(periodos) || 1);
    const total = parseFloat(p.price) * (p.type === 'matricula' ? 1 : n);
    return String(Math.round(total * 100) / 100);
  }

  /** Cómo se llama «uno más» según el plan: un mes, una semana, un paquete. */
  function clavePeriodos(tipo: string): ClaveTexto {
    if (tipo === 'semanal') return 'pago.periodos.semanal';
    if (tipo === 'clase' || tipo === 'paquete') return 'pago.periodos.paquete';
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
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '1.5rem' }}>
      <header
        className="no-imprimir"
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
          <Avatar src={persona?.avatarUrl} nombre={nombre} size={52} />
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

      {error && (
        <p className="msg-error no-imprimir" style={{ marginBottom: '1rem' }}>
          {error}
        </p>
      )}
      {aviso && (
        <p className="msg-ok no-imprimir" style={{ marginBottom: '1rem' }}>
          {aviso}
        </p>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))',
          gap: '1rem',
          marginBottom: '1.25rem',
        }}
      >
        {/* ── Carnet QR: el motivo por el que esta pantalla se imprime ─────── */}
        <div className="card" style={{ padding: '1rem' }}>
          <h2
            className="no-imprimir"
            style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.3rem' }}
          >
            {t('qr.titulo')}
          </h2>
          <p className="muted no-imprimir" style={{ fontSize: '0.75rem', marginBottom: '0.9rem' }}>
            {t('qr.descripcion')}
          </p>
          <CarnetQR
            valor={id}
            nombre={nombre}
            club={club?.name}
            pin={membership?.checkinPin}
          />
        </div>

        <div className="no-imprimir" style={{ display: 'grid', gap: '1rem', alignContent: 'start' }}>
          <div className="card" style={{ padding: '1rem' }}>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.6rem' }}>
              {t('ficha.membresia')}
            </h2>
            <p>
              <span className="muted">{t('comun.estado')}: </span>
              <span className={claseEstado(membership?.estado ?? '')}>
                {t(claveEstado(membership?.estado ?? ''))}
              </span>
            </p>
            <p>
              <span className="muted">{t('mi.vence')}: </span>
              {fmtFecha(membership?.venceEl, idioma)}
              {membership?.diasFaltantes != null ? ` (${membership.diasFaltantes} d)` : ''}
            </p>
            <p>
              <span className="muted">{t('mi.clasesRestantes')}: </span>
              {membership?.clasesRestantes ?? '—'}
            </p>
            <p>
              <span className="muted">{t('comun.telefono')}: </span>
              {persona?.phone || '—'}
            </p>
          </div>

          {esMaestro && <AccesoQR userId={id} />}
        </div>
      </div>

      {esMaestro && (
        <div
          className="no-imprimir"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))',
            gap: '1rem',
            marginBottom: '1.25rem',
          }}
        >
          {/* ── Datos del alumno ── */}
          <form onSubmit={guardarDatos} className="card" style={{ padding: '1rem' }}>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.7rem' }}>
              {t('ficha.datos')}
            </h2>
            <label className="muted" style={{ fontSize: '0.75rem' }}>
              {t('comun.nombre')}
            </label>
            <input
              value={datos.fullName}
              onChange={(e) => setDatos({ ...datos, fullName: e.target.value })}
              maxLength={LIM.nombrePersona}
              required
              style={{ margin: '0.25rem 0 0.7rem' }}
            />
            <label className="muted" style={{ fontSize: '0.75rem' }}>
              {t('comun.telefono')}
            </label>
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
            <label className="muted" style={{ fontSize: '0.75rem' }}>
              {t('comun.cinturon')}
            </label>
            <div style={{ margin: '0.25rem 0 0.9rem' }}>
              <SelectMenu
                valor={datos.belt}
                onChange={(v) => setDatos({ ...datos, belt: v })}
                etiquetaAria={t('comun.cinturon')}
                placeholder={t('comun.sinCinturon')}
                opciones={opcionesCinturon}
              />
            </div>
            <button type="submit" className="btn btn-gold btn-sm" disabled={guardando === 'datos'}>
              {guardando === 'datos' ? t('comun.guardando') : t('comun.guardar')}
            </button>
          </form>

          {/* ── Plan, estado y PIN ── */}
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
            {/* La fecha a mano: el alumno que llega de otro sistema, o que
                pagó por fuera, tiene un vencimiento que la app no calculó. Sin
                esto, la única salida era inventar pagos hasta que cuadrara. */}
            <label className="muted" style={{ fontSize: '0.75rem' }}>
              {t('ficha.venceEl')}
            </label>
            <input
              type="date"
              min="2000-01-01"
              max="2100-12-31"
              value={plan.venceEl}
              onChange={(e) => setPlan({ ...plan, venceEl: e.target.value })}
              style={{ margin: '0.25rem 0 0.2rem' }}
            />
            <p className="muted" style={{ fontSize: '0.7rem', marginBottom: '0.7rem' }}>
              {t('ficha.venceAyuda')} <em>{t('ficha.soloPorTiempo')}</em>
            </p>

            <label className="muted" style={{ fontSize: '0.75rem' }}>
              {t('ficha.clases')}
            </label>
            <input
              inputMode="numeric"
              value={plan.clasesRestantes}
              onChange={(e) =>
                setPlan({ ...plan, clasesRestantes: soloDigitos(e.target.value, LIM.clases) })
              }
              maxLength={LIM.clases}
              style={{ margin: '0.25rem 0 0.2rem' }}
            />
            <p className="muted" style={{ fontSize: '0.7rem', marginBottom: '0.7rem' }}>
              {t('ficha.soloPorClases')}
            </p>

            <label className="muted" style={{ fontSize: '0.75rem' }}>
              {t('ficha.pin')}
            </label>
            <input
              inputMode="numeric"
              value={plan.checkinPin}
              onChange={(e) =>
                setPlan({ ...plan, checkinPin: soloDigitos(e.target.value, LIM.checkinPin) })
              }
              maxLength={LIM.checkinPin}
              style={{ margin: '0.25rem 0 0.2rem' }}
            />
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
            <input
              type="date"
              max={hoyISO()}
              min="2000-01-01"
              value={cobro.paidAt}
              onChange={(e) => setCobro({ ...cobro, paidAt: e.target.value })}
              style={{ margin: '0.25rem 0 0.2rem' }}
            />
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

          {/* ── Contraseña ── */}
          <form onSubmit={cambiarPassword} className="card" style={{ padding: '1rem' }}>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.6rem' }}>
              {t('alumnos.nuevaContrasena')}
            </h2>
            <input
              type="text"
              minLength={8}
              maxLength={LIM.password}
              required
              value={nuevaPass}
              onChange={(e) => setNuevaPass(e.target.value)}
              placeholder={t('mi.contrasenaNueva')}
            />
            <p className="muted" style={{ fontSize: '0.7rem', margin: '0.35rem 0 0.6rem' }}>
              {t('alumnos.contrasenaAyuda')}
            </p>
            <button type="submit" className="btn btn-outline btn-sm">
              {t('comun.guardar')}
            </button>
          </form>
        </div>
      )}

      <div
        className="card tabla-scroll no-imprimir"
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
            {payments.map((p) => (
              <tr key={p.id}>
                <td>{fmtFecha(p.paidAt?.slice(0, 10), idioma)}</td>
                <td className="mono">{fmtMoneda(p.amount)}</td>
                <td className="muted">{t(`pago.metodo.${p.method}` as ClaveTexto)}</td>
                <td>{p.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card no-imprimir" style={{ padding: '0.5rem 1rem' }}>
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
          {attendances.slice(0, 30).map((a) => (
            <span key={a.id} className="badge">
              {fmtFecha(a.checkinDate, idioma)} ·{' '}
              {t(`asistencia.metodo.${a.method}` as ClaveTexto)}
            </span>
          ))}
        </div>
      </div>
    </main>
  );
}
