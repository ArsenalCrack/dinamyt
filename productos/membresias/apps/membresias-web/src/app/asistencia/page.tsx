'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, mensajeError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { fmtFecha, hoyISO } from '@/lib/formato';
import { LIM } from '@/lib/campos';
import { avisoError, avisoInfo, avisoOk } from '@/lib/toast';
import { Avatar } from '@/components/Avatar';
import { POR_PAGINA, Paginacion } from '@/components/Paginacion';
import { SelectMenu } from '@/components/SelectMenu';

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
/** Una clase del club, para pasar lista de una sola. */
interface Clase {
  id: string;
  name: string;
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
  const [clases, setClases] = useState<Clase[]>([]);
  /**
   * Qué clase se está pasando. '' = todas.
   *
   * Es el filtro que hace usable esta pantalla en un club dividido: a las seis
   * de la tarde el maestro tiene delante a los adultos, y una lista con los
   * niños intercalados le obliga a buscar cada nombre entre el doble de filas.
   */
  const [clase, setClase] = useState('');
  const [busqueda, setBusqueda] = useState('');
  /** Lo que de verdad viajó a la API: el filtro es suyo, no del navegador. */
  const [buscado, setBuscado] = useState('');
  /** Solo para fallos al CARGAR la lista; lo demás va por la nube flotante. */
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    try {
      const [r, a] = await Promise.all([
        api.get<{ items: RosterItem[]; total: number }>('/memberships', {
          params: {
            limit: POR_PAGINA,
            offset,
            ...(buscado ? { q: buscado } : {}),
            ...(clase ? { groupId: clase } : {}),
          },
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
      setError(mensajeError(e, t('comun.ninguno')));
    } finally {
      setCargando(false);
    }
  }, [offset, buscado, clase, t]);

  useEffect(() => {
    setOffset(0);
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
    if (!esStaff) {
      router.replace('/mi');
      return;
    }
    void cargar();
    const id = setInterval(() => void cargar(), 10000);
    // Las clases van fuera del temporizador: no cambian cada diez segundos, y
    // recargarlas con la lista sería un viaje de más cada vez.
    void api
      .get<{ grupos: Clase[] }>('/schedule')
      .then((r) => setClases(r.data.grupos ?? []))
      .catch(() => setClases([]));
    return () => clearInterval(id);
  }, [cargandoSesion, user, esStaff, router, cargar]);

  const presentes = new Map(asistencias.map((a) => [a.userId, a]));

  async function marcar(alumno: RosterItem) {
    setOcupado(alumno.userId);
    try {
      const r = await api.post<{ accionSugerida?: string }>('/checkin', {
        identifier: { type: 'manual', value: alumno.userId },
      });
      // Se recarga ANTES de avisar: la nube sale a la vez que la persona pasa a
      // «presente» en la lista. Pasar lista es donde más se notaba el problema
      // —se marca a alguien del final de la lista y el mensaje salía arriba del
      // todo, fuera de la pantalla— y donde marcar dos veces confunde el conteo.
      await cargar();
      if (r.data.accionSugerida === 'avisar') {
        avisoInfo(`${alumno.fullName} · ${t('estado.por_vencer')}`);
      } else {
        avisoOk(`${alumno.fullName} · ${t('asistencia.marcado')} ✓`);
      }
    } catch (e) {
      avisoError(mensajeError(e, t('asistencia.marcar')));
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

      {/* Solo un fallo al CARGAR la lista se queda escrito aquí; el resultado
          de cada marcaje va por la nube flotante (ver lib/toast.ts). */}
      {error && <p className="msg-error" style={{ marginBottom: '1rem' }}>{error}</p>}

      {/* El filtro por clase solo se dibuja si hay clases: en un club sin
          dividir sería un desplegable con una sola opción. */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '0.9rem',
          flexWrap: 'wrap',
        }}
      >
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          maxLength={LIM.busqueda}
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
