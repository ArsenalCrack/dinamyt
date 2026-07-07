'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  obtenerToken,
  misEstadisticasAPI,
  type MisEstadisticas,
  type CampeonatoStat,
} from '@/lib/api';

const NOMBRE_MODALIDAD: Record<string, string> = {
  combate: 'Combate',
  figura_armas: 'Figura con armas',
  figura_manos_libres: 'Figura a manos libres',
  defensa_personal: 'Defensa personal',
  salto_altura: 'Salto alto',
  salto_longitud: 'Salto largo',
};

const MEDALLA = ['🥇', '🥈', '🥉'];

const RESULTADO_BADGE: Record<string, string> = {
  ganado: 'badge-ok',
  perdido: 'badge-danger',
  empate: '',
};

/**
 * MIS ESTADÍSTICAS a fondo — la trayectoria del competidor desglosada por
 * campeonato participado: sus resultados (combate, figuras, saltos), sus
 * podios y el snapshot inmutable de cada participación.
 */
export default function EstadisticasPage() {
  const router = useRouter();
  const [stats, setStats] = useState<MisEstadisticas | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!obtenerToken()) {
      router.replace('/admin/login');
      return;
    }
    misEstadisticasAPI()
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setCargando(false));
  }, [router]);

  if (cargando) {
    return (
      <main className="mx-auto min-h-screen max-w-3xl px-4 py-8 sm:px-6">
        <p style={{ color: 'var(--text-muted)' }}>Cargando tus estadísticas…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-8 sm:px-6">
      <Link href="/panel" className="text-sm" style={{ color: 'var(--text-muted)' }}>
        ← Mi panel
      </Link>
      <h1 className="mb-1 mt-2 text-2xl font-bold" style={{ color: 'var(--gold)' }}>
        Mis estadísticas
      </h1>
      <p className="mb-5 text-sm" style={{ color: 'var(--text-muted)' }}>
        Toda tu trayectoria deportiva: campeonatos, medallas y resultados en
        cada modalidad.
      </p>

      {/* Resumen global */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { v: stats?.campeonatos ?? 0, l: 'Campeonatos' },
          { v: `${stats?.podios.oros ?? 0}🥇`, l: 'Oros' },
          { v: `${stats?.podios.platas ?? 0}🥈`, l: 'Platas' },
          { v: `${stats?.podios.bronces ?? 0}🥉`, l: 'Bronces' },
        ].map((k, i) => (
          <div key={i} className="card p-4 text-center">
            <p className="text-2xl font-extrabold" style={{ color: 'var(--gold)' }}>
              {k.v}
            </p>
            <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              {k.l}
            </p>
          </div>
        ))}
      </div>

      {(!stats || stats.porCampeonato.length === 0) && (
        <div className="card p-8 text-center" style={{ color: 'var(--text-muted)' }}>
          <p className="mb-2 font-bold">Aún no tienes participaciones.</p>
          <p className="text-sm">
            Cuando compitas, aquí verás tus resultados campeonato por campeonato.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {stats?.porCampeonato.map((c) => (
          <CampeonatoDetalle key={c.campeonatoId + c.estadoInscripcion} c={c} />
        ))}
      </div>
    </main>
  );
}

function CampeonatoDetalle({ c }: { c: CampeonatoStat }) {
  const mejorPodio = c.podios.length
    ? Math.min(...c.podios.map((p) => p.puesto))
    : null;

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-bold">{c.campeonato}</h2>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {[c.ciudad, c.fechaInicio].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span
            className={`badge ${
              c.estadoInscripcion === 'APROBADA'
                ? 'badge-ok'
                : c.estadoInscripcion === 'PENDIENTE'
                  ? 'badge-info'
                  : 'badge-danger'
            }`}
          >
            {c.estadoInscripcion}
          </span>
          {mejorPodio && mejorPodio <= 3 && (
            <span className="text-2xl">{MEDALLA[mejorPodio - 1]}</span>
          )}
        </div>
      </div>

      {/* Snapshot inmutable de la participación */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {c.modalidades.map((m) => (
          <span key={m} className="badge badge-gold">
            {NOMBRE_MODALIDAD[m] ?? m}
          </span>
        ))}
        {c.cinturon && <span className="badge">Cinturón: {c.cinturon}</span>}
        {c.peso && <span className="badge">{c.peso} kg</span>}
      </div>

      {/* Motivo si fue desaprobada */}
      {c.estadoInscripcion === 'RECHAZADA' && c.motivoRechazo && (
        <p className="mt-2 text-sm" style={{ color: 'var(--danger)' }}>
          Desaprobada — motivo: {c.motivoRechazo}
        </p>
      )}

      {/* Podios obtenidos */}
      {c.podios.length > 0 && (
        <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
          <h3 className="mb-1.5 text-sm font-semibold">Podios</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {c.podios.map((p, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="text-lg">{MEDALLA[p.puesto - 1] ?? `${p.puesto}º`}</span>
                <span>{p.seccion}</span>
                <span className="badge">{NOMBRE_MODALIDAD[p.modalidad] ?? p.modalidad}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Resultados de combate */}
      {c.combates.length > 0 && (
        <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
          <h3 className="mb-1.5 text-sm font-semibold">Combates</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {c.combates.map((m, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 truncate">{m.seccion}</span>
                <span className="flex items-center gap-2">
                  <span className="mono">{m.marcador}</span>
                  <span className={`badge ${RESULTADO_BADGE[m.resultado] ?? ''}`}>
                    {m.resultado}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Marcas de figuras / saltos */}
      {c.marcas.length > 0 && (
        <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
          <h3 className="mb-1.5 text-sm font-semibold">Figuras y saltos</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {c.marcas.map((m, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 truncate">{m.seccion}</span>
                <span style={{ color: 'var(--text-muted)' }}>
                  {m.posicion ? `${MEDALLA[m.posicion - 1] ?? `${m.posicion}º`} ` : ''}
                  {m.total ?? m.distancia ?? ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
