'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { guardarToken, mensajeError, obtenerConfig, obtenerMe } from '@/lib/api';
import { rutaInicio, useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { ControlesApariencia } from '@/components/ControlesApariencia';

const PORTAL_URL = process.env.NEXT_PUBLIC_ECOSYSTEM_PORTAL_URL || '';

export default function Login() {
  const router = useRouter();
  const { t } = useI18n();
  const { login, user, cargando } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [sso, setSso] = useState(false);

  // Quien ya tiene sesión no debería quedarse mirando el formulario.
  useEffect(() => {
    if (!cargando && user) router.replace(rutaInicio(user));
  }, [cargando, user, router]);

  // El botón de SSO solo se dibuja si esta instalación lo tiene configurado.
  useEffect(() => {
    obtenerConfig()
      .then((c) => setSso(c.sso && Boolean(PORTAL_URL)))
      .catch(() => setSso(false));
  }, []);

  // SSO por redirección: el portal vuelve con #token=<jwt> en el fragmento,
  // que nunca viaja al servidor.
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith('#token=')) return;
    const token = decodeURIComponent(hash.slice(7));
    if (!token) return;
    guardarToken(token);
    window.history.replaceState(null, '', window.location.pathname);
    obtenerMe()
      .then(({ user: u }) => router.replace(rutaInicio(u)))
      .catch(() => setError(t('login.error')));
  }, [router, t]);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      const u = await login(email, password);
      router.replace(rutaInicio(u));
    } catch (err) {
      setError(mensajeError(err, t('login.error')));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
      }}
    >
      <form
        onSubmit={enviar}
        className="card"
        style={{ padding: '1.75rem', width: '100%', maxWidth: 380 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="DINAMYT"
          width={56}
          height={56}
          style={{ marginBottom: '0.75rem' }}
        />
        <p className="eyebrow" style={{ marginBottom: '0.35rem' }}>
          {t('login.eyebrow')}
        </p>
        <h1 className="display" style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>
          {t('login.titulo')}{' '}
          <span style={{ color: 'var(--gold)' }}>{t('login.tituloAcento')}</span>
        </h1>
        <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '1.25rem' }}>
          {t('login.subtitulo')}
        </p>

        <label className="muted" style={{ fontSize: '0.8rem' }} htmlFor="email">
          {t('login.correo')}
        </label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ margin: '0.3rem 0 0.9rem' }}
        />

        <label className="muted" style={{ fontSize: '0.8rem' }} htmlFor="password">
          {t('login.contrasena')}
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{ margin: '0.3rem 0 1.1rem' }}
        />

        {error && (
          <p className="msg-error" style={{ marginBottom: '0.8rem', fontSize: '0.85rem' }}>
            {error}
          </p>
        )}

        <button
          className="btn btn-cta"
          type="submit"
          disabled={enviando}
          style={{ width: '100%' }}
        >
          {enviando ? t('login.entrando') : t('login.entrar')}
        </button>

        {sso && (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                margin: '1rem 0',
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
              }}
            >
              <span style={{ height: 1, flex: 1, background: 'var(--border)' }} />
              {t('login.o')}
              <span style={{ height: 1, flex: 1, background: 'var(--border)' }} />
            </div>
            <a
              className="btn btn-outline"
              style={{ width: '100%' }}
              href={`${PORTAL_URL}/login?redirect=${encodeURIComponent(
                typeof window !== 'undefined' ? `${window.location.origin}/login` : '',
              )}`}
            >
              {t('login.sso')}
            </a>
          </>
        )}
      </form>

      {/* Sin sesión no hay NavBar: el tema y el idioma viven aquí. */}
      <ControlesApariencia />
    </main>
  );
}
