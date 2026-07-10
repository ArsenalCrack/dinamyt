'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  obtenerToken,
  getArtesAPI,
  crearArteAPI,
  patchArteAPI,
  getMaestrosAPI,
  asignarMaestroAPI,
  quitarMaestroAPI,
  getUsuariosAdminAPI,
  patchUsuarioAdminAPI,
  getSolicitudesAPI,
  resolverSolicitudAPI,
  getReportesAPI,
  extraerError,
  type Arte,
  type UsuarioLocal,
  type SolicitudMaestro,
} from '@/lib/api';
import { getRolEfectivo } from '@/lib/session';

type Tab = 'artes' | 'usuarios' | 'solicitudes' | 'reportes';

// ── Pestaña: Artes marciales (RF-ACA-06/08/09) ───────────────────────────────
function TabArtes({ artes, recargar }: { artes: Arte[]; recargar: () => Promise<void> }) {
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [federacion, setFederacion] = useState('');
  const [gradosTexto, setGradosTexto] = useState('');
  const [expandida, setExpandida] = useState<string | null>(null);
  const [maestros, setMaestros] = useState<Awaited<ReturnType<typeof getMaestrosAPI>>>([]);
  const [emailMaestro, setEmailMaestro] = useState('');

  async function crear(e: FormEvent) {
    e.preventDefault();
    setError('');
    setOk('');
    // Un grado por línea; opcionalmente "Nombre | GRUPO".
    const grados = gradosTexto
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [name, groupName] = l.split('|').map((s) => s.trim());
        return { name, groupName: groupName || undefined };
      });
    try {
      await crearArteAPI({
        name: nombre,
        description: descripcion || undefined,
        federation: federacion || undefined,
        grados,
      });
      setOk('Arte marcial registrada (RF-ACA-06).');
      setNombre('');
      setDescripcion('');
      setFederacion('');
      setGradosTexto('');
      setCreando(false);
      await recargar();
    } catch (err) {
      setError(extraerError(err));
    }
  }

  async function alternar(arte: Arte) {
    setError('');
    try {
      await patchArteAPI(arte.id, { isActive: !arte.isActive });
      await recargar();
    } catch (err) {
      setError(extraerError(err));
    }
  }

  async function verMaestros(arteId: string) {
    if (expandida === arteId) {
      setExpandida(null);
      return;
    }
    try {
      setMaestros(await getMaestrosAPI(arteId));
      setExpandida(arteId);
    } catch (err) {
      setError(extraerError(err));
    }
  }

  async function asignar(arteId: string) {
    setError('');
    try {
      await asignarMaestroAPI(arteId, emailMaestro);
      setEmailMaestro('');
      setMaestros(await getMaestrosAPI(arteId));
    } catch (err) {
      setError(extraerError(err));
    }
  }

  async function quitar(arteId: string, userId: string) {
    try {
      await quitarMaestroAPI(arteId, userId);
      setMaestros(await getMaestrosAPI(arteId));
    } catch (err) {
      setError(extraerError(err));
    }
  }

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {!creando ? (
        <button className="btn btn-gold" style={{ justifySelf: 'start' }} onClick={() => setCreando(true)}>
          ＋ Registrar arte marcial
        </button>
      ) : (
        <form onSubmit={crear} className="card" style={{ padding: '1.1rem 1.25rem' }}>
          <h3 className="eyebrow" style={{ marginBottom: '0.7rem' }}>Nueva arte marcial</h3>
          <label className="muted" style={{ fontSize: '0.78rem' }}>Nombre</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} required maxLength={120} style={{ margin: '0.25rem 0 0.7rem' }} />
          <label className="muted" style={{ fontSize: '0.78rem' }}>Descripción</label>
          <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={300} style={{ margin: '0.25rem 0 0.7rem' }} />
          <label className="muted" style={{ fontSize: '0.78rem' }}>Federación de referencia</label>
          <input value={federacion} onChange={(e) => setFederacion(e.target.value)} maxLength={160} style={{ margin: '0.25rem 0 0.7rem' }} />
          <label className="muted" style={{ fontSize: '0.78rem' }}>
            Sistema de grados: uno por línea, en orden (opcional «Nombre | GRUPO»)
          </label>
          <textarea
            rows={6}
            placeholder={'Blanco | BLANCO\nAmarillo | PRINCIPIANTE\n…'}
            value={gradosTexto}
            onChange={(e) => setGradosTexto(e.target.value)}
            maxLength={2000}
            required
            style={{ margin: '0.25rem 0 0.7rem', fontFamily: 'var(--font-mono)' }}
          />
          {error && <p className="msg-error" style={{ marginBottom: '0.6rem', fontSize: '0.85rem' }}>{error}</p>}
          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <button className="btn btn-gold" type="submit">Registrar</button>
            <button type="button" className="btn btn-outline" onClick={() => setCreando(false)}>Cancelar</button>
          </div>
        </form>
      )}
      {ok && <p className="msg-ok" style={{ fontSize: '0.85rem' }}>{ok}</p>}
      {error && !creando && <p className="msg-error" style={{ fontSize: '0.85rem' }}>{error}</p>}

      {artes.map((a) => (
        <div key={a.id} className="card" style={{ padding: '1rem 1.2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600 }}>{a.name}</span>
            <span className="badge">{a.grados.length} grados</span>
            {a.isActive ? (
              <span className="badge badge-ok">Habilitada</span>
            ) : (
              <span className="badge badge-danger">Deshabilitada</span>
            )}
            <span style={{ marginLeft: 'auto', display: 'flex', gap: '0.4rem' }}>
              <button className="btn btn-outline btn-sm" onClick={() => void verMaestros(a.id)}>
                {expandida === a.id ? 'Ocultar maestros' : 'Maestros'}
              </button>
              <button
                className={a.isActive ? 'btn btn-danger btn-sm' : 'btn btn-gold btn-sm'}
                onClick={() => void alternar(a)}
                title="Deshabilitar no borra el contenido (RF-ACA-08)"
              >
                {a.isActive ? 'Deshabilitar' : 'Habilitar'}
              </button>
            </span>
          </div>
          {a.federation && (
            <p className="muted" style={{ fontSize: '0.8rem', marginTop: '0.3rem' }}>{a.federation}</p>
          )}
          {expandida === a.id && (
            <div style={{ marginTop: '0.8rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
                <input
                  type="email"
                  placeholder="correo@delmaestro.com"
                  maxLength={160}
                  value={emailMaestro}
                  onChange={(e) => setEmailMaestro(e.target.value)}
                  style={{ flex: 1, minWidth: 200 }}
                />
                <button className="btn btn-gold btn-sm" onClick={() => void asignar(a.id)}>
                  Asignar maestro
                </button>
              </div>
              {maestros.length === 0 ? (
                <p className="muted" style={{ fontSize: '0.85rem' }}>Sin maestros asignados.</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '0.35rem' }}>
                  {maestros.map((m) => (
                    <li key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                      <span>{m.fullName ?? m.email ?? m.teacherUserId.slice(0, 8)}</span>
                      <span className="muted" style={{ fontSize: '0.78rem' }}>{m.email}</span>
                      <button
                        className="btn btn-danger btn-sm"
                        style={{ marginLeft: 'auto' }}
                        onClick={() => void quitar(a.id, m.teacherUserId)}
                      >
                        Quitar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Pestaña: Usuarios (RF-ACA-26) ────────────────────────────────────────────
function TabUsuarios() {
  const [usuarios, setUsuarios] = useState<UsuarioLocal[]>([]);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    try {
      setUsuarios(await getUsuariosAdminAPI());
    } catch (err) {
      setError(extraerError(err));
    }
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function cambiar(u: UsuarioLocal, body: Record<string, unknown>) {
    setError('');
    try {
      await patchUsuarioAdminAPI(u.id, body);
      await cargar();
    } catch (err) {
      setError(extraerError(err));
    }
  }

  return (
    <div className="card" style={{ padding: '1.1rem 1.25rem' }}>
      <h3 className="eyebrow" style={{ marginBottom: '0.7rem' }}>Usuarios de Academy</h3>
      <p className="muted" style={{ fontSize: '0.78rem', marginBottom: '0.7rem' }}>
        El rol local prevalece sobre el del token; suspender o eliminar aquí NO toca
        la cuenta del ecosistema (RF-ACA-26).
      </p>
      {error && <p className="msg-error" style={{ marginBottom: '0.6rem', fontSize: '0.85rem' }}>{error}</p>}
      <div className="tabla-scroll">
        <table>
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Matrículas</th>
              <th>Rol local</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id}>
                <td>
                  {u.fullName ?? '—'}
                  <span className="muted" style={{ display: 'block', fontSize: '0.75rem' }}>{u.email}</span>
                </td>
                <td style={{ fontSize: '0.8rem' }}>{u.matriculas?.join(', ') || '—'}</td>
                <td>
                  <select
                    value={u.localRole ?? ''}
                    onChange={(e) =>
                      void cambiar(u, { localRole: e.target.value === '' ? null : e.target.value })
                    }
                    style={{ maxWidth: 150 }}
                  >
                    <option value="">— del token —</option>
                    <option value="student">Estudiante</option>
                    <option value="teacher">Maestro</option>
                    <option value="admin">Administrador</option>
                  </select>
                </td>
                <td>
                  {u.suspended ? (
                    <span className="badge badge-danger">Suspendido</span>
                  ) : (
                    <span className="badge badge-ok">Activo</span>
                  )}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button
                      className={u.suspended ? 'btn btn-gold btn-sm' : 'btn btn-outline btn-sm'}
                      onClick={() => void cambiar(u, { suspended: !u.suspended })}
                    >
                      {u.suspended ? 'Reactivar' : 'Suspender'}
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => {
                        if (confirm('¿Eliminar (soft delete) este usuario de Academy?'))
                          void cambiar(u, { eliminar: true });
                      }}
                    >
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Pestaña: Solicitudes de maestro (RF-ACA-27) ──────────────────────────────
function TabSolicitudes() {
  const [solicitudes, setSolicitudes] = useState<SolicitudMaestro[]>([]);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    try {
      setSolicitudes(await getSolicitudesAPI());
    } catch (err) {
      setError(extraerError(err));
    }
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function resolver(id: string, aprobar: boolean) {
    setError('');
    try {
      await resolverSolicitudAPI(id, aprobar);
      await cargar();
    } catch (err) {
      setError(extraerError(err));
    }
  }

  return (
    <div className="card" style={{ padding: '1.1rem 1.25rem' }}>
      <h3 className="eyebrow" style={{ marginBottom: '0.7rem' }}>Solicitudes de maestro</h3>
      {error && <p className="msg-error" style={{ marginBottom: '0.6rem', fontSize: '0.85rem' }}>{error}</p>}
      {solicitudes.length === 0 ? (
        <p className="muted" style={{ fontSize: '0.85rem' }}>Sin solicitudes.</p>
      ) : (
        <div style={{ display: 'grid', gap: '0.6rem' }}>
          {solicitudes.map((s) => (
            <div
              key={s.id}
              style={{
                display: 'flex',
                gap: '0.6rem',
                alignItems: 'center',
                flexWrap: 'wrap',
                borderBottom: '1px solid var(--border)',
                paddingBottom: '0.6rem',
              }}
            >
              <div style={{ flex: 1, minWidth: 220 }}>
                <p style={{ fontWeight: 600 }}>{s.fullName ?? s.userId.slice(0, 8)}</p>
                <p className="muted" style={{ fontSize: '0.8rem' }}>
                  {s.arteNombre ? `Arte: ${s.arteNombre} · ` : ''}
                  {s.message || 'Sin mensaje'}
                </p>
              </div>
              {s.status === 'PENDIENTE' ? (
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button className="btn btn-gold btn-sm" onClick={() => void resolver(s.id, true)}>
                    Aprobar
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => void resolver(s.id, false)}>
                    Rechazar
                  </button>
                </div>
              ) : (
                <span className={s.status === 'APROBADA' ? 'badge badge-ok' : 'badge badge-danger'}>
                  {s.status}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Pestaña: Reportes (RF-ACA-28) ────────────────────────────────────────────
function TabReportes() {
  const [dias, setDias] = useState(30);
  const [datos, setDatos] = useState<Awaited<ReturnType<typeof getReportesAPI>> | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getReportesAPI(dias)
      .then(setDatos)
      .catch((err) => setError(extraerError(err)));
  }, [dias]);

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ display: 'flex', gap: '0.4rem' }}>
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            className={dias === d ? 'btn btn-gold btn-sm' : 'btn btn-outline btn-sm'}
            onClick={() => setDias(d)}
          >
            {d} días
          </button>
        ))}
      </div>
      {error && <p className="msg-error" style={{ fontSize: '0.85rem' }}>{error}</p>}
      {datos && (
        <>
          <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            {(
              [
                ['Usuarios', datos.totales.usuarios],
                ['Matrículas', datos.totales.matriculas],
                ['Contenidos', datos.totales.contenidos],
                ['Evaluaciones', datos.totales.evaluaciones],
                [`Completadas (${datos.periodoDias} d)`, datos.evaluacionesCompletadas],
                [`Avances de grado (${datos.periodoDias} d)`, datos.avancesDeGrado],
                ['Tasa de avance', `${datos.tasaAvance}%`],
              ] as [string, string | number][]
            ).map(([etiqueta, valor]) => (
              <div key={etiqueta} className="card" style={{ padding: '1rem', textAlign: 'center' }}>
                <p className="display mono" style={{ fontSize: '1.6rem' }}>{valor}</p>
                <p className="muted" style={{ fontSize: '0.75rem' }}>{etiqueta}</p>
              </div>
            ))}
          </div>
          <div className="card" style={{ padding: '1.1rem 1.25rem' }}>
            <h3 className="eyebrow" style={{ marginBottom: '0.6rem' }}>Matrículas por arte marcial</h3>
            {Object.keys(datos.usuariosPorArte).length === 0 ? (
              <p className="muted" style={{ fontSize: '0.85rem' }}>Sin matrículas todavía.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Arte marcial</th>
                    <th>Estudiantes</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(datos.usuariosPorArte).map(([arte, n]) => (
                    <tr key={arte}>
                      <td>{arte}</td>
                      <td className="mono">{n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Página ────────────────────────────────────────────────────────────────────
export default function Admin() {
  const router = useRouter();
  const [rol, setRol] = useState<string | null>(null);
  const [artes, setArtes] = useState<Arte[]>([]);
  const [tab, setTab] = useState<Tab>('artes');

  const recargarArtes = useCallback(async () => {
    setArtes(await getArtesAPI());
  }, []);

  useEffect(() => {
    if (!obtenerToken()) {
      router.replace('/login');
      return;
    }
    void (async () => {
      const r = await getRolEfectivo();
      setRol(r);
      if (r !== 'admin') {
        router.replace('/aprender');
        return;
      }
      await recargarArtes();
    })();
  }, [router, recargarArtes]);

  if (rol !== 'admin') return null;

  return (
    <main style={{ maxWidth: 980, margin: '0 auto', padding: '1.5rem 1rem 3rem' }}>
      <p className="eyebrow" style={{ marginBottom: '0.3rem' }}>Gestión global</p>
      <h1 className="display" style={{ fontSize: '1.7rem', marginBottom: '1rem' }}>
        Administración de Academy
      </h1>

      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1.1rem' }}>
        {(
          [
            ['artes', 'Artes marciales'],
            ['usuarios', 'Usuarios'],
            ['solicitudes', 'Solicitudes'],
            ['reportes', 'Reportes'],
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

      {tab === 'artes' && <TabArtes artes={artes} recargar={recargarArtes} />}
      {tab === 'usuarios' && <TabUsuarios />}
      {tab === 'solicitudes' && <TabSolicitudes />}
      {tab === 'reportes' && <TabReportes />}
    </main>
  );
}
