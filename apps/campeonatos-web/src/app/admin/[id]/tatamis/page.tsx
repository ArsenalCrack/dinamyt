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
  asignarJuezAPI,
  quitarJuezAPI,
  extraerError,
  ROLES_TATAMI,
  type Tatami,
  type Seccion,
  type RolTatami,
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

/** Etiqueta legible de cada rol de juez del tatami. */
const NOMBRE_ROL: Record<RolTatami, string> = {
  arbitro: 'Árbitro central',
  j1: 'Juez 1',
  j2: 'Juez 2',
  j3: 'Juez 3',
  j4: 'Juez 4',
  j5: 'Juez 5',
  j6: 'Juez 6',
  j7: 'Juez 7',
};

/** Panel de jueces de un tatami: lista por rol + formulario de asignación. */
function JuecesTatami({
  tatami,
  ocupado,
  onAsignar,
  onQuitar,
}: {
  tatami: Tatami;
  ocupado: boolean;
  onAsignar: (rol: RolTatami, nombre: string, email?: string) => void;
  onQuitar: (rol: RolTatami) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [rol, setRol] = useState<RolTatami>('arbitro');
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');

  const libres = ROLES_TATAMI.filter(
    (r) => !tatami.jueces.some((j) => j.rolTatami === r),
  );
  // Si el rol elegido acaba de ser asignado, cae al primer rol libre.
  const rolSel = libres.includes(rol) ? rol : libres[0];

  function asignar() {
    if (!nombre.trim() || !rolSel) return;
    onAsignar(rolSel, nombre.trim(), email.trim() || undefined);
    setNombre('');
    setEmail('');
  }

  return (
    <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
      <button
        onClick={() => setAbierto(!abierto)}
        className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wider"
        style={{ color: 'var(--text-muted)' }}
      >
        <span>Jueces ({tatami.jueces.length})</span>
        <span>{abierto ? '▲' : '▼'}</span>
      </button>

      {abierto && (
        <div className="mt-2 flex flex-col gap-1.5">
          {tatami.jueces.length === 0 && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Sin jueces asignados.
            </p>
          )}
          {[...tatami.jueces]
            .sort(
              (a, b) =>
                ROLES_TATAMI.indexOf(a.rolTatami) - ROLES_TATAMI.indexOf(b.rolTatami),
            )
            .map((j) => (
              <div
                key={j.rolTatami}
                className="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-sm"
                style={{ borderColor: 'var(--border)' }}
              >
                <span className="min-w-0 flex-1 truncate">
                  <span className="badge badge-gold mr-1.5">{NOMBRE_ROL[j.rolTatami]}</span>
                  {j.nombreDisplay}
                  {j.userEmail && (
                    <span className="ml-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                      · {j.userEmail}
                    </span>
                  )}
                </span>
                <button
                  onClick={() => onQuitar(j.rolTatami)}
                  disabled={ocupado}
                  className="btn btn-danger btn-sm shrink-0"
                  title="Quitar asignación"
                >
                  ✕
                </button>
              </div>
            ))}

          {libres.length > 0 && (
            <div className="mt-1 grid gap-1.5">
              <div className="grid grid-cols-2 gap-1.5">
                <select
                  value={rolSel}
                  onChange={(e) => setRol(e.target.value as RolTatami)}
                  className="text-sm"
                >
                  {libres.map((r) => (
                    <option key={r} value={r}>
                      {NOMBRE_ROL[r]}
                    </option>
                  ))}
                </select>
                <input
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Nombre *"
                  className="text-sm"
                />
              </div>
              <div className="flex gap-1.5">
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email del ecosystem (opcional)"
                  type="email"
                  className="flex-1 text-sm"
                />
                <button
                  onClick={asignar}
                  disabled={ocupado || !nombre.trim()}
                  className="btn btn-gold btn-sm shrink-0"
                >
                  + Asignar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {actual.seccion.modalidad === 'combate' && (
                      <Link
                        href={`/admin/combate?combate=${actual.seccion.id}&seccion=${actual.seccion.id}`}
                        className="btn btn-outline btn-sm"
                        title="Abrir el panel de juez de mesa de esta sección"
                      >
                        ⚔ Juez de mesa
                      </Link>
                    )}
                    <button
                      onClick={() => accion(() => finalizarTatamiAPI(t.id), 'No se pudo finalizar.')}
                      disabled={ocupado}
                      className="btn btn-gold btn-sm"
                    >
                      ✓ Finalizar sección
                    </button>
                  </div>
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

              {/* Jueces del tatami (modelo COMBAT: árbitro + j1..j7) */}
              <JuecesTatami
                tatami={t}
                ocupado={ocupado}
                onAsignar={(rol, nombre, email) =>
                  accion(
                    () => asignarJuezAPI(t.id, rol, { nombreDisplay: nombre, userEmail: email }),
                    'No se pudo asignar el juez.',
                  )
                }
                onQuitar={(rol) =>
                  accion(() => quitarJuezAPI(t.id, rol), 'No se pudo quitar el juez.')
                }
              />

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
