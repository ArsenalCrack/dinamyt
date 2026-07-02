'use client';

/**
 * Árbol de combates + podio (port visual de COMBAT BracketTree/PodioLlave):
 * columnas por ronda con cada partido (hong arriba, chung abajo), ganador
 * resaltado, y el podio 1º/2º/3º cuando hay campeón.
 */
interface Slot {
  id: string;
  nombre: string;
  club?: string;
}
interface Partido {
  comp1: Slot | null;
  comp2: Slot | null;
  ganador: 1 | 2 | null;
}
export interface Bracket {
  competidores: Slot[];
  rondas: Partido[][];
  campeon: Slot | null;
}

function nombreRonda(idx: number, total: number): string {
  const restantes = total - idx;
  if (restantes === 1) return 'FINAL';
  if (restantes === 2) return 'SEMIFINAL';
  if (restantes === 3) return 'CUARTOS';
  return `RONDA ${idx + 1}`;
}

function CajaCompetidor({
  slot,
  esGanador,
  color,
}: {
  slot: Slot | null;
  esGanador: boolean;
  color: 'hong' | 'chung';
}) {
  return (
    <div
      className="flex items-center gap-2 px-2.5 py-1.5 text-sm"
      style={{
        borderLeft: `3px solid var(--${color})`,
        background: esGanador ? 'rgba(240,184,0,0.12)' : 'transparent',
        color: slot ? 'var(--text)' : 'var(--text-muted)',
        fontWeight: esGanador ? 800 : 500,
      }}
    >
      <span className="min-w-0 flex-1 truncate">{slot?.nombre ?? 'BYE'}</span>
      {esGanador && <span style={{ color: 'var(--gold)' }}>✓</span>}
    </div>
  );
}

export function BracketTree({ bracket }: { bracket: Bracket }) {
  const total = bracket.rondas.length;
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max items-stretch gap-6">
        {bracket.rondas.map((ronda, ri) => (
          <div key={ri} className="flex min-w-[220px] flex-col justify-around gap-4">
            <div
              className="text-center text-[0.65rem] font-extrabold uppercase tracking-widest"
              style={{ color: 'var(--gold)' }}
            >
              {nombreRonda(ri, total)}
            </div>
            {ronda.map((p, pi) => (
              <div
                key={pi}
                className="card divide-y overflow-hidden"
                style={{ borderColor: p.ganador ? 'var(--gold-dim)' : 'var(--border)' }}
              >
                <CajaCompetidor slot={p.comp1} esGanador={p.ganador === 1} color="hong" />
                <div style={{ borderTop: '1px solid var(--border)' }}>
                  <CajaCompetidor slot={p.comp2} esGanador={p.ganador === 2} color="chung" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {bracket.campeon && <Podio bracket={bracket} />}
    </div>
  );
}

/** Podio 1º (campeón), 2º (perdedor de la final), 3º (perdedores de semis). */
export function Podio({ bracket }: { bracket: Bracket }) {
  const final = bracket.rondas[bracket.rondas.length - 1]?.[0];
  const segundo =
    final && final.ganador
      ? final.ganador === 1
        ? final.comp2
        : final.comp1
      : null;
  const semis = bracket.rondas[bracket.rondas.length - 2] ?? [];
  const terceros = semis
    .filter((p) => p.ganador)
    .map((p) => (p.ganador === 1 ? p.comp2 : p.comp1))
    .filter(Boolean) as Slot[];

  const puesto = (medalla: string, slot: Slot | null, alto: string) =>
    slot && (
      <div className="flex flex-col items-center gap-1">
        <span className="text-2xl">{medalla}</span>
        <div
          className="card flex flex-col items-center justify-end px-4 pb-2 pt-3 text-center"
          style={{ minHeight: alto, borderColor: 'var(--gold-dim)' }}
        >
          <span className="text-sm font-extrabold">{slot.nombre}</span>
          {slot.club && (
            <span className="text-[0.65rem]" style={{ color: 'var(--text-muted)' }}>
              {slot.club}
            </span>
          )}
        </div>
      </div>
    );

  return (
    <div className="mt-8">
      <div
        className="mb-3 text-center text-sm font-extrabold uppercase tracking-widest"
        style={{ color: 'var(--gold)' }}
      >
        🏆 Podio
      </div>
      <div className="flex items-end justify-center gap-3">
        {puesto('🥈', segundo, '4.5rem')}
        {puesto('🥇', bracket.campeon, '6rem')}
        {terceros.map((t, i) => (
          <span key={i}>{puesto('🥉', t, '3.5rem')}</span>
        ))}
      </div>
    </div>
  );
}
