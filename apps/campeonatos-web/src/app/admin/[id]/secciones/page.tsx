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
  extraerError,
  type Seccion,
} from '@/lib/api';

export default function SeccionesPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const campId = params.id;

  const [secciones, setSecciones] = useState<Seccion[]>([]);
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'error'>('cargando');
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    setEstado('cargando');
    try {
      setSecciones(await listSeccionesAPI(campId));
      setEstado('ok');
    } catch (e) {
      setMsg({ tipo: 'error', texto: extraerError(e, 'No se pudieron cargar las secciones.') });
      setEstado('error');
    }
  }, [campId]);

  useEffect(() => {
    if (!obtenerToken()) {
      router.replace('/admin/login');
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

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      <Link href="/admin" className="text-sm" style={{ color: 'var(--text-muted)' }}>
        ← Volver
      </Link>
      <h1 className="mb-2 mt-2 text-2xl font-bold" style={{ color: 'var(--gold)' }}>
        Secciones y llaves
      </h1>
      <p className="mb-6 text-sm" style={{ color: 'var(--text-muted)' }}>
        Genera las secciones del campeonato, asigna las inscripciones a la sección
        que les corresponde y crea la llave (bracket) de cada sección de combate.
      </p>

      <div className="mb-6 flex flex-wrap gap-3">
        <button
          onClick={generar}
          disabled={ocupado}
          className="rounded-lg px-4 py-2 text-sm font-semibold"
          style={{ background: 'var(--gold)', color: '#14141e' }}
        >
          1 · Generar secciones
        </button>
        <button
          onClick={asignar}
          disabled={ocupado}
          className="rounded-lg border px-4 py-2 text-sm font-semibold"
          style={{ borderColor: 'var(--border)' }}
        >
          2 · Asignar inscripciones
        </button>
        <Link
          href={`/admin/${campId}`}
          className="rounded-lg border px-4 py-2 text-sm font-semibold"
          style={{ borderColor: 'var(--border)' }}
        >
          Inscribir competidores
        </Link>
      </div>

      {msg && (
        <p className="mb-4 text-sm" style={{ color: msg.tipo === 'ok' ? 'var(--gold)' : '#ff5577' }}>
          {msg.texto}
        </p>
      )}

      {estado === 'cargando' && <p style={{ color: 'var(--text-muted)' }}>Cargando…</p>}
      {estado === 'ok' && secciones.length === 0 && (
        <p style={{ color: 'var(--text-muted)' }}>
          Aún no hay secciones. Pulsa «Generar secciones».
        </p>
      )}

      <ul className="grid gap-3">
        {secciones.map((s) => (
          <li
            key={s.id}
            className="flex items-center justify-between gap-3 rounded-xl border p-4"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
          >
            <div>
              <h3 className="font-semibold">{s.nombre}</h3>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {s.modalidad} · {s.estado}
              </span>
            </div>
            {s.modalidad === 'combate' && (
              <button
                onClick={() => generarLlave(s.id)}
                disabled={ocupado}
                className="rounded-lg px-3 py-1.5 text-sm font-semibold"
                style={{ background: 'var(--gold)', color: '#14141e' }}
              >
                Generar llave
              </button>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
