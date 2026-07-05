'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { loginAPI, guardarToken, extraerError } from '@/lib/api';
import { getSesion, rutaInicio } from '@/lib/session';
import { Logo } from '@/components/Logo';

const PORTAL_URL =
  process.env.NEXT_PUBLIC_ECOSYSTEM_PORTAL_URL || 'http://localhost:3000';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  // SSO desde el portal del ecosystem: si llega #token=<jwt> en el fragmento,
  // se guarda y se entra directo (sin segundo login). El fragmento nunca se
  // envía al servidor.
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#token=')) {
      const token = decodeURIComponent(hash.slice(7));
      if (token) {
        guardarToken(token);
        window.history.replaceState(null, '', window.location.pathname);
        router.replace(rutaInicio(getSesion()));
      }
    }
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      const { access_token } = await loginAPI(email, password);
      guardarToken(access_token);
      // Enruta según el rol (juez → panel de combate; resto → gestión).
      router.push(rutaInicio(getSesion()));
    } catch (err) {
      setError(extraerError(err, 'No se pudo iniciar sesión.'));
    } finally {
      setCargando(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6">
      <Logo size={48} />
      <form
        onSubmit={onSubmit}
        className="card w-full max-w-sm p-6"
      >
        <h1 className="mb-1 text-2xl font-bold" style={{ color: 'var(--gold)' }}>
          Panel de gestión
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
        <button type="submit" disabled={cargando} className="btn btn-gold w-full">
          {cargando ? 'Entrando…' : 'Entrar'}
        </button>

        {/* SSO por redirección: el portal devuelve aquí con #token= */}
        <div
          className="my-4 flex items-center gap-3 text-xs"
          style={{ color: 'var(--text-muted)' }}
        >
          <span className="h-px flex-1" style={{ background: 'var(--border)' }} />
          o
          <span className="h-px flex-1" style={{ background: 'var(--border)' }} />
        </div>
        <a
          className="btn btn-outline w-full"
          href={`${PORTAL_URL}/login?redirect=${encodeURIComponent(
            typeof window !== 'undefined'
              ? `${window.location.origin}/admin/login`
              : '',
          )}`}
        >
          Entrar con el portal DINAMYT
        </a>
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
