'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { registerAPI, guardarUsuarioPendiente, extraerError } from '@/lib/api';
import { soloLetras, soloDigitos } from '@/lib/validacion';

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

  // Saneo por campo: el nombre solo letras (y se guarda en MAYÚSCULAS),
  // el documento solo números.
  function set(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      let v = e.target.value;
      if (k === 'fullName') v = soloLetras(v).toLocaleUpperCase('es');
      if (k === 'documentId') v = soloDigitos(v);
      setForm({ ...form, [k]: v });
    };
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
          Nombre completo (como en tu documento)
          <input
            value={form.fullName}
            onChange={set('fullName')}
            required
            autoComplete="name"
            placeholder="NOMBRE APELLIDO"
            className="mt-1"
          />
        </label>
        <label className="mb-3 block text-sm">
          Documento de identidad (solo números)
          <input
            value={form.documentId}
            onChange={set('documentId')}
            required
            inputMode="numeric"
            minLength={4}
            maxLength={20}
            placeholder="1000000000"
            className="mt-1"
          />
        </label>
        <label className="mb-3 block text-sm">
          Correo
          <input type="email" value={form.email} onChange={set('email')} required className="mt-1" />
        </label>
        <label className="mb-3 block text-sm">
          Contraseña (mín. 8 caracteres)
          <input
            type="password"
            value={form.password}
            onChange={set('password')}
            required
            minLength={8}
            autoComplete="new-password"
            className="mt-1"
          />
        </label>
        <label className="mb-4 flex items-start gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 w-auto"
          />
          <span>
            Acepto el tratamiento de mis datos personales según la{' '}
            <Link href="/privacidad" target="_blank" style={{ color: 'var(--gold)' }}>
              política de privacidad
            </Link>{' '}
            (Ley 1581 de 2012).
          </span>
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
