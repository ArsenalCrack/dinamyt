'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  obtenerToken,
  listSeccionesAPI,
  generarSeccionesAPI,
  asignarSeccionesAPI,
  generarBracketAPI,
  getCampeonatoAPI,
  guardarCategoriasAPI,
  extraerError,
  type Seccion,
  type ModalidadCampeonato,
  type CategoriasConfig,
} from '@/lib/api';
import { ConfigCategorias, esConfigCompleta } from './ConfigCategorias';
import { getSesion, esAdmin } from '@/lib/session';

export default function SeccionesPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const campId = params.id;

  const [secciones, setSecciones] = useState<Seccion[]>([]);
  const [modalidades, setModalidades] = useState<ModalidadCampeonato[]>([]);
  const [estadoCamp, setEstadoCamp] = useState<string | null>(null);
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'error'>('cargando');
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Con el evento EN CURSO o FINALIZADO la configuración queda congelada
  // (la API también lo exige): regenerar destruiría colas y llaves.
  const congelado = estadoCamp === 'EN_CURSO' || estadoCamp === 'FINALIZADO';

  // Asistente de 3 pasos: solo se ve UN paso a la vez (nada de scroll
  // infinito). Al cargar cae en el paso que corresponde al avance real.
  const [paso, setPaso] = useState<1 | 2 | 3>(1);
  const [pasoElegido, setPasoElegido] = useState(false);
  useEffect(() => {
    if (pasoElegido || estado !== 'ok') return;
    setPaso(secciones.length > 0 ? 2 : 1);
  }, [estado, secciones.length, pasoElegido]);

  const cargar = useCallback(async () => {
    setEstado('cargando');
    try {
      const [secs, detalle] = await Promise.all([
        listSeccionesAPI(campId),
        getCampeonatoAPI(campId),
      ]);
      setSecciones(secs);
      setModalidades(detalle.modalidades);
      setEstadoCamp(detalle.estado);
      setEstado('ok');
    } catch (e) {
      setMsg({ tipo: 'error', texto: extraerError(e, 'No se pudieron cargar las secciones.') });
      setEstado('error');
    }
  }, [campId]);

  async function guardarCategorias(modalidad: string, categorias: CategoriasConfig) {
    setMsg(null);
    setOcupado(true);
    try {
      await guardarCategoriasAPI(campId, modalidad as ModalidadCampeonato['modalidad'], categorias);
      setMsg({ tipo: 'ok', texto: `Categorías de ${modalidad} guardadas.` });
      await cargar();
    } catch (e) {
      setMsg({ tipo: 'error', texto: extraerError(e, 'No se pudieron guardar las categorías.') });
    } finally {
      setOcupado(false);
    }
  }

  useEffect(() => {
    if (!obtenerToken()) {
      router.replace('/admin/login');
      return;
    }
    // Secciones y llaves son SOLO del administrador (la API también lo exige).
    if (!esAdmin(getSesion())) {
      router.replace('/admin');
      return;
    }
    void cargar();
  }, [router, cargar]);

  async function generar() {
    setMsg(null);
    setOcupado(true);
    try {
      const { total } = await generarSeccionesAPI(campId);
      setMsg({ tipo: 'ok', texto: `Se generaron ${total} secciones.` });
      await cargar();
    } catch (e) {
      setMsg({ tipo: 'error', texto: extraerError(e, 'No se pudieron generar las secciones.') });
    } finally {
      setOcupado(false);
    }
  }

  async function asignar() {
    setMsg(null);
    setOcupado(true);
    try {
      const { asignadas } = await asignarSeccionesAPI(campId);
      setMsg({ tipo: 'ok', texto: `Se asignaron ${asignadas} inscripciones a sus secciones.` });
      await cargar();
    } catch (e) {
      setMsg({ tipo: 'error', texto: extraerError(e, 'No se pudieron asignar las inscripciones.') });
    } finally {
      setOcupado(false);
    }
  }

  async function generarLlave(seccionId: string) {
    setMsg(null);
    setOcupado(true);
    try {
      await generarBracketAPI(seccionId);
      setMsg({ tipo: 'ok', texto: 'Llave generada para la sección.' });
    } catch (e) {
      setMsg({ tipo: 'error', texto: extraerError(e, 'No se pudo generar la llave (¿al menos 2 competidores?).') });
    } finally {
      setOcupado(false);
    }
  }

  const configuradas = modalidades.filter((m) =>
    esConfigCompleta(m.modalidad, m.categorias),
  ).length;

  const PASOS: { n: 1 | 2 | 3; titulo: string; estado: string; listo: boolean }[] = [
    {
      n: 1,
      titulo: 'Configurar modalidades',
      estado: `${configuradas}/${modalidades.length} listas`,
      listo: modalidades.length > 0 && configuradas === modalidades.length,
    },
    {
      n: 2,
      titulo: 'Generar secciones',
      estado: secciones.length > 0 ? `${secciones.length} secciones` : 'Pendiente',
      listo: secciones.length > 0,
    },
    {
      n: 3,
      titulo: 'Colocar aprobados',
      estado: 'Llena las llaves',
      listo: false,
    },
  ];

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-8 sm:px-6">
      <Link href={`/admin/${campId}`} className="text-sm" style={{ color: 'var(--text-muted)' }}>
        ← Panel del campeonato
      </Link>
      <h1 className="mb-4 mt-2 text-2xl font-bold" style={{ color: 'var(--gold)' }}>
        Categorías y llaves
      </h1>

      {/* Asistente: un paso a la vez, con el avance siempre a la vista */}
      <nav className="mb-6 grid grid-cols-3 gap-2">
        {PASOS.map((p) => (
          <button
            key={p.n}
            onClick={() => {
              setPaso(p.n);
              setPasoElegido(true);
            }}
            className="card p-3 text-left"
            style={
              paso === p.n
                ? { borderColor: 'var(--gold)', background: 'var(--bg-elevated)' }
                : undefined
            }
          >
            <span
              className="text-xs font-extrabold"
              style={{ color: paso === p.n ? 'var(--gold)' : 'var(--text-muted)' }}
            >
              {p.listo ? '✓' : p.n} · {p.titulo}
            </span>
            <span className="mt-0.5 block text-[0.65rem]" style={{ color: 'var(--text-muted)' }}>
              {p.estado}
            </span>
          </button>
        ))}
      </nav>

      {/* Candado: con el evento en curso ya no se toca la configuración */}
      {congelado && (
        <div
          className="mb-5 rounded-lg border px-4 py-3 text-sm font-semibold"
          style={{ borderColor: 'var(--gold)', background: 'rgba(240,184,0,0.07)', color: 'var(--gold)' }}
        >
          🔒 El campeonato está {estadoCamp}: las categorías y secciones quedaron
          congeladas. Dirige el evento desde{' '}
          <Link href={`/admin/${campId}/tatamis`} style={{ textDecoration: 'underline' }}>
            Tatamis
          </Link>.
        </div>
      )}

      {/* ── PASO 1: configurar cada modalidad ─────────────────────────── */}
      {paso === 1 && modalidades.length > 0 && !congelado && (
        <section className="mb-6">
          <p className="mb-3 text-sm" style={{ color: 'var(--text-muted)' }}>
            Abre cada modalidad y responde: <strong>¿compiten géneros por
            separado o mixto?</strong>, <strong>¿qué cinturones entran y cómo se
            agrupan?</strong>, <strong>¿qué edades?</strong> y (si aplica){' '}
            <strong>¿qué pesos?</strong>. Con eso el sistema genera las
            secciones automáticamente — cada combinación es una categoría que
            se abre en el campeonato.
          </p>
          <div className="grid gap-2">
            {modalidades.map((m) => (
              <details key={m.id} className="desplegable">
                <summary
                  className="flex cursor-pointer items-center justify-between px-4 py-3 font-semibold"
                  style={{ listStyle: 'none' }}
                >
                  <span>
                    ⚙ {m.modalidad.replaceAll('_', ' ')}
                    {/* "Configurada" SOLO si todas las dimensiones requeridas
                        (cinturón, edad y peso donde aplique) están completas. */}
                    <span
                      className={`badge ml-2 ${
                        esConfigCompleta(m.modalidad, m.categorias)
                          ? 'badge-ok'
                          : m.categorias
                            ? 'badge-live'
                            : 'badge-info'
                      }`}
                    >
                      {esConfigCompleta(m.modalidad, m.categorias)
                        ? 'Configurada'
                        : m.categorias
                          ? 'Incompleta'
                          : 'Sin configurar'}
                    </span>
                  </span>
                </summary>
                <div className="border-t px-4 py-3" style={{ borderColor: 'var(--border)' }}>
                  <ConfigCategorias
                    modalidad={m.modalidad}
                    inicial={m.categorias}
                    guardando={ocupado}
                    onGuardar={(c) => guardarCategorias(m.modalidad, c)}
                  />
                </div>
              </details>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => {
                setPaso(2);
                setPasoElegido(true);
              }}
              className="btn btn-gold"
            >
              Continuar: generar secciones →
            </button>
          </div>
        </section>
      )}

      {/* ── PASO 2: generar secciones (y sus llaves) ──────────────────── */}
      {paso === 2 && !congelado && (
        <section className="card mb-4 p-4">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Con la configuración del paso 1, el sistema crea una{' '}
            <strong>sección</strong> por cada combinación (modalidad · género ·
            cinturón · edad · peso). Puedes regenerarlas mientras el evento no
            arranque: se reemplazan las anteriores.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={generar} disabled={ocupado} className="btn btn-gold">
              {secciones.length > 0 ? '↻ Regenerar secciones' : 'Generar secciones'}
            </button>
            {secciones.length > 0 && (
              <button
                onClick={() => {
                  setPaso(3);
                  setPasoElegido(true);
                }}
                className="btn btn-outline"
              >
                Continuar: colocar aprobados →
              </button>
            )}
          </div>
        </section>
      )}

      {/* ── PASO 3: colocar aprobados en sus llaves ───────────────────── */}
      {paso === 3 && (
        <section className="card mb-4 p-4">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Toma todas las inscripciones <strong>aprobadas</strong> y coloca a
            cada competidor en la sección que le corresponde por cinturón,
            edad, peso y género. (Al aprobar una inscripción en «Revisión» esto
            ya ocurre solo; este botón sirve si generaste las secciones
            después de aprobar gente.)
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={asignar} disabled={ocupado || congelado} className="btn btn-gold">
              Colocar aprobados en sus llaves
            </button>
            <Link href={`/admin/${campId}/tatamis`} className="btn btn-outline">
              Siguiente: dirigir tatamis →
            </Link>
          </div>
        </section>
      )}

      {msg && (
        <p className="mb-4 text-sm" style={{ color: msg.tipo === 'ok' ? 'var(--gold)' : '#ff5577' }}>
          {msg.texto}
        </p>
      )}

      {estado === 'cargando' && <p style={{ color: 'var(--text-muted)' }}>Cargando…</p>}
      {estado === 'ok' && paso === 2 && secciones.length === 0 && (
        <p style={{ color: 'var(--text-muted)' }}>
          Aún no hay secciones. Pulsa «Generar secciones».
        </p>
      )}

      {/* Secciones agrupadas por modalidad (solo en el paso 2): con muchas
          categorías abiertas, cada modalidad se pliega y muestra su total. */}
      {paso === 2 && (
      <div className="grid gap-2">
        {[...new Set(secciones.map((s) => s.modalidad))].map((mod) => {
          const deMod = secciones.filter((s) => s.modalidad === mod);
          return (
            <details key={mod} className="desplegable" open={deMod.length <= 6}>
              <summary>
                <span>
                  {mod.replaceAll('_', ' ')}
                  <span className="badge badge-gold ml-2">{deMod.length} secciones</span>
                </span>
              </summary>
              <ul className="grid gap-2 border-t px-3 py-3 sm:grid-cols-2" style={{ borderColor: 'var(--border)' }}>
                {deMod.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold" title={s.nombre}>
                        {s.nombre}
                      </h3>
                      <span
                        className={`badge mt-0.5 ${s.estado === 'EN_CURSO' ? 'badge-live' : s.estado === 'FINALIZADA' ? 'badge-ok' : ''}`}
                      >
                        {s.estado}
                      </span>
                    </div>
                    {s.modalidad === 'combate' && !congelado && (
                      <button
                        onClick={() => generarLlave(s.id)}
                        disabled={ocupado}
                        className="btn btn-gold btn-sm shrink-0"
                      >
                        Llave
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
      </div>
      )}
    </main>
  );
}
