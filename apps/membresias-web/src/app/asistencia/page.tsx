'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, mensajeError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { fmtFecha, hoyISO } from '@/lib/formato';
import { LIM } from '@/lib/campos';
import { Avatar } from '@/components/Avatar';
import { POR_PAGINA, Paginacion } from '@/components/Paginacion';

interface RosterItem {
  userId: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  estado: string;
  venceEl: string | null;
  clasesRestantes: number | null;
}
interface Asistencia {
  id: string;
  userId: string;
  checkedInAt: string;
  method: string;
}

/**
 * Pasar lista. El maestro marca a cada alumno presente, o deja que entren con
 * su carnet QR o su PIN en el kiosco: la lista recoge todo, venga por donde
 * venga, y se refresca sola cada 10 segundos.
 */
export default function AsistenciaPage() {
  const router = useRouter();
  const { t, idioma } = useI18n();
  const { user, cargando: cargandoSesion, esStaff } = useAuth();

  const [roster, setRoster] = useState<RosterItem[]>([]);
  const [totalRoster, setTotalRoster] = useState(0);
  const [offset, setOffset] = useState(0);
  const [asistencias, setAsistencias] = useState<Asistencia[]>([]);
  const [busqueda, setBusqueda] = useState('');
  /** Lo que de verdad viajó a la API: el filtro es suyo, no del navegador. */
  const [buscado, setBuscado] = useState('');
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error' | 'aviso'; texto: string } | null>(
    null,
  );
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    try {
      const [r, a] = await Promise.all([
        api.get<{ items: RosterItem[]; total: number }>('/memberships', {
          params: { limit: POR_PAGINA, offset, ...(buscado ? { q: buscado } : {}) },
        }),
        // Las de HOY, sin paginar: son las que ya entraron, y en un día de
        // clase eso es una fracción del club. Se necesitan enteras para pintar
        // el ✓ de quien ya está dentro.
        api.get<Asistencia[]>('/attendances', { params: { date: hoyISO() } }),
      ]);
      setRoster(r.data.items);
      setTotalRoster(r.data.total);
      setAsistencias(a.data);
    } catch (e) {
      setMsg({ tipo: 'error', texto: mensajeError(e, t('comun.ninguno')) });
    } finally {
      setCargando(false);
    }
  }, [offset, buscado, t]);

  useEffect(() => {
    setOffset(0);
  }, [buscado]);

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
    if (!esStaff) {
      router.replace('/mi');
      return;
    }
    void cargar();
    const id = setInterval(() => void cargar(), 10000);
    return () => clearInterval(id);
  }, [cargandoSesion, user, esStaff, router, cargar]);

  const presentes = new Map(asistencias.map((a) => [a.userId, a]));

  async function marcar(alumno: RosterItem) {
    setMsg(null);
    setOcupado(alumno.userId);
    try {
      const r = await api.post<{ accionSugerida?: string }>('/checkin', {
        identifier: { type: 'manual', value: alumno.userId },
      });
      setMsg(
        r.data.accionSugerida === 'avisar'
          ? { tipo: 'aviso', texto: `${alumno.fullName} · ${t('estado.por_vencer')}` }
          : { tipo: 'ok', texto: `${alumno.fullName} · ${t('asistencia.marcado')} ✓` },
      );
      await cargar();
    } catch (e) {
      setMsg({ tipo: 'error', texto: mensajeError(e, t('asistencia.marcar')) });
    } finally {
      setOcupado(null);
    }
  }

  // El filtro lo hace la API: ver `cargar`. Filtrar aquí sobre una página de
  // veinticinco escondería a quien no esté en ella.
  const visibles = roster;

  if (cargandoSesion || cargando) {
    return (
      <main style={{ padding: '2rem' }} className="muted">
        {t('comun.cargando')}
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '1.5rem' }}>
      <header style={{ marginBottom: '1.25rem' }}>
        <p className="eyebrow" style={{ marginBottom: '0.15rem' }}>
          {fmtFecha(hoyISO(), idioma)}
        </p>
        <h1 className="display" style={{ fontSize: '1.5rem' }}>
          {t('asistencia.titulo')}
        </h1>
        <p className="muted" style={{ fontSize: '0.85rem', marginTop: '0.35rem' }}>
          {t('asistencia.instruccion')}{' '}
          <Link href="/kiosco" style={{ color: 'var(--gold)' }}>
            {t('menu.kiosco')} →
          </Link>
        </p>
      </header>

      <div style={{ marginBottom: '1rem' }}>
        <span className="badge badge-ok" style={{ fontSize: '0.8rem' }}>
          ✓ {asistencias.length} · {t('asistencia.presentes')}
        </span>
      </div>

      {msg && (
        <p
          className={msg.tipo === 'error' ? 'msg-error' : msg.tipo === 'ok' ? 'msg-ok' : ''}
          style={{
            marginBottom: '1rem',
            ...(msg.tipo === 'aviso' ? { color: 'var(--gold)' } : {}),
          }}
        >
          {msg.texto}
        </p>
      )}

      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        maxLength={LIM.busqueda}
        placeholder={t('pag.buscarAlumno')}
        aria-label={t('pag.buscarAlumno')}
        style={{ marginBottom: '0.9rem', width: '100%' }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {visibles.length === 0 && (
          <p className="muted">{buscado ? t('pag.sinResultados') : t('comun.ninguno')}</p>
        )}
        {visibles.map((a) => {
          const asistencia = presentes.get(a.userId);
          return (
            <div
              key={a.userId}
              className="card"
              style={{
                padding: '0.7rem 0.9rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                borderColor: asistencia ? 'var(--ok)' : 'var(--border)',
              }}
            >
              <Avatar src={a.avatarUrl} nombre={a.fullName} size={42} ampliable />
              <div style={{ minWidth: 0, flex: 1 }}>
                <Link
                  href={`/alumnos/${a.userId}`}
                  style={{ fontWeight: 600, color: 'var(--text)' }}
                >
                  {a.fullName}
                </Link>
                <div className="muted" style={{ fontSize: '0.72rem' }}>
                  {a.estado === 'vencido'
                    ? `⚠ ${t('estado.vencido')}`
                    : a.venceEl
                      ? `${t('panel.vence')} ${fmtFecha(a.venceEl, idioma)}`
                      : a.clasesRestantes != null
                        ? `${a.clasesRestantes} · ${t('panel.clases')}`
                        : t('estado.sin_plan')}
                </div>
              </div>
              {asistencia ? (
                <span className="badge badge-ok">
                  ✓{' '}
                  {new Date(asistencia.checkedInAt).toLocaleTimeString(
                    idioma === 'en' ? 'en-GB' : 'es-CO',
                    { hour: '2-digit', minute: '2-digit' },
                  )}
                </span>
              ) : (
                <button
                  className="btn btn-gold btn-sm"
                  disabled={ocupado === a.userId}
                  onClick={() => marcar(a)}
                >
                  {ocupado === a.userId ? t('comun.guardando') : t('asistencia.marcar')}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <Paginacion offset={offset} limit={POR_PAGINA} total={totalRoster} onIr={setOffset} />
    </main>
  );
}
