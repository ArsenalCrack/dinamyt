'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  obtenerToken,
  misInscripcionesAPI,
  misInvitacionesAPI,
  type MiInscripcion,
} from '@/lib/api';
import { getSesion, etiquetaRol, type Sesion } from '@/lib/session';

const NOMBRE_MODALIDAD: Record<string, string> = {
  combate: 'Combate',
  figura_armas: 'Figura con armas',
  figura_manos_libres: 'Figura a manos libres',
  defensa_personal: 'Defensa personal',
  salto_altura: 'Salto alto',
  salto_longitud: 'Salto largo',
};

/**
 * Área del competidor / usuario común (estilo DINAMYT-PROJECT "perfil" +
 * "mis-inscripciones"): sus datos, sus campeonatos con el snapshot INMUTABLE
 * (cinturón y peso del momento en que participó) y sus invitaciones.
 */
export default function PerfilPage() {
  const router = useRouter();
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [inscripciones, setInscripciones] = useState<MiInscripcion[]>([]);
  const [pendientes, setPendientes] = useState(0);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!obtenerToken()) {
      router.replace('/admin/login');
      return;
    }
    setSesion(getSesion());
    Promise.allSettled([misInscripcionesAPI(), misInvitacionesAPI()]).then(
      ([ins, invs]) => {
        if (ins.status === 'fulfilled') setInscripciones(ins.value);
        if (invs.status === 'fulfilled')
          setPendientes(invs.value.filter((i) => i.estado === 'PENDIENTE').length);
        setCargando(false);
      },
    );
  }, [router]);

  if (!sesion) return null;

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-8 sm:px-6">
      {/* ── Mi perfil ─────────────────────────────────────────────────── */}
      <section className="card mb-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--gold)' }}>
              {sesion.fullName || sesion.email}
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {sesion.email}
            </p>
          </div>
          <span className="badge badge-gold">{etiquetaRol(sesion)}</span>
        </div>
        {sesion.role === 'coach' && (
          <p className="mt-3 text-sm" style={{ color: 'var(--text-muted)' }}>
            Como <strong>coach</strong> acompañas y representas a tus
            competidores dentro del campeonato; esta credencial permite que la
            organización y seguridad te identifiquen.
          </p>
        )}
      </section>

      {/* ── Invitaciones pendientes ───────────────────────────────────── */}
      {pendientes > 0 && (
        <Link
          href="/invitaciones"
          className="card mb-6 block p-4 font-semibold transition hover:brightness-110"
          style={{ borderColor: 'var(--gold)' }}
        >
          ✉ Tienes {pendientes} invitación{pendientes > 1 ? 'es' : ''} pendiente
          {pendientes > 1 ? 's' : ''} — tócala para responder →
        </Link>
      )}

      {/* ── Mis inscripciones (historial inmutable) ───────────────────── */}
      <section>
        <h2 className="mb-1 text-lg font-semibold">Mis campeonatos</h2>
        <p className="mb-4 text-sm" style={{ color: 'var(--text-muted)' }}>
          Tu historial guarda el cinturón y peso <strong>del momento en que
          participaste</strong> — no cambia aunque hoy tengas otro grado.
        </p>

        {cargando && <p style={{ color: 'var(--text-muted)' }}>Cargando…</p>}
        {!cargando && inscripciones.length === 0 && (
          <div className="card p-8 text-center" style={{ color: 'var(--text-muted)' }}>
            <p className="mb-2 font-bold">Aún no tienes inscripciones.</p>
            <p className="text-sm">
              Cuando un maestro te inscriba o aceptes una{' '}
              <Link href="/invitaciones" style={{ color: 'var(--gold)' }}>
                invitación
              </Link>
              , tus campeonatos aparecerán aquí.
            </p>
          </div>
        )}

        <ul className="grid gap-3">
          {inscripciones.map((i) => (
            <li key={i.id} className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold">{i.campeonato}</h3>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {[i.ciudad, i.fechaInicio].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <span
                  className={`badge ${
                    i.estado === 'APROBADA'
                      ? 'badge-ok'
                      : i.estado === 'PENDIENTE'
                        ? 'badge-info'
                        : ''
                  }`}
                >
                  {i.estado}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {i.modalidades.map((m) => (
                  <span key={m} className="badge badge-gold">
                    {NOMBRE_MODALIDAD[m] ?? m}
                  </span>
                ))}
                {i.grupoCinturon && <span className="badge">Cinturón: {i.grupoCinturon}</span>}
                {i.pesoInscripcion && <span className="badge">{i.pesoInscripcion} kg</span>}
              </div>
              {i.estadoCampeonato === 'EN_CURSO' && (
                <Link
                  href={`/pantalla/${i.campeonatoId}`}
                  className="btn btn-outline btn-sm mt-3"
                  style={{ borderColor: 'var(--gold)', color: 'var(--gold)' }}
                >
                  ● Ver en vivo →
                </Link>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
