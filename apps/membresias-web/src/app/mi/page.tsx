'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, mensajeError } from '@/lib/api';
import { claveRol, useAuth } from '@/lib/auth';
import { useI18n, type ClaveTexto } from '@/lib/i18n';
import { claseEstado, claveEstado, fmtFecha, fmtMoneda } from '@/lib/formato';
import { activarPush } from '@/lib/push';
import { LIM, TIPOS_SANGRE, soloTelefono, telefonoValido } from '@/lib/campos';
import { CINTURONES, fondoCinturon } from '@/lib/cinturones';
import { Avatar } from '@/components/Avatar';
import { LogoClub } from '@/components/LogoClub';
import { CampoImagen } from '@/components/CampoImagen';
import { Contador } from '@/components/Contador';
import { Carnet } from '@/components/Carnet';
import { Cinturon } from '@/components/Cinturon';
import { SelectMenu } from '@/components/SelectMenu';
import { VerMas } from '@/components/Paginacion';

interface Pago {
  id: string;
  amount: string;
  method: string;
  status: string;
  paidAt: string;
  planName: string;
}
interface Asistencia {
  id: string;
  checkinDate: string;
  checkedInAt: string;
  method: string;
}
/** El calendario del club, ya contestado por la API (ver `GET /mi`). */
interface Clases {
  hoy: boolean;
  proxima: string | null;
  /** Días de la semana con clase, 0 = domingo. */
  dias: number[];
  /** Por qué está cerrado hoy, si es una excepción del calendario. */
  motivo: string | null;
  /**
   * ¿El maestro ya marcó los días de clase de su club?
   *
   * Sin esto la tarjeta decía «Hoy hay clase» los 365 días del año en cuanto el
   * club no tenía horario: la API da por abierto lo que no está configurado
   * —hace falta para no bloquear el check-in del club recién creado— y aquí eso
   * se leía como una afirmación.
   */
  configurado: boolean;
}
interface MiEstado {
  status: string | null;
  estado: 'al_dia' | 'por_vencer' | 'vencido' | 'sin_plan';
  venceEl: string | null;
  diasFaltantes: number | null;
  clasesRestantes: number | null;
  checkinPin?: string | null;
  plan: { id: string; name: string; type: string; price: string } | null;
  clases: Clases;
  /** Cuándo entró al club (fecha ISO completa). */
  desde: string | null;
  asistencia: { total: number; esteMes: number; ultima: string | null };
  pagos: Pago[];
  /** Cuántos pagos tiene EN TOTAL, no cuántos vinieron en `pagos`. */
  pagosTotal: number;
  asistencias: Asistencia[];
  asistenciasTotal: number;
}
/**
 * Los números del club, para el maestro y el auxiliar.
 *
 * Ocupan el sitio de «Cómo vengo viniendo»: el staff no marca asistencia en el
 * kiosco —el check-in es de alumnos—, así que esa tarjeta le salía en cero para
 * siempre. Lo que sí le corresponde es cómo viene viniendo SU GENTE.
 */
interface Labor {
  /** Alumnos activos del club. */
  alumnos: number;
  /** Cuántos entrenaron hoy. */
  hoy: number;
  /** Asistencias en lo que va del mes. */
  mes: number;
}

/** Solo lo que hace falta del aviso para enseñarlo en una línea. */
interface AvisoBreve {
  id: string;
  type: 'pre_venc' | 'venc' | 'mora' | 'maestro';
  readAt: string | null;
  venceEl: string | null;
}

/** Cuántas filas de historial destapa cada «ver más». */
const PASO_HISTORIAL = 12;

/** Meses cumplidos desde una fecha. Debajo de uno se cuenta en días. */
function antiguedad(desde: string): { meses: number; dias: number } {
  const inicio = new Date(desde);
  const ahora = new Date();
  const dias = Math.max(0, Math.floor((ahora.getTime() - inicio.getTime()) / 86_400_000));
  return { meses: Math.floor(dias / 30.44), dias };
}

/** Nombres cortos de los días en el idioma activo, sin diccionario propio. */
function diasCortos(idioma: string): string[] {
  const fmt = new Intl.DateTimeFormat(idioma === 'en' ? 'en-GB' : 'es-CO', {
    weekday: 'short',
  });
  // 2024-01-07 fue domingo: el índice 0..6 coincide con el `weekday` de la API.
  return Array.from({ length: 7 }, (_, i) => {
    const nombre = fmt.format(new Date(2024, 0, 7 + i)).replace('.', '');
    return nombre.charAt(0).toUpperCase() + nombre.slice(1);
  });
}

/**
 * Panel personal: MI club, MI estado, cuándo hay clase, cómo vengo viniendo,
 * MIS pagos y MI carnet. Aquí no aparece jamás un dato de otro miembro.
 *
 * Lo que el alumno NO puede tocar: su nombre y su cinturón. El nombre es lo que
 * sale en su carnet y en el recibo de sus pagos; si cada quien lo reescribiera,
 * el maestro acabaría con una lista de apodos. Lo corrige él desde la ficha.
 */
export default function MiPanel() {
  const router = useRouter();
  const { t, idioma } = useI18n();
  const { user, club, cargando: cargandoSesion, refrescar, esStaff } = useAuth();
  /** Quien firma los carnets del club: el único que puede reexpedirlos. */
  const esMaestro = user?.role === 'owner' || user?.isSuperAdmin;

  const [mi, setMi] = useState<MiEstado | null>(null);
  const [labor, setLabor] = useState<Labor | null>(null);
  const [avisos, setAvisos] = useState<AvisoBreve[]>([]);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [pass, setPass] = useState({ actual: '', nueva: '' });
  /** Cuánto historial propio se destapa. Ver `VerMas`. */
  const [verPagos, setVerPagos] = useState(PASO_HISTORIAL);
  const [verAsistencias, setVerAsistencias] = useState(PASO_HISTORIAL);
  const [perfil, setPerfil] = useState({
    phone: '',
    bloodType: '',
    emergencyName: '',
    emergencyPhone: '',
  });

  const cargar = useCallback(async () => {
    try {
      const { data } = await api.get<MiEstado>('/mi');
      setMi(data);
    } catch (e) {
      setError(mensajeError(e, t('comun.ninguno')));
    }
    // Los avisos van aparte y sin romper la pantalla si fallan: son un extra
    // sobre el panel, no la razón de abrirlo.
    try {
      const { data } = await api.get<AvisoBreve[]>('/notifications');
      setAvisos(data);
    } catch {
      setAvisos([]);
    }
    // Los números del club, solo para quien puede verlos. Las dos rutas son de
    // staff: pedirlas siendo alumno sería un 403 en cada carga de la pantalla.
    if (esStaff) {
      try {
        const [as, roster] = await Promise.all([
          api.get<{ hoy: number; total: number }>('/reports/attendance'),
          // Una sola fila: lo que interesa es el `total`, no la lista.
          api.get<{ total: number }>('/memberships', { params: { limit: 1 } }),
        ]);
        setLabor({ alumnos: roster.data.total, hoy: as.data.hoy, mes: as.data.total });
      } catch {
        setLabor(null);
      }
    }
  }, [t, esStaff]);

  useEffect(() => {
    if (cargandoSesion) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    setPerfil({
      phone: user.phone ?? '',
      bloodType: user.bloodType ?? '',
      emergencyName: user.emergencyName ?? '',
      emergencyPhone: user.emergencyPhone ?? '',
    });
    void cargar();
  }, [cargandoSesion, user, router, cargar]);

  async function activarNotis() {
    setAviso('');
    setError('');
    const r = await activarPush();
    if (r.ok) setAviso(t('mi.pushActivo'));
    else setError(r.motivo ?? t('mi.activarPush'));
  }

  async function guardarPerfil(e: FormEvent) {
    e.preventDefault();
    setError('');
    setAviso('');
    if (!telefonoValido(perfil.phone) || !telefonoValido(perfil.emergencyPhone)) {
      setError(t('comun.telefonoCorto'));
      return;
    }
    try {
      // El nombre no viaja: lo cambia el maestro, y la API lo rechaza igual
      // aunque alguien lo mande a mano (ver `PATCH /auth/me`). El contacto de
      // emergencia sí es de cada quien: un teléfono desactualizado ahí es peor
      // que no tener ninguno.
      await api.patch('/auth/me', {
        phone: perfil.phone || null,
        bloodType: perfil.bloodType || null,
        emergencyName: perfil.emergencyName || null,
        emergencyPhone: perfil.emergencyPhone || null,
      });
      await refrescar();
      setAviso(t('alumnos.actualizado'));
    } catch (err) {
      setError(mensajeError(err, t('mi.miPerfil')));
    }
  }

  /**
   * Reexpedir MI carnet: le pone la fecha de hoy y con ella otro año de
   * vigencia. Es lo único que la mueve — imprimir no cambia nada.
   *
   * Se refresca la sesión y no la pantalla: la fecha vive en el usuario, así
   * que al recargarlo la vista previa se repinta sola con la nueva vigencia.
   */
  async function reexpedirCarnet() {
    setError('');
    setAviso('');
    try {
      await api.post(`/users/${user!.id}/carnet`, {});
      await refrescar();
      setAviso(t('carnet.reexpedido'));
    } catch (err) {
      setError(mensajeError(err, t('carnet.reexpedir')));
    }
  }

  /** La foto va sola: `CampoImagen` la manda ya recortada y comprimida. */
  async function guardarFoto(avatarUrl: string | null) {
    setError('');
    setAviso('');
    await api.patch('/auth/me', { avatarUrl });
    await refrescar();
    setAviso(t('alumnos.actualizado'));
  }

  async function cambiarPassword(e: FormEvent) {
    e.preventDefault();
    setError('');
    setAviso('');
    try {
      await api.post('/auth/change-password', pass);
      setPass({ actual: '', nueva: '' });
      setAviso(t('mi.contrasenaOk'));
    } catch (err) {
      setError(mensajeError(err, t('mi.cambiarContrasena')));
    }
  }

  if (cargandoSesion || !mi) {
    return (
      <main style={{ padding: '2rem' }} className="muted">
        {error || t('comun.cargando')}
      </main>
    );
  }

  /**
   * El aviso que hay que leer sí o sí. Vienen del más nuevo al más viejo, así
   * que el primero sin leer es el que importa.
   *
   * Sube a la pantalla en vez de quedarse solo en la campana porque el alumno
   * que deja vencer su mensualidad es justo el que no abre la campana.
   */
  const urgente = avisos.find((a) => !a.readAt && a.type !== 'maestro') ?? null;
  const tiempo = mi.desde ? antiguedad(mi.desde) : null;

  return (
    <main style={{ maxWidth: 780, margin: '0 auto', padding: '1.5rem' }}>
      {/* ── El club al que pertenece ──
          Va arriba del todo y con su escudo: el alumno entra a SU club, no a
          una aplicación de mensualidades. El nombre completo del club solo
          cabía antes en una línea diminuta al lado del rol. */}
      <div
        className="card"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.85rem',
          padding: '0.85rem 1rem',
          marginBottom: '1rem',
        }}
      >
        <LogoClub src={club?.logoUrl} nombre={club?.name ?? 'DINAMYT'} size={46} ampliable />
        <div style={{ minWidth: 0 }}>
          <p className="display" style={{ fontSize: '1.05rem', lineHeight: 1.15 }}>
            {club?.name ?? 'DINAMYT'}
          </p>
          <p className="muted" style={{ fontSize: '0.72rem', marginTop: '0.15rem' }}>
            {[club?.city, t(claveRol(user))].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>

      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '0.5rem',
          flexWrap: 'wrap',
          marginBottom: '1.25rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', minWidth: 0 }}>
          <Avatar src={user?.avatarUrl} nombre={user?.fullName ?? '?'} size={52} ampliable />
          <div style={{ minWidth: 0 }}>
            <h1 className="display" style={{ fontSize: '1.5rem' }}>
              {user?.fullName?.split(' ')[0] ?? ''}
            </h1>
            <p className="muted" style={{ fontSize: '0.78rem', overflowWrap: 'anywhere' }}>
              {user?.fullName}
            </p>
            <div style={{ marginTop: '0.25rem' }}>
              <Cinturon nombre={user?.belt} />
            </div>
          </div>
        </div>
        {/* El maestro ya no se lista entre sus alumnos, así que su ficha
            —donde se editan su correo, su cinturón y su antigüedad, y no solo
            lo poco que cabe aquí abajo— necesita una puerta desde su panel. */}
        {esMaestro && user && (
          <Link href={`/alumnos/${user.id}`} className="btn btn-outline btn-sm">
            {t('alumnos.miFicha')}
          </Link>
        )}
      </header>

      {aviso && (
        <p className="msg-ok" style={{ marginBottom: '1rem' }}>
          {aviso}
        </p>
      )}
      {error && (
        <p className="msg-error" style={{ marginBottom: '1rem' }}>
          {error}
        </p>
      )}

      {/* ── El aviso que no puede pasar desapercibido ── */}
      {urgente && (
        <div
          className="card"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.7rem',
            padding: '0.9rem 1rem',
            marginBottom: '1rem',
            borderColor: urgente.type === 'pre_venc' ? 'var(--gold-dim)' : 'var(--danger)',
          }}
        >
          <span aria-hidden="true" style={{ fontSize: '1.1rem', lineHeight: 1.2 }}>
            {urgente.type === 'pre_venc' ? '⚠' : '⛔'}
          </span>
          <div style={{ minWidth: 0 }}>
            <p
              style={{
                fontWeight: 700,
                fontSize: '0.9rem',
                color: urgente.type === 'pre_venc' ? 'var(--gold)' : 'var(--danger)',
              }}
            >
              {t(`aviso.${urgente.type}` as ClaveTexto)}
            </p>
            <p className="muted" style={{ fontSize: '0.78rem', marginTop: '0.15rem' }}>
              {urgente.venceEl
                ? `${t(urgente.type === 'pre_venc' ? 'aviso.venceEl' : 'aviso.vencioEl')} ${fmtFecha(urgente.venceEl, idioma)}`
                : t('aviso.sinFecha')}
            </p>
          </div>
        </div>
      )}

      {/* ── Mi membresía ──
          Solo para quien paga. El maestro y el auxiliar entran aquí por su
          carnet, su foto y su contraseña; mensualidad no tienen —el roster del
          club solo lista alumnos—, así que esta tarjeta les decía «Sin plan»
          para siempre, como si les faltara algo por hacer. */}
      {!esStaff && (
        <div
          className="card"
          style={{
            padding: '1.25rem',
            marginBottom: '1rem',
            borderColor:
              mi.estado === 'vencido'
                ? 'var(--danger)'
                : mi.estado === 'al_dia'
                  ? 'var(--ok)'
                  : 'var(--border)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '0.75rem',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <p className="muted" style={{ fontSize: '0.78rem' }}>
                {mi.plan ? mi.plan.name : t('mi.sinPlan')}
              </p>
              <p className="display" style={{ fontSize: '1.6rem' }}>
                {t(claveEstado(mi.estado))}
              </p>
            </div>
            <span className={claseEstado(mi.estado)}>{t(claveEstado(mi.estado))}</span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(min(140px, 100%), 1fr))',
              gap: '0.75rem',
              marginTop: '1rem',
            }}
          >
            {mi.venceEl && (
              <div>
                <div className="muted" style={{ fontSize: '0.72rem' }}>
                  {t('mi.vence')}
                </div>
                <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 600 }}>
                  {fmtFecha(mi.venceEl, idioma)}
                  {mi.diasFaltantes != null && mi.diasFaltantes >= 0 && (
                    <span className="muted" style={{ fontSize: '0.8rem' }}>
                      {' '}
                      ({mi.diasFaltantes} d)
                    </span>
                  )}
                </div>
              </div>
            )}
            {mi.clasesRestantes != null && (
              <div>
                <div className="muted" style={{ fontSize: '0.72rem' }}>
                  {t('mi.clasesRestantes')}
                </div>
                <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 600 }}>
                  {mi.clasesRestantes}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Los avisos push valen para todos: al alumno le avisan de su
          mensualidad y al maestro, de las de su club. Por eso el botón vive
          fuera de la tarjeta de membresía, que el maestro ya no ve. */}
      <div style={{ marginBottom: '1rem' }}>
        <button className="btn btn-outline btn-sm" onClick={activarNotis}>
          🔔 {t('mi.activarPush')}
        </button>
      </div>

      {/* ── ¿Hay clase hoy? ──
          Es la pregunta que trae al alumno a abrir la app entre semana. La
          respuesta la calcula la API: el alumno no tiene permiso para leer el
          calendario del club, y aunque lo tuviera, tocaría repetir aquí la
          lógica de festivos y cierres. */}
      <div
        className="card"
        style={{ padding: '1.25rem', marginBottom: '1rem' }}
      >
        <h2 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.6rem' }}>
          {t('clases.titulo')}
        </h2>
        {/* Tres respuestas, no dos. «Todavía no lo sabemos» es distinto de «hoy
            no hay»: el club sin horario publicado no puede afirmar ninguna de
            las dos, y decir que sí era mandar al alumno al salón por nada. */}
        <p
          className="display"
          style={{
            fontSize: mi.clases.configurado ? '1.35rem' : '1rem',
            color:
              mi.clases.configurado && mi.clases.hoy ? 'var(--ok)' : 'var(--text-muted)',
          }}
        >
          {!mi.clases.configurado
            ? t('clases.sinHorario')
            : mi.clases.hoy
              ? t('clases.hoySi')
              : t('clases.hoyNo')}
        </p>
        {mi.clases.motivo && (
          <p className="muted" style={{ fontSize: '0.78rem', marginTop: '0.3rem' }}>
            {mi.clases.motivo}
          </p>
        )}
        {!mi.clases.configurado && (
          <p className="muted" style={{ fontSize: '0.78rem', marginTop: '0.3rem' }}>
            {t('clases.sinHorarioAyuda')}
          </p>
        )}
        {!mi.clases.hoy && mi.clases.proxima && (
          <p style={{ fontSize: '0.85rem', marginTop: '0.4rem' }}>
            <span className="muted">{t('clases.proxima')}: </span>
            <strong>{fmtFecha(mi.clases.proxima, idioma)}</strong>
          </p>
        )}

        {mi.clases.dias.length > 0 && (
          <div className="clases-semana" aria-label={t('calendario.diasSemana')}>
            {diasCortos(idioma).map((nombre, i) => (
              <span key={i} className="clases-dia" data-activo={mi.clases.dias.includes(i)}>
                {nombre}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Cómo vengo viniendo ──
          Tres números que el alumno no tenía en ningún lado: la lista de abajo
          es un extracto, y contar ahí «cuántas llevo este mes» no es algo que
          nadie haga.

          Solo para quien entrena. El maestro no pasa por el kiosco —el
          check-in es de alumnos—, así que estos contadores le salían en cero
          para siempre y la lista de abajo, vacía. */}
      {!esStaff && (
        <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.8rem' }}>
            {t('mi.comoVengo')}
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(min(120px, 100%), 1fr))',
              gap: '0.75rem',
            }}
          >
            <div>
              <div className="muted" style={{ fontSize: '0.72rem' }}>
                {t('mi.esteMes')}
              </div>
              <div className="display" style={{ fontSize: '1.6rem', color: 'var(--gold)' }}>
                {mi.asistencia.esteMes}
              </div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: '0.72rem' }}>
                {t('mi.totalClases')}
              </div>
              <div className="display" style={{ fontSize: '1.6rem' }}>
                {mi.asistencia.total}
              </div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: '0.72rem' }}>
                {t('mi.ultimaVez')}
              </div>
              <div className="mono" style={{ fontSize: '1rem', fontWeight: 600, paddingTop: '0.35rem' }}>
                {mi.asistencia.ultima ? fmtFecha(mi.asistencia.ultima, idioma) : '—'}
              </div>
            </div>
            {tiempo && (
              <div>
                <div className="muted" style={{ fontSize: '0.72rem' }}>
                  {t('mi.enElClub')}
                </div>
                <div style={{ paddingTop: '0.35rem' }}>
                  <span className="display" style={{ fontSize: '1.35rem' }}>
                    {tiempo.meses >= 1 ? tiempo.meses : tiempo.dias}
                  </span>{' '}
                  <span className="muted" style={{ fontSize: '0.8rem' }}>
                    {t(tiempo.meses >= 1 ? 'mi.meses' : 'mi.dias')}
                  </span>
                  <div className="muted mono" style={{ fontSize: '0.7rem' }}>
                    {t('mi.desde')} {fmtFecha(mi.desde!.slice(0, 10), idioma)}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Mi labor en el club ──
          Lo que ve el maestro donde el alumno ve su asistencia. No es relleno:
          es el mismo hueco contestado con la pregunta que sí le corresponde
          —cuánta gente enseña y cuánta vino hoy— más su propia antigüedad, que
          antes vivía dentro de la tarjeta que se le acaba de quitar.

          El detalle largo no se repite aquí: para eso está «Estadísticas». */}
      {esStaff && (
        <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.8rem' }}>
            {t('mi.miLabor')}
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(min(120px, 100%), 1fr))',
              gap: '0.75rem',
            }}
          >
            <div>
              <div className="muted" style={{ fontSize: '0.72rem' }}>
                {t('mi.misAlumnos')}
              </div>
              <div className="display" style={{ fontSize: '1.6rem' }}>
                {labor?.alumnos ?? '—'}
              </div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: '0.72rem' }}>
                {t('mi.entrenaronHoy')}
              </div>
              <div className="display" style={{ fontSize: '1.6rem', color: 'var(--gold)' }}>
                {labor?.hoy ?? '—'}
              </div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: '0.72rem' }}>
                {t('mi.esteMesClub')}
              </div>
              <div className="display" style={{ fontSize: '1.6rem' }}>
                {labor?.mes ?? '—'}
              </div>
            </div>
            {tiempo && (
              <div>
                <div className="muted" style={{ fontSize: '0.72rem' }}>
                  {t('mi.enElClub')}
                </div>
                <div style={{ paddingTop: '0.35rem' }}>
                  <span className="display" style={{ fontSize: '1.35rem' }}>
                    {tiempo.meses >= 1 ? tiempo.meses : tiempo.dias}
                  </span>{' '}
                  <span className="muted" style={{ fontSize: '0.8rem' }}>
                    {t(tiempo.meses >= 1 ? 'mi.meses' : 'mi.dias')}
                  </span>
                  <div className="muted mono" style={{ fontSize: '0.7rem' }}>
                    {t('mi.desde')} {fmtFecha(mi.desde!.slice(0, 10), idioma)}
                  </div>
                </div>
              </div>
            )}
          </div>
          <p className="muted" style={{ fontSize: '0.72rem', marginTop: '0.6rem' }}>
            {t('mi.laborAyuda')}
          </p>
        </div>
      )}

      {/* ── Mi grado ──
          La escalera completa con el suyo encendido. Es lo que un alumno mira
          cuando lleva meses en el mismo cinturón: dónde está y qué viene.
          Deliberadamente NO promete cuándo sube: eso lo decide el maestro. */}
      <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.3rem' }}>
          {t('mi.miGrado')}
        </h2>
        <p className="display" style={{ fontSize: '1.35rem', marginBottom: '0.8rem' }}>
          {user?.belt || t('comun.sinCinturon')}
        </p>
        <div className="grados" aria-label={t('mi.miGrado')}>
          {CINTURONES.map((c) => {
            const esElSuyo = c.nombre.toLowerCase() === (user?.belt ?? '').toLowerCase();
            return (
              <span
                key={c.nombre}
                className="grado"
                data-activo={esElSuyo}
                title={c.nombre}
                aria-current={esElSuyo ? 'step' : undefined}
              >
                <span className="grado-punto" style={{ background: fondoCinturon(c) }} />
              </span>
            );
          })}
        </div>
        <p className="muted" style={{ fontSize: '0.72rem', marginTop: '0.6rem' }}>
          {t('mi.gradoAyuda')}
        </p>
      </div>

      {/* ── Mi carnet: se imprime y se lleva a clase ── */}
      <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.3rem' }}>
          {t('mi.miCarnet')}
        </h2>
        {/* Al alumno se le explica para qué sirve —marcar asistencia—; al
            maestro, que el suyo no es para eso. */}
        <p className="muted" style={{ fontSize: '0.78rem', marginBottom: '0.9rem' }}>
          {t(esStaff ? 'qr.descripcionStaff' : 'qr.descripcionMia')}
        </p>

        {/* ── El PIN, delante y no escondido en el reverso del carnet ──
            Es el plan B de verdad: la cámara del maestro falla, el carnet se
            queda en casa, el celular no tiene batería. Que el alumno se lo
            sepa de memoria vale más que tenerlo impreso.

            Solo para quien marca asistencia. El maestro y el auxiliar no pasan
            por el kiosco, así que su PIN no abría ninguna puerta: era un dato
            de adorno en el sitio más visible de su carnet. */}
        {!esStaff && (
          <div className="pin-respaldo">
            <span className="eyebrow">{t('qr.pin')}</span>
            {mi.checkinPin ? (
              <>
                <strong className="mono">{mi.checkinPin}</strong>
                <span className="muted">{t('mi.pinAyuda')}</span>
              </>
            ) : (
              <span className="muted">{t('mi.sinPin')}</span>
            )}
          </div>
        )}

        {user && (
          <Carnet
            id={user.id}
            nombre={user.fullName}
            club={club?.name}
            maestro={club?.ownerName}
            logoClub={club?.logoUrl}
            role={user.role}
            rol={t(claveRol(user))}
            tipo={t(`carnet.tipo.${user.role}` as ClaveTexto)}
            foto={user.avatarUrl}
            cinturon={user.belt}
            sangre={user.bloodType}
            emergenciaNombre={user.emergencyName}
            emergenciaTelefono={user.emergencyPhone}
            pin={mi.checkinPin}
            emitidoEl={user.carnetEmitidoEl}
            desde={mi.desde}
            // Reexpedir su propio carnet: solo el maestro, que es quien los
            // firma. Al alumno se lo reexpide él desde la ficha.
            onReexpedir={esMaestro ? reexpedirCarnet : undefined}
          />
        )}
      </div>

      {/* ── Mi perfil y mi contraseña ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(min(260px, 100%), 1fr))',
          gap: '1rem',
          marginBottom: '1rem',
        }}
      >
        <form onSubmit={guardarPerfil} className="card" style={{ padding: '1rem' }}>
          <h2 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.7rem' }}>
            {t('mi.miPerfil')}
          </h2>
          {/* La foto se guarda al elegirla; el resto del formulario, al pulsar
              «Guardar». Son dos gestos distintos a propósito: nadie espera
              tener que confirmar una foto que ya se está viendo puesta. */}
          <div style={{ marginBottom: '0.9rem' }}>
            <CampoImagen
              src={user?.avatarUrl}
              nombre={user?.fullName ?? '?'}
              onCambiar={guardarFoto}
            />
          </div>
          {/* El nombre se enseña, no se edita: lo cambia el maestro desde la
              ficha del alumno. Ver la cabecera de este archivo. */}
          <label className="muted" style={{ fontSize: '0.75rem' }}>
            {t('comun.nombre')}
          </label>
          <p style={{ margin: '0.25rem 0 0.1rem', fontWeight: 600, overflowWrap: 'anywhere' }}>
            {user?.fullName}
          </p>
          <p className="muted" style={{ fontSize: '0.7rem', marginBottom: '0.7rem' }}>
            {t('mi.nombreLoCambiaElMaestro')}
          </p>
          <label className="muted" style={{ fontSize: '0.75rem' }}>
            {t('comun.telefono')}
          </label>
          <input
            type="tel"
            inputMode="tel"
            value={perfil.phone}
            onChange={(e) => setPerfil({ ...perfil, phone: soloTelefono(e.target.value) })}
            maxLength={LIM.telefono}
            style={{
              margin: '0.25rem 0 0.2rem',
              borderColor: telefonoValido(perfil.phone) ? undefined : 'var(--danger)',
            }}
          />
          <p
            className={telefonoValido(perfil.phone) ? 'muted' : 'msg-error'}
            style={{ fontSize: '0.7rem', marginBottom: '0.7rem' }}
          >
            {t('comun.telefonoCorto')}
          </p>

          {/* ── Lo que hay que saber si algo pasa ──
              Esto SÍ lo mantiene cada quien, al revés que el nombre: el
              hermano que se mudó, el teléfono nuevo de la mamá. Un contacto de
              emergencia desactualizado es peor que no tener ninguno. */}
          <label className="muted" style={{ fontSize: '0.75rem' }}>
            {t('ficha.sangre')}
          </label>
          <div style={{ margin: '0.25rem 0 0.7rem' }}>
            <SelectMenu
              valor={perfil.bloodType}
              onChange={(v) => setPerfil({ ...perfil, bloodType: v })}
              etiquetaAria={t('ficha.sangre')}
              placeholder={t('ficha.sinSangre')}
              opciones={[
                { valor: '', etiqueta: t('ficha.sinSangre') },
                ...TIPOS_SANGRE.map((s) => ({ valor: s, etiqueta: s })),
              ]}
            />
          </div>
          <label className="muted" style={{ fontSize: '0.75rem' }}>
            {t('ficha.emergenciaNombre')}
          </label>
          <input
            value={perfil.emergencyName}
            onChange={(e) => setPerfil({ ...perfil, emergencyName: e.target.value })}
            maxLength={LIM.nombrePersona}
            style={{ margin: '0.25rem 0 0.2rem' }}
          />
          <Contador valor={perfil.emergencyName} max={LIM.nombrePersona} />
          <label className="muted" style={{ fontSize: '0.75rem' }}>
            {t('ficha.emergenciaTelefono')}
          </label>
          <input
            type="tel"
            inputMode="tel"
            value={perfil.emergencyPhone}
            onChange={(e) =>
              setPerfil({ ...perfil, emergencyPhone: soloTelefono(e.target.value) })
            }
            maxLength={LIM.telefono}
            style={{
              margin: '0.25rem 0 0.2rem',
              borderColor: telefonoValido(perfil.emergencyPhone) ? undefined : 'var(--danger)',
            }}
          />
          <Contador valor={perfil.emergencyPhone} max={LIM.telefono} />
          <p className="muted" style={{ fontSize: '0.7rem', marginBottom: '0.7rem' }}>
            {t('ficha.emergenciaAyuda')}
          </p>

          <button type="submit" className="btn btn-outline btn-sm">
            {t('comun.guardar')}
          </button>
        </form>

        <form onSubmit={cambiarPassword} className="card" style={{ padding: '1rem' }}>
          <h2 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.7rem' }}>
            {t('mi.cambiarContrasena')}
          </h2>
          <label className="muted" style={{ fontSize: '0.75rem' }}>
            {t('mi.contrasenaActual')}
          </label>
          <input
            type="password"
            autoComplete="current-password"
            value={pass.actual}
            onChange={(e) => setPass({ ...pass, actual: e.target.value })}
            maxLength={LIM.password}
            required
            style={{ margin: '0.25rem 0 0.7rem' }}
          />
          <label className="muted" style={{ fontSize: '0.75rem' }}>
            {t('mi.contrasenaNueva')}
          </label>
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={LIM.password}
            value={pass.nueva}
            onChange={(e) => setPass({ ...pass, nueva: e.target.value })}
            required
            style={{ margin: '0.25rem 0 0.2rem' }}
          />
          <Contador valor={pass.nueva} max={LIM.password} />
          <div style={{ height: '0.7rem' }} />
          <button type="submit" className="btn btn-outline btn-sm">
            {t('comun.guardar')}
          </button>
        </form>
      </div>

      {/* ── Mis pagos ──
          Va con la membresía: quien no paga mensualidad no tiene pagos que
          mirar, y una tabla eternamente vacía solo hace dudar de si falta
          algo. El maestro ve el dinero del club en «Estadísticas». */}
      {!esStaff && (
        <div
          className="card tabla-scroll"
          style={{ padding: '0.5rem 1rem', marginBottom: '1rem' }}
        >
          <h2 style={{ fontSize: '0.95rem', fontWeight: 700, padding: '0.5rem 0' }}>
            {t('mi.pagos')}
          </h2>
          <table>
            <thead>
              <tr>
                <th>{t('comun.fecha')}</th>
                <th>{t('pago.plan')}</th>
                <th>{t('pago.metodo')}</th>
                <th>{t('pago.monto')}</th>
              </tr>
            </thead>
            <tbody>
              {mi.pagos.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted" style={{ padding: '0.9rem' }}>
                    {t('comun.ninguno')}
                  </td>
                </tr>
              )}
              {mi.pagos.slice(0, verPagos).map((p) => (
                <tr key={p.id}>
                  <td className="mono">{fmtFecha(p.paidAt?.slice(0, 10), idioma)}</td>
                  <td>{p.planName}</td>
                  <td className="muted">
                    {t(`pago.metodo.${p.method}` as ClaveTexto)}
                  </td>
                  <td className="mono">{fmtMoneda(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <VerMas
            visibles={Math.min(verPagos, mi.pagos.length)}
            total={mi.pagosTotal}
            onMas={() => setVerPagos((n) => n + PASO_HISTORIAL)}
          />
        </div>
      )}

      {/* ── Mis asistencias ──
          Va con lo de arriba: quien no registra asistencia no tiene ninguna
          que leer. Al maestro le salía siempre «Ninguno». */}
      {!esStaff && (
        <div className="card tabla-scroll" style={{ padding: '0.5rem 1rem' }}>
          <h2 style={{ fontSize: '0.95rem', fontWeight: 700, padding: '0.5rem 0' }}>
            {t('mi.asistencias')}
          </h2>
          <table>
            <thead>
              <tr>
                <th>{t('comun.fecha')}</th>
                <th>{t('pago.metodo')}</th>
              </tr>
            </thead>
            <tbody>
              {mi.asistencias.length === 0 && (
                <tr>
                  <td colSpan={2} className="muted" style={{ padding: '0.9rem' }}>
                    {t('comun.ninguno')}
                  </td>
                </tr>
              )}
              {mi.asistencias.slice(0, verAsistencias).map((a) => (
                <tr key={a.id}>
                  <td className="mono">{fmtFecha(a.checkinDate, idioma)}</td>
                  <td className="muted">
                    {t(`asistencia.metodo.${a.method}` as ClaveTexto)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <VerMas
            visibles={Math.min(verAsistencias, mi.asistencias.length)}
            total={mi.asistenciasTotal}
            onMas={() => setVerAsistencias((n) => n + PASO_HISTORIAL)}
          />
        </div>
      )}
    </main>
  );
}
