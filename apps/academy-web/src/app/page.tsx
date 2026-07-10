'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { obtenerToken } from '@/lib/api';
import { getRolEfectivo, rutaInicio } from '@/lib/session';

/** Portada: con sesión redirige al panel del rol; sin sesión, invita a entrar. */
export default function Home() {
  const router = useRouter();
  const [listo, setListo] = useState(false);

  useEffect(() => {
    if (obtenerToken()) {
      void getRolEfectivo().then((rol) => router.replace(rutaInicio(rol)));
    } else {
      setListo(true);
    }
  }, [router]);

  if (!listo) return null;

  return (
    <main
      style={{
        minHeight: '80vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
      }}
    >
      <div style={{ maxWidth: 640, textAlign: 'center' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="DINAMYT" width={72} height={72} style={{ margin: '0 auto 1rem' }} />
        <p className="eyebrow" style={{ marginBottom: '0.5rem' }}>Ecosistema DINAMYT</p>
        <h1 className="display" style={{ fontSize: 'clamp(2rem, 6vw, 3.2rem)', marginBottom: '0.75rem' }}>
          DINAMYT <span style={{ color: 'var(--gold)' }}>Academy</span>
        </h1>
        <hr className="cinturon" style={{ maxWidth: 320, margin: '0 auto 1rem' }} />
        <p className="muted" style={{ fontSize: '1rem', marginBottom: '1.75rem' }}>
          El programa técnico de tu arte marcial, grado a grado: material del
          maestro, evaluaciones con evidencias y tu progreso hasta el cinturón
          negro. Empezamos con Hapkido (GHA / Hapkido del Cóndor).
        </p>
        <Link href="/login" className="btn btn-cta" style={{ padding: '0.7rem 2.2rem', fontSize: '1rem' }}>
          Entrar a Academy
        </Link>
      </div>
    </main>
  );
}
