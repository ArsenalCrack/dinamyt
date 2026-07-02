'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { registerAPI, guardarUsuarioPendiente, extraerError } from '@/lib/api';

export default function RegistroPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    documentId: '',
    password: '',
  });
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  function set(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm({ ...form, [k]: e.target.value });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!consent) {
      setError('Debes aceptar el tratamiento de datos personales (Ley 1581).');
      return;
    }
    setCargando(true);
    try {
      const { userId } = await registerAPI({ ...form, dataConsent: consent });
      guardarUsuarioPendiente(userId);
      router.push('/verificar');
    } catch (err) {
      setError(extraerError(err, 'No se pudo crear la cuenta.'));
    } finally {
      setCargando(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-10">
      <Link href="/" className="flex flex-col items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="DINAMYT" width={72} height={72} />
        <span className="text-xl font-extrabold tracking-wide" style={{ color: 'var(--gold)' }}>
          DINAMYT
        </span>
      </Link>
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-xl border p-6"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <h1 className="mb-6 text-2xl font-bold" style={{ color: 'var(--gold)' }}>
          Crear cuenta
        </h1>
        <label className="mb-3 block text-sm">
          Nombre completo
          <input value={form.fullName} onChange={set('fullName')} required className="mt-1" />
        </label>
        <label className="mb-3 block text-sm">
          Documento de identidad
          <input value={form.documentId} onChange={set('documentId')} required className="mt-1" />
        </label>
        <label className="mb-3 block text-sm">
          Correo
          <input type="email" value={form.email} onChange={set('email')} required className="mt-1" />
        </label>
        <label className="mb-3 block text-sm">
          Contraseña
          <input type="password" value={form.password} onChange={set('password')} required className="mt-1" />
        </label>
        <label className="mb-4 flex items-start gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 w-auto"
          />
          Acepto el tratamiento de mis datos personales (Ley 1581 de 2012).
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
          {cargando ? 'Creando…' : 'Crear cuenta'}
        </button>
        <p className="mt-4 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
          ¿Ya tienes cuenta?{' '}
          <Link href="/login" style={{ color: 'var(--gold)' }}>
            Inicia sesión
          </Link>
        </p>
      </form>
    </main>
  );
}
