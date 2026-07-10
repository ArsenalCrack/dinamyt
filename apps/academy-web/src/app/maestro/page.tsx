'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  obtenerToken,
  getArtesAPI,
  getContenidosAPI,
  crearContenidoAPI,
  crearContenidoArchivoAPI,
  editarContenidoAPI,
  borrarContenidoAPI,
  getEvaluacionesAPI,
  crearEvaluacionAPI,
  borrarEvaluacionAPI,
  getIntentosAPI,
  getEstudiantesAPI,
  matricularAPI,
  avanzarGradoAPI,
  getAnunciosAPI,
  crearAnuncioAPI,
  borrarAnuncioAPI,
  getFigurasRefAPI,
  subirFiguraRefAPI,
  borrarFiguraRefAPI,
  getIntentosFiguraAPI,
  getHistorialAPI,
  getBancoAPI,
  guardarEnBancoAPI,
  borrarDelBancoAPI,
  archivoUrl,
  extraerError,
  colorCinturon,
  type Arte,
  type Contenido,
  type Evaluacion,
  type Intento,
  type EstudiantePanel,
  type Anuncio,
  type FiguraRef,
  type IntentoFigura,
  type EventoHistorial,
  type PreguntaBanco,
} from '@/lib/api';
import { getRolEfectivo } from '@/lib/session';
import { Avatar } from '@/components/Avatar';

type Tab =
  | 'contenidos'
  | 'evaluaciones'
  | 'estudiantes'
  | 'anuncios'
  | 'figuras'
  | 'historial';

const TIPOS = [
  { valor: 'texto', etiqueta: '📖 Lectura (texto)' },
  { valor: 'video', etiqueta: '🎬 Video (YouTube/Drive)' },
  { valor: 'documento', etiqueta: '📄 Documento (URL)' },
  { valor: 'imagen', etiqueta: '🖼️ Imagen (URL)' },
] as const;

// ── Pestaña: Contenidos (RF-ACA-10..13) ──────────────────────────────────────
function TabContenidos({ arte }: { arte: Arte }) {
  const [gradoId, setGradoId] = useState(arte.grados[0]?.id ?? '');
  const [lista, setLista] = useState<Contenido[]>([]);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  // Formulario (sirve para crear y para editar)
  const [editando, setEditando] = useState<string | null>(null);
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [tipo, setTipo] = useState<Contenido['type']>('texto');
  const [url, setUrl] = useState('');
  const [cuerpo, setCuerpo] = useState('');
  const [orden, setOrden] = useState(0);
  // Origen del recurso: enlace externo o archivo subido desde el dispositivo.
  const [origen, setOrigen] = useState<'url' | 'archivo'>('url');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);

  const ACCEPT: Record<string, string> = {
    video: 'video/mp4,video/webm,video/quicktime',
    imagen: 'image/jpeg,image/png,image/webp,image/gif',
    documento: 'application/pdf',
  };

  const cargar = useCallback(async () => {
    try {
      const data = await getContenidosAPI(arte.id, gradoId || undefined);
      setLista(data.contenidos);
    } catch (err) {
      setError(extraerError(err));
    }
  }, [arte.id, gradoId]);

  useEffect(() => {
    setGradoId(arte.grados[0]?.id ?? '');
  }, [arte]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  function limpiar() {
    setEditando(null);
    setTitulo('');
    setDescripcion('');
    setTipo('texto');
    setUrl('');
    setCuerpo('');
    setOrden(0);
    setOrigen('url');
    setArchivo(null);
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError('');
    setOk('');
    // Publicar SUBIENDO el archivo (video/imagen/PDF) desde el dispositivo.
    if (!editando && tipo !== 'texto' && origen === 'archivo') {
      if (!archivo) {
        setError('Adjunta el archivo que quieres publicar.');
        return;
      }
      setSubiendo(true);
      try {
        await crearContenidoArchivoAPI({
          martialArtId: arte.id,
          gradeId: gradoId,
          title: titulo,
          description: descripcion || undefined,
          orderIndex: orden,
          file: archivo,
        });
        setOk('Archivo subido y unidad publicada (validado por seguridad).');
        limpiar();
        await cargar();
      } catch (err) {
        setError(extraerError(err));
      } finally {
        setSubiendo(false);
      }
      return;
    }
    try {
      const body = {
        martialArtId: arte.id,
        gradeId: gradoId,
        title: titulo,
        description: descripcion || null,
        type: tipo,
        url: url || null,
        body: cuerpo || null,
        orderIndex: orden,
      };
      if (editando) {
        await editarContenidoAPI(editando, body);
        setOk('Unidad actualizada.');
      } else {
        await crearContenidoAPI(body);
        setOk('Unidad publicada.');
      }
      limpiar();
      await cargar();
    } catch (err) {
      setError(extraerError(err));
    }
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar esta unidad? El historial de evaluaciones no se toca.')) return;
    try {
      await borrarContenidoAPI(id);
      await cargar();
    } catch (err) {
      setError(extraerError(err));
    }
  }

  function editar(u: Contenido) {
    setEditando(u.id);
    setTitulo(u.title);
    setDescripcion(u.description ?? '');
    setTipo(u.type);
    setUrl(u.url ?? '');
    setCuerpo(u.body ?? '');
    setOrden(u.orderIndex);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <form onSubmit={guardar} className="card" style={{ padding: '1.1rem 1.25rem' }}>
        <h3 className="eyebrow" style={{ marginBottom: '0.7rem' }}>
          {editando ? 'Editar unidad' : 'Publicar unidad de contenido'}
        </h3>
        <div style={{ display: 'grid', gap: '0.7rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <div>
            <label className="muted" style={{ fontSize: '0.78rem' }}>Grado</label>
            <select value={gradoId} onChange={(e) => setGradoId(e.target.value)} style={{ marginTop: '0.25rem' }}>
              {arte.grados.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="muted" style={{ fontSize: '0.78rem' }}>Tipo</label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as Contenido['type'])}
              style={{ marginTop: '0.25rem' }}
            >
              {TIPOS.map((t) => (
                <option key={t.valor} value={t.valor}>{t.etiqueta}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="muted" style={{ fontSize: '0.78rem' }}>Orden</label>
            <input
              type="number"
              value={orden}
              onChange={(e) => setOrden(parseInt(e.target.value, 10) || 0)}
              style={{ marginTop: '0.25rem' }}
            />
          </div>
        </div>
        <label className="muted" style={{ fontSize: '0.78rem', display: 'block', marginTop: '0.7rem' }}>Título</label>
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} required maxLength={160} style={{ marginTop: '0.25rem' }} />
        <label className="muted" style={{ fontSize: '0.78rem', display: 'block', marginTop: '0.7rem' }}>Descripción (opcional)</label>
        <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={300} style={{ marginTop: '0.25rem' }} />
        {tipo === 'texto' ? (
          <>
            <label className="muted" style={{ fontSize: '0.78rem', display: 'block', marginTop: '0.7rem' }}>Contenido</label>
            <textarea rows={5} value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} maxLength={8000} style={{ marginTop: '0.25rem' }} />
          </>
        ) : (
          <>
            {!editando && (
              <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.7rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={origen === 'archivo' ? 'btn btn-gold btn-sm' : 'btn btn-outline btn-sm'}
                  onClick={() => setOrigen('archivo')}
                >
                  ⬆ Subir desde mi dispositivo
                </button>
                <button
                  type="button"
                  className={origen === 'url' ? 'btn btn-gold btn-sm' : 'btn btn-outline btn-sm'}
                  onClick={() => setOrigen('url')}
                >
                  🔗 Enlace externo
                </button>
              </div>
            )}
            {!editando && origen === 'archivo' ? (
              <>
                <label className="muted" style={{ fontSize: '0.78rem', display: 'block', marginTop: '0.7rem' }}>
                  Archivo ({tipo === 'video' ? 'MP4/WebM/MOV, máx. 300 MB' : tipo === 'imagen' ? 'JPG/PNG/WebP/GIF, máx. 10 MB' : 'PDF, máx. 25 MB'})
                </label>
                <input
                  type="file"
                  accept={ACCEPT[tipo]}
                  onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
                  style={{ marginTop: '0.25rem' }}
                />
                <p className="muted" style={{ fontSize: '0.72rem', marginTop: '0.3rem' }}>
                  Cada archivo se valida por seguridad (tipo real y tamaño) antes de publicarse.
                </p>
              </>
            ) : (
              <>
                <label className="muted" style={{ fontSize: '0.78rem', display: 'block', marginTop: '0.7rem' }}>
                  URL {tipo === 'video' ? '(YouTube o Google Drive)' : '(enlace externo)'}
                </label>
                <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} maxLength={300} style={{ marginTop: '0.25rem' }} />
              </>
            )}
          </>
        )}
        {error && <p className="msg-error" style={{ marginTop: '0.7rem', fontSize: '0.85rem' }}>{error}</p>}
        {ok && <p className="msg-ok" style={{ marginTop: '0.7rem', fontSize: '0.85rem' }}>{ok}</p>}
        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.9rem' }}>
          <button className="btn btn-gold" type="submit" disabled={subiendo}>
            {subiendo ? '⏳ Subiendo…' : editando ? 'Guardar cambios' : 'Publicar'}
          </button>
          {editando && (
            <button type="button" className="btn btn-outline" onClick={limpiar}>
              Cancelar edición
            </button>
          )}
        </div>
      </form>

      <div className="card" style={{ padding: '1.1rem 1.25rem' }}>
        <h3 className="eyebrow" style={{ marginBottom: '0.7rem' }}>
          Unidades del grado {arte.grados.find((g) => g.id === gradoId)?.name ?? ''}
        </h3>
        {lista.length === 0 ? (
          <p className="muted" style={{ fontSize: '0.85rem' }}>Sin unidades en este grado.</p>
        ) : (
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th>Orden</th>
                  <th>Título</th>
                  <th>Tipo</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((u) => (
                  <tr key={u.id}>
                    <td className="mono">{u.orderIndex}</td>
                    <td>{u.title}</td>
                    <td><span className="badge">{u.type}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button className="btn btn-outline btn-sm" onClick={() => editar(u)}>Editar</button>
                        <button className="btn btn-danger btn-sm" onClick={() => void eliminar(u.id)}>Eliminar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Pestaña: Evaluaciones (RF-ACA-16..18, 20) ────────────────────────────────
interface PreguntaForm {
  type: 'opcion_multiple' | 'evidencia';
  prompt: string;
  points: number;
  opciones: { text: string; isCorrect: boolean }[];
  /** Rúbrica (evidencia): la nota de la pregunta = suma de criterios. */
  criterios: { label: string; maxPoints: number }[];
}

function TabEvaluaciones({ arte }: { arte: Arte }) {
  const [lista, setLista] = useState<Evaluacion[]>([]);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [creando, setCreando] = useState(false);
  const [intentosDe, setIntentosDe] = useState<string | null>(null);
  const [intentos, setIntentos] = useState<Intento[]>([]);
  // Formulario
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [gradoId, setGradoId] = useState(arte.grados[0]?.id ?? '');
  const [maxIntentos, setMaxIntentos] = useState(1);
  const [pesoMC, setPesoMC] = useState(50);
  const [tipo, setTipo] = useState<'cuestionario' | 'tarea' | 'actividad'>('cuestionario');
  const [vence, setVence] = useState('');
  const [preguntas, setPreguntas] = useState<PreguntaForm[]>([]);
  const [banco, setBanco] = useState<PreguntaBanco[]>([]);
  const [bancoAbierto, setBancoAbierto] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setLista(await getEvaluacionesAPI(arte.id));
    } catch (err) {
      setError(extraerError(err));
    }
  }, [arte.id]);

  useEffect(() => {
    setGradoId(arte.grados[0]?.id ?? '');
    setIntentosDe(null);
    void cargar();
  }, [arte, cargar]);

  function agregarPregunta(
    type: PreguntaForm['type'],
    base?: Partial<PreguntaForm>,
  ) {
    setPreguntas([
      ...preguntas,
      {
        type,
        prompt: base?.prompt ?? '',
        points: base?.points ?? (type === 'evidencia' ? 2 : 1),
        opciones:
          base?.opciones ??
          (type === 'opcion_multiple'
            ? [
                { text: '', isCorrect: true },
                { text: '', isCorrect: false },
              ]
            : []),
        criterios: base?.criterios ?? [],
      },
    ]);
  }
  function actualizarPregunta(i: number, cambio: Partial<PreguntaForm>) {
    setPreguntas(preguntas.map((p, j) => (j === i ? { ...p, ...cambio } : p)));
  }

  async function crear(e: FormEvent) {
    e.preventDefault();
    setError('');
    setOk('');
    try {
      await crearEvaluacionAPI({
        martialArtId: arte.id,
        gradeId: gradoId,
        title: titulo,
        description: descripcion || null,
        kind: tipo,
        dueAt: vence ? new Date(vence).toISOString() : null,
        maxAttempts: maxIntentos,
        mcWeight: pesoMC,
        preguntas,
      });
      setOk('Evaluación publicada.');
      setTitulo('');
      setDescripcion('');
      setPreguntas([]);
      setCreando(false);
      await cargar();
    } catch (err) {
      setError(extraerError(err));
    }
  }

  async function verIntentos(id: string) {
    if (intentosDe === id) {
      setIntentosDe(null);
      return;
    }
    try {
      setIntentos(await getIntentosAPI(id));
      setIntentosDe(id);
    } catch (err) {
      setError(extraerError(err));
    }
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar esta evaluación? Los intentos previos se conservan.')) return;
    try {
      await borrarEvaluacionAPI(id);
      await cargar();
    } catch (err) {
      setError(extraerError(err));
    }
  }

  const nombreGrado = (id: string) => arte.grados.find((g) => g.id === id)?.name ?? '';

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {!creando ? (
        <button className="btn btn-gold" style={{ justifySelf: 'start' }} onClick={() => setCreando(true)}>
          ＋ Nueva evaluación
        </button>
      ) : (
        <form onSubmit={crear} className="card" style={{ padding: '1.1rem 1.25rem' }}>
          <h3 className="eyebrow" style={{ marginBottom: '0.7rem' }}>Nueva evaluación</h3>
          <div style={{ display: 'grid', gap: '0.7rem', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <div>
              <label className="muted" style={{ fontSize: '0.78rem' }}>Tipo</label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as typeof tipo)}
                style={{ marginTop: '0.25rem' }}
              >
                <option value="cuestionario">Cuestionario (opción múltiple)</option>
                <option value="tarea">Tarea (entregable)</option>
                <option value="actividad">Actividad (mixta)</option>
              </select>
            </div>
            <div>
              <label className="muted" style={{ fontSize: '0.78rem' }}>Fecha límite (opcional)</label>
              <input
                type="datetime-local"
                value={vence}
                onChange={(e) => setVence(e.target.value)}
                style={{ marginTop: '0.25rem' }}
              />
            </div>
            <div>
              <label className="muted" style={{ fontSize: '0.78rem' }}>Grado</label>
              <select value={gradoId} onChange={(e) => setGradoId(e.target.value)} style={{ marginTop: '0.25rem' }}>
                {arte.grados.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="muted" style={{ fontSize: '0.78rem' }}>Intentos máximos</label>
              <input
                type="number"
                min={1}
                value={maxIntentos}
                onChange={(e) => setMaxIntentos(Math.max(1, parseInt(e.target.value, 10) || 1))}
                style={{ marginTop: '0.25rem' }}
              />
            </div>
            <div>
              <label className="muted" style={{ fontSize: '0.78rem' }}>Peso opción múltiple (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={pesoMC}
                onChange={(e) => setPesoMC(Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                style={{ marginTop: '0.25rem' }}
              />
            </div>
          </div>
          <label className="muted" style={{ fontSize: '0.78rem', display: 'block', marginTop: '0.7rem' }}>Título</label>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} required maxLength={160} style={{ marginTop: '0.25rem' }} />
          <label className="muted" style={{ fontSize: '0.78rem', display: 'block', marginTop: '0.7rem' }}>Descripción (opcional)</label>
          <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={300} style={{ marginTop: '0.25rem' }} />

          {preguntas.map((p, i) => (
            <div key={i} className="card" style={{ padding: '0.9rem 1rem', marginTop: '0.9rem', background: 'var(--bg-elevated)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                <span className="badge badge-gold">
                  {p.type === 'opcion_multiple' ? 'Opción múltiple' : 'Evidencia multimedia'}
                </span>
                <label className="muted" style={{ fontSize: '0.75rem', marginLeft: 'auto' }}>
                  Puntos{' '}
                  <input
                    type="number"
                    min={1}
                    value={p.points}
                    onChange={(e) => actualizarPregunta(i, { points: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                    style={{ width: 70, display: 'inline-block', marginLeft: '0.3rem' }}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => setPreguntas(preguntas.filter((_, j) => j !== i))}
                >
                  Quitar
                </button>
              </div>
              <input
                placeholder="Enunciado de la pregunta…"
                maxLength={500}
                value={p.prompt}
                onChange={(e) => actualizarPregunta(i, { prompt: e.target.value })}
                required
              />
              {p.type === 'opcion_multiple' && (
                <div style={{ display: 'grid', gap: '0.4rem', marginTop: '0.6rem' }}>
                  {p.opciones.map((o, j) => (
                    <div key={j} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input
                        type="radio"
                        name={`correcta-${i}`}
                        title="Opción correcta"
                        checked={o.isCorrect}
                        onChange={() =>
                          actualizarPregunta(i, {
                            opciones: p.opciones.map((op, k) => ({ ...op, isCorrect: k === j })),
                          })
                        }
                      />
                      <input
                        placeholder={`Opción ${j + 1}`}
                        maxLength={200}
                        value={o.text}
                        onChange={(e) =>
                          actualizarPregunta(i, {
                            opciones: p.opciones.map((op, k) =>
                              k === j ? { ...op, text: e.target.value } : op,
                            ),
                          })
                        }
                        required
                      />
                      {p.opciones.length > 2 && (
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() =>
                            actualizarPregunta(i, { opciones: p.opciones.filter((_, k) => k !== j) })
                          }
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    style={{ justifySelf: 'start' }}
                    onClick={() =>
                      actualizarPregunta(i, {
                        opciones: [...p.opciones, { text: '', isCorrect: false }],
                      })
                    }
                  >
                    ＋ Opción
                  </button>
                  <p className="muted" style={{ fontSize: '0.72rem' }}>
                    Marca con el círculo la opción correcta (calificación automática).
                  </p>
                </div>
              )}
              {p.type === 'evidencia' && (
                <div style={{ marginTop: '0.6rem' }}>
                  {/* Rúbrica: criterios con puntaje; la nota = suma. */}
                  {p.criterios.map((c, j) => (
                    <div key={j} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <input
                        placeholder={`Criterio ${j + 1} (ej. Postura y equilibrio)`}
                        maxLength={160}
                        value={c.label}
                        onChange={(e) =>
                          actualizarPregunta(i, {
                            criterios: p.criterios.map((cr, k) =>
                              k === j ? { ...cr, label: e.target.value } : cr,
                            ),
                          })
                        }
                        required
                      />
                      <input
                        type="number"
                        min={1}
                        title="Puntos del criterio"
                        value={c.maxPoints}
                        onChange={(e) =>
                          actualizarPregunta(i, {
                            criterios: p.criterios.map((cr, k) =>
                              k === j
                                ? { ...cr, maxPoints: Math.max(1, parseInt(e.target.value, 10) || 1) }
                                : cr,
                            ),
                          })
                        }
                        style={{ width: 74 }}
                      />
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() =>
                          actualizarPregunta(i, { criterios: p.criterios.filter((_, k) => k !== j) })
                        }
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() =>
                      actualizarPregunta(i, {
                        criterios: [...p.criterios, { label: '', maxPoints: 1 }],
                      })
                    }
                  >
                    ＋ Criterio de rúbrica
                  </button>
                  <p className="muted" style={{ fontSize: '0.72rem', marginTop: '0.4rem' }}>
                    {p.criterios.length > 0
                      ? `Con rúbrica: la pregunta vale ${p.criterios.reduce((s, c) => s + c.maxPoints, 0)} pts (suma de criterios) y calificas criterio por criterio.`
                      : `Sin rúbrica: calificas la evidencia de 0 a ${p.points} directamente.`}
                  </p>
                </div>
              )}
              <button
                type="button"
                className="btn btn-outline btn-sm"
                style={{ marginTop: '0.5rem' }}
                title="Guardar esta pregunta en tu banco para reutilizarla"
                onClick={async () => {
                  try {
                    await guardarEnBancoAPI({
                      martialArtId: arte.id,
                      type: p.type,
                      prompt: p.prompt,
                      points: p.points,
                      opciones: p.type === 'opcion_multiple' ? p.opciones : undefined,
                      criterios: p.type === 'evidencia' ? p.criterios : undefined,
                    });
                    setOk('Pregunta guardada en tu banco.');
                  } catch (err) {
                    setError(extraerError(err));
                  }
                }}
              >
                🏦 Guardar en mi banco
              </button>
            </div>
          ))}

          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '0.9rem' }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => agregarPregunta('opcion_multiple')}>
              ＋ Pregunta de opción múltiple
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => agregarPregunta('evidencia')}>
              ＋ Pregunta de evidencia
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={async () => {
                try {
                  setBanco(await getBancoAPI(arte.id));
                  setBancoAbierto(!bancoAbierto);
                } catch (err) {
                  setError(extraerError(err));
                }
              }}
            >
              🏦 Desde mi banco ({bancoAbierto ? 'ocultar' : 'ver'})
            </button>
          </div>
          {bancoAbierto && (
            <div className="card" style={{ padding: '0.8rem 1rem', marginTop: '0.7rem', background: 'var(--bg-elevated)' }}>
              {banco.length === 0 ? (
                <p className="muted" style={{ fontSize: '0.8rem' }}>
                  Tu banco está vacío: guarda preguntas con «🏦 Guardar en mi banco».
                </p>
              ) : (
                banco.map((b) => (
                  <div key={b.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
                    <span className="badge">{b.type === 'opcion_multiple' ? 'MC' : 'Evidencia'}</span>
                    <span style={{ fontSize: '0.85rem', flex: 1, minWidth: 160 }}>{b.prompt}</span>
                    <button
                      type="button"
                      className="btn btn-gold btn-sm"
                      onClick={() =>
                        agregarPregunta(b.type, {
                          prompt: b.prompt,
                          points: b.points,
                          opciones: (b.opciones ?? []).map((o) => ({
                            text: o.text,
                            isCorrect: !!o.isCorrect,
                          })),
                          criterios: (b.criterios ?? []).map((c) => ({
                            label: c.label,
                            maxPoints: Math.max(1, c.maxPoints ?? 1),
                          })),
                        })
                      }
                    >
                      Añadir
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={async () => {
                        await borrarDelBancoAPI(b.id).catch(() => undefined);
                        setBanco(await getBancoAPI(arte.id));
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {error && <p className="msg-error" style={{ marginTop: '0.7rem', fontSize: '0.85rem' }}>{error}</p>}
          <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.9rem' }}>
            <button className="btn btn-gold" type="submit">Publicar evaluación</button>
            <button type="button" className="btn btn-outline" onClick={() => setCreando(false)}>Cancelar</button>
          </div>
        </form>
      )}
      {ok && <p className="msg-ok" style={{ fontSize: '0.85rem' }}>{ok}</p>}
      {error && !creando && <p className="msg-error" style={{ fontSize: '0.85rem' }}>{error}</p>}

      <div style={{ display: 'grid', gap: '0.75rem' }}>
        {lista.map((e) => (
          <div key={e.id} className="card" style={{ padding: '1rem 1.2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
              <span className="badge badge-gold">{nombreGrado(e.gradeId)}</span>
              <span style={{ fontWeight: 600 }}>{e.title}</span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                {(e.porRevisar ?? 0) > 0 && (
                  <span className="badge badge-danger">⏳ {e.porRevisar} por revisar</span>
                )}
                <span className="badge mono">{e.intentos ?? 0} intento(s)</span>
                <button className="btn btn-outline btn-sm" onClick={() => void verIntentos(e.id)}>
                  {intentosDe === e.id ? 'Ocultar' : 'Ver intentos'}
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => void eliminar(e.id)}>
                  Eliminar
                </button>
              </span>
            </div>
            {intentosDe === e.id && (
              <div className="tabla-scroll" style={{ marginTop: '0.8rem' }}>
                {intentos.length === 0 ? (
                  <p className="muted" style={{ fontSize: '0.85rem' }}>Nadie la ha rendido aún.</p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Estudiante</th>
                        <th>Cinturón</th>
                        <th>MC</th>
                        <th>Final</th>
                        <th>Estado</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {intentos.map((a) => (
                        <tr key={a.id}>
                          <td>{a.fullName ?? a.email ?? a.studentUserId.slice(0, 8)}</td>
                          <td>{a.gradeNameSnapshot ?? '—'}</td>
                          <td className="mono">{a.mcScore ?? '—'}</td>
                          <td className="mono">{a.finalScore ?? '—'}</td>
                          <td>
                            {a.status === 'ENVIADO' ? (
                              <span className="badge badge-danger">Por revisar</span>
                            ) : (
                              <span className="badge badge-ok">Calificado</span>
                            )}
                          </td>
                          <td>
                            <Link href={`/maestro/revisar/${a.id}`} className="btn btn-outline btn-sm">
                              {a.status === 'ENVIADO' ? 'Calificar' : 'Ver'}
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        ))}
        {lista.length === 0 && <p className="muted">Aún no has creado evaluaciones en esta arte.</p>}
      </div>
    </div>
  );
}

// ── Pestaña: Estudiantes (RF-ACA-23/25) ──────────────────────────────────────
function TabEstudiantes({ arte }: { arte: Arte }) {
  const [filas, setFilas] = useState<EstudiantePanel[]>([]);
  const [filtroGrado, setFiltroGrado] = useState('');
  const [email, setEmail] = useState('');
  const [gradoInicial, setGradoInicial] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const cargar = useCallback(async () => {
    try {
      setFilas(await getEstudiantesAPI(arte.id, filtroGrado || undefined));
    } catch (err) {
      setError(extraerError(err));
    }
  }, [arte.id, filtroGrado]);

  useEffect(() => {
    setFiltroGrado('');
    setGradoInicial('');
  }, [arte]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function matricular(e: FormEvent) {
    e.preventDefault();
    setError('');
    setOk('');
    try {
      await matricularAPI({
        martialArtId: arte.id,
        email,
        gradeId: gradoInicial || undefined,
      });
      setOk(`Estudiante matriculado.`);
      setEmail('');
      await cargar();
    } catch (err) {
      setError(extraerError(err));
    }
  }

  async function avanzar(fila: EstudiantePanel) {
    const notas = prompt(
      `Certificar avance de grado de ${fila.fullName ?? fila.email ?? 'estudiante'} (actualmente ${fila.gradoNombre}). Notas del examen (opcional):`,
    );
    if (notas === null) return;
    setError('');
    try {
      await avanzarGradoAPI(fila.id, notas || undefined);
      setOk('Avance certificado: el historial guarda el grado anterior.');
      await cargar();
    } catch (err) {
      setError(extraerError(err));
    }
  }

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <form onSubmit={matricular} className="card" style={{ padding: '1.1rem 1.25rem' }}>
        <h3 className="eyebrow" style={{ marginBottom: '0.7rem' }}>Matricular estudiante</h3>
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <input
            type="email"
            placeholder="correo@delestudiante.com"
            maxLength={160}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ flex: 2, minWidth: 200 }}
          />
          <select
            value={gradoInicial}
            onChange={(e) => setGradoInicial(e.target.value)}
            style={{ flex: 1, minWidth: 140 }}
          >
            <option value="">Grado inicial: {arte.grados[0]?.name ?? '—'}</option>
            {arte.grados.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          <button className="btn btn-gold" type="submit">Matricular</button>
        </div>
        <p className="muted" style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>
          La persona debe haber entrado a Academy al menos una vez con su cuenta del
          ecosistema.
        </p>
        {error && <p className="msg-error" style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>{error}</p>}
        {ok && <p className="msg-ok" style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>{ok}</p>}
      </form>

      <div className="card" style={{ padding: '1.1rem 1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', flexWrap: 'wrap', marginBottom: '0.7rem' }}>
          <h3 className="eyebrow">Seguimiento grupal</h3>
          <select
            value={filtroGrado}
            onChange={(e) => setFiltroGrado(e.target.value)}
            style={{ maxWidth: 200, marginLeft: 'auto' }}
          >
            <option value="">Todos los grados</option>
            {arte.grados.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
        {filas.length === 0 ? (
          <p className="muted" style={{ fontSize: '0.85rem' }}>Sin estudiantes matriculados.</p>
        ) : (
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th>Estudiante</th>
                  <th>Grado</th>
                  <th>Material visto</th>
                  <th>Evaluaciones</th>
                  <th>Último avance</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Avatar src={f.avatarUrl} nombre={f.fullName ?? f.email ?? '?'} size={30} />
                        <span>
                          {f.fullName ?? '—'}
                          <span className="muted" style={{ display: 'block', fontSize: '0.75rem' }}>{f.email}</span>
                        </span>
                      </span>
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span
                          aria-hidden
                          style={{
                            width: 18,
                            height: 8,
                            borderRadius: 2,
                            background: colorCinturon(f.gradoNombre),
                            border: '1px solid var(--border-strong)',
                          }}
                        />
                        {f.gradoNombre}
                      </span>
                    </td>
                    <td className="mono">{f.progresoContenido.pct}%</td>
                    <td className="mono">{f.evaluacionesCompletadas}</td>
                    <td className="mono" style={{ fontSize: '0.8rem' }}>
                      {f.ultimoAvance ? new Date(f.ultimoAvance).toLocaleDateString('es-CO') : '—'}
                    </td>
                    <td>
                      <button className="btn btn-gold btn-sm" onClick={() => void avanzar(f)}>
                        ⬆ Avanzar grado
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Pestaña: Anuncios ────────────────────────────────────────────────────────
function TabAnuncios({ arte }: { arte: Arte }) {
  const [lista, setLista] = useState<Anuncio[]>([]);
  const [titulo, setTitulo] = useState('');
  const [cuerpo, setCuerpo] = useState('');
  const [gradoId, setGradoId] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const cargar = useCallback(async () => {
    try {
      setLista(await getAnunciosAPI(arte.id));
    } catch (err) {
      setError(extraerError(err));
    }
  }, [arte.id]);
  useEffect(() => {
    setGradoId('');
    void cargar();
  }, [arte, cargar]);

  async function publicar(e: FormEvent) {
    e.preventDefault();
    setError('');
    setOk('');
    try {
      await crearAnuncioAPI({
        martialArtId: arte.id,
        gradeId: gradoId || null,
        title: titulo,
        body: cuerpo || undefined,
      });
      setOk('Anuncio publicado: los estudiantes reciben la notificación.');
      setTitulo('');
      setCuerpo('');
      await cargar();
    } catch (err) {
      setError(extraerError(err));
    }
  }

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <form onSubmit={publicar} className="card" style={{ padding: '1.1rem 1.25rem' }}>
        <h3 className="eyebrow" style={{ marginBottom: '0.7rem' }}>Publicar anuncio</h3>
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
          <input
            placeholder="Título (ej. Examen de ascenso el sábado)"
            maxLength={160}
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            required
            style={{ flex: 2, minWidth: 220 }}
          />
          <select value={gradoId} onChange={(e) => setGradoId(e.target.value)} style={{ flex: 1, minWidth: 160 }}>
            <option value="">Para toda el arte</option>
            {arte.grados.map((g) => (
              <option key={g.id} value={g.id}>Solo cinturón {g.name}</option>
            ))}
          </select>
        </div>
        <textarea
          rows={3}
          placeholder="Detalles (opcional)…"
          maxLength={2000}
          value={cuerpo}
          onChange={(e) => setCuerpo(e.target.value)}
        />
        {error && <p className="msg-error" style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>{error}</p>}
        {ok && <p className="msg-ok" style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>{ok}</p>}
        <button className="btn btn-gold" type="submit" style={{ marginTop: '0.7rem' }}>📣 Publicar</button>
      </form>

      <div style={{ display: 'grid', gap: '0.5rem' }}>
        {lista.map((a) => (
          <div key={a.id} className="card" style={{ padding: '0.9rem 1.1rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600 }}>📣 {a.title}</span>
              {a.gradeId && (
                <span className="badge badge-gold">
                  {arte.grados.find((g) => g.id === a.gradeId)?.name ?? 'grado'}
                </span>
              )}
              <span className="muted mono" style={{ fontSize: '0.72rem' }}>
                {new Date(a.createdAt).toLocaleDateString('es-CO')}
              </span>
              <button
                className="btn btn-danger btn-sm"
                style={{ marginLeft: 'auto' }}
                onClick={async () => {
                  await borrarAnuncioAPI(a.id).catch((err) => setError(extraerError(err)));
                  await cargar();
                }}
              >
                Eliminar
              </button>
            </div>
            {a.body && <p className="muted" style={{ fontSize: '0.85rem', marginTop: '0.3rem' }}>{a.body}</p>}
          </div>
        ))}
        {lista.length === 0 && <p className="muted">Sin anuncios publicados.</p>}
      </div>
    </div>
  );
}

// ── Pestaña: Figuras (referencias del maestro + intentos recientes) ─────────
function TabFiguras({ arte }: { arte: Arte }) {
  const [refs, setRefs] = useState<FiguraRef[]>([]);
  const [intentos, setIntentos] = useState<IntentoFigura[]>([]);
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [gradoId, setGradoId] = useState(arte.grados[0]?.id ?? '');
  const [video, setVideo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const cargar = useCallback(async () => {
    try {
      setRefs(await getFigurasRefAPI(arte.id));
      setIntentos(await getIntentosFiguraAPI({ martialArtId: arte.id }));
    } catch (err) {
      setError(extraerError(err));
    }
  }, [arte.id]);
  useEffect(() => {
    setGradoId(arte.grados[0]?.id ?? '');
    void cargar();
  }, [arte, cargar]);

  async function subir(e: FormEvent) {
    e.preventDefault();
    if (!video) {
      setError('Adjunta el video de la figura.');
      return;
    }
    setError('');
    setOk('');
    setSubiendo(true);
    try {
      await subirFiguraRefAPI({
        martialArtId: arte.id,
        gradeId: gradoId,
        name: nombre,
        description: descripcion || undefined,
        video,
      });
      setOk('Referencia subida y procesada (pose extraída).');
      setNombre('');
      setDescripcion('');
      setVideo(null);
      await cargar();
    } catch (err) {
      setError(extraerError(err));
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <form onSubmit={subir} className="card" style={{ padding: '1.1rem 1.25rem' }}>
        <h3 className="eyebrow" style={{ marginBottom: '0.7rem' }}>Subir figura de referencia</h3>
        <p className="muted" style={{ fontSize: '0.78rem', marginBottom: '0.7rem' }}>
          Graba la ejecución correcta con el cuerpo completo visible y buena luz: el
          sistema extrae la pose una sola vez y luego compara a cada estudiante contra
          ella. Los del programa oficial están en
          «D:\hapkido\Programa Cambio de Cinturones - Alfa y Omega».
        </p>
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
          <input
            placeholder="Nombre (ej. Figura 1 — Il Bon)"
            maxLength={160}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
            style={{ flex: 2, minWidth: 200 }}
          />
          <select value={gradoId} onChange={(e) => setGradoId(e.target.value)} style={{ flex: 1, minWidth: 150 }}>
            {arte.grados.map((g) => (
              <option key={g.id} value={g.id}>Cinturón {g.name}</option>
            ))}
          </select>
        </div>
        <input
          placeholder="Descripción (opcional)"
          maxLength={300}
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          style={{ marginBottom: '0.6rem' }}
        />
        <input
          type="file"
          accept="video/*"
          onChange={(e) => setVideo(e.target.files?.[0] ?? null)}
          style={{ marginBottom: '0.6rem' }}
        />
        {error && <p className="msg-error" style={{ fontSize: '0.85rem' }}>{error}</p>}
        {ok && <p className="msg-ok" style={{ fontSize: '0.85rem' }}>{ok}</p>}
        <button className="btn btn-gold" type="submit" disabled={subiendo}>
          {subiendo ? '⏳ Subiendo y extrayendo pose…' : '⬆ Subir referencia'}
        </button>
      </form>

      <div className="card" style={{ padding: '1.1rem 1.25rem' }}>
        <h3 className="eyebrow" style={{ marginBottom: '0.7rem' }}>Referencias publicadas</h3>
        {refs.length === 0 ? (
          <p className="muted" style={{ fontSize: '0.85rem' }}>Sin referencias aún.</p>
        ) : (
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th>Figura</th>
                  <th>Grado</th>
                  <th>Detección</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {refs.map((f) => (
                  <tr key={f.id}>
                    <td>
                      {f.name}
                      <a
                        className="muted"
                        style={{ display: 'block', fontSize: '0.72rem', color: 'var(--gold)' }}
                        href={archivoUrl(f.videoPath)!}
                        target="_blank"
                        rel="noreferrer"
                      >
                        ver video ↗
                      </a>
                    </td>
                    <td>{arte.grados.find((g) => g.id === f.gradeId)?.name ?? '—'}</td>
                    <td className="mono">{f.detectionRate ?? '—'}%</td>
                    <td>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={async () => {
                          if (!confirm('¿Eliminar esta referencia?')) return;
                          await borrarFiguraRefAPI(f.id).catch((err) => setError(extraerError(err)));
                          await cargar();
                        }}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ padding: '1.1rem 1.25rem' }}>
        <h3 className="eyebrow" style={{ marginBottom: '0.7rem' }}>Intentos de estudiantes</h3>
        {intentos.length === 0 ? (
          <p className="muted" style={{ fontSize: '0.85rem' }}>Nadie ha enviado figuras todavía.</p>
        ) : (
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th>Estudiante</th>
                  <th>Figura</th>
                  <th>Cinturón</th>
                  <th>Nota</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {intentos.map((i) => (
                  <tr key={i.id}>
                    <td>{i.estudiante ?? '—'}</td>
                    <td>{i.nombre}</td>
                    <td>{i.gradeNameSnapshot ?? '—'}</td>
                    <td className="mono">{i.score ? Math.round(parseFloat(i.score)) : '—'}</td>
                    <td>
                      {i.status === 'COMPLETADO' ? (
                        <span className="badge badge-ok">Completado</span>
                      ) : i.status === 'PROCESANDO' ? (
                        <span className="badge">⏳ Procesando</span>
                      ) : (
                        <span className="badge badge-danger">Error</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Pestaña: Historial (bitácora de actividad de los estudiantes) ────────────
const EVENTO_HISTORIAL: Record<string, { icono: string; etiqueta: string }> = {
  ingreso: { icono: '🚪', etiqueta: 'Ingreso' },
  contenido_visto: { icono: '👁️', etiqueta: 'Material visto' },
  entrega: { icono: '📤', etiqueta: 'Entrega' },
  intento_figura: { icono: '🥋', etiqueta: 'Figura' },
  avance_grado: { icono: '⬆️', etiqueta: 'Ascenso' },
};

/** Apartados del historial: el maestro abre directo en ENTREGAS para no
 *  perderse ninguna tarea entregada. */
const APARTADOS_HISTORIAL: [string, string][] = [
  ['entrega', '📤 Entregas'],
  ['contenido_visto', '👁️ Material visto'],
  ['ingreso', '🚪 Ingresos'],
  ['intento_figura', '🥋 Figuras'],
  ['avance_grado', '⬆️ Ascensos'],
  ['', 'Todo'],
];

function TabHistorial({ arte }: { arte: Arte }) {
  const [eventos, setEventos] = useState<EventoHistorial[]>([]);
  const [estudiantes, setEstudiantes] = useState<EstudiantePanel[]>([]);
  const [filtroEstudiante, setFiltroEstudiante] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('entrega');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setEventos(
        await getHistorialAPI(arte.id, {
          studentUserId: filtroEstudiante || undefined,
          type: filtroTipo || undefined,
        }),
      );
      setError('');
    } catch (err) {
      setEventos([]);
      setError(extraerError(err));
    } finally {
      setCargando(false);
    }
  }, [arte.id, filtroEstudiante, filtroTipo]);

  useEffect(() => {
    setFiltroEstudiante('');
    setFiltroTipo('entrega');
    getEstudiantesAPI(arte.id).then(setEstudiantes).catch(() => setEstudiantes([]));
  }, [arte]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  const fechaHora = (iso: string) =>
    new Date(iso).toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <div className="card" style={{ padding: '1.1rem 1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
        <h3 className="eyebrow">Actividad de tus estudiantes</h3>
        <select
          value={filtroEstudiante}
          onChange={(e) => setFiltroEstudiante(e.target.value)}
          style={{ maxWidth: 210, marginLeft: 'auto' }}
        >
          <option value="">Todos los estudiantes</option>
          {estudiantes.map((s) => (
            <option key={s.studentUserId} value={s.studentUserId}>
              {s.fullName ?? s.email ?? s.studentUserId.slice(0, 8)}
            </option>
          ))}
        </select>
      </div>
      {/* Apartados separados por tipo: el maestro no se pierde una entrega. */}
      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.8rem' }}>
        {APARTADOS_HISTORIAL.map(([valor, etiqueta]) => (
          <button
            key={valor}
            className={filtroTipo === valor ? 'btn btn-gold btn-sm' : 'btn btn-outline btn-sm'}
            onClick={() => setFiltroTipo(valor)}
          >
            {etiqueta}
          </button>
        ))}
      </div>
      <p className="muted" style={{ fontSize: '0.78rem', marginBottom: '0.8rem' }}>
        Cuándo entran a la plataforma, ven el material, entregan tareas, envían
        figuras o ascienden de grado. Los ingresos se registran una vez por sesión
        (~30 min); las vistas de material solo la primera vez.
      </p>

      {error && <p className="msg-error" style={{ fontSize: '0.85rem' }}>{error}</p>}
      {cargando && <p className="muted" style={{ fontSize: '0.85rem' }}>Cargando historial…</p>}
      {!cargando && eventos.length === 0 && !error && (
        <p className="muted" style={{ fontSize: '0.85rem' }}>
          Sin actividad registrada todavía (la bitácora empieza a llenarse desde hoy).
        </p>
      )}

      {eventos.length > 0 && (
        <div className="tabla-scroll">
          <table>
            <thead>
              <tr>
                <th>Cuándo</th>
                <th>Estudiante</th>
                <th>Evento</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {eventos.map((e) => {
                const meta = EVENTO_HISTORIAL[e.type] ?? { icono: '•', etiqueta: e.type };
                return (
                  <tr key={e.id}>
                    <td className="mono" style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                      {fechaHora(e.createdAt)}
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Avatar src={e.avatarUrl} nombre={e.fullName ?? e.email ?? '?'} size={28} />
                        <span>
                          {e.fullName ?? '—'}
                          <span className="muted" style={{ display: 'block', fontSize: '0.72rem' }}>{e.email}</span>
                        </span>
                      </span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span className="badge">{meta.icono} {meta.etiqueta}</span>
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>{e.detail ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Página ────────────────────────────────────────────────────────────────────
export default function Maestro() {
  const router = useRouter();
  const [rol, setRol] = useState<string | null>(null);
  const [artes, setArtes] = useState<Arte[]>([]);
  const [arteSel, setArteSel] = useState<Arte | null>(null);
  const [tab, setTab] = useState<Tab>('contenidos');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!obtenerToken()) {
      router.replace('/login');
      return;
    }
    void (async () => {
      const r = await getRolEfectivo();
      setRol(r);
      if (r !== 'teacher' && r !== 'admin') {
        router.replace('/aprender');
        return;
      }
      try {
        const lista = (await getArtesAPI()).filter((a) => a.asignada);
        setArtes(lista);
        setArteSel(lista[0] ?? null);
      } catch (err) {
        setError(extraerError(err));
      }
    })();
  }, [router]);

  if (rol !== 'teacher' && rol !== 'admin') return null;

  return (
    <main style={{ maxWidth: 980, margin: '0 auto', padding: '1.5rem 1rem 3rem' }}>
      <p className="eyebrow" style={{ marginBottom: '0.3rem' }}>Gestión académica</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <h1 className="display" style={{ fontSize: '1.7rem' }}>Panel del maestro</h1>
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

      {error && <p className="msg-error" style={{ marginBottom: '1rem' }}>{error}</p>}
      {!arteSel && !error && (
        <div className="card" style={{ padding: '1.25rem' }}>
          <p className="muted">
            No tienes artes marciales asignadas todavía. Pide al administrador que te
            asigne una (RF-ACA-09).
          </p>
        </div>
      )}

      {arteSel && (
        <>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1.1rem' }}>
            {(
              [
                ['contenidos', 'Contenidos'],
                ['evaluaciones', 'Evaluaciones'],
                ['estudiantes', 'Estudiantes'],
                ['anuncios', 'Anuncios'],
                ['figuras', 'Figuras'],
                ['historial', 'Historial'],
              ] as [Tab, string][]
            ).map(([t, etiqueta]) => (
              <button
                key={t}
                className={tab === t ? 'btn btn-gold btn-sm' : 'btn btn-outline btn-sm'}
                onClick={() => setTab(t)}
              >
                {etiqueta}
              </button>
            ))}
          </div>
          {tab === 'contenidos' && <TabContenidos arte={arteSel} />}
          {tab === 'evaluaciones' && <TabEvaluaciones arte={arteSel} />}
          {tab === 'estudiantes' && <TabEstudiantes arte={arteSel} />}
          {tab === 'anuncios' && <TabAnuncios arte={arteSel} />}
          {tab === 'figuras' && <TabFiguras arte={arteSel} />}
          {tab === 'historial' && <TabHistorial arte={arteSel} />}
        </>
      )}
    </main>
  );
}
