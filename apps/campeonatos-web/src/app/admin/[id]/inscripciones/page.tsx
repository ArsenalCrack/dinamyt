'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  obtenerToken,
  listInscripcionesCampAPI,
  revisarInscripcionAPI,
  extraerError,
  type InscripcionRevision,
} from '@/lib/api';
import { getSesion, esAdmin } from '@/lib/session';
import { Avatar } from '@/components/Avatar';

/** Edad a partir de la fecha de nacimiento (para mostrar en la revisión). */
function edadDe(fecha: string | null): string {
  if (!fecha) return '—';
  const n = new Date(fecha);
  const hoy = new Date();
  let e = hoy.getFullYear() - n.getFullYear();
  const m = hoy.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < n.getDate())) e--;
  return `${e} años`;
}

/**
 * Revisión de inscripciones: el admin ve TODA la información que envió el
 * competidor (documento, correo, edad, club, peso, cinturón, modalidades) y
 * al APROBAR el sistema lo coloca automáticamente en su sección (llave)
 * correspondiente; al RECHAZAR sale de cualquier sección.
 */
export default function RevisionInscripcionesPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const campId = params.id;

  const [lista, setLista] = useState<InscripcionRevision[]>([]);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [filtro, setFiltro] = useState<'PENDIENTE' | 'TODAS'>('PENDIENTE');

  const cargar = useCallback(() => {
    listInscripcionesCampAPI(campId)
      .then(setLista)
      .catch((e) =>
        setMsg({ tipo: 'error', texto: extraerError(e, 'No se pudieron cargar.') }),
      );
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
    cargar();
  }, [router, cargar]);

  async function revisar(ins: InscripcionRevision, estado: 'APROBADA' | 'RECHAZADA') {
    setMsg(null);
    setOcupado(true);
    try {
      const r = (await revisarInscripcionAPI(ins.id, estado)) as {
        seccionesAsignadas: number;
        avisos?: string[];
      };
      const avisos = r.avisos?.length ? ` ${r.avisos.join(' ')}` : '';
      setMsg({
        tipo: 'ok',
        texto:
          estado === 'APROBADA'
            ? `${ins.nombreCompleto} aprobado y colocado en ${r.seccionesAsignadas} sección(es).${r.seccionesAsignadas === 0 ? ' (Su combinación no coincide con ninguna categoría configurada.)' : ''}${avisos}`
            : `${ins.nombreCompleto} rechazado.`,
      });
      cargar();
    } catch (e) {
      setMsg({ tipo: 'error', texto: extraerError(e, 'No se pudo actualizar.') });
    } finally {
      setOcupado(false);
    }
  }

  const visibles = filtro === 'TODAS' ? lista : lista.filter((i) => i.estado === 'PENDIENTE');
  const pendientes = lista.filter((i) => i.estado === 'PENDIENTE').length;

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-8 sm:px-6">
      <Link href="/admin" className="text-sm" style={{ color: 'var(--text-muted)' }}>
        ← Campeonatos
      </Link>
      <div className="mb-6 mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--gold)' }}>
            Revisión de inscripciones
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Al <strong>aprobar</strong>, el sistema coloca al competidor
            automáticamente en su sección (llave) según cinturón, edad, peso y
            género.
          </p>
        </div>
        <div className="flex gap-1">
          {(['PENDIENTE', 'TODAS'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold"
              style={
                filtro === f
                  ? { background: 'var(--bg-elevated)', color: 'var(--gold)' }
                  : { color: 'var(--text-muted)' }
              }
            >
              {f === 'PENDIENTE' ? `Pendientes (${pendientes})` : 'Todas'}
            </button>
          ))}
        </div>
      </div>

      {msg && (
        <p className={`mb-4 text-sm ${msg.tipo === 'ok' ? 'msg-ok' : 'msg-error'}`}>
          {msg.texto}
        </p>
      )}
      {visibles.length === 0 && (
        <div className="card p-8 text-center" style={{ color: 'var(--text-muted)' }}>
          {filtro === 'PENDIENTE'
            ? 'No hay inscripciones pendientes de revisión. 🎉'
            : 'Aún no hay inscripciones.'}
        </div>
      )}

      <ul className="grid gap-3">
        {visibles.map((i) => (
          <li key={i.id} className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <Avatar src={i.foto} nombre={i.nombreCompleto} size={44} />
                <div className="min-w-0">
                <h3 className="font-semibold">{i.nombreCompleto}</h3>
                <dl className="mt-1 grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs sm:grid-cols-3" style={{ color: 'var(--text-muted)' }}>
                  <div>Documento: <strong>{i.documento}</strong></div>
                  <div>Edad: <strong>{edadDe(i.fechaNacimiento)}</strong></div>
                  <div>Género: <strong>{i.genero ?? '—'}</strong></div>
                  <div>Correo: <strong>{i.correo ?? '—'}</strong></div>
                  <div>Club: <strong>{i.academiaClub ?? '—'}</strong></div>
                  <div>Peso: <strong>{i.pesoInscripcion ? `${i.pesoInscripcion} kg` : '—'}</strong></div>
                  <div>Cinturón: <strong>{i.grupoCinturon ?? '—'}</strong></div>
                  <div>Monto: <strong>${i.montoTotal ?? '0'}</strong></div>
                </dl>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {i.modalidades.map((m) => (
                    <span key={m} className="badge badge-gold">
                      {m.replaceAll('_', ' ')}
                    </span>
                  ))}
                </div>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <span
                  className={`badge ${
                    i.estado === 'APROBADA' ? 'badge-ok' : i.estado === 'PENDIENTE' ? 'badge-info' : ''
                  }`}
                >
                  {i.estado}
                </span>
                {i.estado === 'PENDIENTE' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => revisar(i, 'APROBADA')}
                      disabled={ocupado}
                      className="btn btn-gold btn-sm"
                    >
                      ✓ Aprobar
                    </button>
                    <button
                      onClick={() => revisar(i, 'RECHAZADA')}
                      disabled={ocupado}
                      className="btn btn-danger btn-sm"
                    >
                      ✕ Rechazar
                    </button>
                  </div>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
