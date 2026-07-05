'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { loginAPI, guardarToken, extraerError } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      const { access_token } = await loginAPI(email, password);
      guardarToken(access_token);
      router.push('/dashboard');
    } catch (err) {
      setError(extraerError(err, 'No se pudo iniciar sesión.'));
    } finally {
      setCargando(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6">
      <Link href="/" className="flex flex-col items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="DINAMYT" width={72} height={72} />
        <span className="display text-xl" style={{ color: 'var(--gold)' }}>
          DINAMYT
        </span>
      </Link>
      <form onSubmit={onSubmit} className="card w-full max-w-sm p-6">
        <h1 className="display mb-1 text-2xl">Iniciar sesión</h1>
        <p className="mb-6 text-sm" style={{ color: 'var(--text-muted)' }}>
          Una cuenta para todo el ecosistema.
        </p>
        <label className="mb-3 block text-sm">
          Correo
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="mt-1"
          />
        </label>
        <label className="mb-4 block text-sm">
          Contraseña
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="mt-1"
          />
        </label>
        {error && (
          <p className="mb-3 text-sm" style={{ color: 'var(--danger)' }}>
            {error}
          </p>
        )}
        <button type="submit" disabled={cargando} className="btn btn-gold w-full">
          {cargando ? 'Entrando…' : 'Entrar'}
        </button>
        <p className="mt-4 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
          ¿No tienes cuenta?{' '}
          <Link href="/registro" style={{ color: 'var(--gold)' }}>
            Regístrate
          </Link>
        </p>
      </form>
    </main>
  );
}
