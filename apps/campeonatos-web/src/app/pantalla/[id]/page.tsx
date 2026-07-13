'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  pantallaAPI,
  esErrorPrivado,
  type PantallaDetalle,
  type PantallaJuez,
  type PantallaSeccion,
} from '@/lib/api';
import { Logo } from '@/components/Logo';
import { Avatar } from '@/components/Avatar';

type Apartado = 'info' | 'tatamis' | 'resultados';

const ROL_JUEZ: Record<string, string> = {
  arbitro: 'Juez Central',
  j1: 'Esquina 1',
  j2: 'Esquina 2',
  j3: 'Esquina 3',
  j4: 'Esquina 4',
  j5: 'Juez 5',
  j6: 'Juez 6',
  j7: 'Juez 7',
};

/**
 * Jueces participantes + competidores por sección, con los filtros granulares
 * de DINAMYT-PROJECT: búsqueda + modalidad + género + cinturón + edad + peso.
 * Los sub-filtros se derivan de las secciones reales y se REINICIAN al cambiar
 * de modalidad (para no dejar combinaciones imposibles).
 */
function InfoParticipantes({
  jueces,
  secciones,
}: {
  jueces: PantallaJuez[];
  secciones: PantallaSeccion[];
}) {
  const [modalidad, setModalidad] = useState<string>('todas');
  const [genero, setGenero] = useState<string>('todos');
  const [cinturon, setCinturon] = useState<string>('todos');
  const [edad, setEdad] = useState<string>('todas');
  const [peso, setPeso] = useState<string>('todos');
  const [busqueda, setBusqueda] = useState('');
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);

  // Al cambiar de modalidad se reinician los sub-filtros (estilo PROJECT).
  function cambiarModalidad(m: string) {
    setModalidad(m);
    setGenero('todos');
    setCinturon('todos');
    setEdad('todas');
    setPeso('todos');
  }

  const base =
    modalidad === 'todas' ? secciones : secciones.filter((s) => s.modalidad === modalidad);
  const unicos = (vals: (string | null)[]) =>
    [...new Set(vals.filter(Boolean) as string[])].sort();

  const modalidades = unicos(secciones.map((s) => s.modalidad));
  const generos = unicos(base.map((s) => s.genero));
  const cinturones = unicos(base.map((s) => s.cinturon));
  const edades = unicos(base.map((s) => s.rangoEdad));
  const pesos = unicos(base.map((s) => s.rangoPeso));

  const filtradas = base.filter((s) => {
    if (genero !== 'todos' && s.genero !== genero) return false;
    if (cinturon !== 'todos' && s.cinturon !== cinturon) return false;
    if (edad !== 'todas' && s.rangoEdad !== edad) return false;
    if (peso !== 'todos' && s.rangoPeso !== peso) return false;
    if (!busqueda.trim()) return true;
    const q = busqueda.toLowerCase();
    return (
      s.nombre.toLowerCase().includes(q) ||
      s.competidores.some(
        (c) => c.nombre.toLowerCase().includes(q) || c.club?.toLowerCase().includes(q),
      )
    );
  });
  const totalCompetidores = filtradas.reduce((n, s) => n + s.competidores.length, 0);

  const selectFiltro = (
    valor: string,
    onChange: (v: string) => void,
    opciones: string[],
    todos: string,
    etiquetas?: Record<string, string>,
  ) =>
    opciones.length > 0 && (
      <select value={valor} onChange={(e) => onChange(e.target.value)} className="w-auto">
        <option value={todos.startsWith('Todas') ? 'todas' : 'todos'}>{todos}</option>
        {opciones.map((o) => (
          <option key={o} value={o}>
            {etiquetas?.[o] ?? o}
          </option>
        ))}
      </select>
    );

  return (
    <>
      {/* Jueces */}
      {jueces.length > 0 && (
        <section className="card mb-6 p-5">
          <h2 className="mb-3 text-lg font-semibold">Jueces del campeonato</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {jueces.map((j, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--border)' }}
              >
                <span className="min-w-0 truncate font-semibold">{j.nombre}</span>
                <span className="badge badge-gold shrink-0">
                  {ROL_JUEZ[j.rol] ?? j.rol}
                  {j.tatami ? ` · T${j.tatami}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Competidores por sección, con filtros granulares */}
      {secciones.length > 0 && (
        <section className="card p-5">
          <h2 className="mb-3 text-lg font-semibold">Competidores por sección</h2>
          {/* En móvil, un botón «Filtros» abre la caja (estilo PROJECT); en
              escritorio los filtros van SIEMPRE en una sola línea. */}
          <button
            onClick={() => setFiltrosAbiertos((v) => !v)}
            className="filtros-toggle btn btn-outline btn-sm mb-2 w-full"
            aria-expanded={filtrosAbiertos}
          >
            {filtrosAbiertos ? '▲ Ocultar filtros' : '▼ Filtros y búsqueda'}
          </button>
          <div className={`filtros-caja ${filtrosAbiertos ? 'abierta' : ''} mb-2 flex-wrap gap-2`}>
            {selectFiltro(modalidad, cambiarModalidad, modalidades, 'Todas las modalidades', NOMBRE_MODALIDAD)}
            {selectFiltro(genero, setGenero, generos, 'Todos los géneros')}
            {selectFiltro(cinturon, setCinturon, cinturones, 'Todos los cinturones')}
            {selectFiltro(edad, setEdad, edades, 'Todas las edades')}
            {selectFiltro(peso, setPeso, pesos, 'Todos los pesos')}
          </div>
          <div
            className={`filtros-caja ${filtrosAbiertos ? 'abierta' : ''} mb-3 items-center gap-2`}
          >
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar competidor, club o sección…"
              className="min-w-0 flex-1"
            />
            <span className="badge shrink-0">
              {filtradas.length} secciones · {totalCompetidores} competidores
            </span>
          </div>
          <div className="grid gap-2">
            {filtradas.map((s) => (
              <details key={s.id} className="desplegable">
                <summary className="text-sm">
                  <span className="min-w-0 truncate">{s.nombre}</span>
                  <span className="badge shrink-0">{s.competidores.length} competidores</span>
                </summary>
                <ul className="border-t px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }}>
                  {s.competidores.map((c, i) => (
                    <li key={i} className="flex items-center gap-2 py-1">
                      <Avatar src={c.foto} nombre={c.nombre} size={28} />
                      <span className="min-w-0 flex-1 truncate">{c.nombre}</span>
                      <span className="shrink-0" style={{ color: 'var(--text-muted)' }}>
                        {c.club ?? ''}
                      </span>
                    </li>
                  ))}
                  {s.competidores.length === 0 && (
                    <li style={{ color: 'var(--text-muted)' }}>Aún sin competidores asignados.</li>
                  )}
                </ul>
              </details>
            ))}
            {filtradas.length === 0 && (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Nada coincide con el filtro.
              </p>
            )}
          </div>
        </section>
      )}
    </>
  );
}

const NOMBRE_MODALIDAD: Record<string, string> = {
  combate: 'Combate',
  figura_armas: 'Figura armas',
  figura_manos_libres: 'Figura manos libres',
  defensa_personal: 'Defensa personal',
  salto_altura: 'Salto alto',
  salto_longitud: 'Salto largo',
};

/**
 * Pantalla pública EN VIVO de un campeonato (para TV / proyector): estado de
 * cada tatami y resultados a medida que salen. Se refresca sola cada 5 s.
 */
export default function PantallaCampeonatoPage() {
  const params = useParams<{ id: string }>();
  const campId = params.id;
  const [data, setData] = useState<PantallaDetalle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [apartado, setApartado] = useState<Apartado>('info');
  // Campeonato privado: se pide el código de acceso una sola vez.
  const [privado, setPrivado] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [codigoOk, setCodigoOk] = useState<string | undefined>(undefined);

  useEffect(() => {
    let vivo = true;
    // Las FOTOS solo se piden para la vista de información (pesan); el
    // sondeo de tatamis/resultados cada 5 s viaja liviano.
    async function cargar(conFotos: boolean) {
      try {
        const d = await pantallaAPI(campId, codigoOk, conFotos);
        if (vivo) {
          setData(d);
          setPrivado(false);
          setError(null);
        }
      } catch (e) {
        if (!vivo) return;
        if (esErrorPrivado(e)) {
          setPrivado(true);
          setError(null);
        } else {
          setError('No se pudo conectar con el servidor.');
        }
      }
    }
    void cargar(apartado === 'info');
    const t = setInterval(() => void cargar(apartado === 'info'), 5000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [campId, codigoOk, apartado]);

  // Al entrar directo a un campeonato EN CURSO, lo primero son los tatamis.
  useEffect(() => {
    if (data?.campeonato.estado === 'EN_CURSO') setApartado('tatamis');
  }, [data?.campeonato.estado]);

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <Link href="/pantalla">
          <Logo size={44} subtitle="En vivo" />
        </Link>
        {data && (
          <div className="text-right">
            <h1 className="text-2xl font-bold sm:text-3xl" style={{ color: 'var(--gold)' }}>
              {data.campeonato.nombre}
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {[data.campeonato.ubicacion, data.campeonato.ciudad, data.campeonato.pais]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        )}
      </header>

      {error && <p className="msg-error">{error}</p>}
      {privado && (
        <div className="card mx-auto max-w-sm p-6 text-center">
          <p className="mb-3 font-bold" style={{ color: 'var(--gold)' }}>
            🔒 Campeonato privado
          </p>
          <p className="mb-3 text-sm" style={{ color: 'var(--text-muted)' }}>
            Ingresa el código de acceso que te compartió la organización.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setCodigoOk(codigo.trim());
            }}
            className="flex gap-2"
          >
            <input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="Código"
              className="flex-1"
            />
            <button type="submit" className="btn btn-gold">
              Entrar
            </button>
          </form>
        </div>
      )}
      {!data && !error && !privado && (
        <p style={{ color: 'var(--text-muted)' }}>Cargando…</p>
      )}

      {data && (
        <>
          {/* ── Apartados: Información | Tatamis | Resultados ─────────────── */}
          <nav className="mb-5 flex gap-1 border-b pb-2" style={{ borderColor: 'var(--border)' }}>
            {(
              [
                ['info', 'Información'],
                ['tatamis', `Tatamis (${data.tatamis.length})`],
                ['resultados', `Resultados (${data.resultados.length})`],
              ] as [Apartado, string][]
            ).map(([id, etiqueta]) => (
              <button
                key={id}
                onClick={() => setApartado(id)}
                className="rounded-lg px-4 py-2 text-sm font-semibold"
                style={
                  apartado === id
                    ? { background: 'var(--bg-elevated)', color: 'var(--gold)' }
                    : { color: 'var(--text-muted)' }
                }
              >
                {etiqueta}
              </button>
            ))}
          </nav>

          {/* ── Información general (visible sin registro, estilo PROJECT) ── */}
          {apartado === 'info' && (
          <section className="card mb-6 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`badge ${data.campeonato.estado === 'EN_CURSO' ? 'badge-live' : data.campeonato.estado === 'FINALIZADO' ? 'badge-ok' : 'badge-info'}`}>
                {data.campeonato.estado === 'EN_CURSO'
                  ? '● EN CURSO'
                  : data.campeonato.estado === 'LISTO'
                    ? 'PRÓXIMO'
                    : data.campeonato.estado}
              </span>
              {data.campeonato.alcance && <span className="badge">{data.campeonato.alcance}</span>}
            </div>
            {/* Fecha del campeonato, SIEMPRE visible en la información */}
            <p className="mt-3 text-sm font-semibold">
              📅{' '}
              {data.campeonato.fechaInicio ? (
                <>
                  {new Date(`${data.campeonato.fechaInicio}T12:00:00`).toLocaleDateString('es', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                  {data.campeonato.fechaFin &&
                    data.campeonato.fechaFin !== data.campeonato.fechaInicio && (
                      <>
                        {' '}
                        →{' '}
                        {new Date(`${data.campeonato.fechaFin}T12:00:00`).toLocaleDateString('es', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </>
                    )}
                </>
              ) : (
                <span style={{ color: 'var(--text-muted)' }}>Fecha por confirmar</span>
              )}
            </p>
            {data.campeonato.descripcion && (
              <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                {data.campeonato.descripcion}
              </p>
            )}
            {data.modalidades.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {data.modalidades.map((m) => (
                  <span key={m.modalidad} className="badge badge-gold">
                    {NOMBRE_MODALIDAD[m.modalidad] ?? m.modalidad}
                  </span>
                ))}
              </div>
            )}
            {/* Dirección completa del evento */}
            {(data.campeonato.ubicacion || data.campeonato.ciudad) && (
              <p className="mt-3 text-sm" style={{ color: 'var(--text-muted)' }}>
                📍{' '}
                {[data.campeonato.ubicacion, data.campeonato.ciudad, data.campeonato.pais]
                  .filter(Boolean)
                  .join(', ')}
              </p>
            )}
            {/* Inscripción abierta: cualquier persona con cuenta DINAMYT */}
            {(data.campeonato.estado === 'LISTO' || data.campeonato.estado === 'BORRADOR') && (
              <Link
                href={`/campeonatos/${campId}/inscribirme`}
                className="btn btn-gold mt-4 inline-block"
              >
                🥋 Inscribirme en este campeonato →
              </Link>
            )}
          </section>
          )}

          {/* ── Clubes asistentes ──────────────────────────────────────── */}
          {apartado === 'info' && data.clubes.length > 0 && (
            <section className="card mb-6 p-5">
              <h2 className="mb-3 text-lg font-semibold">
                Clubes asistentes{' '}
                <span className="badge badge-gold">{data.clubes.length}</span>
              </h2>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {data.clubes.map((c) => (
                  <li
                    key={c.nombre}
                    className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <span className="min-w-0 truncate font-semibold">{c.nombre}</span>
                    <span className="badge shrink-0">
                      {c.competidores} {c.competidores === 1 ? 'competidor' : 'competidores'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ── Jueces + competidores por sección (estilo PROJECT) ────────── */}
          {apartado === 'info' && (
            <InfoParticipantes jueces={data.jueces} secciones={data.secciones} />
          )}

          {/* ── Tatamis en vivo ────────────────────────────────────────── */}
          {apartado === 'tatamis' && (
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.tatamis.map((t) => (
              <article
                key={t.numero}
                className="card p-5"
                style={t.activo === false ? { opacity: 0.55 } : undefined}
              >
                <header className="mb-2 flex items-center justify-between">
                  <h2 className="text-xl font-bold">Tatami {t.numero}</h2>
                  <span
                    className={`badge ${t.activo === false ? '' : t.estado === 'OCUPADO' ? 'badge-live' : 'badge-ok'}`}
                  >
                    {t.activo === false
                      ? 'DESACTIVADO'
                      : t.estado === 'OCUPADO'
                        ? '● EN VIVO'
                        : 'LIBRE'}
                  </span>
                </header>
                {t.enCurso ? (
                  <>
                    <p className="text-lg font-semibold">{t.enCurso.nombre}</p>
                    <span className="badge badge-gold mt-1">
                      {NOMBRE_MODALIDAD[t.enCurso.modalidad] ?? t.enCurso.modalidad}
                    </span>
                  </>
                ) : (
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Sin sección en curso.
                  </p>
                )}
                {t.enEspera > 0 && (
                  <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                    En espera: {t.enEspera}
                  </p>
                )}
                {/* La pantalla del tatami solo tiene sentido con el evento EN
                    CURSO: en «próximo» aún no hay nada que proyectar. */}
                {t.activo !== false && data.campeonato.estado === 'EN_CURSO' && (
                  <div
                    className="mt-4 border-t pt-3"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <Link
                      href={`/tatami/${t.id}?rol=pantalla`}
                      className="btn btn-outline btn-sm w-full"
                      style={{ borderColor: 'var(--gold)', color: 'var(--gold)' }}
                    >
                      📺 Ver pantalla del tatami →
                    </Link>
                  </div>
                )}
              </article>
            ))}
            {data.tatamis.length === 0 && (
              <p style={{ color: 'var(--text-muted)' }}>Aún no hay tatamis configurados.</p>
            )}
          </section>
          )}

          {/* ── Resultados ─────────────────────────────────────────────── */}
          {apartado === 'resultados' && (
          <section>
            <h2 className="mb-3 text-xl font-bold" style={{ color: 'var(--gold)' }}>
              Resultados
            </h2>
            {data.resultados.length === 0 && (
              <p style={{ color: 'var(--text-muted)' }}>
                Todavía no hay resultados registrados.
              </p>
            )}
            <ul className="grid gap-2">
              {data.resultados.map((r, i) => (
                <li
                  key={i}
                  className="card flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{r.seccion}</p>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {NOMBRE_MODALIDAD[r.modalidad] ?? r.modalidad}
                    </span>
                  </div>
                  {r.modalidad === 'combate' && (
                    <div className="flex items-center gap-3 text-lg font-bold">
                      <span style={{ color: 'var(--hong)' }}>{r.marcadorHong ?? '–'}</span>
                      <span style={{ color: 'var(--text-muted)' }}>:</span>
                      <span style={{ color: 'var(--chung)' }}>{r.marcadorChung ?? '–'}</span>
                      {r.ganador && (
                        <span className="flex items-center gap-1.5">
                          {r.ganador === 'hong' && r.hong && (
                            <Avatar src={r.fotoHong} nombre={r.hong} size={26} />
                          )}
                          <span className={`badge ${r.ganador === 'empate' ? '' : 'badge-gold'}`}>
                            {r.ganador === 'hong'
                              ? `Gana rojo${r.hong ? ` · ${r.hong}` : ''}`
                              : r.ganador === 'chung'
                                ? 'Gana azul'
                                : 'Empate'}
                          </span>
                        </span>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
          )}
        </>
      )}
    </main>
  );
}
