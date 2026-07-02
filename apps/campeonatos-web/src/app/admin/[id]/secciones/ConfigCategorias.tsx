'use client';

import { useMemo, useState } from 'react';
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

/** Qué dimensiones REQUIERE cada modalidad para estar bien configurada:
 *  cinturón y edad siempre; peso solo donde se compite por peso (combate). */
export function dimensionesRequeridas(modalidad: Modalidad): Kind[] {
  return modalidad === 'combate'
    ? ['cinturon', 'edad', 'peso']
    : ['cinturon', 'edad'];
}

/** Una fila está completa si tiene todos sus valores diligenciados. */
function filaCompleta(f: Fila): boolean {
  return f.tipo === 'individual' ? !!f.valor : !!f.desde && !!f.hasta;
}

/**
 * ¿La modalidad quedó COMPLETA? Solo entonces se muestra "Configurada":
 * cada dimensión que la modalidad requiere (y no fue desactivada a
 * propósito) debe tener al menos una categoría completa.
 */
export function esConfigCompleta(
  modalidad: Modalidad,
  cat: CategoriasConfig | null,
): boolean {
  if (!cat?.genero) return false;
  for (const dim of dimensionesRequeridas(modalidad)) {
    const lista = cat[dim] as CategoriaConfig[] | undefined;
    // La dimensión puede desactivarse explícitamente guardándola vacía —
    // pero si la modalidad la requiere, vacía = incompleta.
    if (!lista || lista.filter((c) => c.activa).length === 0) return false;
  }
  return true;
}

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

const ETIQUETA: Record<Kind, string> = {
  cinturon: '¿Qué cinturones entran y cómo se agrupan?',
  edad: '¿Qué edades entran? (años)',
  peso: '¿Qué pesos entran? (kg)',
};

/**
 * Editor de categorías de una modalidad. Cada dimensión (cinturón, edad,
 * peso) se puede ACTIVAR o DESACTIVAR; una dimensión activa exige al menos
 * una categoría completa. Los cambios sin guardar se marcan claramente.
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
  const requeridas = dimensionesRequeridas(modalidad);

  const [genero, setGenero] = useState<string>(
    inicial?.genero === 'mixto' ? 'mixto' : 'separado',
  );
  const [cinturon, setCinturon] = useState<Fila[]>(desdeCategoria(inicial?.cinturon));
  const [edad, setEdad] = useState<Fila[]>(desdeCategoria(inicial?.edad));
  const [peso, setPeso] = useState<Fila[]>(desdeCategoria(inicial?.peso));
  // Cada dimensión puede usarse o no. Al cargar: usada si trae categorías
  // o si la modalidad la requiere.
  const [usa, setUsa] = useState<Record<Kind, boolean>>({
    cinturon: (inicial?.cinturon?.length ?? 0) > 0 || requeridas.includes('cinturon'),
    edad: (inicial?.edad?.length ?? 0) > 0 || requeridas.includes('edad'),
    peso: (inicial?.peso?.length ?? 0) > 0 || requeridas.includes('peso'),
  });
  const [errores, setErrores] = useState<string[]>([]);

  const filasDe: Record<Kind, Fila[]> = { cinturon, edad, peso };
  const setDe: Record<Kind, React.Dispatch<React.SetStateAction<Fila[]>>> = {
    cinturon: setCinturon,
    edad: setEdad,
    peso: setPeso,
  };

  // Validación EN VIVO de choques (duplicados, individual dentro de un rango,
  // rangos solapados): se avisa al instante, sin esperar al Guardar. Solo se
  // evalúan las filas completas (las "nueva" a medio llenar no chocan aún).
  const erroresVivos = useMemo(() => {
    const soloCompletas = (fs: Fila[]) => fs.filter(filaCompleta).map(aCategoria);
    const cat: CategoriasConfig = {
      genero,
      ...(usa.cinturon ? { cinturon: soloCompletas(cinturon) } : {}),
      ...(usa.edad ? { edad: soloCompletas(edad) } : {}),
      ...(usa.peso ? { peso: soloCompletas(peso) } : {}),
    };
    return validarCategorias(cat);
  }, [genero, cinturon, edad, peso, usa]);

  // ¿Hay cambios sin guardar? Se compara contra lo que vino del servidor.
  const sucio = useMemo(() => {
    const actual = JSON.stringify({
      genero,
      c: usa.cinturon ? cinturon : [],
      e: usa.edad ? edad : [],
      p: usa.peso ? peso : [],
    });
    const original = JSON.stringify({
      genero: inicial?.genero === 'mixto' ? 'mixto' : 'separado',
      c: desdeCategoria(inicial?.cinturon),
      e: desdeCategoria(inicial?.edad),
      p: desdeCategoria(inicial?.peso),
    });
    return actual !== original;
  }, [genero, cinturon, edad, peso, usa, inicial]);

  function guardar() {
    const errs: string[] = [];
    // Dimensión activa ⇒ al menos una categoría COMPLETA.
    (['cinturon', 'edad', 'peso'] as Kind[]).forEach((k) => {
      if (!usa[k]) return;
      const completas = filasDe[k].filter(filaCompleta);
      if (completas.length === 0) {
        errs.push(
          `${ETIQUETA[k]} — añade al menos una categoría completa o desactiva esta dimensión.`,
        );
      } else if (filasDe[k].some((f) => !filaCompleta(f))) {
        errs.push(`Hay categorías de ${k} a medio llenar: complétalas o elimínalas.`);
      }
    });
    // Requeridas por la modalidad no pueden desactivarse.
    requeridas.forEach((k) => {
      if (!usa[k]) errs.push(`Esta modalidad requiere la dimensión "${k}".`);
    });
    if (errs.length > 0) {
      setErrores(errs);
      return;
    }

    const cat: CategoriasConfig = {
      genero,
      ...(usa.cinturon && cinturon.length ? { cinturon: cinturon.map(aCategoria) } : {}),
      ...(usa.edad && edad.length ? { edad: edad.map(aCategoria) } : {}),
      ...(usa.peso && peso.length ? { peso: peso.map(aCategoria) } : {}),
    };
    const errsCore = validarCategorias(cat);
    setErrores(errsCore);
    if (errsCore.length === 0) onGuardar(cat);
  }

  return (
    <div
      className="rounded-xl border p-4"
      style={{
        background: 'var(--bg-card)',
        borderColor: sucio ? 'var(--gold-dim)' : 'var(--border)',
      }}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          {sucio && <span className="badge badge-gold">● Sin guardar</span>}
          {erroresVivos.length > 0 && (
            <span className="badge badge-live">⚠ {erroresVivos.length} choque(s)</span>
          )}
        </span>
        <button
          onClick={guardar}
          disabled={guardando || !sucio || erroresVivos.length > 0}
          className="btn btn-gold btn-sm"
          title={erroresVivos.length > 0 ? 'Corrige los choques antes de guardar' : undefined}
        >
          {sucio ? 'Guardar cambios' : 'Guardado ✓'}
        </button>
      </div>

      {/* Choques detectados EN VIVO */}
      {erroresVivos.length > 0 && (
        <ul
          className="mb-3 rounded-lg border p-2 text-xs"
          style={{ borderColor: 'var(--danger)', color: 'var(--danger-soft)' }}
        >
          {erroresVivos.map((e, i) => (
            <li key={i}>⚠ {e}</li>
          ))}
        </ul>
      )}

      {errores.length > 0 && (
        <ul
          className="mb-3 rounded-lg border p-2 text-xs"
          style={{ borderColor: 'var(--danger)', color: 'var(--danger-soft)' }}
        >
          {errores.map((e, i) => (
            <li key={i}>• {e}</li>
          ))}
        </ul>
      )}

      {/* Género */}
      <div className="mb-4 flex flex-wrap items-center gap-4 text-sm">
        <span style={{ color: 'var(--text-muted)' }}>
          ¿Compiten géneros por separado o juntos?
        </span>
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

      {(['cinturon', 'edad', 'peso'] as Kind[]).map((k) => (
        <Dimension
          key={k}
          kind={k}
          etiqueta={ETIQUETA[k]}
          requerida={requeridas.includes(k)}
          usada={usa[k]}
          onUsar={(v) => setUsa((cur) => ({ ...cur, [k]: v }))}
          filas={filasDe[k]}
          setFilas={setDe[k]}
        />
      ))}
    </div>
  );
}

function Dimension({
  kind,
  etiqueta,
  requerida,
  usada,
  onUsar,
  filas,
  setFilas,
}: {
  kind: Kind;
  etiqueta: string;
  requerida: boolean;
  usada: boolean;
  onUsar: (v: boolean) => void;
  filas: Fila[];
  setFilas: React.Dispatch<React.SetStateAction<Fila[]>>;
}) {
  const esCinturon = kind === 'cinturon';

  function set(i: number, campo: keyof Fila, valor: string) {
    setFilas((cur) => cur.map((f, j) => (j === i ? { ...f, [campo]: valor } : f)));
  }

  return (
    <fieldset
      className="mt-4 rounded-lg border p-3"
      style={{ borderColor: 'var(--border)', opacity: usada ? 1 : 0.55 }}
    >
      <legend className="flex items-center gap-2 px-1 text-sm font-semibold">
        <label className="flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={usada}
            disabled={requerida}
            onChange={(e) => onUsar(e.target.checked)}
            title={
              requerida
                ? 'Esta modalidad requiere esta dimensión'
                : 'Activar o desactivar esta dimensión'
            }
          />
          {etiqueta}
        </label>
        {requerida ? (
          <span className="badge badge-gold">Requerida</span>
        ) : (
          <span className="badge">{usada ? 'Activa' : 'Desactivada'}</span>
        )}
      </legend>

      {usada && (
        <>
          {filas.map((f, i) => (
            <div
              key={i}
              className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border px-2 py-1.5 text-sm"
              style={{
                // Una fila incompleta se marca: es lo "precargado" sin llenar.
                borderColor: filaCompleta(f) ? 'var(--border)' : 'var(--gold-dim)',
                background: filaCompleta(f) ? 'transparent' : 'rgba(240,184,0,0.05)',
              }}
            >
              {!filaCompleta(f) && (
                <span className="badge badge-gold" title="Completa los valores de esta categoría">
                  nueva
                </span>
              )}
              <select
                value={f.tipo}
                onChange={(e) => set(i, 'tipo', e.target.value)}
                className="w-auto"
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
                className="btn btn-danger btn-sm ml-auto"
                title="Eliminar esta categoría"
              >
                ✕
              </button>
            </div>
          ))}
          {filas.length === 0 && (
            <p className="mb-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              Sin categorías todavía: añade la primera.
            </p>
          )}
          <button
            onClick={() =>
              setFilas((cur) => [...cur, { tipo: 'individual', valor: '', desde: '', hasta: '' }])
            }
            className="btn btn-outline btn-sm"
          >
            + Añadir {esCinturon ? 'categoría de cinturón' : 'categoría'}
          </button>
        </>
      )}
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
  if (esCinturon) {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-auto">
        <option value="">Elige…</option>
        {CINTURONES_ORDEN.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-20"
      placeholder="—"
    />
  );
}
