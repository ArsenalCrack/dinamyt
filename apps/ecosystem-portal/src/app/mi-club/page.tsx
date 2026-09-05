'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  obtenerToken,
  miClubAPI,
  crearMiClubAPI,
  extraerError,
  urlImagen,
  type MiClub,
} from '@/lib/api';
import { soloTelefono, comprimirAvatar,
  LIM,
} from '@/lib/validacion';
import { nombreRol } from '@/lib/roles';
import { Avatar } from '@/components/Avatar';
import { PaisCiudad } from '@/components/PaisCiudad';
import { Ampliable } from '@/components/VisorImagen';

const TIPO: Record<string, string> = {
  FEDERATION: 'Federación',
  LEAGUE: 'Liga',
  CLUB: 'Club',
  ACADEMY: 'Academia',
};

/** Etiqueta corta de un enlace de red social (instagram.com/club → Instagram). */
function etiquetaRed(url: string): string {
  try {
    const host = new URL(url).hostname.replace('www.', '');
    if (host.includes('instagram')) return 'Instagram';
    if (host.includes('facebook')) return 'Facebook';
    if (host.includes('tiktok')) return 'TikTok';
    if (host.includes('youtube')) return 'YouTube';
    if (host.includes('wa.me') || host.includes('whatsapp')) return 'WhatsApp';
    if (host.includes('x.com') || host.includes('twitter')) return 'X';
    return host;
  } catch {
    return url;
  }
}

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
  const [nuevo, setNuevo] = useState({
    name: '',
    city: '',
    country: 'Colombia',
    description: '',
    phone: '',
    logoUrl: '',
    red1: '',
    red2: '',
  });
  const [creando, setCreando] = useState(false);
  const inputLogo = useRef<HTMLInputElement>(null);

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

  async function elegirLogo(file: File | undefined) {
    if (!file) return;
    try {
      const dataUrl = await comprimirAvatar(file, 256);
      setNuevo((n) => ({ ...n, logoUrl: dataUrl }));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'No se pudo procesar el logo.');
    }
  }

  async function fundarClub(e: React.FormEvent) {
    e.preventDefault();
    setCreando(true);
    setMsg('');
    try {
      await crearMiClubAPI({
        name: nuevo.name.trim(),
        city: nuevo.city.trim() || undefined,
        country: nuevo.country || undefined,
        description: nuevo.description.trim() || undefined,
        phone: nuevo.phone.trim() || undefined,
        logoUrl: nuevo.logoUrl || undefined,
        socialLinks: [nuevo.red1.trim(), nuevo.red2.trim()].filter(Boolean),
      });
      setMsg('Club creado: ya eres su maestro. Complétalo en «Mi organización».');
      setNuevo({
        name: '', city: '', country: 'Colombia', description: '',
        phone: '', logoUrl: '', red1: '', red2: '',
      });
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

            {/* Identidad visual: logo + nombre */}
            <div className="flex flex-wrap items-center gap-4">
              {nuevo.logoUrl ? (
                <Ampliable src={nuevo.logoUrl} alt="Logo del club" logo>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={urlImagen(nuevo.logoUrl) ?? undefined}
                    alt="Logo del club"
                    className="h-20 w-20 rounded-xl object-cover"
                    style={{ border: '2px solid var(--gold-dim)' }}
                  />
                </Ampliable>
              ) : (
                <div
                  className="flex h-20 w-20 items-center justify-center rounded-xl text-3xl"
                  style={{ background: 'var(--bg-elevated)', border: '2px dashed var(--border)' }}
                >
                  🛡
                </div>
              )}
              <div className="flex flex-col gap-2">
                <input
                  ref={inputLogo}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void elegirLogo(e.target.files?.[0])}
                />
                <button
                  type="button"
                  onClick={() => inputLogo.current?.click()}
                  className="btn btn-outline btn-sm"
                >
                  {nuevo.logoUrl ? 'Cambiar logo' : 'Subir logo del club'}
                </button>
                {nuevo.logoUrl && (
                  <button
                    type="button"
                    onClick={() => setNuevo((n) => ({ ...n, logoUrl: '' }))}
                    className="btn btn-outline btn-sm"
                  >
                    Quitar
                  </button>
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span style={{ color: 'var(--text-muted)' }}>Nombre del club *</span>
                <input
                  className="mt-1"
                  value={nuevo.name}
                  onChange={(e) => setNuevo({ ...nuevo, name: e.target.value })}
                  required
                  maxLength={LIM.orgNombre}
                />
              </label>
              <label className="block text-sm">
                <span style={{ color: 'var(--text-muted)' }}>Teléfono de contacto</span>
                <input
                  className="mt-1"
                  type="tel"
                  inputMode="tel"
                  value={nuevo.phone}
                  maxLength={LIM.telefono}
                  onChange={(e) => setNuevo({ ...nuevo, phone: soloTelefono(e.target.value) })}
                  placeholder="300 123 4567"
                />
              </label>
              {/* Del catálogo local (ver `lib/geo.ts`). Antes estos dos
                  desplegables se llenaban con una llamada a campeonatos-api
                  que no existe: fallaba siempre, y quedaban «Colombia» como
                  único país y ninguna ciudad. */}
              <PaisCiudad
                pais={nuevo.country}
                ciudad={nuevo.city}
                onChange={(country, city) => setNuevo({ ...nuevo, country, city })}
              />
              <label className="block text-sm">
                <span style={{ color: 'var(--text-muted)' }}>Red social (enlace)</span>
                <input
                  className="mt-1"
                  type="url"
                  value={nuevo.red1}
                  maxLength={LIM.url}
                  onChange={(e) => setNuevo({ ...nuevo, red1: e.target.value })}
                  placeholder="https://instagram.com/tuclub"
                />
              </label>
              <label className="block text-sm">
                <span style={{ color: 'var(--text-muted)' }}>Otra red social (enlace)</span>
                <input
                  className="mt-1"
                  type="url"
                  value={nuevo.red2}
                  maxLength={LIM.url}
                  onChange={(e) => setNuevo({ ...nuevo, red2: e.target.value })}
                  placeholder="https://facebook.com/tuclub"
                />
              </label>
            </div>
            <label className="block text-sm">
              <span style={{ color: 'var(--text-muted)' }}>Descripción</span>
              <textarea
                className="mt-1"
                rows={2}
                value={nuevo.description}
                maxLength={LIM.descripcion}
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
        <section key={club.id} className="card mb-4 overflow-hidden">
          {/* Cabecera con el escudo/logo del club como identidad */}
          <div
            className="flex flex-wrap items-center gap-4 border-b p-5"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}
          >
            {club.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={urlImagen(club.logoUrl) ?? undefined}
                alt={`Logo de ${club.name}`}
                className="h-20 w-20 shrink-0 rounded-xl object-cover"
                style={{ border: '2px solid var(--gold-dim)' }}
              />
            ) : (
              <div
                className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl text-3xl font-extrabold"
                style={{ background: 'var(--bg-card)', border: '2px solid var(--gold-dim)', color: 'var(--gold)' }}
              >
                {club.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-bold" style={{ color: 'var(--gold)' }}>
                {club.name}
              </h2>
              <p className="mt-0.5 text-sm" style={{ color: 'var(--text-muted)' }}>
                {[TIPO[club.type] ?? club.type, club.city, club.country]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {club.organizacionPadre && (
                <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                  Afiliado a <strong>{club.organizacionPadre}</strong>
                </p>
              )}
            </div>
            <span className="badge badge-gold">{nombreRol(club.myRole)}</span>
          </div>

          <div className="p-5">
            {club.description && <p className="text-sm">{club.description}</p>}

            <dl
              className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2"
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

            {/* Redes sociales del club */}
            {(club.socialLinks?.length ?? 0) > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {club.socialLinks!.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline btn-sm"
                  >
                    🔗 {etiquetaRed(url)}
                  </a>
                ))}
              </div>
            )}

            {club.gestores.length > 0 && (
              <div className="mt-4 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
                <h3 className="mb-2 text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
                  Maestros y administradores
                </h3>
                <ul className="flex flex-col gap-1.5 text-sm">
                  {club.gestores.map((g, i) => (
                    /* Nombre, correo y teléfono en columna y recortados: en
                       una sola línea, un correo normal se sale de la tarjeta
                       en cualquier celular. El `title` deja leerlo entero. */
                    <li key={i} className="flex items-center gap-2">
                      <Avatar src={g.avatarUrl} nombre={g.fullName} size={32} />
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-1.5">
                          <span className="badge">{nombreRol(g.role)}</span>
                          <strong className="truncate">{g.fullName}</strong>
                        </p>
                        <p
                          className="truncate text-xs"
                          style={{ color: 'var(--text-muted)' }}
                          title={`${g.email}${g.phone ? ` · ${g.phone}` : ''}`}
                        >
                          {g.email}
                          {g.phone ? ` · ${g.phone}` : ''}
                        </p>
                      </div>
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
          </div>
        </section>
      ))}
    </main>
  );
}
