import Link from 'next/link';
import { LogoMark } from '@/components/Logo';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-10 px-6 text-center">
      <div className="flex flex-col items-center">
        <LogoMark size={88} />
        <h1
          className="mt-5 text-5xl font-extrabold tracking-tight sm:text-6xl"
          style={{ color: 'var(--gold)' }}
        >
          DINAMYT
        </h1>
        <p className="mt-2 text-xl font-semibold sm:text-2xl">
          Campeonatos de Hapkido
        </p>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
          Gestión, puntuación en vivo y resultados — ecosistema DINAMYT
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-4">
        <Link href="/pantalla" className="btn btn-gold px-6 py-3 text-base">
          Pantalla pública
        </Link>
        <Link href="/admin" className="btn btn-outline px-6 py-3 text-base">
          Panel de gestión
        </Link>
      </div>
    </main>
  );
}
