'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { loginAPI, guardarToken, obtenerToken, extraerError } from '@/lib/api';

const CAMPEONATOS_URL =
  process.env.NEXT_PUBLIC_CAMPEONATOS_URL || 'http://localhost:3003';
const MEMBRESIAS_URL =
  process.env.NEXT_PUBLIC_MEMBRESIAS_URL || 'http://localhost:3006';
const ACADEMY_URL =
  process.env.NEXT_PUBLIC_ACADEMY_URL || 'http://localhost:3008';

/**
 * SSO por redirección: una app federada manda aquí con `?redirect=<su login>`;
 * tras iniciar sesión se vuelve a esa URL con el token en el FRAGMENTO
 * (`#token=` nunca viaja al servidor). Solo se permite volver a orígenes
 * conocidos del ecosistema — jamás a un dominio arbitrario.
 */
function destinoSeguro(redirect: string | null): string | null {
  if (!redirect) return null;
  try {
    const url = new URL(redirect);
    const origenesPermitidos = [
      new URL(CAMPEONATOS_URL).origin,
      new URL(MEMBRESIAS_URL).origin,
      new URL(ACADEMY_URL).origin,
    ];
    return origenesPermitidos.includes(url.origin) ? url.toString() : null;
  } catch {
    return null;
  }
}

export default function LoginPage() {
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
  const [verClave, setVerClave] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const redirect = destinoSeguro(search.get('redirect'));

  function entregarSesion(token: string) {
    if (redirect) {
      window.location.href = `${redirect}#token=${encodeURIComponent(token)}`;
      return;
    }
    router.push('/dashboard');
  }

  // Si ya hay sesión y una app pide el token, se entrega sin segundo login.
  useEffect(() => {
    const t = obtenerToken();
    if (t && redirect) entregarSesion(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      const { access_token } = await loginAPI(email, password);
      guardarToken(access_token);
      entregarSesion(access_token);
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
        <label className="mb-1 block text-sm">
          Contraseña
          {/* El ojo no es un adorno: la mitad de los «no puedo entrar» son una
              letra mal tecleada en un teclado de celular. */}
          <span className="relative mt-1 block">
            <input
              type={verClave ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full pr-10"
            />
            <button
              type="button"
              onClick={() => setVerClave(!verClave)}
              aria-label={verClave ? 'Ocultar contraseña' : 'Ver contraseña'}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-sm"
              style={{ color: 'var(--text-muted)' }}
            >
              {verClave ? '🙈' : '👁'}
            </button>
          </span>
        </label>
        {error && (
          <p className="mb-3 text-sm" style={{ color: 'var(--danger)' }}>
            {error}
          </p>
        )}
        <button type="submit" disabled={cargando} className="btn btn-cta w-full">
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
