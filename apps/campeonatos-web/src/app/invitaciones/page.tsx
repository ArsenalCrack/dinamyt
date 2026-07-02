'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  obtenerToken,
  misInvitacionesAPI,
  aceptarInvitacionAPI,
  rechazarInvitacionAPI,
  getCampeonatoAPI,
  extraerError,
  GENEROS,
  GRUPOS_CINTURON,
  type MiInvitacion,
  type Modalidad,
} from '@/lib/api';
import { Logo } from '@/components/Logo';

const NOMBRE_MODALIDAD: Record<string, string> = {
  combate: 'Combate',
  figura_armas: 'Figura con armas',
  figura_manos_libres: 'Figura a manos libres',
  defensa_personal: 'Defensa personal',
  salto_altura: 'Salto alto',
  salto_longitud: 'Salto largo',
};

/**
 * «Mis invitaciones» (flujo de DINAMYT-PROJECT): el competidor ve aquí sus
 * invitaciones (notificación in-app; también llegan por correo), y al aceptar
 * completa sus datos y elige modalidades → queda inscrito.
 */
export default function MisInvitacionesPage() {
  const router = useRouter();
  const [invitaciones, setInvitaciones] = useState<MiInvitacion[]>([]);
  const [estado, setEstado] = useState<'cargando' | 'ok' | 'error'>('cargando');
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [aceptando, setAceptando] = useState<MiInvitacion | null>(null);
  const [modsCamp, setModsCamp] = useState<Modalidad[]>([]);
  const [ocupado, setOcupado] = useState(false);

  // Formulario de aceptación
  const [documento, setDocumento] = useState('');
  const [fechaNacimiento, setFechaNacimiento] = useState('');
  const [genero, setGenero] = useState<(typeof GENEROS)[number]>('MASCULINO');
  const [grupoCinturon, setGrupoCinturon] =
    useState<(typeof GRUPOS_CINTURON)[number]>('BLANCO');
  const [pesoActual, setPesoActual] = useState('');
  const [academiaClub, setAcademiaClub] = useState('');
  const [mods, setMods] = useState<Modalidad[]>([]);

  const cargar = useCallback(async () => {
    try {
      setInvitaciones(await misInvitacionesAPI());
      setEstado('ok');
    } catch (e) {
      setMsg({ tipo: 'error', texto: extraerError(e, 'No se pudieron cargar tus invitaciones.') });
      setEstado('error');
    }
  }, []);

  useEffect(() => {
    if (!obtenerToken()) {
      router.replace('/admin/login');
      return;
    }
    void cargar();
  }, [router, cargar]);

  async function abrirAceptar(inv: MiInvitacion) {
    setAceptando(inv);
    setMods([]);
    try {
      // Modalidades habilitadas del campeonato para elegir.
      const det = await getCampeonatoAPI(inv.campeonatoId);
      setModsCamp(det.modalidades.map((m) => m.modalidad));
    } catch {
      setModsCamp([]);
    }
  }

  async function aceptar(e: React.FormEvent) {
    e.preventDefault();
    if (!aceptando) return;
    setMsg(null);
    setOcupado(true);
    try {
      await aceptarInvitacionAPI(aceptando.id, {
        documento,
        fechaNacimiento,
        genero,
        grupoCinturon,
        pesoActual: pesoActual || undefined,
        academiaClub: academiaClub || undefined,
        modalidades: mods,
      });
      setMsg({ tipo: 'ok', texto: `¡Inscrito en ${aceptando.campeonato}! 🥋` });
      setAceptando(null);
      await cargar();
    } catch (err) {
      setMsg({ tipo: 'error', texto: extraerError(err, 'No se pudo aceptar la invitación.') });
    } finally {
      setOcupado(false);
    }
  }

  async function rechazar(inv: MiInvitacion) {
    setMsg(null);
    setOcupado(true);
    try {
      await rechazarInvitacionAPI(inv.id);
      await cargar();
    } catch (err) {
      setMsg({ tipo: 'error', texto: extraerError(err, 'No se pudo rechazar.') });
    } finally {
      setOcupado(false);
    }
  }

  const pendientes = invitaciones.filter((i) => i.estado === 'PENDIENTE');
  const respondidas = invitaciones.filter((i) => i.estado !== 'PENDIENTE');

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex items-center justify-between">
        <Link href="/">
          <Logo size={36} />
        </Link>
        <Link href="/admin" className="btn btn-outline btn-sm">
          Panel
        </Link>
      </header>

      <h1 className="text-2xl font-bold" style={{ color: 'var(--gold)' }}>
        Mis invitaciones
      </h1>
      <p className="mb-6 text-sm" style={{ color: 'var(--text-muted)' }}>
        Invitaciones a competir enviadas a tu cuenta. Al aceptar eliges tus
        modalidades y quedas inscrito.
      </p>

      {msg && (
        <p className={`mb-4 text-sm ${msg.tipo === 'ok' ? 'msg-ok' : 'msg-error'}`}>
          {msg.texto}
        </p>
      )}
      {estado === 'cargando' && <p style={{ color: 'var(--text-muted)' }}>Cargando…</p>}
      {estado === 'ok' && invitaciones.length === 0 && (
        <div className="card p-8 text-center" style={{ color: 'var(--text-muted)' }}>
          No tienes invitaciones por ahora.
        </div>
      )}

      <ul className="grid gap-3">
        {pendientes.map((inv) => (
          <li key={inv.id} className="card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">{inv.campeonato}</h3>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {[inv.ciudad, inv.fechaInicio].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => abrirAceptar(inv)}
                  disabled={ocupado}
                  className="btn btn-gold btn-sm"
                >
                  Aceptar
                </button>
                <button
                  onClick={() => rechazar(inv)}
                  disabled={ocupado}
                  className="btn btn-danger btn-sm"
                >
                  Rechazar
                </button>
              </div>
            </div>

            {/* Formulario de aceptación */}
            {aceptando?.id === inv.id && (
              <form onSubmit={aceptar} className="mt-4 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm">
                    Documento *
                    <input value={documento} onChange={(e) => setDocumento(e.target.value.replace(/\D/g, ''))} required maxLength={30} inputMode="numeric" placeholder="Solo números" className="mt-1" />
                  </label>
                  <label className="block text-sm">
                    Fecha de nacimiento *
                    <input type="date" value={fechaNacimiento} onChange={(e) => setFechaNacimiento(e.target.value)} required className="mt-1" />
                  </label>
                  <label className="block text-sm">
                    Género *
                    <select value={genero} onChange={(e) => setGenero(e.target.value as (typeof GENEROS)[number])} className="mt-1">
                      {GENEROS.map((g) => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    Grupo de cinturón *
                    <select value={grupoCinturon} onChange={(e) => setGrupoCinturon(e.target.value as (typeof GRUPOS_CINTURON)[number])} className="mt-1">
                      {GRUPOS_CINTURON.map((g) => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    Peso (kg)
                    <input type="number" step="0.1" min="10" max="400" value={pesoActual} onChange={(e) => setPesoActual(e.target.value)} className="mt-1" />
                  </label>
                  <label className="block text-sm">
                    Academia / club
                    <input value={academiaClub} onChange={(e) => setAcademiaClub(e.target.value)} maxLength={200} className="mt-1" />
                  </label>
                </div>

                <fieldset className="mt-4">
                  <legend className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
                    Modalidades * (en qué quieres competir)
                  </legend>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {modsCamp.map((m) => (
                      <label key={m} className="flex items-center gap-2 rounded-lg border p-2 text-sm" style={{ borderColor: mods.includes(m) ? 'var(--gold-dim)' : 'var(--border)' }}>
                        <input
                          type="checkbox"
                          checked={mods.includes(m)}
                          onChange={() =>
                            setMods((cur) =>
                              cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m],
                            )
                          }
                        />
                        {NOMBRE_MODALIDAD[m] ?? m}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div className="mt-4 flex gap-2">
                  <button type="submit" disabled={ocupado || mods.length === 0} className="btn btn-gold">
                    {ocupado ? 'Inscribiendo…' : 'Confirmar inscripción'}
                  </button>
                  <button type="button" onClick={() => setAceptando(null)} className="btn btn-outline">
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </li>
        ))}

        {respondidas.map((inv) => (
          <li key={inv.id} className="card flex items-center justify-between p-4" style={{ opacity: 0.7 }}>
            <div>
              <h3 className="font-semibold">{inv.campeonato}</h3>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {[inv.ciudad, inv.fechaInicio].filter(Boolean).join(' · ')}
              </p>
            </div>
            <span className={`badge ${inv.estado === 'ACEPTADA' ? 'badge-ok' : ''}`}>
              {inv.estado}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
