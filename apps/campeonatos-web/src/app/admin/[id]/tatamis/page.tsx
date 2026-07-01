'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  obtenerToken,
  listTatamisAPI,
  listSeccionesAPI,
  getCampeonatoAPI,
  encolarSeccionAPI,
  iniciarTatamiAPI,
  finalizarTatamiAPI,
  promoverColaAPI,
  robarColaAPI,
  quitarColaAPI,
  extraerError,
  type Tatami,
  type Seccion,
} from '@/lib/api';
import { getSesion, esAdmin } from '@/lib/session';

/** Etiqueta corta y legible de una modalidad. */
const NOMBRE_MODALIDAD: Record<string, string> = {
  combate: 'Combate',
  figura_armas: 'Figura armas',
  figura_manos_libres: 'Figura manos libres',
  defensa_personal: 'Defensa personal',
  salto_altura: 'Salto alto',
  salto_longitud: 'Salto largo',
};

/**
 * Gestión del evento en vivo (lógica de DINAMYT-PROJECT): cada tatami tiene
 * una cola FIFO de secciones. El admin encola, inicia/finaliza, promueve al
 * frente y "roba" secciones en espera de otros tatamis para balancear.
 */
export default function TatamisPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const campId = params.id;

  const [nombreCamp, setNombreCamp] = useState('');
  const [tatamis, setTatamis] = useState<Tatami[]>([]);
  const [secciones, setSecciones] = useState<Seccion[]>([]);
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'error'>('cargando');
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  /** Ítem de cola en modo "robar": muestra los destinos posibles. */
  const [robando, setRobando] = useState<string | null>(null);
  /** Sección disponible en modo "encolar": muestra los tatamis destino. */
  const [encolando, setEncolando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [tats, secs, detalle] = await Promise.all([
        listTatamisAPI(campId),
        listSeccionesAPI(campId),
        getCampeonatoAPI(campId),
      ]);
      setTatamis(tats);
      setSecciones(secs);
      setNombreCamp(detalle.nombre);
      setEstado('ok');
    } catch (e) {
      setMsg({ tipo: 'error', texto: extraerError(e, 'No se pudieron cargar los tatamis.') });
      setEstado('error');
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

  /** Ejecuta una acción de la API, refresca y reporta errores. */
  async function accion(fn: () => Promise<unknown>, fallback: string) {
    setMsg(null);
    setOcupado(true);
    try {
      await fn();
      await cargar();
    } catch (e) {
      setMsg({ tipo: 'error', texto: extraerError(e, fallback) });
    } finally {
      setOcupado(false);
      setRobando(null);
      setEncolando(null);
    }
  }

  // Secciones aún sin encolar en ningún tatami (y sin finalizar).
  const enColas = new Set(
    tatamis.flatMap((t) =>
      t.cola.filter((i) => i.estado !== 'FINALIZADA').map((i) => i.seccion.id),
    ),
  );
  const disponibles = secciones.filter(
    (s) => s.estado !== 'FINALIZADA' && !enColas.has(s.id),
  );

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-6">
      <Link href="/admin" className="text-sm" style={{ color: 'var(--text-muted)' }}>
        ← Campeonatos
      </Link>
      <div className="mb-6 mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--gold)' }}>
            Tatamis · {nombreCamp || '…'}
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Encola secciones en cada tatami, inícialas en orden y «roba» las que
            estén en espera en otro tatami para balancear el evento.
          </p>
        </div>
        <Link href={`/admin/${campId}/secciones`} className="btn btn-outline">
          Secciones y llaves
        </Link>
      </div>

      {msg && (
        <p className={`mb-4 text-sm ${msg.tipo === 'ok' ? 'msg-ok' : 'msg-error'}`}>
          {msg.texto}
        </p>
      )}
      {estado === 'cargando' && <p style={{ color: 'var(--text-muted)' }}>Cargando…</p>}

      {/* ── Tatamis con su cola ─────────────────────────────────────────── */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {tatamis.map((t) => {
          const actual = t.cola.find((i) => i.estado === 'EN_CURSO');
          const espera = t.cola.filter((i) => i.estado === 'EN_ESPERA');
          const hechas = t.cola.filter((i) => i.estado === 'FINALIZADA');
          return (
            <article key={t.id} className="card flex flex-col p-4">
              <header className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-bold">Tatami {t.numero}</h2>
                <span className={`badge ${t.estado === 'OCUPADO' ? 'badge-live' : 'badge-ok'}`}>
                  {t.estado === 'OCUPADO' ? '● EN VIVO' : 'LIBRE'}
                </span>
              </header>

              {/* Sección en curso */}
              {actual ? (
                <div
                  className="mb-3 rounded-lg border p-3"
                  style={{ borderColor: 'var(--gold-dim)', background: 'var(--bg-elevated)' }}
                >
                  <span className="text-[0.65rem] font-bold uppercase tracking-wider" style={{ color: 'var(--gold)' }}>
                    En curso
                  </span>
                  <p className="text-sm font-semibold">{actual.seccion.nombre}</p>
                  <button
                    onClick={() => accion(() => finalizarTatamiAPI(t.id), 'No se pudo finalizar.')}
                    disabled={ocupado}
                    className="btn btn-gold btn-sm mt-2"
                  >
                    ✓ Finalizar sección
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => accion(() => iniciarTatamiAPI(t.id), 'No se pudo iniciar.')}
                  disabled={ocupado || espera.length === 0}
                  className="btn btn-gold btn-sm mb-3"
                >
                  ▶ Iniciar siguiente
                </button>
              )}

              {/* Cola en espera */}
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                En espera ({espera.length})
              </h3>
              <ul className="flex flex-col gap-1.5">
                {espera.length === 0 && (
                  <li className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Cola vacía.
                  </li>
                )}
                {espera.map((i, idx) => (
                  <li
                    key={i.id}
                    className="rounded-lg border px-2.5 py-2 text-sm"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 flex-1 truncate" title={i.seccion.nombre}>
                        <span style={{ color: 'var(--text-muted)' }}>{idx + 1}.</span>{' '}
                        {i.seccion.nombre}
                      </span>
                      <span className="flex shrink-0 gap-1">
                        {idx > 0 && (
                          <button
                            onClick={() => accion(() => promoverColaAPI(i.id), 'No se pudo promover.')}
                            disabled={ocupado}
                            className="btn btn-outline btn-sm"
                            title="Mover al frente de la cola"
                          >
                            ↑
                          </button>
                        )}
                        {tatamis.length > 1 && (
                          <button
                            onClick={() => setRobando(robando === i.id ? null : i.id)}
                            disabled={ocupado}
                            className="btn btn-outline btn-sm"
                            title="Mover a otro tatami (robo de modalidades)"
                          >
                            ⇄
                          </button>
                        )}
                        <button
                          onClick={() => accion(() => quitarColaAPI(i.id), 'No se pudo quitar.')}
                          disabled={ocupado}
                          className="btn btn-danger btn-sm"
                          title="Quitar de la cola"
                        >
                          ✕
                        </button>
                      </span>
                    </div>
                    {robando === i.id && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {tatamis
                          .filter((d) => d.id !== t.id)
                          .map((d) => (
                            <button
                              key={d.id}
                              onClick={() =>
                                accion(() => robarColaAPI(i.id, d.id), 'No se pudo mover.')
                              }
                              disabled={ocupado}
                              className="btn btn-outline btn-sm"
                            >
                              → Tatami {d.numero}
                            </button>
                          ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>

              {/* Historial del tatami */}
              {hechas.length > 0 && (
                <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                  Finalizadas: {hechas.length}
                </p>
              )}
            </article>
          );
        })}
      </section>

      {/* ── Secciones disponibles para encolar ──────────────────────────── */}
      <section className="mt-8">
        <h2 className="mb-1 text-lg font-semibold">
          Secciones disponibles ({disponibles.length})
        </h2>
        <p className="mb-3 text-sm" style={{ color: 'var(--text-muted)' }}>
          Secciones generadas que aún no están en la cola de ningún tatami.
          {secciones.length === 0 && (
            <>
              {' '}
              Primero <Link href={`/admin/${campId}/secciones`} style={{ color: 'var(--gold)' }}>genera las secciones</Link>.
            </>
          )}
        </p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {disponibles.map((s) => (
            <li key={s.id} className="card px-3 py-2.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate" title={s.nombre}>
                  {s.nombre}
                </span>
                <span className="badge shrink-0">
                  {NOMBRE_MODALIDAD[s.modalidad] ?? s.modalidad}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {encolando === s.id ? (
                  tatamis.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => accion(() => encolarSeccionAPI(t.id, s.id), 'No se pudo encolar.')}
                      disabled={ocupado}
                      className="btn btn-outline btn-sm"
                    >
                      → Tatami {t.numero}
                    </button>
                  ))
                ) : (
                  <button
                    onClick={() => setEncolando(s.id)}
                    disabled={ocupado || tatamis.length === 0}
                    className="btn btn-gold btn-sm"
                  >
                    + Encolar
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
