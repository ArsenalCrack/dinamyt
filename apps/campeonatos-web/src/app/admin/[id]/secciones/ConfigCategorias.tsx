'use client';

import { useState } from 'react';
import {
  CINTURONES_ORDEN,
  validarCategorias,
  type CategoriasConfig,
  type CategoriaConfig,
} from '@dinamyt/campeonatos-core';
import type { Modalidad } from '@/lib/api';

type Kind = 'cinturon' | 'edad' | 'peso';
interface Fila {
  tipo: 'individual' | 'rango';
  valor: string;
  desde: string;
  hasta: string;
}

const cardStyle = { background: 'var(--bg-card)', borderColor: 'var(--border)' } as const;

function desdeCategoria(cs: CategoriaConfig[] | undefined): Fila[] {
  return (cs ?? [])
    .filter((c) => c.activa)
    .map((c) => ({
      tipo: c.tipo,
      valor: c.valor ?? '',
      desde: c.desde ?? '',
      hasta: c.hasta ?? '',
    }));
}

function aCategoria(f: Fila): CategoriaConfig {
  return f.tipo === 'individual'
    ? { activa: true, tipo: 'individual', valor: f.valor }
    : { activa: true, tipo: 'rango', desde: f.desde, hasta: f.hasta };
}

/**
 * Editor de categorías de una modalidad. Cinturón por nombre fijo (5 grupos),
 * edad/peso individual o rango. Valida con el core (mismos límites que la API)
 * antes de guardar. Las categorías definen CÓMO se agrupa al competidor.
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
  const [cinturon, setCinturon] = useState<Fila[]>(desdeCategoria(inicial?.cinturon));
  const [edad, setEdad] = useState<Fila[]>(desdeCategoria(inicial?.edad));
  const [peso, setPeso] = useState<Fila[]>(desdeCategoria(inicial?.peso));
  const [errores, setErrores] = useState<string[]>([]);

  function guardar() {
    const cat: CategoriasConfig = {
      genero,
      ...(cinturon.length ? { cinturon: cinturon.map(aCategoria) } : {}),
      ...(edad.length ? { edad: edad.map(aCategoria) } : {}),
      ...(peso.length ? { peso: peso.map(aCategoria) } : {}),
    };
    const errs = validarCategorias(cat);
    setErrores(errs);
    if (errs.length === 0) onGuardar(cat);
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

      {errores.length > 0 && (
        <ul className="mb-3 rounded-lg border p-2 text-xs" style={{ borderColor: '#ff5577', color: '#ff8899' }}>
          {errores.map((e, i) => (
            <li key={i}>• {e}</li>
          ))}
        </ul>
      )}

      {/* Género */}
      <div className="mb-4 flex items-center gap-4 text-sm">
        <span style={{ color: 'var(--text-muted)' }}>Género:</span>
        {(['separado', 'mixto'] as const).map((g) => (
          <label key={g} className="flex items-center gap-1">
            <input type="radio" name={`gen-${modalidad}`} checked={genero === g} onChange={() => setGenero(g)} />
            {g === 'separado' ? 'Masculino y Femenino' : 'Mixto'}
          </label>
        ))}
      </div>

      <EditorLista titulo="Cinturón" kind="cinturon" filas={cinturon} setFilas={setCinturon} />
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <EditorLista titulo="Edad (años)" kind="edad" filas={edad} setFilas={setEdad} />
        <EditorLista titulo="Peso (kg)" kind="peso" filas={peso} setFilas={setPeso} />
      </div>
    </div>
  );
}

function EditorLista({
  titulo,
  kind,
  filas,
  setFilas,
}: {
  titulo: string;
  kind: Kind;
  filas: Fila[];
  setFilas: React.Dispatch<React.SetStateAction<Fila[]>>;
}) {
  const esCinturon = kind === 'cinturon';

  function set(i: number, campo: keyof Fila, valor: string) {
    setFilas((cur) => cur.map((f, j) => (j === i ? { ...f, [campo]: valor } : f)));
  }

  return (
    <fieldset>
      <legend className="mb-1 text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
        {titulo}
      </legend>
      {filas.map((f, i) => (
        <div key={i} className="mb-2 flex flex-wrap items-center gap-2 text-sm">
          <select
            value={f.tipo}
            onChange={(e) => set(i, 'tipo', e.target.value)}
            className="rounded border px-1 py-1"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-input, #0e0e18)', color: 'var(--text)' }}
          >
            <option value="individual">Individual</option>
            <option value="rango">Rango</option>
          </select>

          {f.tipo === 'individual' ? (
            <Campo esCinturon={esCinturon} value={f.valor} onChange={(v) => set(i, 'valor', v)} />
          ) : (
            <>
              <Campo esCinturon={esCinturon} value={f.desde} onChange={(v) => set(i, 'desde', v)} />
              <span style={{ color: 'var(--text-muted)' }}>–</span>
              <Campo esCinturon={esCinturon} value={f.hasta} onChange={(v) => set(i, 'hasta', v)} />
            </>
          )}

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
        onClick={() => setFilas((cur) => [...cur, { tipo: 'individual', valor: '', desde: '', hasta: '' }])}
        className="rounded border px-3 py-1 text-xs"
        style={{ borderColor: 'var(--border)' }}
      >
        + {esCinturon ? 'Categoría de cinturón' : 'Rango'}
      </button>
    </fieldset>
  );
}

function Campo({
  esCinturon,
  value,
  onChange,
}: {
  esCinturon: boolean;
  value: string;
  onChange: (v: string) => void;
}) {
  const estilo = {
    borderColor: 'var(--border)',
    background: 'var(--bg-input, #0e0e18)',
    color: 'var(--text)',
  } as const;
  if (esCinturon) {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded border px-1 py-1" style={estilo}>
        <option value="">—</option>
        {CINTURONES_ORDEN.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
    );
  }
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-20 rounded border px-2 py-1"
      style={estilo}
    />
  );
}
