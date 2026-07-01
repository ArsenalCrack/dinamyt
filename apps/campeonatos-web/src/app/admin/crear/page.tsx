'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { obtenerToken, crearCampeonatoAPI, extraerError } from '@/lib/api';
import { getSesion, esAdmin } from '@/lib/session';
import { CampeonatoForm, aPayload } from '@/components/CampeonatoForm';

export default function CrearCampeonatoPage() {
  const router = useRouter();
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!obtenerToken()) {
      router.replace('/admin/login');
      return;
    }
    if (!esAdmin(getSesion())) router.replace('/admin');
  }, [router]);

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-8 sm:px-6">
      <Link href="/admin" className="text-sm" style={{ color: 'var(--text-muted)' }}>
        ← Volver
      </Link>
      <h1 className="mb-1 mt-2 text-2xl font-bold" style={{ color: 'var(--gold)' }}>
        Nuevo campeonato
      </h1>
      <p className="mb-6 text-sm" style={{ color: 'var(--text-muted)' }}>
        Define los datos del evento y las modalidades. Las <strong>categorías</strong>{' '}
        (cinturón, edad, peso, género) se configuran luego en «Secciones».
      </p>

      {error && <p className="msg-error mb-4 text-sm">{error}</p>}

      <CampeonatoForm
        submitLabel={creando ? 'Creando…' : 'Crear campeonato'}
        enviando={creando}
        onSubmit={async (v) => {
          setError(null);
          setCreando(true);
          try {
            await crearCampeonatoAPI(aPayload(v));
            router.push('/admin');
          } catch (err) {
            setError(extraerError(err, 'No se pudo crear el campeonato.'));
            window.scrollTo({ top: 0, behavior: 'smooth' });
          } finally {
            setCreando(false);
          }
        }}
      />
    </main>
  );
}
