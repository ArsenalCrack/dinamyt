import Link from 'next/link';
import { LogoMark } from '@/components/Logo';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-10 px-6 text-center">
      <div className="flex flex-col items-center">
        <LogoMark size={88} />
        <p className="eyebrow mt-6">Ecosistema DINAMYT · Hapkido</p>
        <h1 className="display mt-3 text-4xl sm:text-7xl" style={{ color: 'var(--gold)' }}>
          Campeonatos
        </h1>
        <p className="mt-3 max-w-md text-lg" style={{ color: 'var(--text-muted)' }}>
          Inscripción, llaves, tatamis y puntuación de combate en vivo, con
          resultados públicos al instante.
        </p>
      </div>

      <div className="cinturon w-40 rounded-full" aria-hidden="true" />

      <div className="flex flex-wrap justify-center gap-4">
        <Link href="/campeonatos" className="btn btn-gold px-6 py-3 text-base">
          Ver campeonatos
        </Link>
        <Link href="/pantalla" className="btn btn-outline px-6 py-3 text-base">
          Pantalla en vivo
        </Link>
        <Link href="/admin" className="btn btn-outline px-6 py-3 text-base">
          Panel de gestión
        </Link>
      </div>
    </main>
  );
}
