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
  /** Solo cinturón: grupos que abarca la categoría (checkboxes). */
  grupos: string[];
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
  if (f.tipo === 'individual') {
    return f.grupos.length > 0 ? true : !!f.valor;
  }
  return !!f.desde && !!f.hasta;
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
      grupos: c.grupos ?? [],
    }));
}

function aCategoria(f: Fila, esCinturon: boolean): CategoriaConfig {
  if (f.tipo === 'individual') {
    return esCinturon
      ? {
          activa: true,
          tipo: 'individual',
          valor: f.valor || f.grupos.join('-'),
          grupos: f.grupos,
        }
      : { activa: true, tipo: 'individual', valor: f.valor };
  }
  return { activa: true, tipo: 'rango', desde: f.desde, hasta: f.hasta };
}

const ETIQUETA: Record<Kind, string> = {
  cinturon: '¿Qué cinturones entran y cómo se agrupan?',
  edad: '¿Qué edades entran? (años)',
  peso: '¿Qué pesos entran? (kg)',
};

const FILA_VACIA: Fila = { tipo: 'individual', valor: '', desde: '', hasta: '', grupos: [] };

/** Texto legible de una categoría ya añadida. */
function textoFila(f: Fila, kind: Kind): string {
  if (f.tipo === 'rango') {
    return kind === 'peso' ? `${f.desde}–${f.hasta} kg` : `${f.desde}–${f.hasta}`;
  }
  if (kind === 'cinturon') {
    const grupos = f.grupos.join(' + ');
    return f.valor && f.valor !== grupos ? `${f.valor} (${grupos})` : grupos || f.valor;
  }
  return f.valor;
}

/**
 * Editor de categorías de una modalidad. Cada dimensión (cinturón, edad,
 * peso) se puede ACTIVAR o DESACTIVAR mientras el evento no haya comenzado;
 * las categorías se agregan con un editor en línea + botón «Añadir» (lo
 * añadido queda como una lista confirmada, sin filas a medio llenar).
 */
export function ConfigCategorias({
  modalidad,
  inicial,
  onGuardar,
  guardando,
  congelado = false,
}: {
  modalidad: Modalidad;
  inicial: CategoriasConfig | null;
  onGuardar: (c: CategoriasConfig) => void;
  guardando: boolean;
  /** true cuando el campeonato ya comenzó (EN_CURSO/FINALIZADO): solo lectura. */
  congelado?: boolean;
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
  // rangos solapados): se avisa al instante, sin esperar al Guardar.
  const erroresVivos = useMemo(() => {
    const cat: CategoriasConfig = {
      genero,
      ...(usa.cinturon ? { cinturon: cinturon.map((f) => aCategoria(f, true)) } : {}),
      ...(usa.edad ? { edad: edad.map((f) => aCategoria(f, false)) } : {}),
      ...(usa.peso ? { peso: peso.map((f) => aCategoria(f, false)) } : {}),
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
    // Dimensión activa ⇒ al menos una categoría.
    (['cinturon', 'edad', 'peso'] as Kind[]).forEach((k) => {
      if (!usa[k]) return;
      if (filasDe[k].length === 0) {
        errs.push(
          `${ETIQUETA[k]} — añade al menos una categoría o desactiva esta dimensión.`,
        );
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
      ...(usa.cinturon && cinturon.length
        ? { cinturon: cinturon.map((f) => aCategoria(f, true)) }
        : {}),
      ...(usa.edad && edad.length ? { edad: edad.map((f) => aCategoria(f, false)) } : {}),
      ...(usa.peso && peso.length ? { peso: peso.map((f) => aCategoria(f, false)) } : {}),
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
        opacity: congelado ? 0.75 : 1,
      }}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          {congelado && <span className="badge">🔒 Solo lectura (el evento comenzó)</span>}
          {!congelado && sucio && <span className="badge badge-gold">● Sin guardar</span>}
          {erroresVivos.length > 0 && (
            <span className="badge badge-live">⚠ {erroresVivos.length} choque(s)</span>
          )}
        </span>
        {!congelado && (
          <button
            onClick={guardar}
            disabled={guardando || !sucio || erroresVivos.length > 0}
            className="btn btn-gold btn-sm"
            title={erroresVivos.length > 0 ? 'Corrige los choques antes de guardar' : undefined}
          >
            {sucio ? 'Guardar cambios' : 'Guardado ✓'}
          </button>
        )}
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
              disabled={congelado}
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
          congelado={congelado}
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
  congelado,
}: {
  kind: Kind;
  etiqueta: string;
  requerida: boolean;
  usada: boolean;
  onUsar: (v: boolean) => void;
  filas: Fila[];
  setFilas: React.Dispatch<React.SetStateAction<Fila[]>>;
  congelado: boolean;
}) {
  const esCinturon = kind === 'cinturon';
  // Editor en línea de la NUEVA categoría: se confirma con «Añadir».
  const [nueva, setNueva] = useState<Fila>(FILA_VACIA);

  function set(campo: keyof Fila, valor: string | string[]) {
    setNueva((cur) => ({ ...cur, [campo]: valor }));
  }

  function toggleGrupo(g: string) {
    setNueva((cur) => ({
      ...cur,
      grupos: cur.grupos.includes(g)
        ? cur.grupos.filter((x) => x !== g)
        : [...cur.grupos, g],
    }));
  }

  function anadir() {
    if (!filaCompleta(nueva)) return;
    setFilas((cur) => [...cur, nueva]);
    setNueva(FILA_VACIA);
  }

  return (
    <fieldset
      className="mt-4 rounded-lg border p-3"
      style={{ borderColor: 'var(--border)', opacity: usada ? 1 : 0.55 }}
    >
      <legend className="flex items-center gap-2 px-1 text-sm font-semibold">
        <label className="flex cursor-pointer items-center gap-1.5">
          {/* Los interruptores se congelan cuando el evento ya comenzó */}
          <input
            type="checkbox"
            checked={usada}
            disabled={requerida || congelado}
            onChange={(e) => onUsar(e.target.checked)}
            title={
              congelado
                ? 'El evento ya comenzó: la configuración quedó congelada'
                : requerida
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
          {/* Categorías YA añadidas: lista confirmada */}
          {filas.map((f, i) => (
            <div
              key={i}
              className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--border)' }}
            >
              <span className="badge badge-ok">✓</span>
              <span className="badge">{f.tipo === 'rango' ? 'Rango' : 'Individual'}</span>
              <span className="min-w-0 flex-1 font-semibold">{textoFila(f, kind)}</span>
              {!congelado && (
                <button
                  onClick={() => setFilas((cur) => cur.filter((_, j) => j !== i))}
                  className="btn btn-danger btn-sm"
                  title="Eliminar esta categoría"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {filas.length === 0 && (
            <p className="mb-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              Sin categorías todavía: arma la primera y pulsa «Añadir».
            </p>
          )}

          {/* Editor de la nueva categoría: TODO en una línea + botón Añadir */}
          {!congelado && (
            <div
              className="flex flex-wrap items-center gap-2 rounded-lg border px-2 py-2 text-sm"
              style={{ borderColor: 'var(--gold-dim)', background: 'rgba(240,184,0,0.04)' }}
            >
              <select
                value={nueva.tipo}
                onChange={(e) => set('tipo', e.target.value)}
                className="w-auto"
              >
                <option value="individual">Individual</option>
                <option value="rango">Rango</option>
              </select>

              {nueva.tipo === 'individual' ? (
                esCinturon ? (
                  <>
                    {/* Selección INDIVIDUAL de cinturones = checkboxes */}
                    <span className="flex flex-wrap items-center gap-2">
                      {CINTURONES_ORDEN.map((c) => (
                        <label
                          key={c}
                          className="flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-xs"
                          style={{
                            borderColor: nueva.grupos.includes(c)
                              ? 'var(--gold)'
                              : 'var(--border)',
                            color: nueva.grupos.includes(c) ? 'var(--gold)' : undefined,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={nueva.grupos.includes(c)}
                            onChange={() => toggleGrupo(c)}
                          />
                          {c}
                        </label>
                      ))}
                    </span>
                    <input
                      value={nueva.valor}
                      onChange={(e) => set('valor', e.target.value)}
                      className="w-36"
                      placeholder="Nombre (opcional)"
                      title="Nombre de la categoría, ej. Principiantes"
                    />
                  </>
                ) : (
                  <input
                    type="number"
                    value={nueva.valor}
                    onChange={(e) => set('valor', e.target.value)}
                    className="w-24"
                    placeholder={kind === 'peso' ? 'kg' : 'años'}
                  />
                )
              ) : (
                // Rango: desde y hasta EN LA MISMA LÍNEA
                <span className="flex items-center gap-2">
                  {esCinturon ? (
                    <>
                      <CampoCinturon value={nueva.desde} onChange={(v) => set('desde', v)} />
                      <span style={{ color: 'var(--text-muted)' }}>–</span>
                      <CampoCinturon value={nueva.hasta} onChange={(v) => set('hasta', v)} />
                    </>
                  ) : (
                    <>
                      <input
                        type="number"
                        value={nueva.desde}
                        onChange={(e) => set('desde', e.target.value)}
                        className="w-20"
                        placeholder="Desde"
                      />
                      <span style={{ color: 'var(--text-muted)' }}>–</span>
                      <input
                        type="number"
                        value={nueva.hasta}
                        onChange={(e) => set('hasta', e.target.value)}
                        className="w-20"
                        placeholder="Hasta"
                      />
                    </>
                  )}
                </span>
              )}

              <button
                onClick={anadir}
                disabled={!filaCompleta(nueva)}
                className="btn btn-gold btn-sm ml-auto"
                title={
                  filaCompleta(nueva)
                    ? 'Añadir esta categoría a la lista'
                    : 'Completa los valores para añadir'
                }
              >
                + Añadir
              </button>
            </div>
          )}
        </>
      )}
    </fieldset>
  );
}

function CampoCinturon({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
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
