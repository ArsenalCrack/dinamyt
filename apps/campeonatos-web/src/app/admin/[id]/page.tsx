'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  inscribirAPI,
  invitarAPI,
  listInvitacionesAPI,
  extraerError,
  MODALIDADES,
  GRUPOS_CINTURON,
  GENEROS,
  type Modalidad,
  type Invitacion,
} from '@/lib/api';

export default function InscribirPage() {
  const params = useParams<{ id: string }>();
  const campId = params.id;

  const [documento, setDocumento] = useState('');
  const [nombreCompleto, setNombreCompleto] = useState('');
  const [fechaNacimiento, setFechaNacimiento] = useState('');
  const [genero, setGenero] = useState<(typeof GENEROS)[number]>('MASCULINO');
  const [grupoCinturon, setGrupoCinturon] =
    useState<(typeof GRUPOS_CINTURON)[number]>('BLANCO');
  const [pesoActual, setPesoActual] = useState('');
  const [academiaClub, setAcademiaClub] = useState('');
  const [mods, setMods] = useState<Modalidad[]>([]);

  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  function toggleMod(m: Modalidad) {
    setMods((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (mods.length === 0) {
      setMsg({ tipo: 'error', texto: 'Selecciona al menos una modalidad.' });
      return;
    }
    setEnviando(true);
    try {
      await inscribirAPI(campId, {
        documento,
        nombreCompleto,
        fechaNacimiento,
        genero,
        grupoCinturon,
        pesoActual: pesoActual || undefined,
        academiaClub: academiaClub || undefined,
        modalidades: mods,
      });
      setMsg({ tipo: 'ok', texto: 'Competidor inscrito correctamente.' });
      setDocumento('');
      setNombreCompleto('');
      setFechaNacimiento('');
      setPesoActual('');
      setAcademiaClub('');
      setMods([]);
    } catch (err) {
      setMsg({ tipo: 'error', texto: extraerError(err, 'No se pudo inscribir.') });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-xl px-6 py-10">
      <div className="flex items-center justify-between">
        <Link href="/admin" className="text-sm" style={{ color: 'var(--text-muted)' }}>
          ← Volver
        </Link>
        <Link
          href={`/admin/${campId}/secciones`}
          className="text-sm font-semibold"
          style={{ color: 'var(--gold)' }}
        >
          Secciones y llaves →
        </Link>
      </div>
      <h1 className="mb-6 mt-2 text-2xl font-bold" style={{ color: 'var(--gold)' }}>
        Inscribir competidor
      </h1>

      <form
        onSubmit={onSubmit}
        className="rounded-xl border p-5"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            Documento
            <input value={documento} onChange={(e) => setDocumento(e.target.value)} required className="mt-1" />
          </label>
          <label className="block text-sm">
            Nombre completo
            <input value={nombreCompleto} onChange={(e) => setNombreCompleto(e.target.value)} required className="mt-1" />
          </label>
          <label className="block text-sm">
            Fecha de nacimiento
            <input type="date" value={fechaNacimiento} onChange={(e) => setFechaNacimiento(e.target.value)} required className="mt-1" />
          </label>
          <label className="block text-sm">
            Peso actual (kg)
            <input type="number" step="0.1" value={pesoActual} onChange={(e) => setPesoActual(e.target.value)} className="mt-1" />
          </label>
          <label className="block text-sm">
            Género
            <select value={genero} onChange={(e) => setGenero(e.target.value as (typeof GENEROS)[number])} className="mt-1">
              {GENEROS.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Grupo de cinturón
            <select
              value={grupoCinturon}
              onChange={(e) => setGrupoCinturon(e.target.value as (typeof GRUPOS_CINTURON)[number])}
              className="mt-1"
            >
              {GRUPOS_CINTURON.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="mt-3 block text-sm">
          Academia / club
          <input value={academiaClub} onChange={(e) => setAcademiaClub(e.target.value)} className="mt-1" />
        </label>

        <fieldset className="mt-3">
          <legend className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Modalidades
          </legend>
          <div className="mt-2 flex flex-wrap gap-3">
            {MODALIDADES.map((m) => (
              <label key={m} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={mods.includes(m)} onChange={() => toggleMod(m)} />
                {m}
              </label>
            ))}
          </div>
        </fieldset>

        {msg && (
          <p
            className="mt-3 text-sm"
            style={{ color: msg.tipo === 'ok' ? 'var(--gold)' : '#ff5577' }}
          >
            {msg.texto}
          </p>
        )}
        <button
          type="submit"
          disabled={enviando}
          className="mt-4 rounded-lg px-5 py-2 font-semibold"
          style={{ background: 'var(--gold)', color: '#14141e' }}
        >
          {enviando ? 'Inscribiendo…' : 'Inscribir'}
        </button>
      </form>

      <SeccionInvitaciones campId={campId} />
    </main>
  );
}

/** Invitar competidores por email (aceptan in-app eligiendo modalidades). */
function SeccionInvitaciones({ campId }: { campId: string }) {
  const [email, setEmail] = useState('');
  const [lista, setLista] = useState<Invitacion[]>([]);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(() => {
    listInvitacionesAPI(campId)
      .then(setLista)
      .catch(() => setLista([]));
  }, [campId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function invitar(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setOcupado(true);
    try {
      const inv = await invitarAPI(campId, email.trim());
      setMsg({
        tipo: 'ok',
        texto: inv.correoEnviado
          ? 'Invitación enviada por correo; también la verá al iniciar sesión.'
          : 'Invitación creada: la verá al iniciar sesión (correo no configurado).',
      });
      setEmail('');
      cargar();
    } catch (err) {
      setMsg({ tipo: 'error', texto: extraerError(err, 'No se pudo invitar.') });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="card mt-6 p-5">
      <h2 className="mb-1 text-lg font-semibold">Invitar competidores</h2>
      <p className="mb-3 text-sm" style={{ color: 'var(--text-muted)' }}>
        El invitado recibe un correo y ve la invitación al entrar con su cuenta;
        al aceptar completa sus datos y elige modalidades.
      </p>
      <form onSubmit={invitar} className="flex flex-wrap gap-2">
        <input
          type="email"
          placeholder="email@competidor.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="min-w-0 flex-1"
        />
        <button type="submit" disabled={ocupado || !email.trim()} className="btn btn-gold">
          + Invitar
        </button>
      </form>
      {msg && (
        <p className={`mt-2 text-sm ${msg.tipo === 'ok' ? 'msg-ok' : 'msg-error'}`}>
          {msg.texto}
        </p>
      )}
      {lista.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {lista.map((i) => (
            <li
              key={i.id}
              className="flex items-center justify-between rounded-lg border px-3 py-1.5 text-sm"
              style={{ borderColor: 'var(--border)' }}
            >
              <span className="truncate">{i.email}</span>
              <span
                className={`badge ${
                  i.estado === 'ACEPTADA' ? 'badge-ok' : i.estado === 'PENDIENTE' ? 'badge-info' : ''
                }`}
              >
                {i.estado}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
