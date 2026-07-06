'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { obtenerToken, miCuentaAPI, type MiCuenta } from '@/lib/api';
import { getSesion, etiquetaRol, type Sesion } from '@/lib/session';
import { Avatar } from '@/components/Avatar';

const PORTAL_URL =
  process.env.NEXT_PUBLIC_ECOSYSTEM_PORTAL_URL || 'http://localhost:3000';

/**
 * Mi perfil — los DATOS DE LA PERSONA viven en el portal del ecosistema
 * (una persona, un perfil para todas las apps). Aquí solo se muestra un
 * resumen y se enlaza al portal; la contraseña también se cambia SOLO allá.
 * Lo propio de Campeonatos (inscripciones, estadísticas) está en «Mi panel».
 */
export default function PerfilPage() {
  const router = useRouter();
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [cuenta, setCuenta] = useState<MiCuenta | null>(null);

  useEffect(() => {
    if (!obtenerToken()) {
      router.replace('/admin/login');
      return;
    }
    setSesion(getSesion());
    miCuentaAPI()
      .then(setCuenta)
      .catch(() => setCuenta(null));
  }, [router]);

  if (!sesion) return null;

  return (
    <main className="mx-auto min-h-screen max-w-xl px-4 py-10 sm:px-6">
      <section className="card p-6 text-center">
        <div className="mb-4 flex justify-center">
          <Avatar nombre={sesion.fullName || sesion.email} size={72} />
        </div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--gold)' }}>
          {sesion.fullName || sesion.email}
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {sesion.email} · {etiquetaRol(sesion)}
        </p>

        {cuenta && (
          <dl
            className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 border-t pt-4 text-left text-sm sm:grid-cols-2"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="flex justify-between gap-2">
              <dt style={{ color: 'var(--text-muted)' }}>Documento</dt>
              <dd className="font-semibold">{cuenta.documentId}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt style={{ color: 'var(--text-muted)' }}>Miembro desde</dt>
              <dd className="font-semibold">
                {cuenta.createdAt
                  ? new Date(cuenta.createdAt).toLocaleDateString('es')
                  : '—'}
              </dd>
            </div>
          </dl>
        )}

        <div
          className="mt-5 rounded-lg border px-4 py-3 text-sm"
          style={{ borderColor: 'var(--gold-dim)', color: 'var(--text-muted)' }}
        >
          Tus datos personales (foto, teléfono, contacto de emergencia) y tu{' '}
          <strong>contraseña</strong> se administran en un solo lugar: tu perfil
          del ecosistema DINAMYT.
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <a href={`${PORTAL_URL}/perfil`} className="btn btn-gold w-full">
            Abrir mi perfil en el portal DINAMYT →
          </a>
          <Link href="/panel" className="btn btn-outline w-full">
            Mis inscripciones y estadísticas
          </Link>
        </div>
      </section>
    </main>
  );
}
