'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  obtenerToken,
  getCampeonatoAPI,
  editarCampeonatoAPI,
  extraerError,
  type CampeonatoDetalle,
} from '@/lib/api';
import { getSesion, esAdmin } from '@/lib/session';
import {
  CampeonatoForm,
  aPayload,
  type CampeonatoFormValues,
} from '@/components/CampeonatoForm';

/** Edición del campeonato (solo BORRADOR/LISTO). Reusa el formulario de crear. */
export default function EditarCampeonatoPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const campId = params.id;

  const [inicial, setInicial] = useState<Partial<CampeonatoFormValues> | null>(null);
  const [bloqueado, setBloqueado] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!obtenerToken()) {
      router.replace('/admin/login');
      return;
    }
    if (!esAdmin(getSesion())) {
      router.replace('/admin');
      return;
    }
    getCampeonatoAPI(campId)
      .then((c: CampeonatoDetalle) => {
        if (c.estado === 'EN_CURSO' || c.estado === 'FINALIZADO') {
          setBloqueado(
            `El campeonato está ${c.estado}: ya no se puede editar su configuración.`,
          );
          return;
        }
        setInicial({
          nombre: c.nombre,
          descripcion: c.descripcion ?? '',
          pais: c.pais ?? '',
          ciudad: c.ciudad ?? '',
          ubicacion: c.ubicacion ?? '',
          alcance: c.alcance ?? '',
          fechaInicio: c.fechaInicio ?? '',
          fechaFin: c.fechaFin ?? '',
          numTatamis: c.numTatamis ?? 1,
          maxParticipantes: c.maxParticipantes ? String(c.maxParticipantes) : '',
          esPublico: c.esPublico ?? true,
          codigo: c.codigo ?? '',
          costoBase: c.costoBase ?? '',
          mods: c.modalidades.map((m) => m.modalidad),
        });
      })
      .catch((e) => setError(extraerError(e, 'No se pudo cargar el campeonato.')));
  }, [router, campId]);

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-8 sm:px-6">
      <Link href="/admin" className="text-sm" style={{ color: 'var(--text-muted)' }}>
        ← Volver
      </Link>
      <h1 className="mb-1 mt-2 text-2xl font-bold" style={{ color: 'var(--gold)' }}>
        Editar campeonato
      </h1>
      <p className="mb-6 text-sm" style={{ color: 'var(--text-muted)' }}>
        Cambia los datos del evento. Si reduces el nº de tatamis, los sobrantes
        deben tener la cola vacía; una modalidad con inscripciones no se puede quitar.
      </p>

      {error && <p className="msg-error mb-4 text-sm">{error}</p>}
      {bloqueado && (
        <div className="card p-4 text-sm" style={{ color: 'var(--text-muted)' }}>
          {bloqueado}{' '}
          <Link href={`/admin/${campId}/tatamis`} style={{ color: 'var(--gold)' }}>
            Ir a tatamis →
          </Link>
        </div>
      )}
      {!inicial && !bloqueado && !error && (
        <p style={{ color: 'var(--text-muted)' }}>Cargando…</p>
      )}

      {inicial && (
        <CampeonatoForm
          inicial={inicial}
          submitLabel={guardando ? 'Guardando…' : 'Guardar cambios'}
          enviando={guardando}
          onSubmit={async (v) => {
            setError(null);
            setGuardando(true);
            try {
              await editarCampeonatoAPI(campId, aPayload(v));
              router.push('/admin');
            } catch (err) {
              setError(extraerError(err, 'No se pudo guardar el campeonato.'));
              window.scrollTo({ top: 0, behavior: 'smooth' });
            } finally {
              setGuardando(false);
            }
          }}
        />
      )}
    </main>
  );
}
