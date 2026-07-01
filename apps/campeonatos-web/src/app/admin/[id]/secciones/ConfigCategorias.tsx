'use client';

import { useState } from 'react';
import {
  GRUPOS_CINTURON,
  type CategoriasConfig,
  type CategoriaConfig,
  type Modalidad,
} from '@/lib/api';

interface CinturonRow {
  valor: string;
  grupos: string[];
}
interface RangoRow {
  desde: string;
  hasta: string;
}

const cardStyle = {
  background: 'var(--bg-card)',
  borderColor: 'var(--border)',
} as const;

/**
 * Editor de categorías de una modalidad (lógica de DINAMYT-PROJECT / ArbolBuilder):
 * el admin define género, categorías de cinturón (con los grupos que abarca cada
 * una) y rangos de edad/peso. Al guardar produce un `CategoriasConfig` que la API
 * usa en `generar-secciones`.
 */
export function ConfigCategorias({
  modalidad,
  inicial,
  onGuardar,
  guardando,
}: {
  modalidad: Modalidad;
  inicial: CategoriasConfig | null;
  onGuardar: (c: CategoriasConfig) => void;
  guardando: boolean;
}) {
  const [genero, setGenero] = useState<string>(
    inicial?.genero === 'mixto' ? 'mixto' : 'separado',
  );
  const [cinturones, setCinturones] = useState<CinturonRow[]>(
    (inicial?.cinturon ?? [])
      .filter((c) => c.activa)
      .map((c) => ({ valor: c.valor ?? '', grupos: c.grupos ?? [] })),
  );
  const [edades, setEdades] = useState<RangoRow[]>(
    (inicial?.edad ?? [])
      .filter((c) => c.activa && c.tipo === 'rango')
      .map((c) => ({ desde: c.desde ?? '', hasta: c.hasta ?? '' })),
  );
  const [pesos, setPesos] = useState<RangoRow[]>(
    (inicial?.peso ?? [])
      .filter((c) => c.activa && c.tipo === 'rango')
      .map((c) => ({ desde: c.desde ?? '', hasta: c.hasta ?? '' })),
  );

  function toggleGrupo(idx: number, grupo: string) {
    setCinturones((cur) =>
      cur.map((c, i) =>
        i === idx
          ? {
              ...c,
              grupos: c.grupos.includes(grupo)
                ? c.grupos.filter((g) => g !== grupo)
                : [...c.grupos, grupo],
            }
          : c,
      ),
    );
  }

  function guardar() {
    const cinturon: CategoriaConfig[] = cinturones
      .filter((c) => c.valor.trim() || c.grupos.length)
      .map((c) => ({
        activa: true,
        tipo: 'individual',
        valor: c.valor.trim() || c.grupos.join('-'),
        grupos: c.grupos,
      }));
    const edad: CategoriaConfig[] = edades
      .filter((r) => r.desde && r.hasta)
      .map((r) => ({ activa: true, tipo: 'rango', desde: r.desde, hasta: r.hasta }));
    const peso: CategoriaConfig[] = pesos
      .filter((r) => r.desde && r.hasta)
      .map((r) => ({ activa: true, tipo: 'rango', desde: r.desde, hasta: r.hasta }));
    onGuardar({
      genero,
      ...(cinturon.length ? { cinturon } : {}),
      ...(edad.length ? { edad } : {}),
      ...(peso.length ? { peso } : {}),
    });
  }

  return (
    <div className="rounded-xl border p-4" style={cardStyle}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">{modalidad}</h3>
        <button
          onClick={guardar}
          disabled={guardando}
          className="rounded-lg px-3 py-1.5 text-sm font-semibold"
          style={{ background: 'var(--gold)', color: '#14141e' }}
        >
          Guardar
        </button>
      </div>

      {/* Género */}
      <div className="mb-4 flex items-center gap-4 text-sm">
        <span style={{ color: 'var(--text-muted)' }}>Género:</span>
        {(['separado', 'mixto'] as const).map((g) => (
          <label key={g} className="flex items-center gap-1">
            <input
              type="radio"
              name={`gen-${modalidad}`}
              checked={genero === g}
              onChange={() => setGenero(g)}
            />
            {g === 'separado' ? 'Masculino y Femenino' : 'Mixto'}
          </label>
        ))}
      </div>

      {/* Cinturón */}
      <fieldset className="mb-4">
        <legend className="mb-1 text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
          Categorías de cinturón
        </legend>
        {cinturones.map((c, i) => (
          <div key={i} className="mb-2 rounded-lg border p-2" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2">
              <input
                value={c.valor}
                placeholder="Nombre (ej. Principiantes)"
                onChange={(e) =>
                  setCinturones((cur) => cur.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))
                }
                className="flex-1"
              />
              <button
                onClick={() => setCinturones((cur) => cur.filter((_, j) => j !== i))}
                className="rounded border px-2 py-1 text-xs"
                style={{ borderColor: 'var(--border)' }}
              >
                Quitar
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {GRUPOS_CINTURON.map((g) => (
                <label key={g} className="flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={c.grupos.includes(g)} onChange={() => toggleGrupo(i, g)} />
                  {g}
                </label>
              ))}
            </div>
          </div>
        ))}
        <button
          onClick={() => setCinturones((cur) => [...cur, { valor: '', grupos: [] }])}
          className="rounded border px-3 py-1 text-xs"
          style={{ borderColor: 'var(--border)' }}
        >
          + Categoría de cinturón
        </button>
      </fieldset>

      {/* Edad y peso */}
      <div className="grid gap-4 sm:grid-cols-2">
        <RangoLista titulo="Rangos de edad (años)" filas={edades} setFilas={setEdades} />
        <RangoLista titulo="Rangos de peso (kg)" filas={pesos} setFilas={setPesos} />
      </div>
    </div>
  );
}

function RangoLista({
  titulo,
  filas,
  setFilas,
}: {
  titulo: string;
  filas: RangoRow[];
  setFilas: React.Dispatch<React.SetStateAction<RangoRow[]>>;
}) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
        {titulo}
      </legend>
      {filas.map((r, i) => (
        <div key={i} className="mb-2 flex items-center gap-2">
          <input
            value={r.desde}
            placeholder="desde"
            onChange={(e) => setFilas((cur) => cur.map((x, j) => (j === i ? { ...x, desde: e.target.value } : x)))}
            className="w-20"
          />
          <span style={{ color: 'var(--text-muted)' }}>–</span>
          <input
            value={r.hasta}
            placeholder="hasta"
            onChange={(e) => setFilas((cur) => cur.map((x, j) => (j === i ? { ...x, hasta: e.target.value } : x)))}
            className="w-20"
          />
          <button
            onClick={() => setFilas((cur) => cur.filter((_, j) => j !== i))}
            className="rounded border px-2 py-1 text-xs"
            style={{ borderColor: 'var(--border)' }}
          >
            ×
          </button>
        </div>
      ))}
      <button
        onClick={() => setFilas((cur) => [...cur, { desde: '', hasta: '' }])}
        className="rounded border px-3 py-1 text-xs"
        style={{ borderColor: 'var(--border)' }}
      >
        + Rango
      </button>
    </fieldset>
  );
}
