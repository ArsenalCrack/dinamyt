'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  inscribirAPI,
  invitarAPI,
  listInvitacionesAPI,
  getCampeonatoAPI,
  clubesEcosistemaAPI,
  extraerError,
  CINTURONES,
  GENEROS,
  type Modalidad,
  type Invitacion,
  type CampeonatoDetalle,
  type ClubEcosistema,
} from '@/lib/api';
import { getSesion, esAdmin, puedeInscribir } from '@/lib/session';

const NOMBRE_MODALIDAD: Record<string, string> = {
  combate: 'Combate',
  figura_armas: 'Figura con armas',
  figura_manos_libres: 'Figura a manos libres',
  defensa_personal: 'Defensa personal',
  salto_altura: 'Salto alto',
  salto_longitud: 'Salto largo',
};

const OTRA_ACADEMIA = '__otra__';

export default function InscribirPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const campId = params.id;
  const admin = esAdmin(getSesion());

  // Inscribir a TERCEROS (y ver invitaciones) es de admin y maestro; el
  // usuario común se inscribe a sí mismo desde el campeonato público.
  useEffect(() => {
    if (!puedeInscribir(getSesion())) {
      router.replace(`/campeonatos/${campId}/inscribirme`);
    }
  }, [router, campId]);

  const [camp, setCamp] = useState<CampeonatoDetalle | null>(null);
  const [clubes, setClubes] = useState<ClubEcosistema[]>([]);

  const [documento, setDocumento] = useState('');
  const [nombreCompleto, setNombreCompleto] = useState('');
  const [fechaNacimiento, setFechaNacimiento] = useState('');
  const [genero, setGenero] = useState<(typeof GENEROS)[number]>('MASCULINO');
  // El staff elige el CINTURÓN REAL; el sistema lo asocia a su grupo.
  const [cinturon, setCinturon] = useState(CINTURONES[0].nombre);
  const [pesoActual, setPesoActual] = useState('');
  const [academiaSel, setAcademiaSel] = useState('');
  const [academiaOtra, setAcademiaOtra] = useState('');
  const [mods, setMods] = useState<Modalidad[]>([]);

  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    getCampeonatoAPI(campId).then(setCamp).catch(() => setCamp(null));
    clubesEcosistemaAPI().then(setClubes).catch(() => setClubes([]));
  }, [campId]);

  const grupoDelCinturon =
    CINTURONES.find((c) => c.nombre === cinturon)?.grupo ?? 'BLANCO';
  const enCurso = camp?.estado === 'EN_CURSO';
  const finalizado = camp?.estado === 'FINALIZADO';
  // Con el evento EN VIVO solo el admin añade competidores (tarea del flujo
  // del evento); el maestro ve el porqué, no un formulario muerto.
  const bloqueado = finalizado || (enCurso && !admin);
  const modalidadesCamp = (camp?.modalidades ?? []).map((m) => m.modalidad);

  function toggleMod(m: Modalidad) {
    setMods((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setAvisos([]);
    if (mods.length === 0) {
      setMsg({ tipo: 'error', texto: 'Selecciona al menos una modalidad.' });
      return;
    }
    const academiaClub =
      academiaSel === OTRA_ACADEMIA ? academiaOtra.trim() : academiaSel;
    setEnviando(true);
    try {
      const r = (await inscribirAPI(campId, {
        documento,
        nombreCompleto,
        fechaNacimiento,
        genero,
        grupoCinturon: grupoDelCinturon,
        cinturon,
        pesoActual: pesoActual || undefined,
        academiaClub: academiaClub || undefined,
        modalidades: mods,
      })) as { avisos?: string[] };
      setMsg({ tipo: 'ok', texto: 'Competidor inscrito correctamente.' });
      setAvisos(r.avisos ?? []);
      setDocumento('');
      setNombreCompleto('');
      setFechaNacimiento('');
      setPesoActual('');
      setAcademiaSel('');
      setAcademiaOtra('');
      setMods([]);
    } catch (err) {
      setMsg({ tipo: 'error', texto: extraerError(err, 'No se pudo inscribir.') });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-xl px-4 py-10 sm:px-6">
      <div className="flex items-center justify-between">
        <Link href="/admin" className="text-sm" style={{ color: 'var(--text-muted)' }}>
          ← Volver
        </Link>
        {/* Secciones y llaves es SOLO del administrador */}
        {admin && (
          <Link
            href={`/admin/${campId}/secciones`}
            className="text-sm font-semibold"
            style={{ color: 'var(--gold)' }}
          >
            Secciones y llaves →
          </Link>
        )}
      </div>
      <h1 className="mb-2 mt-2 text-2xl font-bold" style={{ color: 'var(--gold)' }}>
        Inscribir competidor
      </h1>
      {camp && (
        <p className="mb-4 text-sm" style={{ color: 'var(--text-muted)' }}>
          {camp.nombre}
          {camp.fechaInicio ? ` · ${camp.fechaInicio}` : ''}
        </p>
      )}

      {enCurso && (
        <div
          className="mb-4 rounded-lg border px-4 py-3 text-sm font-semibold"
          style={{ borderColor: 'var(--gold)', background: 'rgba(240,184,0,0.07)', color: 'var(--gold)' }}
        >
          ● El campeonato está EN CURSO:{' '}
          {admin
            ? 'solo tú como administrador puedes añadir competidores. Revisa el aviso si su sección ya arrancó.'
            : 'las inscripciones quedaron cerradas. Solo el administrador puede añadir competidores.'}
        </div>
      )}
      {finalizado && (
        <div className="mb-4 rounded-lg border px-4 py-3 text-sm font-semibold" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
          El campeonato finalizó: las inscripciones están cerradas.
        </div>
      )}

      {!bloqueado && (
        <form
          onSubmit={onSubmit}
          className="rounded-xl border p-5"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              Documento (solo números)
              <input
                value={documento}
                onChange={(e) => setDocumento(e.target.value.replace(/\D/g, ''))}
                required
                maxLength={30}
                inputMode="numeric"
                className="mt-1"
              />
            </label>
            <label className="block text-sm">
              Nombre completo (solo letras)
              <input
                value={nombreCompleto}
                onChange={(e) =>
                  setNombreCompleto(
                    e.target.value
                      .replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .\-]/g, '')
                      .toLocaleUpperCase('es'),
                  )
                }
                required
                maxLength={200}
                placeholder="NOMBRE APELLIDO"
                className="mt-1"
              />
            </label>
            <label className="block text-sm">
              Fecha de nacimiento
              <input
                type="date"
                value={fechaNacimiento}
                onChange={(e) => setFechaNacimiento(e.target.value)}
                required
                className="mt-1"
              />
            </label>
            <label className="block text-sm">
              Peso actual (kg)
              <input
                type="number"
                step="0.1"
                min={10}
                max={400}
                value={pesoActual}
                onChange={(e) => setPesoActual(e.target.value)}
                className="mt-1"
              />
            </label>
            <label className="block text-sm">
              Género
              <select
                value={genero}
                onChange={(e) => setGenero(e.target.value as (typeof GENEROS)[number])}
                className="mt-1"
              >
                {GENEROS.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Cinturón
              <select
                value={cinturon}
                onChange={(e) => setCinturon(e.target.value)}
                className="mt-1"
              >
                {CINTURONES.map((c) => (
                  <option key={c.nombre} value={c.nombre}>
                    {c.nombre}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs" style={{ color: 'var(--gold)' }}>
                Grupo competitivo: {grupoDelCinturon}
              </span>
            </label>
          </div>

          {/* Academia: las registradas en el sistema, u «Otra» a mano */}
          <label className="mt-3 block text-sm">
            Academia / club
            <select
              value={academiaSel}
              onChange={(e) => setAcademiaSel(e.target.value)}
              className="mt-1"
            >
              <option value="">— Sin academia —</option>
              {clubes.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                  {c.city ? ` (${c.city})` : ''}
                </option>
              ))}
              <option value={OTRA_ACADEMIA}>Otra (escribirla)…</option>
            </select>
          </label>
          {academiaSel === OTRA_ACADEMIA && (
            <input
              value={academiaOtra}
              onChange={(e) => setAcademiaOtra(e.target.value)}
              maxLength={200}
              placeholder="Nombre de la academia"
              className="mt-2"
            />
          )}

          <fieldset className="mt-3">
            <legend className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Modalidades del campeonato
            </legend>
            <div className="mt-2 flex flex-wrap gap-3">
              {(modalidadesCamp.length > 0 ? modalidadesCamp : []).map((m) => (
                <label key={m} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={mods.includes(m)} onChange={() => toggleMod(m)} />
                  {NOMBRE_MODALIDAD[m] ?? m}
                </label>
              ))}
              {modalidadesCamp.length === 0 && (
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Cargando modalidades…
                </p>
              )}
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
          {avisos.map((a, i) => (
            <p key={i} className="mt-1 text-sm font-semibold" style={{ color: '#ff9f43' }}>
              {a}
            </p>
          ))}
          <button
            type="submit"
            disabled={enviando}
            className="btn btn-gold mt-4"
          >
            {enviando ? 'Inscribiendo…' : 'Inscribir'}
          </button>
        </form>
      )}

      {/* Invitar: en BORRADOR/LISTO admin y maestro; EN_CURSO solo el admin */}
      {!finalizado && (admin || !enCurso) && (
        <SeccionInvitaciones campId={campId} enCurso={enCurso} />
      )}
    </main>
  );
}

/** Invitar competidores por email (aceptan in-app eligiendo modalidades). */
function SeccionInvitaciones({ campId, enCurso }: { campId: string; enCurso: boolean }) {
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
        {enCurso
          ? 'Con el evento en curso, TU invitación es la única forma de que alguien se inscriba por su cuenta.'
          : 'El invitado recibe un correo y ve la invitación al entrar con su cuenta; al aceptar completa sus datos y elige modalidades.'}
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
