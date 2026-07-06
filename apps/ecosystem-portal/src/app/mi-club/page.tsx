'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  obtenerToken,
  miClubAPI,
  crearMiClubAPI,
  extraerError,
  type MiClub,
} from '@/lib/api';
import { Avatar } from '@/components/Avatar';

const TIPO: Record<string, string> = {
  FEDERATION: 'Federación',
  LEAGUE: 'Liga',
  CLUB: 'Club',
  ACADEMY: 'Academia',
};

const ROL: Record<string, string> = {
  maestro: 'Maestro',
  owner: 'Dueño',
  admin: 'Administrador',
  coach: 'Coach',
  judge: 'Juez',
  competitor: 'Competidor',
  student: 'Alumno',
  member: 'Miembro',
};

/**
 * Mi club — la información del club al que pertenece la persona: sede,
 * horarios, contactos y maestros. La llena el maestro o el administrador del
 * club desde «Mi organización»; aquí todos sus miembros la consultan.
 */
export default function MiClubPage() {
  const router = useRouter();
  const [clubes, setClubes] = useState<MiClub[] | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  // Fundar mi propio club (flujo del maestro sin club).
  const [nuevo, setNuevo] = useState({ name: '', city: '', description: '' });
  const [creando, setCreando] = useState(false);

  const cargar = useCallback(async () => {
    if (!obtenerToken()) {
      router.replace('/login');
      return;
    }
    try {
      setClubes(await miClubAPI());
    } catch (e) {
      setError(extraerError(e, 'No se pudo cargar la información de tu club.'));
      setClubes([]);
    }
  }, [router]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function fundarClub(e: React.FormEvent) {
    e.preventDefault();
    setCreando(true);
    setMsg('');
    try {
      await crearMiClubAPI({
        name: nuevo.name.trim(),
        city: nuevo.city.trim() || undefined,
        description: nuevo.description.trim() || undefined,
      });
      setMsg('Club creado: ya eres su maestro. Complétalo en «Mi organización».');
      setNuevo({ name: '', city: '', description: '' });
      await cargar();
    } catch (e2) {
      setMsg(extraerError(e2, 'No se pudo crear el club.'));
    } finally {
      setCreando(false);
    }
  }

  if (clubes === null) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p style={{ color: 'var(--text-muted)' }}>Cargando…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-10 sm:px-6">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow mb-1">Tu casa deportiva</p>
          <h1 className="display text-3xl">Mi club</h1>
        </div>
        <Link href="/dashboard" className="btn btn-outline">
          ← Mis aplicaciones
        </Link>
      </header>

      {error && <p className="msg-error mb-4 text-sm">{error}</p>}

      {clubes.length === 0 && (
        <>
          <div className="card p-8 text-center" style={{ color: 'var(--text-muted)' }}>
            <p className="mb-2 font-bold">Aún no perteneces a un club.</p>
            <p className="text-sm">
              Pide a tu maestro que te agregue con tu correo, o si eres maestro,
              funda tu club aquí mismo.
            </p>
          </div>

          {/* Fundar mi club (un maestro crea el suyo; luego una organización
              puede invitarlo a afiliarse) */}
          <form onSubmit={fundarClub} className="card mt-4 flex flex-col gap-3 p-5">
            <h2 className="text-lg font-semibold">Fundar mi club</h2>
            <p className="-mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
              Quedas como maestro del club: podrás agregar a tus alumnos y
              coaches, llenar su información y aceptar la invitación de una
              federación o liga.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span style={{ color: 'var(--text-muted)' }}>Nombre del club *</span>
                <input
                  className="mt-1"
                  value={nuevo.name}
                  onChange={(e) => setNuevo({ ...nuevo, name: e.target.value })}
                  required
                  maxLength={200}
                />
              </label>
              <label className="block text-sm">
                <span style={{ color: 'var(--text-muted)' }}>Ciudad</span>
                <input
                  className="mt-1"
                  value={nuevo.city}
                  onChange={(e) => setNuevo({ ...nuevo, city: e.target.value })}
                  maxLength={100}
                />
              </label>
            </div>
            <label className="block text-sm">
              <span style={{ color: 'var(--text-muted)' }}>Descripción</span>
              <textarea
                className="mt-1"
                rows={2}
                value={nuevo.description}
                onChange={(e) => setNuevo({ ...nuevo, description: e.target.value })}
                placeholder="Qué se entrena, para quién, desde cuándo…"
              />
            </label>
            {msg && <p className="text-sm" style={{ color: 'var(--gold)' }}>{msg}</p>}
            <button
              type="submit"
              disabled={creando || !nuevo.name.trim()}
              className="btn btn-gold self-start"
            >
              {creando ? 'Creando…' : '+ Fundar club'}
            </button>
          </form>
        </>
      )}

      {clubes.map((club) => (
        <section key={club.id} className="card mb-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-bold" style={{ color: 'var(--gold)' }}>
                {club.name}
              </h2>
              <p className="mt-0.5 text-sm" style={{ color: 'var(--text-muted)' }}>
                {[TIPO[club.type] ?? club.type, club.city, club.country]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            <span className="badge badge-gold">{ROL[club.myRole] ?? club.myRole}</span>
          </div>

          {club.organizacionPadre && (
            <p className="mt-2 text-sm">
              <span style={{ color: 'var(--text-muted)' }}>Afiliado a</span>{' '}
              <strong>{club.organizacionPadre}</strong>
            </p>
          )}

          {club.description && <p className="mt-3 text-sm">{club.description}</p>}

          <dl
            className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 border-t pt-4 text-sm sm:grid-cols-2"
            style={{ borderColor: 'var(--border)' }}
          >
            <div>
              <dt style={{ color: 'var(--text-muted)' }}>Sede / dirección</dt>
              <dd className="font-semibold">{club.address ?? 'Por definir'}</dd>
            </div>
            <div>
              <dt style={{ color: 'var(--text-muted)' }}>Horarios de clase</dt>
              <dd className="whitespace-pre-line font-semibold">
                {club.schedule ?? 'Por definir'}
              </dd>
            </div>
            <div>
              <dt style={{ color: 'var(--text-muted)' }}>Teléfono</dt>
              <dd className="font-semibold">{club.phone ?? '—'}</dd>
            </div>
            <div>
              <dt style={{ color: 'var(--text-muted)' }}>Correo</dt>
              <dd className="font-semibold">{club.email ?? '—'}</dd>
            </div>
          </dl>

          {club.gestores.length > 0 && (
            <div className="mt-4 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
              <h3 className="mb-2 text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
                Maestros y administradores
              </h3>
              <ul className="flex flex-col gap-1.5 text-sm">
                {club.gestores.map((g, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2">
                    <Avatar src={g.avatarUrl} nombre={g.fullName} size={32} />
                    <span className="badge">{ROL[g.role] ?? g.role}</span>
                    <strong>{g.fullName}</strong>
                    <span style={{ color: 'var(--text-muted)' }}>
                      {g.email}
                      {g.phone ? ` · ${g.phone}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {['maestro', 'owner', 'admin'].includes(club.myRole) && (
            <Link href="/mi-organizacion" className="btn btn-gold mt-4 inline-block">
              Editar la información del club
            </Link>
          )}
        </section>
      ))}
    </main>
  );
}
