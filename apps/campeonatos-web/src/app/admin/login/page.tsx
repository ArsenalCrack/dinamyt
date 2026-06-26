'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { loginAPI, guardarToken, extraerError } from '@/lib/api';

export default function AdminLoginPage() {
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
      router.push('/admin');
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
        <h1 className="mb-1 text-2xl font-bold" style={{ color: 'var(--gold)' }}>
          Panel de administración
        </h1>
        <p className="mb-6 text-sm" style={{ color: 'var(--text-muted)' }}>
          Inicia sesión con tu cuenta del ecosistema DINAMYT.
        </p>
        <label className="mb-3 block text-sm">
          Correo
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={inputStyle}
          />
        </label>
        <label className="mb-4 block text-sm">
          Contraseña
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={inputStyle}
          />
        </label>
        {error && (
          <p className="mb-3 text-sm" style={{ color: '#ff5577' }}>
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
      </form>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  marginTop: '0.25rem',
  width: '100%',
  background: 'var(--bg-input, #0e0e18)',
  border: '1px solid var(--border)',
  borderRadius: '0.5rem',
  padding: '0.6rem 0.8rem',
  color: 'var(--text)',
};
