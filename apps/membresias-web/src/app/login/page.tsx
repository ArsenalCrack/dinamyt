'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { login, guardarToken } from '@/lib/api';
import { getSesion, rutaInicio } from '@/lib/session';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  // SSO desde el portal del ecosystem: si llega #token=<jwt> en el fragmento,
  // se guarda y se entra directo (el fragmento nunca viaja al servidor).
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#token=')) {
      const token = decodeURIComponent(hash.slice(7));
      if (token) {
        guardarToken(token);
        window.history.replaceState(null, '', window.location.pathname);
        // El staff entra al panel del club; el alumno/acudiente a SU estado.
        router.replace(rutaInicio(getSesion()));
      }
    }
  }, [router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      await login(email, password);
      router.push(rutaInicio(getSesion()));
    } catch {
      setError('Correo o contraseña incorrectos.');
    } finally {
      setCargando(false);
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
      <form onSubmit={submit} className="card" style={{ padding: '1.75rem', width: '100%', maxWidth: 380 }}>
        <p className="eyebrow" style={{ marginBottom: '0.35rem' }}>Ecosistema DINAMYT</p>
        <h1 className="display" style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>
          Membresías <span style={{ color: 'var(--gold)' }}>del club</span>
        </h1>
        <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '1.25rem' }}>
          Ingresa con tu cuenta del ecosistema.
        </p>

        <label className="muted" style={{ fontSize: '0.8rem' }}>Correo</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ margin: '0.3rem 0 0.9rem' }} />

        <label className="muted" style={{ fontSize: '0.8rem' }}>Contraseña</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ margin: '0.3rem 0 1.1rem' }} />

        {error && <p className="msg-error" style={{ marginBottom: '0.8rem', fontSize: '0.85rem' }}>{error}</p>}

        <button className="btn btn-gold" type="submit" disabled={cargando} style={{ width: '100%' }}>
          {cargando ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </main>
  );
}
