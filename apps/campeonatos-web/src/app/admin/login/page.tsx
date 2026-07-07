'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { loginAPI, guardarToken, extraerError } from '@/lib/api';
import { getSesion, rutaInicio } from '@/lib/session';
import { Logo } from '@/components/Logo';

const PORTAL_URL =
  process.env.NEXT_PUBLIC_ECOSYSTEM_PORTAL_URL || 'http://localhost:3000';

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  // ¿A dónde volver tras entrar? Solo rutas internas (nunca URLs externas).
  const volver = search.get('volver');
  const destino = (): string =>
    volver && volver.startsWith('/') ? volver : rutaInicio(getSesion());

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
        router.replace(destino());
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      const { access_token } = await loginAPI(email, password);
      guardarToken(access_token);
      // Enruta según el rol (juez → su tatami; usuario → su panel).
      router.push(destino());
    } catch (err) {
      setError(extraerError(err, 'No se pudo iniciar sesión.'));
    } finally {
      setCargando(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-10">
      <Logo size={48} />
      <form onSubmit={onSubmit} className="card w-full max-w-sm p-6">
        <h1 className="mb-1 text-2xl font-bold" style={{ color: 'var(--gold)' }}>
          DINAMYT Campeonatos
        </h1>
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
            autoComplete="email"
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
            autoComplete="current-password"
            className="mt-1"
          />
        </label>
        {error && (
          <p className="mb-3 text-sm" style={{ color: '#ff5577' }}>
            {error}
          </p>
        )}
        <button type="submit" disabled={cargando} className="btn btn-cta w-full">
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

        {/* Salidas al ecosistema: registro y panel principal */}
        <p className="mt-4 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
          ¿No tienes cuenta?{' '}
          <a href={`${PORTAL_URL}/registro`} style={{ color: 'var(--gold)' }}>
            Regístrate en el portal
          </a>
        </p>
        <p className="mt-1 text-center text-sm">
          <a href={`${PORTAL_URL}/dashboard`} style={{ color: 'var(--text-muted)' }}>
            ⇱ Ir al panel principal DINAMYT
          </a>
        </p>
      </form>
    </main>
  );
}
