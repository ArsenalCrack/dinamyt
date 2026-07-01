'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  obtenerToken,
  crearCampeonatoAPI,
  extraerError,
  MODALIDADES,
  type Modalidad,
} from '@/lib/api';
import { getSesion, esAdmin } from '@/lib/session';
import { ALCANCES, LIMITES, validarDatosCampeonato } from '@dinamyt/campeonatos-core';

const inputStyle: React.CSSProperties = {
  marginTop: '0.25rem',
  width: '100%',
  background: 'var(--bg-input, #0e0e18)',
  border: '1px solid var(--border)',
  borderRadius: '0.5rem',
  padding: '0.55rem 0.75rem',
  color: 'var(--text)',
};

/** Etiqueta legible de cada modalidad. */
const NOMBRE_MODALIDAD: Record<Modalidad, string> = {
  combate: 'Combate',
  figura_armas: 'Figura con armas',
  figura_manos_libres: 'Figura a manos libres',
  defensa_personal: 'Defensa personal',
  salto_altura: 'Salto alto',
  salto_longitud: 'Salto largo',
};

export default function CrearCampeonatoPage() {
  const router = useRouter();

  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [pais, setPais] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [alcance, setAlcance] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [numTatamis, setNumTatamis] = useState(1);
  const [maxParticipantes, setMaxParticipantes] = useState('');
  const [esPublico, setEsPublico] = useState(true);
  const [codigo, setCodigo] = useState('');
  const [costoBase, setCostoBase] = useState('');
  const [mods, setMods] = useState<Modalidad[]>([]);

  const [errores, setErrores] = useState<string[]>([]);
  const [creando, setCreando] = useState(false);

  useEffect(() => {
    if (!obtenerToken()) {
      router.replace('/admin/login');
      return;
    }
    if (!esAdmin(getSesion())) router.replace('/admin');
  }, [router]);

  function toggleMod(m: Modalidad) {
    setMods((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));
  }

  function validar(): string[] {
    const errs = validarDatosCampeonato({
      nombre,
      ubicacion,
      alcance,
      numTatamis,
      maxParticipantes: maxParticipantes ? Number(maxParticipantes) : null,
      fechaInicio,
      fechaFin,
    });
    if (mods.length === 0) errs.push('Selecciona al menos una modalidad.');
    if (!esPublico && !codigo.trim()) errs.push('Un campeonato privado requiere un código de acceso.');
    return errs;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validar();
    setErrores(errs);
    if (errs.length > 0) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setCreando(true);
    try {
      await crearCampeonatoAPI({
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || undefined,
        ubicacion: ubicacion.trim() || undefined,
        pais: pais.trim() || undefined,
        ciudad: ciudad.trim() || undefined,
        alcance: alcance || undefined,
        numTatamis,
        maxParticipantes: maxParticipantes ? Number(maxParticipantes) : undefined,
        esPublico,
        codigo: !esPublico ? codigo.trim() : undefined,
        fechaInicio: fechaInicio || undefined,
        fechaFin: fechaFin || undefined,
        costoBase: costoBase || '0',
        modalidades: mods.map((m) => ({ modalidad: m, costoExtra: '0' })),
      });
      router.push('/admin');
    } catch (err) {
      setErrores([extraerError(err, 'No se pudo crear el campeonato.')]);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setCreando(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-10">
      <Link href="/admin" className="text-sm" style={{ color: 'var(--text-muted)' }}>
        ← Volver
      </Link>
      <h1 className="mb-1 mt-2 text-2xl font-bold" style={{ color: 'var(--gold)' }}>
        Nuevo campeonato
      </h1>
      <p className="mb-6 text-sm" style={{ color: 'var(--text-muted)' }}>
        Define los datos del evento y las modalidades. Las <strong>categorías</strong>{' '}
        (cinturón, edad, peso, género) se configuran luego en «Secciones».
      </p>

      {errores.length > 0 && (
        <ul className="mb-4 rounded-lg border p-3 text-sm" style={{ borderColor: '#ff5577', color: '#ff8899' }}>
          {errores.map((e, i) => (
            <li key={i}>• {e}</li>
          ))}
        </ul>
      )}

      <form onSubmit={onSubmit} className="rounded-xl border p-5" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <h2 className="mb-3 text-lg font-semibold">Datos generales</h2>
        <label className="block text-sm">
          Nombre *
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={200} required style={inputStyle} />
        </label>
        <label className="mt-3 block text-sm">
          Descripción
          <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} style={inputStyle} />
        </label>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            País
            <input value={pais} onChange={(e) => setPais(e.target.value)} maxLength={100} style={inputStyle} />
          </label>
          <label className="block text-sm">
            Ciudad
            <input value={ciudad} onChange={(e) => setCiudad(e.target.value)} maxLength={100} style={inputStyle} />
          </label>
        </div>
        <label className="mt-3 block text-sm">
          Ubicación / sede *
          <input value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} maxLength={200} style={inputStyle} />
        </label>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            Ámbito *
            <select value={alcance} onChange={(e) => setAlcance(e.target.value)} style={inputStyle}>
              <option value="">Selecciona…</option>
              {ALCANCES.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Costo base
            <input type="number" min="0" value={costoBase} onChange={(e) => setCostoBase(e.target.value)} placeholder="0" style={inputStyle} />
          </label>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            Fecha de inicio
            <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} style={inputStyle} />
          </label>
          <label className="block text-sm">
            Fecha de fin
            <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} style={inputStyle} />
          </label>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            Nº de tatamis ({LIMITES.tatamisMin}–{LIMITES.tatamisMax})
            <input
              type="number"
              min={LIMITES.tatamisMin}
              max={LIMITES.tatamisMax}
              value={numTatamis}
              onChange={(e) => setNumTatamis(Math.max(LIMITES.tatamisMin, Math.min(LIMITES.tatamisMax, Number(e.target.value) || 1)))}
              style={inputStyle}
            />
          </label>
          <label className="block text-sm">
            Máx. participantes ({LIMITES.participantesMin}–{LIMITES.participantesMax})
            <input
              type="number"
              min={LIMITES.participantesMin}
              max={LIMITES.participantesMax}
              value={maxParticipantes}
              onChange={(e) => setMaxParticipantes(e.target.value)}
              style={inputStyle}
            />
          </label>
        </div>

        {/* Privacidad */}
        <fieldset className="mt-4">
          <legend className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>Privacidad *</legend>
          <div className="mt-2 flex gap-4 text-sm">
            <label className="flex items-center gap-1">
              <input type="radio" name="priv" checked={esPublico} onChange={() => setEsPublico(true)} /> Público
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" name="priv" checked={!esPublico} onChange={() => setEsPublico(false)} /> Privado
            </label>
          </div>
          {!esPublico && (
            <label className="mt-2 block text-sm">
              Código de acceso *
              <input value={codigo} onChange={(e) => setCodigo(e.target.value)} maxLength={20} style={inputStyle} />
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
              <label key={m} className="flex items-center gap-2 rounded-lg border p-2 text-sm" style={{ borderColor: 'var(--border)' }}>
                <input type="checkbox" checked={mods.includes(m)} onChange={() => toggleMod(m)} />
                {NOMBRE_MODALIDAD[m]}
              </label>
            ))}
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={creando}
          className="mt-6 w-full rounded-lg px-5 py-2.5 font-semibold"
          style={{ background: 'var(--gold)', color: '#14141e' }}
        >
          {creando ? 'Creando…' : 'Crear campeonato'}
        </button>
      </form>
    </main>
  );
}
