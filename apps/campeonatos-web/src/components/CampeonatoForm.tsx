'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  MODALIDADES,
  listPaisesAPI,
  listCiudadesAPI,
  type Modalidad,
  type CrearCampeonatoInput,
  type Pais,
} from '@/lib/api';
import { ALCANCES, LIMITES, validarDatosCampeonato } from '@dinamyt/campeonatos-core';

/** Etiqueta legible de cada modalidad. */
export const NOMBRE_MODALIDAD: Record<Modalidad, string> = {
  combate: 'Combate',
  figura_armas: 'Figura con armas',
  figura_manos_libres: 'Figura a manos libres',
  defensa_personal: 'Defensa personal',
  salto_altura: 'Salto alto',
  salto_longitud: 'Salto largo',
};

export interface CampeonatoFormValues {
  nombre: string;
  descripcion: string;
  pais: string;
  ciudad: string;
  ubicacion: string;
  alcance: string;
  fechaInicio: string;
  fechaFin: string;
  numTatamis: number;
  maxParticipantes: string;
  esPublico: boolean;
  codigo: string;
  costoBase: string;
  mods: Modalidad[];
}

const VACIO: CampeonatoFormValues = {
  nombre: '',
  descripcion: '',
  pais: '',
  ciudad: '',
  ubicacion: '',
  alcance: '',
  fechaInicio: '',
  fechaFin: '',
  numTatamis: 1,
  maxParticipantes: '',
  esPublico: true,
  codigo: '',
  costoBase: '',
  mods: [],
};

/** Convierte los valores del formulario al payload de la API. */
export function aPayload(v: CampeonatoFormValues): CrearCampeonatoInput {
  return {
    nombre: v.nombre.trim(),
    descripcion: v.descripcion.trim() || undefined,
    ubicacion: v.ubicacion.trim() || undefined,
    pais: v.pais.trim() || undefined,
    ciudad: v.ciudad.trim() || undefined,
    alcance: v.alcance || undefined,
    numTatamis: v.numTatamis,
    maxParticipantes: v.maxParticipantes ? Number(v.maxParticipantes) : undefined,
    esPublico: v.esPublico,
    codigo: !v.esPublico ? v.codigo.trim() : undefined,
    fechaInicio: v.fechaInicio || undefined,
    fechaFin: v.fechaFin || undefined,
    costoBase: v.costoBase || '0',
    modalidades: v.mods.map((m) => ({ modalidad: m, costoExtra: '0' })),
  };
}

/**
 * Formulario de datos del campeonato, compartido por Crear y Editar.
 * Valida en el cliente con las mismas reglas del core que usa la API.
 */
export function CampeonatoForm({
  inicial,
  submitLabel,
  enviando,
  onSubmit,
}: {
  inicial?: Partial<CampeonatoFormValues>;
  submitLabel: string;
  enviando: boolean;
  onSubmit: (v: CampeonatoFormValues) => void | Promise<void>;
}) {
  const [v, setV] = useState<CampeonatoFormValues>({ ...VACIO, ...inicial });
  const [errores, setErrores] = useState<string[]>([]);

  // ── Catálogo geográfico: todos los países (nombre en español) y las
  // ciudades del país elegido (datalist con búsqueda). Si la API no responde,
  // los campos siguen funcionando como texto libre.
  const [paises, setPaises] = useState<Pais[]>([]);
  const [ciudades, setCiudades] = useState<string[]>([]);
  const nombresEs = useMemo(() => {
    try {
      return new Intl.DisplayNames(['es'], { type: 'region' });
    } catch {
      return null;
    }
  }, []);
  const paisesEs = useMemo(
    () =>
      paises
        .map((p) => ({ ...p, nombre: nombresEs?.of(p.iso2) ?? p.nombre }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [paises, nombresEs],
  );

  useEffect(() => {
    listPaisesAPI().then(setPaises).catch(() => setPaises([]));
  }, []);

  const paisIso = useMemo(
    () => paisesEs.find((p) => p.nombre === v.pais)?.iso2 ?? null,
    [paisesEs, v.pais],
  );
  useEffect(() => {
    if (!paisIso) {
      setCiudades([]);
      return;
    }
    listCiudadesAPI(paisIso).then(setCiudades).catch(() => setCiudades([]));
  }, [paisIso]);

  function set<K extends keyof CampeonatoFormValues>(k: K, val: CampeonatoFormValues[K]) {
    setV((cur) => ({ ...cur, [k]: val }));
  }

  function toggleMod(m: Modalidad) {
    set('mods', v.mods.includes(m) ? v.mods.filter((x) => x !== m) : [...v.mods, m]);
  }

  // Hoy en ISO (YYYY-MM-DD) para el `min` del calendario y la validación.
  const hoyISO = useMemo(() => new Date().toISOString().slice(0, 10), []);

  function validar(): string[] {
    const errs = validarDatosCampeonato({
      nombre: v.nombre,
      ubicacion: v.ubicacion,
      alcance: v.alcance,
      numTatamis: v.numTatamis,
      maxParticipantes: v.maxParticipantes ? Number(v.maxParticipantes) : null,
      fechaInicio: v.fechaInicio,
      fechaFin: v.fechaFin,
    });
    // La fecha de inicio no puede estar en el pasado (solo al crear o al
    // cambiarla: si es la misma que ya estaba, no se re-valida en el server).
    if (v.fechaInicio && v.fechaInicio < hoyISO && v.fechaInicio !== inicial?.fechaInicio) {
      errs.push('La fecha de inicio no puede ser anterior a hoy.');
    }
    if (v.mods.length === 0) errs.push('Selecciona al menos una modalidad.');
    if (!v.esPublico && !v.codigo.trim())
      errs.push('Un campeonato privado requiere un código de acceso.');
    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validar();
    setErrores(errs);
    if (errs.length > 0) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    await onSubmit(v);
  }

  return (
    <>
      {errores.length > 0 && (
        <ul
          className="mb-4 rounded-lg border p-3 text-sm"
          style={{ borderColor: 'var(--danger)', color: 'var(--danger-soft)' }}
        >
          {errores.map((e, i) => (
            <li key={i}>• {e}</li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="card p-5">
        <h2 className="mb-3 text-lg font-semibold">Datos generales</h2>
        <label className="block text-sm">
          Nombre *
          <input
            value={v.nombre}
            onChange={(e) => set('nombre', e.target.value)}
            maxLength={200}
            required
            className="mt-1"
          />
        </label>
        <label className="mt-3 block text-sm">
          Descripción
          <textarea
            value={v.descripcion}
            onChange={(e) => set('descripcion', e.target.value)}
            rows={2}
            className="mt-1"
          />
        </label>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            País
            {paisesEs.length > 0 ? (
              <select
                value={v.pais}
                onChange={(e) => {
                  set('pais', e.target.value);
                  set('ciudad', '');
                }}
                className="mt-1"
              >
                <option value="">Selecciona…</option>
                {paisesEs.map((p) => (
                  <option key={p.iso2} value={p.nombre}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={v.pais}
                onChange={(e) => set('pais', e.target.value)}
                maxLength={100}
                className="mt-1"
              />
            )}
          </label>
          <label className="block text-sm">
            Ciudad
            <input
              value={v.ciudad}
              onChange={(e) => set('ciudad', e.target.value)}
              maxLength={100}
              className="mt-1"
              list="ciudades-datalist"
              placeholder={
                ciudades.length > 0
                  ? `Busca entre ${ciudades.length} ciudades…`
                  : undefined
              }
            />
            <datalist id="ciudades-datalist">
              {ciudades.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
        </div>
        <label className="mt-3 block text-sm">
          Ubicación / sede *
          <input
            value={v.ubicacion}
            onChange={(e) => set('ubicacion', e.target.value)}
            maxLength={200}
            className="mt-1"
          />
        </label>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            Ámbito *
            <select
              value={v.alcance}
              onChange={(e) => set('alcance', e.target.value)}
              className="mt-1"
            >
              <option value="">Selecciona…</option>
              {ALCANCES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Costo base
            <input
              type="number"
              min="0"
              value={v.costoBase}
              onChange={(e) => set('costoBase', e.target.value)}
              placeholder="0"
              className="mt-1"
            />
          </label>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            Fecha de inicio
            <input
              type="date"
              value={v.fechaInicio}
              // No permite fechas pasadas (salvo conservar la ya guardada al editar).
              min={inicial?.fechaInicio && inicial.fechaInicio < hoyISO ? inicial.fechaInicio : hoyISO}
              onChange={(e) => set('fechaInicio', e.target.value)}
              className="mt-1"
            />
          </label>
          <label className="block text-sm">
            Fecha de fin
            <input
              type="date"
              value={v.fechaFin}
              // La fecha de fin nunca antes de la de inicio.
              min={v.fechaInicio || hoyISO}
              onChange={(e) => set('fechaFin', e.target.value)}
              className="mt-1"
            />
          </label>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            Nº de tatamis ({LIMITES.tatamisMin}–{LIMITES.tatamisMax})
            <input
              type="number"
              min={LIMITES.tatamisMin}
              max={LIMITES.tatamisMax}
              value={v.numTatamis}
              onChange={(e) =>
                set(
                  'numTatamis',
                  Math.max(
                    LIMITES.tatamisMin,
                    Math.min(LIMITES.tatamisMax, Number(e.target.value) || 1),
                  ),
                )
              }
              className="mt-1"
            />
          </label>
          <label className="block text-sm">
            Máx. participantes ({LIMITES.participantesMin}–{LIMITES.participantesMax})
            <input
              type="number"
              min={LIMITES.participantesMin}
              max={LIMITES.participantesMax}
              value={v.maxParticipantes}
              onChange={(e) => set('maxParticipantes', e.target.value)}
              className="mt-1"
            />
          </label>
        </div>

        {/* Privacidad */}
        <fieldset className="mt-4">
          <legend className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
            Privacidad *
          </legend>
          <div className="mt-2 flex gap-4 text-sm">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name="priv"
                checked={v.esPublico}
                onChange={() => set('esPublico', true)}
              />{' '}
              Público
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name="priv"
                checked={!v.esPublico}
                onChange={() => set('esPublico', false)}
              />{' '}
              Privado
            </label>
          </div>
          {!v.esPublico && (
            <label className="mt-2 block text-sm">
              Código de acceso *
              <input
                value={v.codigo}
                onChange={(e) => set('codigo', e.target.value)}
                maxLength={20}
                className="mt-1"
              />
            </label>
          )}
        </fieldset>

        {/* Modalidades */}
        <fieldset className="mt-5">
          <legend className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
            Modalidades * (en qué compiten)
          </legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {MODALIDADES.map((m) => (
              <label
                key={m}
                className="flex items-center gap-2 rounded-lg border p-2 text-sm"
                style={{
                  borderColor: v.mods.includes(m) ? 'var(--gold-dim)' : 'var(--border)',
                }}
              >
                <input
                  type="checkbox"
                  checked={v.mods.includes(m)}
                  onChange={() => toggleMod(m)}
                />
                {NOMBRE_MODALIDAD[m]}
              </label>
            ))}
          </div>
        </fieldset>

        <button type="submit" disabled={enviando} className="btn btn-gold mt-6 w-full">
          {submitLabel}
        </button>
      </form>
    </>
  );
}
