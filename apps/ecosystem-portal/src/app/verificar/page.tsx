'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { verifyEmailAPI, obtenerUsuarioPendiente, extraerError } from '@/lib/api';

export default function VerificarPage() {
  const [userId, setUserId] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    const u = obtenerUsuarioPendiente();
    if (u) setUserId(u);
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      await verifyEmailAPI(userId, code);
      setOk(true);
    } catch (err) {
      setError(extraerError(err, 'Código inválido o expirado.'));
    } finally {
      setCargando(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div
        className="w-full max-w-sm rounded-xl border p-6"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <h1 className="mb-6 text-2xl font-bold" style={{ color: 'var(--gold)' }}>
          Verifica tu correo
        </h1>
        {ok ? (
          <div>
            <p className="mb-4">¡Correo verificado! Ya puedes iniciar sesión.</p>
            <Link
              href="/login"
              className="inline-block rounded-lg px-4 py-2 font-semibold"
              style={{ background: 'var(--accion)', color: 'var(--accion-texto)' }}
            >
              Ir a iniciar sesión
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit}>
            <p className="mb-4 text-sm" style={{ color: 'var(--text-muted)' }}>
              Ingresa el código de 6 dígitos que enviamos a tu correo.
            </p>
            <label className="mb-3 block text-sm">
              ID de usuario
              <input value={userId} onChange={(e) => setUserId(e.target.value)} required className="mt-1" />
            </label>
            <label className="mb-4 block text-sm">
              Código
              <input value={code} onChange={(e) => setCode(e.target.value)} required className="mt-1" />
            </label>
            {error && (
              <p className="mb-3 text-sm" style={{ color: 'var(--danger)' }}>
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={cargando}
              className="w-full rounded-lg px-4 py-2 font-semibold"
              style={{ background: 'var(--accion)', color: 'var(--accion-texto)' }}
            >
              {cargando ? 'Verificando…' : 'Verificar'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
