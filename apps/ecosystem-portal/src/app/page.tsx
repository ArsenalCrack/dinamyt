'use client';

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

const CAMPEONATOS_API =
  process.env.NEXT_PUBLIC_CAMPEONATOS_API_URL || 'http://localhost:3002';
const CAMPEONATOS_URL =
  process.env.NEXT_PUBLIC_CAMPEONATOS_URL || 'http://localhost:3003';
const MEMBRESIAS_URL =
  process.env.NEXT_PUBLIC_MEMBRESIAS_URL || 'http://localhost:3006';

interface CampeonatoVivo {
  id: string;
  nombre: string;
  estado: string;
  fechaInicio: string | null;
}

/**
 * Landing del ecosistema DINAMYT. El hero es la tesis del producto: un
 * marcador de combate corriendo (lo que el sistema hace en un tatami real),
 * y la franja de cinturones como firma — el historial de grados es inmutable.
 */
export default function HomePage() {
  const [enVivo, setEnVivo] = useState<CampeonatoVivo[]>([]);

  useEffect(() => {
    fetch(`${CAMPEONATOS_API}/campeonatos/publico`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: CampeonatoVivo[]) =>
        setEnVivo(data.filter((c) => c.estado === 'EN_CURSO')),
      )
      .catch(() => setEnVivo([]));
  }, []);

  return (
    <main className="min-h-screen">
      {/* ── Barra superior ─────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-20 border-b backdrop-blur"
        style={{ background: 'rgba(14,14,21,0.85)', borderColor: 'var(--border)' }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <span className="inline-flex items-center gap-2.5">
            <img src="/logo.png" alt="DINAMYT" width={32} height={32} />
            <span className="display text-lg" style={{ color: 'var(--gold)' }}>
              DINAMYT
            </span>
          </span>
          <nav className="flex items-center gap-2">
            <a
              href={`${CAMPEONATOS_URL}/campeonatos`}
              className="btn btn-outline hidden sm:inline-flex"
            >
              Campeonatos
            </a>
            <Link href="/planes" className="btn btn-outline hidden sm:inline-flex">
              Planes
            </Link>
            <Link href="/login" className="btn btn-gold">
              Iniciar sesión
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Hero: la tesis ─────────────────────────────────────────────── */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="eyebrow mb-5">Ecosistema deportivo · Hapkido · Colombia</p>
          <h1 className="display text-5xl sm:text-6xl lg:text-7xl">
            Del club
            <br />
            al podio,
            <br />
            <span style={{ color: 'var(--gold)' }}>una cuenta.</span>
          </h1>
          <p
            className="mt-6 max-w-xl text-lg leading-relaxed"
            style={{ color: 'var(--text-muted)' }}
          >
            DINAMYT opera el deporte completo: campeonatos con puntuación en
            vivo desde el tatami, mensualidades y asistencia del club, y un
            historial deportivo que acompaña a cada persona toda la vida.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
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
        </div>

        <MarcadorDemo />
      </section>

      {/* ── Firma: la progresión de cinturones ─────────────────────────── */}
      <div className="cinturon" aria-hidden="true" />

      {/* ── Sucediendo ahora ───────────────────────────────────────────── */}
      {enVivo.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pt-14 sm:px-6">
          <div className="mb-4 flex items-center gap-3">
            <h2 className="display text-2xl">Sucediendo ahora</h2>
            <span className="badge badge-live">
              <span className="punto-vivo" /> En vivo
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {enVivo.map((c) => (
              <a
                key={c.id}
                href={`${CAMPEONATOS_URL}/pantalla/${c.id}`}
                className="card p-5"
              >
                <h3 className="text-lg font-semibold">{c.nombre}</h3>
                <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                  Tatamis y resultados en tiempo real →
                </p>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* ── Las aplicaciones ──────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <p className="eyebrow mb-2">Las aplicaciones</p>
        <h2 className="display mb-10 max-w-2xl text-3xl sm:text-4xl">
          Cada una resuelve una parte del deporte
        </h2>
        <div className="grid gap-5 md:grid-cols-3">
          <article className="card flex flex-col p-6">
            <div className="mb-3 flex items-center justify-between">
              <span className="eyebrow" style={{ color: 'var(--text-muted)' }}>
                Campeonatos
              </span>
              <span className="badge badge-gold">En producción</span>
            </div>
            <h3 className="text-xl font-bold">El torneo, de punta a punta</h3>
            <p className="mt-2 flex-1 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Inscripciones con categorización automática por cinturón, edad y
              peso; llaves, tatamis con cola en vivo, panel de jueces y pantalla
              pública de resultados.
            </p>
            <a
              href={`${CAMPEONATOS_URL}/campeonatos`}
              className="btn btn-outline mt-5 self-start"
            >
              Explorar campeonatos
            </a>
          </article>

          <article className="card flex flex-col p-6">
            <div className="mb-3 flex items-center justify-between">
              <span className="eyebrow" style={{ color: 'var(--text-muted)' }}>
                Membresías
              </span>
              <span className="badge badge-ok">Nuevo</span>
            </div>
            <h3 className="text-xl font-bold">El club, al día</h3>
            <p className="mt-2 flex-1 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Mensualidades por mes calendario, check-in con huella, QR o PIN,
              recordatorios de pago por push y correo, y reportes de recaudo,
              cartera y asistencia.
            </p>
            <a href={MEMBRESIAS_URL} className="btn btn-outline mt-5 self-start">
              Entrar a Membresías
            </a>
          </article>

          <article className="card flex flex-col p-6" style={{ opacity: 0.75 }}>
            <div className="mb-3 flex items-center justify-between">
              <span className="eyebrow" style={{ color: 'var(--text-muted)' }}>
                Academy
              </span>
              <span className="badge">Próximamente</span>
            </div>
            <h3 className="text-xl font-bold">La formación del practicante</h3>
            <p className="mt-2 flex-1 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Planes de estudio, evaluaciones de grado y seguimiento del avance
              por cinturón, conectados al mismo perfil de la persona.
            </p>
          </article>
        </div>
      </section>

      {/* ── El día a día, por sistema (en la voz de quien lo usa) ───────── */}
      <section
        className="border-y py-16"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <p className="eyebrow mb-2">Qué puedes hacer</p>
          <h2 className="display mb-10 max-w-2xl text-3xl sm:text-4xl">
            El día a día del deporte, resuelto
          </h2>
          <div className="grid gap-8 md:grid-cols-3">
            <div>
              <h3 className="mb-4 flex items-center gap-2 text-lg font-bold">
                <span
                  aria-hidden="true"
                  style={{ width: 10, height: 22, borderRadius: 2, background: 'var(--gold)' }}
                />
                En el club — Membresías
              </h3>
              <ul className="space-y-3 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                <li>Tu alumno llega, pone la huella o su PIN, y la asistencia queda registrada.</li>
                <li>Ves de un vistazo quién está al día, quién está por vencer y quién debe.</li>
                <li>Registras el pago en dos toques y el vencimiento se recalcula solo, por mes calendario.</li>
                <li>Cada alumno recibe su recordatorio antes del vencimiento, sin que persigas a nadie.</li>
              </ul>
            </div>
            <div>
              <h3 className="mb-4 flex items-center gap-2 text-lg font-bold">
                <span
                  aria-hidden="true"
                  style={{ width: 10, height: 22, borderRadius: 2, background: 'var(--hong)' }}
                />
                En el torneo — Campeonatos
              </h3>
              <ul className="space-y-3 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                <li>Creas el campeonato, inscribes a tus competidores y el sistema arma categorías y llaves.</li>
                <li>Cada tatami tiene su cola de combates; los jueces puntúan desde su puesto, incluso sin internet.</li>
                <li>Las familias siguen el marcador en vivo desde el celular en la pantalla pública.</li>
                <li>Al declarar el ganador, el resultado queda publicado al instante.</li>
              </ul>
            </div>
            <div>
              <h3 className="mb-4 flex items-center gap-2 text-lg font-bold">
                <span
                  aria-hidden="true"
                  style={{ width: 10, height: 22, borderRadius: 2, background: 'var(--chung)' }}
                />
                En la formación — Academy
                <span className="badge">Próximamente</span>
              </h3>
              <ul className="space-y-3 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                <li>Verás tu plan de estudio y exactamente qué te falta para el próximo cinturón.</li>
                <li>Tus evaluaciones de grado quedarán guardadas en tu perfil para siempre.</li>
                <li>El maestro hará seguimiento del progreso de cada alumno desde un solo lugar.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Para quién ────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <p className="eyebrow mb-2">Para todo el tatami</p>
        <h2 className="display mb-10 text-3xl sm:text-4xl">Cada rol tiene su panel</h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Organizaciones', 'Federaciones y clubes gestionan eventos, gente y suscripciones con un plan por organización.'],
            ['Maestros', 'Cobran mensualidades, pasan asistencia y promueven grados de sus alumnos.'],
            ['Jueces', 'Puntúan combate desde su tatami asignado, incluso sin internet.'],
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
        <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
          <Link href="/registro" className="btn btn-gold px-7 py-3 text-base">
            Empieza con tu club
          </Link>
          <Link href="/planes" className="btn btn-outline px-7 py-3 text-base">
            Conoce los planes
          </Link>
        </div>
      </section>

      {/* El pie ya no vive aquí: es el mismo del layout, en todas las
          pantallas (`components/PieDePagina.tsx`). */}
    </main>
  );
}

/**
 * Marcador de demostración: el panel de mesa en miniatura, con el cronómetro
 * corriendo. Es la firma del hero — muestra lo que el sistema hace en un
 * combate real. Respeta prefers-reduced-motion (queda congelado en 01:23).
 */
function MarcadorDemo() {
  const [segundos, setSegundos] = useState(83); // 01:23 de la R2
  const intervalo = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducido) return;
    intervalo.current = setInterval(() => {
      setSegundos((s) => (s <= 0 ? 120 : s - 1)); // reinicia la ronda al llegar a 0
    }, 1000);
    return () => {
      if (intervalo.current) clearInterval(intervalo.current);
    };
  }, []);

  const mm = String(Math.floor(segundos / 60)).padStart(2, '0');
  const ss = String(segundos % 60).padStart(2, '0');

  return (
    <div aria-label="Demostración del marcador de combate">
      <div className="marcador">
        <div className="marcador-head">
          <span className="eyebrow" style={{ color: 'var(--text-muted)' }}>
            Tatami 1 · Semifinal · R2
          </span>
          <span
            className="mono text-lg font-semibold"
            style={{ color: 'var(--gold)' }}
          >
            {mm}:{ss}
          </span>
        </div>

        <div className="marcador-fila">
          <span
            aria-hidden="true"
            style={{ background: 'var(--chung)', height: '100%', borderRadius: 2 }}
          />
          <div>
            <p className="font-semibold">S. Rodríguez</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Chung · Liga del Valle
            </p>
          </div>
          <span className="marcador-puntos" style={{ color: 'var(--chung)' }}>
            7
          </span>
        </div>

        <div className="marcador-fila">
          <span
            aria-hidden="true"
            style={{ background: 'var(--hong)', height: '100%', borderRadius: 2 }}
          />
          <div>
            <p className="font-semibold">J. Valencia</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Hong · Liga de Antioquia
            </p>
          </div>
          <span className="marcador-puntos" style={{ color: 'var(--hong)' }}>
            5
          </span>
        </div>

        <div
          className="flex items-center justify-between gap-3 border-t px-4 py-2.5"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}
        >
          <span className="mono text-xs" style={{ color: 'var(--text-muted)' }}>
            KyongGo 1 · GamJeum 0
          </span>
          <span className="mono text-xs" style={{ color: 'var(--text-muted)' }}>
            4 réferis + central
          </span>
        </div>
      </div>
      {/* Membresías también vive en el hero: el kiosco confirma un check-in. */}
      <div
        className="card mt-3 flex items-center justify-between gap-3 px-4 py-3"
        role="presentation"
      >
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold"
            style={{ background: 'rgba(62,207,142,0.15)', color: 'var(--ok)' }}
          >
            ✓
          </span>
          <div>
            <p className="text-sm font-semibold">Ana Gómez marcó asistencia</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Kiosco del club · huella
            </p>
          </div>
        </div>
        <span className="badge badge-ok">Al día · 12 d</span>
      </div>
      <p
        className="mono mt-3 text-center text-xs"
        style={{ color: 'var(--text-muted)' }}
      >
        La mesa de puntuación y el kiosco del club, tal como se ven en vivo.
      </p>
    </div>
  );
}
