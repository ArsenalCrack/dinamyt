import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-10 px-6 text-center">
      <div>
        <h1
          className="text-6xl font-extrabold tracking-tight"
          style={{ color: 'var(--gold)' }}
        >
          DINAMYT
        </h1>
        <p className="mt-2 text-2xl font-semibold">Ecosystem</p>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
          Una sola cuenta para todo el ecosistema marcial
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-4">
        <Link
          href="/login"
          className="rounded-lg px-6 py-3 font-semibold"
          style={{ background: 'var(--gold)', color: '#14141e' }}
        >
          Iniciar sesión
        </Link>
        <Link
          href="/registro"
          className="rounded-lg border px-6 py-3 font-semibold"
          style={{ borderColor: 'var(--border)' }}
        >
          Crear cuenta
        </Link>
        <Link
          href="/planes"
          className="rounded-lg border px-6 py-3 font-semibold"
          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
        >
          Ver planes
        </Link>
      </div>
    </main>
  );
}
