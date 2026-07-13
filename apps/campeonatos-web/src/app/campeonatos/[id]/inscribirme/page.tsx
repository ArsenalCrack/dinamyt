'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  obtenerToken,
  inscribirAPI,
  pantallaAPI,
  miPerfilCompetidorAPI,
  miCuentaAPI,
  miPerfilEcosistemaAPI,
  miClubEcosistemaAPI,
  clubesEcosistemaAPI,
  grupoDeCinturon,
  extraerError,
  CINTURONES,
  GENEROS,
  type Modalidad,
  type PantallaDetalle,
  type ClubEcosistema,
} from '@/lib/api';
import { getSesion } from '@/lib/session';
import { Avatar } from '@/components/Avatar';

const NOMBRE_MODALIDAD: Record<string, string> = {
  combate: 'Combate',
  figura_armas: 'Figura con armas',
  figura_manos_libres: 'Figura a manos libres',
  defensa_personal: 'Defensa personal',
  salto_altura: 'Salto alto',
  salto_longitud: 'Salto largo',
};

const OTRA_ACADEMIA = '__otra__';

/**
 * INSCRIBIRME (estilo PROJECT championship-registration): el sistema detecta
 * del perfil de la persona su documento, nombre, nacimiento, género, cinturón,
 * academia y foto — solo digita su PESO y elige MODALIDADES. Los campos que el
 * sistema no conozca aún (primera vez) sí se piden.
 */
export default function InscribirmePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const campId = params.id;

  const [camp, setCamp] = useState<PantallaDetalle | null>(null);
  const [clubes, setClubes] = useState<ClubEcosistema[]>([]);
  const [cargando, setCargando] = useState(true);

  // Datos de la persona (autollenados si el sistema los conoce).
  const [documento, setDocumento] = useState('');
  const [nombre, setNombre] = useState('');
  const [fechaNacimiento, setFechaNacimiento] = useState('');
  const [genero, setGenero] = useState<(typeof GENEROS)[number] | ''>('');
  const [cinturon, setCinturon] = useState('');
  const [academiaSel, setAcademiaSel] = useState('');
  const [academiaOtra, setAcademiaOtra] = useState('');
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  // Qué campos vinieron del perfil (se muestran bloqueados).
  const [detectado, setDetectado] = useState({
    documento: false,
    nombre: false,
    fecha: false,
    genero: false,
    cinturon: false,
    academia: false,
  });

  // Lo único que SIEMPRE digita: peso y modalidades.
  const [peso, setPeso] = useState('');
  const [mods, setMods] = useState<Modalidad[]>([]);

  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [inscrito, setInscrito] = useState(false);

  useEffect(() => {
    if (!obtenerToken()) {
      router.replace(
        `/admin/login?volver=${encodeURIComponent(`/campeonatos/${campId}/inscribirme`)}`,
      );
      return;
    }
    const sesion = getSesion();

    Promise.allSettled([
      pantallaAPI(campId),
      miPerfilCompetidorAPI(),
      miCuentaAPI(),
      sesion ? miPerfilEcosistemaAPI(sesion.sub) : Promise.reject(),
      miClubEcosistemaAPI(),
      clubesEcosistemaAPI(),
    ]).then(([c, comp, cuenta, perfilEco, miClub, clubs]) => {
      if (c.status === 'fulfilled') setCamp(c.value);
      if (clubs.status === 'fulfilled') setClubes(clubs.value);

      const det = { ...detectado };
      // 1) Perfil de competidor previo (ya compitió antes): manda.
      if (comp.status === 'fulfilled' && comp.value) {
        const p = comp.value;
        setDocumento(p.documento);
        det.documento = true;
        setNombre(p.nombreCompleto);
        det.nombre = true;
        if (p.fechaNacimiento) {
          setFechaNacimiento(p.fechaNacimiento.slice(0, 10));
          det.fecha = true;
        }
        if (p.genero) {
          setGenero(p.genero);
          det.genero = true;
        }
        if (p.cinturon) {
          setCinturon(p.cinturon);
          det.cinturon = true;
        }
        if (p.academiaClub) {
          setAcademiaSel(p.academiaClub);
          det.academia = true;
        }
        if (p.pesoActual) setPeso(p.pesoActual);
        if (p.fotoUrl) setFotoUrl(p.fotoUrl);
      }
      // 2) Cuenta y perfil del ecosystem: completan lo que falte.
      if (cuenta.status === 'fulfilled') {
        if (!det.documento && cuenta.value.documentId) {
          setDocumento(cuenta.value.documentId);
          det.documento = true;
        }
        if (!det.nombre && cuenta.value.fullName) {
          setNombre(cuenta.value.fullName.toLocaleUpperCase('es'));
          det.nombre = true;
        }
        if (!det.fecha && cuenta.value.birthDate) {
          setFechaNacimiento(cuenta.value.birthDate.slice(0, 10));
          det.fecha = true;
        }
      }
      if (perfilEco.status === 'fulfilled') {
        if (perfilEco.value.avatarUrl) setFotoUrl((f) => f ?? perfilEco.value.avatarUrl);
        const grado = perfilEco.value.disciplines?.[0]?.currentGrade;
        if (!det.cinturon && grado && grupoDeCinturon(grado)) {
          setCinturon(grado);
          det.cinturon = true;
        }
      }
      // 3) Mi club del ecosystem → academia por defecto.
      if (
        !det.academia &&
        miClub.status === 'fulfilled' &&
        miClub.value.length > 0
      ) {
        setAcademiaSel(miClub.value[0].name);
        det.academia = true;
      }
      setDetectado(det);
      setCargando(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campId, router]);

  const grupo = useMemo(() => grupoDeCinturon(cinturon), [cinturon]);
  const estado = camp?.campeonato.estado;
  const cerrado = estado === 'EN_CURSO' || estado === 'FINALIZADO';
  const modalidadesCamp = (camp?.modalidades ?? []).map((m) => m.modalidad);

  // La academia detectada puede no estar en el catálogo: se añade como opción.
  const opcionesAcademia = useMemo(() => {
    const nombres = clubes.map((c) => c.name);
    if (academiaSel && academiaSel !== OTRA_ACADEMIA && !nombres.includes(academiaSel)) {
      return [academiaSel, ...nombres];
    }
    return nombres;
  }, [clubes, academiaSel]);

  function toggleMod(m: Modalidad) {
    setMods((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!genero) {
      setMsg({ tipo: 'error', texto: 'Selecciona tu género.' });
      return;
    }
    if (!grupo) {
      setMsg({ tipo: 'error', texto: 'Selecciona tu cinturón.' });
      return;
    }
    if (mods.length === 0) {
      setMsg({ tipo: 'error', texto: 'Elige al menos una modalidad.' });
      return;
    }
    const academiaClub =
      academiaSel === OTRA_ACADEMIA ? academiaOtra.trim() : academiaSel;
    setEnviando(true);
    try {
      await inscribirAPI(campId, {
        documento,
        nombreCompleto: nombre,
        fechaNacimiento,
        genero,
        grupoCinturon: grupo,
        cinturon,
        pesoActual: peso || undefined,
        academiaClub: academiaClub || undefined,
        fotoUrl: fotoUrl ?? undefined,
        modalidades: mods,
      });
      setInscrito(true);
    } catch (err) {
      setMsg({ tipo: 'error', texto: extraerError(err, 'No se pudo enviar tu inscripción.') });
    } finally {
      setEnviando(false);
    }
  }

  if (cargando) {
    return (
      <main className="mx-auto min-h-screen max-w-xl px-4 py-10 sm:px-6">
        <p style={{ color: 'var(--text-muted)' }}>Cargando tus datos…</p>
      </main>
    );
  }

  if (inscrito) {
    return (
      <main className="mx-auto min-h-screen max-w-xl px-4 py-10 sm:px-6">
        <div className="card p-8 text-center">
          <p className="mb-2 text-3xl">🥋</p>
          <h1 className="mb-2 text-xl font-bold" style={{ color: 'var(--gold)' }}>
            ¡Inscripción enviada!
          </h1>
          <p className="mb-4 text-sm" style={{ color: 'var(--text-muted)' }}>
            Queda <strong>pendiente de aprobación</strong> por la organización
            del campeonato. Sigue su estado desde tu panel.
          </p>
          <div className="flex flex-col gap-2">
            <Link href="/panel" className="btn btn-gold w-full">
              Ir a mi panel →
            </Link>
            <Link href={`/pantalla/${campId}`} className="btn btn-outline w-full">
              Ver el campeonato
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-xl px-4 py-10 sm:px-6">
      <Link
        href={`/pantalla/${campId}`}
        className="text-sm"
        style={{ color: 'var(--text-muted)' }}
      >
        ← {camp?.campeonato.nombre ?? 'Campeonato'}
      </Link>
      <h1 className="mb-1 mt-2 text-2xl font-bold" style={{ color: 'var(--gold)' }}>
        Inscribirme
      </h1>
      <p className="mb-5 text-sm" style={{ color: 'var(--text-muted)' }}>
        Detectamos tus datos de tu perfil DINAMYT: revisa, digita tu{' '}
        <strong>peso</strong> y elige tus <strong>modalidades</strong>.
      </p>

      {cerrado && (
        <div
          className="mb-4 rounded-lg border px-4 py-3 text-sm font-semibold"
          style={{ borderColor: 'var(--gold)', background: 'rgba(240,184,0,0.07)', color: 'var(--gold)' }}
        >
          {estado === 'EN_CURSO'
            ? '● El campeonato está EN CURSO: solo puedes entrar si el administrador te invita (revisa tus invitaciones en Mi panel).'
            : 'El campeonato finalizó: las inscripciones están cerradas.'}
        </div>
      )}

      {!cerrado && (
        <form onSubmit={onSubmit} className="card p-5">
          {/* Quién se inscribe (con su foto del perfil) */}
          <div className="mb-4 flex items-center gap-3 border-b pb-4" style={{ borderColor: 'var(--border)' }}>
            <Avatar src={fotoUrl} nombre={nombre || '?'} size={52} />
            <div className="min-w-0">
              <p className="truncate font-bold">{nombre || 'Completa tus datos'}</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {detectado.nombre
                  ? 'Datos tomados de tu perfil DINAMYT'
                  : 'Primera vez: completa tus datos de competidor'}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              Documento
              <input
                value={documento}
                onChange={(e) => setDocumento(e.target.value.replace(/\D/g, ''))}
                required
                maxLength={30}
                inputMode="numeric"
                readOnly={detectado.documento}
                className="mt-1"
                style={detectado.documento ? { opacity: 0.7 } : undefined}
              />
            </label>
            <label className="block text-sm">
              Nombre completo
              <input
                value={nombre}
                onChange={(e) =>
                  setNombre(
                    e.target.value
                      .replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .\-]/g, '')
                      .toLocaleUpperCase('es'),
                  )
                }
                required
                maxLength={200}
                readOnly={detectado.nombre}
                className="mt-1"
                style={detectado.nombre ? { opacity: 0.7 } : undefined}
              />
            </label>
            <label className="block text-sm">
              Fecha de nacimiento
              <input
                type="date"
                value={fechaNacimiento}
                onChange={(e) => setFechaNacimiento(e.target.value)}
                required
                readOnly={detectado.fecha}
                className="mt-1"
                style={detectado.fecha ? { opacity: 0.7 } : undefined}
              />
            </label>
            <label className="block text-sm">
              Género
              <select
                value={genero}
                onChange={(e) => setGenero(e.target.value as (typeof GENEROS)[number])}
                required
                disabled={detectado.genero}
                className="mt-1"
              >
                <option value="">— Elige —</option>
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
                required
                disabled={detectado.cinturon}
                className="mt-1"
              >
                <option value="">— Elige —</option>
                {/* Si su grado no está en la lista estándar, se conserva */}
                {cinturon && !CINTURONES.some((c) => c.nombre === cinturon) && (
                  <option value={cinturon}>{cinturon}</option>
                )}
                {CINTURONES.map((c) => (
                  <option key={c.nombre} value={c.nombre}>
                    {c.nombre}
                  </option>
                ))}
              </select>
              {grupo && (
                <span className="mt-1 block text-xs" style={{ color: 'var(--gold)' }}>
                  Grupo competitivo: {grupo}
                </span>
              )}
            </label>
            <label className="block text-sm">
              Peso actual (kg) *
              <input
                type="number"
                step="0.1"
                min={10}
                max={400}
                value={peso}
                onChange={(e) => setPeso(e.target.value)}
                required
                className="mt-1"
              />
            </label>
          </div>

          {/* Academia detectada o elegible */}
          <label className="mt-3 block text-sm">
            Academia / club
            <select
              value={academiaSel}
              onChange={(e) => setAcademiaSel(e.target.value)}
              disabled={detectado.academia}
              className="mt-1"
            >
              <option value="">— Sin academia —</option>
              {opcionesAcademia.map((n) => (
                <option key={n} value={n}>{n}</option>
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

          <fieldset className="mt-4">
            <legend className="text-sm font-semibold">
              ¿En qué modalidades compites? *
            </legend>
            <div className="mt-2 flex flex-wrap gap-3">
              {modalidadesCamp.map((m) => (
                <label
                  key={m}
                  className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                  style={{
                    borderColor: mods.includes(m) ? 'var(--gold)' : 'var(--border)',
                  }}
                >
                  <input type="checkbox" checked={mods.includes(m)} onChange={() => toggleMod(m)} />
                  {NOMBRE_MODALIDAD[m] ?? m}
                </label>
              ))}
            </div>
          </fieldset>

          {msg && (
            <p className="mt-3 text-sm" style={{ color: msg.tipo === 'ok' ? 'var(--gold)' : '#ff5577' }}>
              {msg.texto}
            </p>
          )}
          <button type="submit" disabled={enviando} className="btn btn-gold mt-4 w-full">
            {enviando ? 'Enviando…' : 'Enviar mi inscripción'}
          </button>
        </form>
      )}
    </main>
  );
}
