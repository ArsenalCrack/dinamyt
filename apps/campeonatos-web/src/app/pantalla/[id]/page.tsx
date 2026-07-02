'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { pantallaAPI, esErrorPrivado, type PantallaDetalle } from '@/lib/api';
import { Logo } from '@/components/Logo';

type Apartado = 'info' | 'tatamis' | 'resultados';

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
    async function cargar() {
      try {
        const d = await pantallaAPI(campId, codigoOk);
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
    void cargar();
    const t = setInterval(cargar, 5000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [campId, codigoOk]);

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
              {data.campeonato.fechaInicio && (
                <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  {data.campeonato.fechaInicio}
                  {data.campeonato.fechaFin &&
                  data.campeonato.fechaFin !== data.campeonato.fechaInicio
                    ? ` → ${data.campeonato.fechaFin}`
                    : ''}
                </span>
              )}
            </div>
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
          </section>
          )}

          {/* ── Tatamis en vivo ────────────────────────────────────────── */}
          {apartado === 'tatamis' && (
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.tatamis.map((t) => (
              <article key={t.numero} className="card p-5">
                <header className="mb-2 flex items-center justify-between">
                  <h2 className="text-xl font-bold">Tatami {t.numero}</h2>
                  <span className={`badge ${t.estado === 'OCUPADO' ? 'badge-live' : 'badge-ok'}`}>
                    {t.estado === 'OCUPADO' ? '● EN VIVO' : 'LIBRE'}
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
                <Link
                  href={`/tatami/${t.id}?rol=pantalla`}
                  className="btn btn-outline btn-sm mt-3"
                  style={{ borderColor: 'var(--gold)', color: 'var(--gold)' }}
                >
                  📺 Ver pantalla del tatami →
                </Link>
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
                        <span className={`badge ${r.ganador === 'empate' ? '' : 'badge-gold'}`}>
                          {r.ganador === 'hong'
                            ? `Gana rojo${r.hong ? ` · ${r.hong}` : ''}`
                            : r.ganador === 'chung'
                              ? 'Gana azul'
                              : 'Empate'}
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
