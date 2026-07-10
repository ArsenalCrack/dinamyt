'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  obtenerToken,
  getArtesAPI,
  getContenidosAPI,
  marcarVistoAPI,
  extraerError,
  urlEmbed,
  colorCinturon,
  type Arte,
  type Grado,
  type Contenido,
} from '@/lib/api';
import { getRolEfectivo } from '@/lib/session';

const ETIQUETA_TIPO: Record<Contenido['type'], string> = {
  documento: '📄 Documento',
  video: '🎬 Video',
  imagen: '🖼️ Imagen',
  texto: '📖 Lectura',
};

/** Visor de una unidad de contenido según su tipo (RF-ACA-10/12). */
function Visor({ unidad }: { unidad: Contenido }) {
  if (unidad.type === 'texto') {
    return (
      <p style={{ whiteSpace: 'pre-wrap', fontSize: '0.95rem', lineHeight: 1.6 }}>
        {unidad.body}
      </p>
    );
  }
  if (unidad.type === 'imagen' && unidad.url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={unidad.url} alt={unidad.title} style={{ maxWidth: '100%', borderRadius: '0.5rem' }} />;
  }
  if (unidad.type === 'video' && unidad.url) {
    const embed = urlEmbed(unidad.url);
    if (embed) {
      return (
        <div style={{ position: 'relative', paddingTop: '56.25%' }}>
          <iframe
            src={embed}
            title={unidad.title}
            allowFullScreen
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              border: 0,
              borderRadius: '0.5rem',
            }}
          />
        </div>
      );
    }
  }
  return (
    <a className="btn btn-gold" href={unidad.url ?? '#'} target="_blank" rel="noreferrer">
      Abrir {unidad.type === 'documento' ? 'documento' : 'recurso'} ↗
    </a>
  );
}

export default function Aprender() {
  const router = useRouter();
  const [rol, setRol] = useState<string | null>(null);
  const [artes, setArtes] = useState<Arte[]>([]);
  const [arteSel, setArteSel] = useState<Arte | null>(null);
  const [gradoActual, setGradoActual] = useState<Grado | null>(null);
  const [contenidos, setContenidos] = useState<Contenido[]>([]);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!obtenerToken()) {
      router.replace('/login');
      return;
    }
    void (async () => {
      const r = await getRolEfectivo();
      setRol(r);
      try {
        const lista = await getArtesAPI();
        setArtes(lista);
        setArteSel(lista[0] ?? null);
      } catch (err) {
        setError(extraerError(err));
      }
    })();
  }, [router]);

  const cargarContenidos = useCallback(
    async (arte: Arte) => {
      setCargando(true);
      setError('');
      try {
        const data = await getContenidosAPI(arte.id);
        setContenidos(data.contenidos);
        setGradoActual(data.gradoActual ?? null);
      } catch (err) {
        setContenidos([]);
        setGradoActual(null);
        setError(extraerError(err));
      } finally {
        setCargando(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (arteSel) void cargarContenidos(arteSel);
  }, [arteSel, cargarContenidos]);

  async function abrir(unidad: Contenido) {
    setAbierta(abierta === unidad.id ? null : unidad.id);
    // RF-ACA-15: la primera consulta del estudiante marca la unidad como vista.
    if (rol === 'student' && !unidad.visto) {
      try {
        await marcarVistoAPI(unidad.id);
        setContenidos((prev) =>
          prev.map((c) => (c.id === unidad.id ? { ...c, visto: true } : c)),
        );
      } catch {
        /* la vista es best-effort */
      }
    }
  }

  const grados = arteSel?.grados ?? [];
  const ordenActual = gradoActual?.orderIndex ?? 0;

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '1.5rem 1rem 3rem' }}>
      <p className="eyebrow" style={{ marginBottom: '0.3rem' }}>Material por grado</p>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap',
          marginBottom: '0.5rem',
        }}
      >
        <h1 className="display" style={{ fontSize: '1.7rem' }}>Aprender</h1>
        {artes.length > 1 && (
          <select
            value={arteSel?.id ?? ''}
            onChange={(e) => setArteSel(artes.find((a) => a.id === e.target.value) ?? null)}
            style={{ maxWidth: 240 }}
          >
            {artes.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        )}
      </div>
      {arteSel && (
        <p className="muted" style={{ fontSize: '0.9rem', marginBottom: '1.25rem' }}>
          {arteSel.name}
          {arteSel.federation ? ` · ${arteSel.federation}` : ''}
          {gradoActual && (
            <>
              {' — tu grado: '}
              <span className="badge badge-gold">{gradoActual.name}</span>
            </>
          )}
        </p>
      )}

      {error && (
        <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
          <p className="msg-error" style={{ marginBottom: '0.5rem' }}>{error}</p>
          <p className="muted" style={{ fontSize: '0.85rem' }}>
            Si aún no estás matriculado, pide a tu maestro que te matricule con tu
            correo. Los maestros gestionan su material desde el{' '}
            <Link href="/maestro" style={{ color: 'var(--gold)' }}>panel del maestro</Link>.
          </p>
        </div>
      )}

      {cargando && !error && <p className="muted">Cargando material…</p>}

      {!cargando &&
        grados.map((g) => {
          // Estudiante: los grados superiores se muestran BLOQUEADOS (RF-ACA-14).
          const bloqueado = rol === 'student' && gradoActual !== null && g.orderIndex > ordenActual;
          const unidades = contenidos.filter((c) => c.gradeId === g.id);
          if (rol === 'student' && gradoActual === null) return null;
          return (
            <section key={g.id} style={{ marginBottom: '1.25rem', opacity: bloqueado ? 0.55 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
                <span
                  aria-hidden
                  style={{
                    width: 26,
                    height: 10,
                    borderRadius: 3,
                    background: colorCinturon(g.name),
                    border: '1px solid var(--border-strong)',
                    display: 'inline-block',
                  }}
                />
                <h2 className="display" style={{ fontSize: '1.05rem' }}>
                  Cinturón {g.name}
                </h2>
                {g.groupName && <span className="badge">{g.groupName}</span>}
                {bloqueado && <span className="badge">🔒 Bloqueado</span>}
                {!bloqueado && g.orderIndex === ordenActual && rol === 'student' && (
                  <span className="badge badge-gold">Tu grado</span>
                )}
              </div>

              {bloqueado ? (
                <p className="muted" style={{ fontSize: '0.85rem', paddingLeft: '2.3rem' }}>
                  Se desbloquea cuando tu maestro certifique tu avance a este grado.
                </p>
              ) : unidades.length === 0 ? (
                <p className="muted" style={{ fontSize: '0.85rem', paddingLeft: '2.3rem' }}>
                  Aún no hay material publicado para este grado.
                </p>
              ) : (
                <div style={{ display: 'grid', gap: '0.6rem' }}>
                  {unidades.map((u) => (
                    <div key={u.id} className="card" style={{ padding: '0.9rem 1.1rem' }}>
                      <button
                        onClick={() => void abrir(u)}
                        style={{
                          all: 'unset',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.6rem',
                          width: '100%',
                          flexWrap: 'wrap',
                        }}
                      >
                        <span className="badge">{ETIQUETA_TIPO[u.type]}</span>
                        <span style={{ fontWeight: 600 }}>{u.title}</span>
                        <span style={{ marginLeft: 'auto', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                          {u.visto && <span className="badge badge-ok">✓ Visto</span>}
                          <span className="muted">{abierta === u.id ? '▲' : '▼'}</span>
                        </span>
                      </button>
                      {abierta === u.id && (
                        <div style={{ marginTop: '0.9rem' }}>
                          {u.description && (
                            <p className="muted" style={{ fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                              {u.description}
                            </p>
                          )}
                          <Visor unidad={u} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
    </main>
  );
}
