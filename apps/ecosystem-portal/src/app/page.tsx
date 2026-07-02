'use client';

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from 'react';
import Link from 'next/link';

const CAMPEONATOS_API =
  process.env.NEXT_PUBLIC_CAMPEONATOS_API_URL || 'http://localhost:3002';
const CAMPEONATOS_URL =
  process.env.NEXT_PUBLIC_CAMPEONATOS_URL || 'http://localhost:3003';

interface CampeonatoVivo {
  id: string;
  nombre: string;
  estado: string;
  fechaInicio: string | null;
}

/**
 * Landing pública del ecosistema DINAMYT: qué es, sus aplicaciones, los
 * campeonatos EN VIVO (con enlace a la pantalla pública de resultados) y
 * acceso a planes / registro. Una sola cuenta para todo el ecosistema.
 */
export default function HomePage() {
  const [enVivo, setEnVivo] = useState<CampeonatoVivo[]>([]);

  useEffect(() => {
    fetch(`${CAMPEONATOS_API}/campeonatos/publico`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: CampeonatoVivo[]) => setEnVivo(data))
      .catch(() => setEnVivo([]));
  }, []);

  return (
    <main className="min-h-screen">
      {/* ── Barra superior ─────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-20 border-b"
        style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <span className="inline-flex items-center gap-2.5">
            <img src="/logo.png" alt="DINAMYT" width={34} height={34} />
            <span className="text-lg font-extrabold tracking-wide" style={{ color: 'var(--gold)' }}>
              DINAMYT
            </span>
          </span>
          <nav className="flex items-center gap-2">
            <Link href="/planes" className="btn btn-outline hidden sm:inline-flex">
              Planes
            </Link>
            <Link href="/login" className="btn btn-gold">
              Iniciar sesión
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-16 text-center sm:px-6 sm:py-24">
        <img src="/logo.png" alt="DINAMYT" width={110} height={110} />
        <h1 className="max-w-3xl text-4xl font-extrabold tracking-tight sm:text-6xl">
          El ecosistema digital del{' '}
          <span style={{ color: 'var(--gold)' }}>deporte marcial</span>
        </h1>
        <p className="max-w-2xl text-lg" style={{ color: 'var(--text-muted)' }}>
          Gestión de campeonatos con puntuación en tiempo real, formación
          académica y una sola identidad para atletas, entrenadores, jueces y
          organizaciones de Hapkido.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/registro" className="btn btn-gold px-7 py-3 text-base">
            Crear cuenta gratis
          </Link>
          <a
            href={`${CAMPEONATOS_URL}/pantalla`}
            className="btn btn-outline px-7 py-3 text-base"
          >
            Ver resultados en vivo
          </a>
        </div>
      </section>

      {/* ── Campeonatos en vivo ───────────────────────────────────────── */}
      {enVivo.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <div className="mb-4 flex items-center gap-3">
            <h2 className="text-2xl font-bold">Sucediendo ahora</h2>
            <span className="badge badge-live">● EN VIVO</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {enVivo.map((c) => (
              <a
                key={c.id}
                href={`${CAMPEONATOS_URL}/pantalla/${c.id}`}
                className="card p-5 transition hover:brightness-110"
              >
                <h3 className="text-lg font-semibold">{c.nombre}</h3>
                <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                  Sigue los tatamis y resultados en tiempo real →
                </p>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* ── Las aplicaciones ──────────────────────────────────────────── */}
      <section
        className="border-y py-16"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="mb-2 text-center text-2xl font-bold sm:text-3xl">
            Un ecosistema, tres pilares
          </h2>
          <p className="mx-auto mb-10 max-w-xl text-center" style={{ color: 'var(--text-muted)' }}>
            Cada aplicación resuelve una parte del deporte; tu cuenta DINAMYT
            las conecta todas.
          </p>
          <div className="grid gap-5 md:grid-cols-3">
            {[
              {
                titulo: 'Campeonatos',
                desc: 'Crea y dirige torneos: inscripciones con categorización automática, llaves, tatamis con cola en vivo, puntuación de combate con 4 réferis + central y pantalla pública de resultados.',
                extra: '⚔',
                activo: true,
              },
              {
                titulo: 'Academy',
                desc: 'Formación y progreso académico del practicante: planes de estudio, evaluaciones de grado y seguimiento del avance por cinturón. Próximamente.',
                extra: '🥋',
                activo: false,
              },
              {
                titulo: 'Identidad única',
                desc: 'Un perfil por persona con su historial deportivo INMUTABLE: cada participación guarda el cinturón, peso y club del momento en que compitió.',
                extra: '🪪',
                activo: true,
              },
            ].map((a) => (
              <article key={a.titulo} className="card p-6" style={{ background: 'var(--bg)' }}>
                <span className="text-3xl">{a.extra}</span>
                <h3 className="mt-3 flex items-center gap-2 text-xl font-bold">
                  {a.titulo}
                  {!a.activo && <span className="badge">Próximamente</span>}
                </h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  {a.desc}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Para quién ────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="mb-10 text-center text-2xl font-bold sm:text-3xl">
          Hecho para todo el tatami
        </h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Organizaciones', 'Federaciones, ligas, clubes y academias gestionan sus eventos y su gente con un plan por organización.'],
            ['Entrenadores', 'Inscriben a sus competidores, siguen sus resultados y su progreso histórico.'],
            ['Jueces', 'Puntúan combate y figuras desde su tatami asignado, incluso sin internet.'],
            ['Competidores', 'Aceptan invitaciones, eligen modalidades y conservan su historial de por vida.'],
          ].map(([titulo, desc]) => (
            <article key={titulo} className="card p-5">
              <h3 className="font-bold" style={{ color: 'var(--gold)' }}>
                {titulo}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                {desc}
              </p>
            </article>
          ))}
        </div>
        <div className="mt-10 text-center">
          <Link href="/planes" className="btn btn-outline px-7 py-3 text-base">
            Conoce los planes
          </Link>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className="border-t py-8" style={{ borderColor: 'var(--border)' }}>
        <div
          className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 text-sm sm:px-6"
          style={{ color: 'var(--text-muted)' }}
        >
          <span className="inline-flex items-center gap-2">
            <img src="/logo.png" alt="" width={22} height={22} />
            DINAMYT Ecosystem · Hapkido
          </span>
          <nav className="flex gap-4">
            <Link href="/planes">Planes</Link>
            <Link href="/registro">Registro</Link>
            <a href={`${CAMPEONATOS_URL}/pantalla`}>Resultados</a>
          </nav>
        </div>
      </footer>
    </main>
  );
}
