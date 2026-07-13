'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  api,
  obtenerToken,
  reportePanelAPI,
  extraerError,
  type ReportePanel,
  type RegistroReporte,
} from '@/lib/api';
import { getSesion, esAdmin } from '@/lib/session';

const NOMBRE_MODALIDAD: Record<string, string> = {
  combate: 'Combate',
  figura_armas: 'Figura con armas',
  figura_manos_libres: 'Figura a manos libres',
  defensa_personal: 'Defensa personal',
  salto_altura: 'Salto alto',
  salto_longitud: 'Salto largo',
};

const fmtCOP = (n: number) =>
  n.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

const MEDALLA = ['🥇', '🥈', '🥉'];

/**
 * PANEL DE REPORTES (port del alcance de DINAMYT-COMBAT): resumen del evento,
 * registros de combate y de figuras/saltos con filtros, podios por sección y
 * la descarga del reporte completo en Excel. Solo el administrador.
 */
export default function ReportesCampeonatoPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const campId = params.id;

  const [data, setData] = useState<ReportePanel | null>(null);
  const [error, setError] = useState('');
  const [descargando, setDescargando] = useState(false);
  const [tab, setTab] = useState<'resumen' | 'registros' | 'podios'>('resumen');

  // Filtros de los registros.
  const [fModalidad, setFModalidad] = useState('todas');
  const [fTatami, setFTatami] = useState('todos');
  const [fTipo, setFTipo] = useState('todos');
  const [busqueda, setBusqueda] = useState('');

  const cargar = useCallback(async () => {
    try {
      setData(await reportePanelAPI(campId));
    } catch (e) {
      setError(extraerError(e, 'No se pudo cargar el reporte.'));
    }
  }, [campId]);

  useEffect(() => {
    if (!obtenerToken()) {
      router.replace('/admin/login');
      return;
    }
    if (!esAdmin(getSesion())) {
      router.replace('/admin');
      return;
    }
    void cargar();
  }, [router, cargar]);

  const modalidades = useMemo(
    () => [...new Set((data?.registros ?? []).map((r) => r.modalidad))],
    [data],
  );
  const tatamis = useMemo(
    () =>
      [...new Set((data?.registros ?? []).map((r) => r.tatami).filter((t): t is number => t != null))].sort(
        (a, b) => a - b,
      ),
    [data],
  );

  const registrosFiltrados = useMemo(() => {
    let regs = data?.registros ?? [];
    if (fModalidad !== 'todas') regs = regs.filter((r) => r.modalidad === fModalidad);
    if (fTatami !== 'todos') regs = regs.filter((r) => String(r.tatami) === fTatami);
    if (fTipo !== 'todos') regs = regs.filter((r) => r.tipo === fTipo);
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      regs = regs.filter(
        (r) =>
          r.seccion.toLowerCase().includes(q) ||
          r.hong?.toLowerCase().includes(q) ||
          r.chung?.toLowerCase().includes(q) ||
          r.ranking?.some((x) => x.nombre.toLowerCase().includes(q)),
      );
    }
    return regs;
  }, [data, fModalidad, fTatami, fTipo, busqueda]);

  async function descargarExcel() {
    setDescargando(true);
    setError('');
    try {
      const res = await api.get(`/campeonatos/${campId}/reporte`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reporte-${(data?.campeonato.nombre ?? 'campeonato').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-')}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(extraerError(e, 'No se pudo generar el Excel.'));
    } finally {
      setDescargando(false);
    }
  }

  if (!data) {
    return (
      <main className="mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-6">
        <p style={{ color: error ? 'var(--danger)' : 'var(--text-muted)' }}>
          {error || 'Cargando reportes…'}
        </p>
      </main>
    );
  }

  const { resumen } = data;

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={`/admin/${campId}`} className="text-sm" style={{ color: 'var(--text-muted)' }}>
          ← Panel del campeonato
        </Link>
        <button onClick={descargarExcel} disabled={descargando} className="btn btn-gold btn-sm">
          {descargando ? 'Generando…' : '⬇ Descargar Excel completo'}
        </button>
      </div>
      <h1 className="mb-1 mt-2 text-2xl font-bold" style={{ color: 'var(--gold)' }}>
        Reportes — {data.campeonato.nombre}
      </h1>
      <p className="mb-5 text-sm" style={{ color: 'var(--text-muted)' }}>
        {resumen.inscripciones.total} inscripciones · {resumen.secciones.total} secciones ·{' '}
        {data.registros.length} registros
      </p>

      {error && <p className="msg-error mb-4 text-sm">{error}</p>}

      {/* Pestañas */}
      <nav className="mb-5 flex gap-1 border-b pb-2" style={{ borderColor: 'var(--border)' }}>
        {(
          [
            ['resumen', 'Resumen'],
            ['registros', `Registros (${data.registros.length})`],
            ['podios', `Podios (${data.podios.length})`],
          ] as [typeof tab, string][]
        ).map(([id, etq]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="rounded-lg px-4 py-2 text-sm font-semibold"
            style={
              tab === id
                ? { background: 'var(--bg-elevated)', color: 'var(--gold)' }
                : { color: 'var(--text-muted)' }
            }
          >
            {etq}
          </button>
        ))}
      </nav>

      {/* ── RESUMEN ── */}
      {tab === 'resumen' && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { v: resumen.inscripciones.aprobadas, l: 'Aprobadas', c: 'var(--ok)' },
              { v: resumen.inscripciones.pendientes, l: 'Pendientes', c: 'var(--gold)' },
              { v: resumen.secciones.finalizadas, l: 'Secciones finalizadas', c: 'var(--gold)' },
              { v: fmtCOP(resumen.recaudo.abonado), l: 'Recaudado', c: 'var(--ok)' },
            ].map((k, i) => (
              <div key={i} className="card p-4 text-center">
                <p className="text-2xl font-extrabold" style={{ color: k.c }}>
                  {k.v}
                </p>
                <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                  {k.l}
                </p>
              </div>
            ))}
          </div>

          <h2 className="mb-2 text-lg font-semibold">Categorías (secciones)</h2>
          <div className="card tabla-scroll p-1">
            <table>
              <thead>
                <tr>
                  <th>Sección</th>
                  <th>Modalidad</th>
                  <th>Tatami</th>
                  <th>Competidores</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {resumen.categorias.map((c, i) => (
                  <tr key={i}>
                    <td className="font-semibold">{c.nombre}</td>
                    <td>{NOMBRE_MODALIDAD[c.modalidad] ?? c.modalidad}</td>
                    <td>{c.tatami ? `Tatami ${c.tatami}` : '—'}</td>
                    <td>{c.competidores}</td>
                    <td>
                      <span
                        className={`badge ${c.estado === 'FINALIZADA' ? 'badge-ok' : c.estado === 'EN_CURSO' ? 'badge-live' : ''}`}
                      >
                        {c.estado}
                      </span>
                    </td>
                  </tr>
                ))}
                {resumen.categorias.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ color: 'var(--text-muted)', padding: '1rem' }}>
                      Aún no hay secciones.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── REGISTROS ── */}
      {tab === 'registros' && (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            <select value={fTipo} onChange={(e) => setFTipo(e.target.value)} className="w-auto">
              <option value="todos">Todo tipo</option>
              <option value="combate">Combate</option>
              <option value="figuras">Figuras / saltos</option>
            </select>
            <select
              value={fModalidad}
              onChange={(e) => setFModalidad(e.target.value)}
              className="w-auto"
            >
              <option value="todas">Todas las modalidades</option>
              {modalidades.map((m) => (
                <option key={m} value={m}>
                  {NOMBRE_MODALIDAD[m] ?? m}
                </option>
              ))}
            </select>
            {tatamis.length > 0 && (
              <select value={fTatami} onChange={(e) => setFTatami(e.target.value)} className="w-auto">
                <option value="todos">Todos los tatamis</option>
                {tatamis.map((t) => (
                  <option key={t} value={String(t)}>
                    Tatami {t}
                  </option>
                ))}
              </select>
            )}
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar competidor o sección…"
              className="min-w-0 flex-1"
            />
          </div>

          <div className="grid gap-2">
            {registrosFiltrados.map((r) => (
              <RegistroCard key={`${r.tipo}-${r.id}`} r={r} />
            ))}
            {registrosFiltrados.length === 0 && (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Sin registros que coincidan con el filtro.
              </p>
            )}
          </div>
        </>
      )}

      {/* ── PODIOS ── */}
      {tab === 'podios' && (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.podios.map((p, i) => (
            <div key={i} className="card p-4">
              <h3 className="mb-2 font-semibold">{p.seccion}</h3>
              <ul className="flex flex-col gap-1.5">
                {p.items.map((it, j) => (
                  <li key={j} className="flex items-center gap-2 text-sm">
                    <span className="text-lg">{MEDALLA[it.puesto - 1] ?? `${it.puesto}º`}</span>
                    <span className="font-semibold">{it.nombre}</span>
                    {it.club && (
                      <span style={{ color: 'var(--text-muted)' }}>· {it.club}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {data.podios.length === 0 && (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Aún no hay podios: se llenan a medida que finalizan las secciones.
            </p>
          )}
        </div>
      )}
    </main>
  );
}

function RegistroCard({ r }: { r: RegistroReporte }) {
  return (
    <div className="card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{r.seccion}</p>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {NOMBRE_MODALIDAD[r.modalidad] ?? r.modalidad}
            {r.tatami ? ` · Tatami ${r.tatami}` : ''}
            {r.fecha ? ` · ${new Date(r.fecha).toLocaleDateString('es-CO')}` : ''}
          </span>
        </div>
        {r.tipo === 'combate' && (
          <div className="flex items-center gap-2 text-sm font-bold">
            <span style={{ color: 'var(--hong)' }}>{r.hong}</span>
            <span style={{ color: 'var(--hong)' }}>{r.marcadorHong ?? '–'}</span>
            <span style={{ color: 'var(--text-muted)' }}>:</span>
            <span style={{ color: 'var(--chung)' }}>{r.marcadorChung ?? '–'}</span>
            <span style={{ color: 'var(--chung)' }}>{r.chung}</span>
            {r.ganador && (
              <span className={`badge ${r.ganador === 'empate' ? '' : 'badge-gold'}`}>
                {r.ganador === 'hong' ? 'Gana rojo' : r.ganador === 'chung' ? 'Gana azul' : 'Empate'}
              </span>
            )}
          </div>
        )}
      </div>
      {r.tipo === 'figuras' && r.ranking && (
        <ul className="mt-2 flex flex-col gap-1 border-t pt-2 text-sm" style={{ borderColor: 'var(--border)' }}>
          {r.ranking.slice(0, 5).map((x, i) => (
            <li key={i} className="flex justify-between gap-2">
              <span>
                {x.posicion ? `${MEDALLA[x.posicion - 1] ?? `${x.posicion}º`} ` : ''}
                {x.nombre}
              </span>
              <span style={{ color: 'var(--text-muted)' }}>
                {x.total ?? x.distancia ?? ''}
                {x.club ? ` · ${x.club}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
