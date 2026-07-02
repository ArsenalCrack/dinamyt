'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { pantallaAPI, type PantallaDetalle } from '@/lib/api';
import { Logo } from '@/components/Logo';

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

  useEffect(() => {
    let vivo = true;
    async function cargar() {
      try {
        const d = await pantallaAPI(campId);
        if (vivo) {
          setData(d);
          setError(null);
        }
      } catch {
        if (vivo) setError('No se pudo conectar con el servidor.');
      }
    }
    void cargar();
    const t = setInterval(cargar, 5000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [campId]);

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
      {!data && !error && <p style={{ color: 'var(--text-muted)' }}>Cargando…</p>}

      {data && (
        <>
          {/* ── Tatamis en vivo ────────────────────────────────────────── */}
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
              </article>
            ))}
            {data.tatamis.length === 0 && (
              <p style={{ color: 'var(--text-muted)' }}>Aún no hay tatamis configurados.</p>
            )}
          </section>

          {/* ── Resultados ─────────────────────────────────────────────── */}
          <section className="mt-10">
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
        </>
      )}
    </main>
  );
}
