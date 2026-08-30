'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, mensajeError } from '@/lib/api';
import { rutaInicio, useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { claseEstado, claveEstado, fmtFecha, fmtMoneda } from '@/lib/formato';
import { Avatar } from '@/components/Avatar';
import { CampoImagen } from '@/components/CampoImagen';
import { Cinturon } from '@/components/Cinturon';
import { LogoClub } from '@/components/LogoClub';
import { POR_PAGINA, Paginacion } from '@/components/Paginacion';
import { SelectMenu } from '@/components/SelectMenu';
import { avisoError, avisoInfo, avisoOk } from '@/lib/toast';

interface RosterItem {
  userId: string;
  fullName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  belt: string | null;
  qr: string;
  status: string | null;
  venceEl: string | null;
  clasesRestantes: number | null;
  diasFaltantes: number | null;
  estado: string;
  /** En qué clase entrena. `null` = sin repartir, o club sin dividir. */
  groupId: string | null;
  groupName: string | null;
}
/** Una clase del club, para el filtro de arriba del roster. */
interface Clase {
  id: string;
  name: string;
}
/** Quien cumple años HOY. Ver `GET /reports/birthdays`. */
interface Cumple {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  cumple: number | null;
}
interface Revenue {
  /** Lo que ENTRÓ este mes, sin importar qué meses cubra. */
  recaudado: number;
  /** Lo que le CORRESPONDE a este mes, aunque se cobrara en otro. */
  devengado: number;
  esperadoMensual: number;
  numPagos: number;
  month: string;
}
interface Overdue {
  userId: string;
  venceEl: string;
  diasVencido: number;
}
interface Attendance {
  hoy: number;
  total: number;
}

export default function Panel() {
  const router = useRouter();
  const { t, idioma } = useI18n();
  const { user, club, cargando: cargandoSesion, esStaff, refrescar } = useAuth();
  const esMaestro = user?.role === 'owner' || user?.isSuperAdmin;

  const [editandoLogo, setEditandoLogo] = useState(false);
  const [roster, setRoster] = useState<RosterItem[]>([]);
  const [totalRoster, setTotalRoster] = useState(0);
  const [offset, setOffset] = useState(0);
  const [busqueda, setBusqueda] = useState('');
  /** Lo que de verdad viajó a la API. Ver el temporizador de más abajo. */
  const [buscado, setBuscado] = useState('');
  const [revenue, setRevenue] = useState<Revenue | null>(null);
  const [overdue, setOverdue] = useState<Overdue[]>([]);
  const [attendance, setAttendance] = useState<Attendance | null>(null);
  const [cumples, setCumples] = useState<Cumple[]>([]);
  const [clases, setClases] = useState<Clase[]>([]);
  /** Qué clase se está mirando. '' = todas. */
  const [clase, setClase] = useState('');
  /** Solo para fallos al CARGAR el panel; lo demás va por la nube flotante. */
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    try {
      const [r, rev, ov, at, cum] = await Promise.all([
        api.get<{ items: RosterItem[]; total: number }>('/memberships', {
          params: {
            limit: POR_PAGINA,
            offset,
            ...(buscado ? { q: buscado } : {}),
            ...(clase ? { groupId: clase } : {}),
          },
        }),
        api.get<Revenue>('/reports/revenue'),
        api.get<Overdue[]>('/reports/overdue'),
        api.get<Attendance>('/reports/attendance'),
        api.get<Cumple[]>('/reports/birthdays'),
      ]);
      setRoster(r.data.items);
      setTotalRoster(r.data.total);
      setRevenue(rev.data);
      setOverdue(ov.data);
      setAttendance(at.data);
      setCumples(cum.data);
    } catch (e) {
      setError(mensajeError(e, t('comun.ninguno')));
    } finally {
      setCargando(false);
    }
  }, [offset, buscado, clase, t]);

  useEffect(() => {
    setOffset(0); // buscar o cambiar de clase empieza por el principio
  }, [buscado, clase]);

  useEffect(() => {
    const id = setTimeout(() => setBuscado(busqueda.trim()), 300);
    return () => clearTimeout(id);
  }, [busqueda]);

  useEffect(() => {
    if (cargandoSesion) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    // El panel del club es del staff; el alumno tiene su propia vista.
    if (!esStaff) {
      router.replace(rutaInicio(user));
      return;
    }
    void cargar();
    // Las clases del club van aparte: no cambian entre búsquedas ni entre
    // páginas, así que no tienen por qué viajar con cada recarga del roster.
    void api
      .get<{ grupos: Clase[] }>('/schedule')
      .then((r) => setClases(r.data.grupos ?? []))
      .catch(() => setClases([]));
  }, [cargandoSesion, user, esStaff, router, cargar]);

  /**
   * El escudo del club. Se refresca la sesión y no la pantalla: el club viaja
   * dentro de `/auth/me`, así que al recargarlo el logo cambia a la vez en la
   * barra, en el panel del alumno y en el carnet.
   */
  async function guardarLogo(logoUrl: string | null) {
    await api.patch('/mi-club', { logoUrl });
    await refrescar();
    setEditandoLogo(false);
    avisoOk(t('logo.guardado'));
  }

  /**
   * Adelanta a mano el repaso diario de mensualidades: la API mira quién está
   * por vencer o vencido, le crea el aviso que verá en la campana y —a quien
   * haya dado permiso en su navegador— se lo manda al celular. No cobra nada ni
   * cambia ninguna fecha, y no repite el aviso que ya se dio hoy.
   *
   * El resultado se cuenta con palabras y no con dos números sueltos: «0 · 0»
   * no dejaba claro si el botón había fallado o si sencillamente no había a
   * quién avisar, que es lo normal a mitad de mes.
   */
  async function enviarAvisos() {
    try {
      const r = await api.post<{ creados: number; pushEnviados: number }>(
        '/notifications/run',
        {},
      );
      // «Ninguno» no es un éxito que celebrar ni un fallo: es información, y
      // por eso va en el tono neutro y no en verde.
      if (r.data.creados === 0) {
        avisoInfo(t('panel.avisosNinguno'));
      } else {
        avisoOk(
          `${t('panel.avisosCreados')}: ${r.data.creados} · ` +
            `${r.data.pushEnviados} ${t('panel.avisosPush')}`,
        );
      }
    } catch (e) {
      avisoError(mensajeError(e, t('panel.avisos')));
    }
  }

  if (cargandoSesion || cargando) {
    return (
      <main style={{ padding: '2rem' }} className="muted">
        {t('comun.cargando')}
      </main>
    );
  }

  /** Para marcar la fila con el 🎂 sin recorrer la lista en cada alumno. */
  const cumpleHoy = new Set(cumples.map((c) => c.userId));

  return (
    <main style={{ maxWidth: 1000, margin: '0 auto', padding: '1.5rem' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.25rem',
          gap: '0.5rem',
          flexWrap: 'wrap',
        }}
      >
        {/* El escudo del club preside su propio panel. Es también donde se
            pone: el maestro lo ve en su pantalla de todos los días y no tiene
            que buscar una pantalla de ajustes que esta app no tiene. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', minWidth: 0 }}>
          <LogoClub src={club?.logoUrl} nombre={club?.name ?? 'DINAMYT'} size={46} />
          <div style={{ minWidth: 0 }}>
            <h1 className="display" style={{ fontSize: '1.5rem' }}>
              {club?.name ?? t('panel.titulo')}
            </h1>
            <p className="muted" style={{ fontSize: '0.75rem' }}>
              {t('panel.titulo')}
              {club?.city ? ` · ${club.city}` : ''}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* ── El escudo ──
              Aquí ya no se cambia si el club es del ecosistema: se pone UNA vez
              en la ficha del club del portal, que es de donde lo leen también
              Campeonatos y Academy. Con un botón a cada lado, el mismo club
              acababa con dos escudos distintos según por qué puerta se entrara.
              El club que usa Membresías por su cuenta lo sigue teniendo aquí. */}
          {esMaestro && !club?.enElEcosistema && (
            <button
              className="btn btn-outline btn-sm"
              onClick={() => setEditandoLogo((v) => !v)}
              aria-expanded={editandoLogo}
            >
              {club?.logoUrl ? t('logo.cambiar') : t('logo.poner')}
            </button>
          )}
          <Link href="/estadisticas" className="btn btn-outline btn-sm">
            📊 {t('menu.estadisticas')}
          </Link>
          <button
            className="btn btn-outline btn-sm"
            onClick={enviarAvisos}
            title={t('panel.avisosAyuda')}
          >
            🔔 {t('panel.avisos')}
          </button>
        </div>
      </header>

      {editandoLogo && esMaestro && !club?.enElEcosistema && (
        <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.7rem' }}>
            {t('logo.titulo')}
          </h2>
          <CampoImagen
            variante="logo"
            src={club?.logoUrl}
            nombre={club?.name ?? 'DINAMYT'}
            onCambiar={guardarLogo}
          />
        </div>
      )}

      {/* Solo un fallo al CARGAR el panel se queda escrito aquí; el resultado
          de una acción va por la nube flotante (ver lib/toast.ts). */}
      {error && (
        <p className="msg-error" style={{ marginBottom: '1rem' }}>
          {error}
        </p>
      )}

      {/* ── Quién cumple años hoy ──
          Aparece SOLO el día que hay alguno. Una tarjeta que dijera «hoy nadie
          cumple años» estaría en pantalla trescientos sesenta días al año para
          no decir nada, y acabaría siendo un trozo de panel que nadie mira —que
          es justo lo que le pasaría al aviso el día que sí importa—. */}
      {cumples.length > 0 && (
        <div
          className="card"
          style={{
            padding: '0.9rem 1rem',
            marginBottom: '1.25rem',
            borderColor: 'var(--gold)',
          }}
        >
          <div
            className="eyebrow"
            style={{ marginBottom: '0.6rem', color: 'var(--gold)' }}
          >
            🎂 {cumples.length === 1 ? t('panel.cumpleHoy') : t('panel.cumpleHoyVarios')}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
            {cumples.map((c) => (
              <Link
                key={c.userId}
                href={`/alumnos/${c.userId}`}
                style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}
              >
                <Avatar src={c.avatarUrl} nombre={c.fullName} size={36} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: 'var(--gold)' }}>{c.fullName}</div>
                  {c.cumple != null && (
                    <div className="muted" style={{ fontSize: '0.72rem' }}>
                      {c.cumple} {t('panel.cumpleAnos')}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(min(160px, 100%), 1fr))',
          gap: '0.75rem',
          marginBottom: '1.25rem',
        }}
      >
        {/* Dos números y no uno: lo que entró en caja, y cuánto de eso le toca
            a ESTE mes. Quien paga tres meses de golpe no recauda el triple en
            julio; adelanta agosto y septiembre. */}
        <div className="card" style={{ padding: '0.9rem' }}>
          <div className="muted" style={{ fontSize: '0.75rem' }}>
            {revenue?.month} · {t('panel.enCaja')}
          </div>
          <div
            className="mono"
            style={{ fontSize: '1.3rem', fontWeight: 600, color: 'var(--gold)' }}
          >
            {fmtMoneda(revenue?.recaudado ?? 0)}
          </div>
          <div className="muted" style={{ fontSize: '0.72rem' }}>
            {fmtMoneda(revenue?.devengado ?? 0)} / {fmtMoneda(revenue?.esperadoMensual ?? 0)}{' '}
            {t('panel.deEsperado')}
          </div>
        </div>
        <div className="card" style={{ padding: '0.9rem' }}>
          <div className="muted" style={{ fontSize: '0.75rem' }}>
            {t('panel.vencidos')}
          </div>
          <div
            className="mono"
            style={{ fontSize: '1.3rem', fontWeight: 600, color: 'var(--danger)' }}
          >
            {overdue.length}
          </div>
        </div>
        <Link href="/asistencia" className="card" style={{ padding: '0.9rem' }}>
          <div className="muted" style={{ fontSize: '0.75rem' }}>
            {t('asistencia.presentes')}
          </div>
          <div
            className="mono"
            style={{ fontSize: '1.3rem', fontWeight: 600, color: 'var(--ok)' }}
          >
            {attendance?.hoy ?? 0}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--gold)' }}>
            {t('asistencia.titulo')} →
          </div>
        </Link>
      </div>

      {/* El roster va por páginas, así que necesita buscador SÍ o SÍ: sin él,
          el alumno de la página tres no aparece por ningún lado. Filtra la
          API, no el navegador. */}
      {/* El filtro por clase solo se dibuja si hay clases: en un club sin
          dividir sería un desplegable con una sola opción. */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '0.75rem',
          flexWrap: 'wrap',
        }}
      >
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          maxLength={80}
          placeholder={t('pag.buscarAlumno')}
          aria-label={t('pag.buscarAlumno')}
          style={{ flex: '1 1 12rem', margin: 0 }}
        />
        {clases.length > 0 && (
          <div style={{ flex: '0 1 12rem', minWidth: '10rem' }}>
            <SelectMenu
              valor={clase}
              onChange={setClase}
              etiquetaAria={t('grupos.filtrar')}
              opciones={[
                { valor: '', etiqueta: t('grupos.todas') },
                ...clases.map((c) => ({ valor: c.id, etiqueta: c.name })),
                { valor: 'ninguna', etiqueta: t('grupos.sinAsignar') },
              ]}
            />
          </div>
        )}
      </div>

      <div className="card tabla-scroll" style={{ padding: '0.5rem 1rem' }}>
        <table>
          <thead>
            <tr>
              <th>{t('panel.alumnos')}</th>
              <th>{t('comun.cinturon')}</th>
              <th>{t('comun.estado')}</th>
              <th>
                {t('panel.vence')} / {t('panel.clases')}
              </th>
              <th>{t('panel.registrarPago')}</th>
            </tr>
          </thead>
          <tbody>
            {roster.length === 0 && (
              <tr>
                <td colSpan={5} className="muted" style={{ padding: '1rem' }}>
                  {buscado ? t('pag.sinResultados') : t('panel.sinAlumnos')}
                </td>
              </tr>
            )}
            {roster.map((a) => (
              <tr key={a.userId}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <Avatar src={a.avatarUrl} nombre={a.fullName} size={36} ampliable />
                    <div style={{ minWidth: 0 }}>
                      <Link
                        href={`/alumnos/${a.userId}`}
                        style={{ fontWeight: 600, color: 'var(--gold)' }}
                      >
                        {a.fullName}
                        {/* El mismo dato que la tarjeta de arriba, pegado a la
                            fila: el maestro que está cobrando ve ahí mismo que
                            hoy es el cumpleaños de quien tiene delante. */}
                        {cumpleHoy.has(a.userId) && (
                          <span title={t('panel.cumpleTitulo')}> 🎂</span>
                        )}
                      </Link>
                      <div className="muted" style={{ fontSize: '0.72rem' }}>
                        {a.email}
                        {a.groupName ? ` · ${a.groupName}` : ''}
                      </div>
                    </div>
                  </div>
                </td>
                <td>
                  <Cinturon nombre={a.belt} />
                </td>
                <td>
                  <span className={claseEstado(a.estado)}>{t(claveEstado(a.estado))}</span>
                </td>
                <td className="muted">
                  {a.venceEl
                    ? `${fmtFecha(a.venceEl, idioma)}${
                        a.diasFaltantes != null ? ` (${a.diasFaltantes} d)` : ''
                      }`
                    : a.clasesRestantes != null
                      ? `${a.clasesRestantes} · ${t('panel.clases')}`
                      : '—'}
                </td>
                <td>
                  {/* Cobrar es una acción con consecuencias —mueve fechas y
                      dinero—, así que vive en la ficha del alumno y en ningún
                      otro sitio. Tenerla también aquí era lo que hacía tan
                      fácil registrar el mismo pago dos y tres veces yendo y
                      viniendo entre pantallas. */}
                  <Link
                    href={`/alumnos/${a.userId}#cobrar`}
                    className="btn btn-gold btn-sm"
                  >
                    {t('panel.cobrar')} →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Paginacion offset={offset} limit={POR_PAGINA} total={totalRoster} onIr={setOffset} />
    </main>
  );
}
