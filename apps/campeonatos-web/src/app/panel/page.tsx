'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  obtenerToken,
  misInscripcionesAPI,
  misInvitacionesAPI,
  misEstadisticasAPI,
  miPerfilCompetidorAPI,
  type MiInscripcion,
  type MisEstadisticas,
  type MiPerfilCompetidor,
} from '@/lib/api';
import { getSesion, etiquetaRol, type Sesion } from '@/lib/session';
import { Avatar } from '@/components/Avatar';

const PORTAL_URL =
  process.env.NEXT_PUBLIC_ECOSYSTEM_PORTAL_URL || 'http://localhost:3000';

const NOMBRE_MODALIDAD: Record<string, string> = {
  combate: 'Combate',
  figura_armas: 'Figura con armas',
  figura_manos_libres: 'Figura a manos libres',
  defensa_personal: 'Defensa personal',
  salto_altura: 'Salto alto',
  salto_longitud: 'Salto largo',
};

/**
 * MI PANEL — dashboard del usuario común (competidor / coach):
 * sus estadísticas (campeonatos, modalidades y marca en combate), sus
 * inscripciones (historial inmutable) y sus invitaciones. Su PERFIL vive en
 * el portal del ecosistema; aquí solo se enlaza.
 */
export default function PanelUsuarioPage() {
  const router = useRouter();
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [inscripciones, setInscripciones] = useState<MiInscripcion[]>([]);
  const [stats, setStats] = useState<MisEstadisticas | null>(null);
  const [perfilComp, setPerfilComp] = useState<MiPerfilCompetidor | null>(null);
  const [pendientes, setPendientes] = useState(0);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!obtenerToken()) {
      router.replace('/admin/login');
      return;
    }
    setSesion(getSesion());
    Promise.allSettled([
      misInscripcionesAPI(),
      misInvitacionesAPI(),
      misEstadisticasAPI(),
      miPerfilCompetidorAPI(),
    ]).then(([ins, invs, est, perf]) => {
      if (ins.status === 'fulfilled') setInscripciones(ins.value);
      if (invs.status === 'fulfilled')
        setPendientes(invs.value.filter((i) => i.estado === 'PENDIENTE').length);
      if (est.status === 'fulfilled') setStats(est.value);
      if (perf.status === 'fulfilled') setPerfilComp(perf.value);
      setCargando(false);
    });
  }, [router]);

  if (!sesion) return null;

  const modalidadTop = stats
    ? Object.entries(stats.modalidades).sort((a, b) => b[1] - a[1])[0]
    : null;

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-8 sm:px-6">
      {/* ── Cabecera: quién soy + acceso al perfil (vive en el portal) ── */}
      <section className="card mb-6 p-5">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar
            src={perfilComp?.fotoUrl}
            nombre={sesion.fullName || sesion.email}
            size={64}
          />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold" style={{ color: 'var(--gold)' }}>
              {sesion.fullName || sesion.email}
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {sesion.email}
            </p>
          </div>
          <span className="badge badge-gold">{etiquetaRol(sesion)}</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
          <a href={`${PORTAL_URL}/perfil`} className="btn btn-outline btn-sm">
            Editar mi perfil (portal DINAMYT) →
          </a>
          {perfilComp && (
            <span className="badge">
              {perfilComp.cinturon ?? perfilComp.grupoCinturon ?? 'Sin cinturón'}
              {perfilComp.academiaClub ? ` · ${perfilComp.academiaClub}` : ''}
            </span>
          )}
        </div>
      </section>

      {/* ── Invitaciones pendientes ── */}
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

      {/* ── Mis estadísticas (resumen + medallero) ── */}
      <section className="mb-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Mis estadísticas</h2>
          <Link href="/panel/estadisticas" className="btn btn-outline btn-sm">
            Ver a fondo por campeonato →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { valor: stats?.campeonatos ?? '—', etiqueta: 'Campeonatos', color: 'var(--gold)' },
            {
              valor: stats ? `${stats.podios.oros}🥇 ${stats.podios.platas}🥈 ${stats.podios.bronces}🥉` : '—',
              etiqueta: 'Medallero',
              color: 'var(--gold)',
            },
            {
              valor: stats ? stats.combates.ganados : '—',
              etiqueta: 'Combates ganados',
              color: 'var(--ok)',
            },
            {
              valor: stats
                ? `${stats.combates.perdidos}${stats.combates.empates ? ` · ${stats.combates.empates}E` : ''}`
                : '—',
              etiqueta: 'Combates perdidos',
              color: 'var(--text)',
            },
          ].map((c, i) => (
            <div key={i} className="card p-4 text-center">
              <p className="text-2xl font-extrabold" style={{ color: c.color }}>
                {c.valor}
              </p>
              <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                {c.etiqueta}
              </p>
            </div>
          ))}
        </div>
        {modalidadTop && (
          <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            Tu modalidad más competida:{' '}
            <strong>{NOMBRE_MODALIDAD[modalidadTop[0]] ?? modalidadTop[0]}</strong>{' '}
            ({modalidadTop[1]} {modalidadTop[1] === 1 ? 'vez' : 'veces'}). Los
            resultados incluyen combate, figuras y saltos.
          </p>
        )}
      </section>

      {/* ── Mis inscripciones (historial inmutable) ── */}
      <section>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Mis inscripciones</h2>
          <Link href="/campeonatos" className="btn btn-outline btn-sm">
            Explorar campeonatos →
          </Link>
        </div>
        <p className="mb-4 text-sm" style={{ color: 'var(--text-muted)' }}>
          Tu historial guarda el cinturón y peso <strong>del momento en que
          participaste</strong> — no cambia aunque hoy tengas otro grado.
        </p>

        {cargando && <p style={{ color: 'var(--text-muted)' }}>Cargando…</p>}
        {!cargando && inscripciones.length === 0 && (
          <div className="card p-8 text-center" style={{ color: 'var(--text-muted)' }}>
            <p className="mb-2 font-bold">Aún no tienes inscripciones.</p>
            <p className="text-sm">
              Explora los{' '}
              <Link href="/campeonatos" style={{ color: 'var(--gold)' }}>
                campeonatos abiertos
              </Link>{' '}
              e inscríbete, o espera la invitación de tu maestro.
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
