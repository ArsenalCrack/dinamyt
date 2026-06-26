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
    <main className="flex min-h-screen items-center justify-center px-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-xl border p-6"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <h1 className="mb-6 text-2xl font-bold" style={{ color: 'var(--gold)' }}>
          Iniciar sesión
        </h1>
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
        <button
          type="submit"
          disabled={cargando}
          className="w-full rounded-lg px-4 py-2 font-semibold"
          style={{ background: 'var(--gold)', color: '#14141e' }}
        >
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
