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
import { useI18n } from '@/lib/i18n';
import { Cargando } from '@/components/Cargando';
import { Icono } from '@/components/Icono';
import { MensajeVivo } from '@/components/MensajeVivo';
import { iniciales } from '@/lib/iniciales';

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
  const { t } = useI18n();
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
      <main className="mx-auto min-h-screen max-w-3xl px-4 py-8">
        <Cargando mensaje={t('club.cargando')} />
      </main>
    );
  }

  return (
    <main
      className={`mx-auto min-h-screen max-w-2xl px-4 py-10 sm:px-6 ${clubes.length > 1 ? 'lg:max-w-5xl' : ''}`}
    >
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow mb-1">Tu casa deportiva</p>
          <h1 className="display text-3xl">Mi club</h1>
        </div>
        <Link href="/dashboard" className="btn btn-outline">
          ← Mis aplicaciones
        </Link>
      </header>

      <MensajeVivo tono="error" texto={error} className="mb-4 text-sm" />

      {clubes.length === 0 && (
        <>
          <div className="card p-8 text-center text-muted">
            <p className="mb-2 font-bold">{t('club.sinClub')}</p>
            <p className="text-sm">
              Pide a tu maestro que te agregue con tu correo, o si eres maestro,
              funda tu club aquí mismo.
            </p>
          </div>

          {/* Fundar mi club (un maestro crea el suyo; luego una organización
              puede invitarlo a afiliarse) */}
          <form onSubmit={fundarClub} className="card mt-4 flex flex-col gap-3 p-5">
            <h2 className="text-lg font-semibold">Fundar mi club</h2>
            <p className="-mt-1 text-sm text-muted">
              Quedas como maestro del club: podrás agregar a tus alumnos y
              coaches, llenar su información y aceptar la invitación de una
              federación o liga.
            </p>

            {/* Identidad visual: logo + nombre */}
            <div className="flex flex-wrap items-center gap-4">
              {nuevo.logoUrl ? (
                <Ampliable src={nuevo.logoUrl} alt={t('club.logo')} logo>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={urlImagen(nuevo.logoUrl) ?? undefined}
                    alt={t('club.logo2')}
                    className="h-20 w-20 rounded-xl object-cover"
                    style={{ border: '2px solid var(--gold-dim)' }}
                  />
                </Ampliable>
              ) : (
                <div
                  className="flex h-20 w-20 items-center justify-center rounded-xl text-muted"
                  style={{ background: 'var(--bg-elevated)', border: '2px dashed var(--border)' }}
                >
                  <Icono nombre="escudo" tamano={34} />
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
                <span className="text-muted">{t('club.nombre')}</span>
                <input
                  name="club"
                  autoComplete="organization"
                  className="mt-1"
                  value={nuevo.name}
                  onChange={(e) => setNuevo({ ...nuevo, name: e.target.value })}
                  required
                  maxLength={LIM.orgNombre}
                />
              </label>
              <label className="block text-sm">
                <span className="text-muted">{t('club.telefonoContacto')}</span>
                <input
                  name="telefono"
                  autoComplete="tel"
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
                <span className="text-muted">Red social (enlace)</span>
                <input
                  name="red1"
                  autoComplete="url"
                  className="mt-1"
                  type="url"
                  value={nuevo.red1}
                  maxLength={LIM.url}
                  onChange={(e) => setNuevo({ ...nuevo, red1: e.target.value })}
                  placeholder="https://instagram.com/tuclub"
                />
              </label>
              <label className="block text-sm">
                <span className="text-muted">Otra red social (enlace)</span>
                <input
                  name="red2"
                  autoComplete="url"
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
              <span className="text-muted">{t('club.descripcion')}</span>
              <textarea
                name="descripcion"
                autoComplete="off"
                className="mt-1"
                rows={2}
                value={nuevo.description}
                maxLength={LIM.descripcion}
                onChange={(e) => setNuevo({ ...nuevo, description: e.target.value })}
                placeholder={t('club.descripcionPh')}
              />
            </label>
            <MensajeVivo tono="info" texto={msg} className="text-sm text-gold" />
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

      {/* `p-0` a proposito: la cabecera de estas tarjetas va a ras del borde,
          con su propio fondo. Desde que `.card` trae relleno por defecto, sin
          esto quedaria un marco de 1rem alrededor de esa franja de color. */}
      {/* En escritorio, los clubes lado a lado (003, nº 7). Con uno solo la
          pantalla se queda en una columna, como el resto de lo de una tarea. */}
      <div className={`grid gap-4 ${clubes.length > 1 ? 'lg:grid-cols-2 lg:items-start' : ''}`}>
      {clubes.map((club) => (
        <section key={club.id} className="card overflow-hidden p-0">
          {/* Cabecera con el escudo/logo del club como identidad */}
          <div
            className="flex flex-wrap items-center gap-4 border-b p-5 border-line bg-elevated"
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
                {iniciales(club.name)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-bold text-gold">
                {club.name}
              </h2>
              <p className="mt-0.5 text-sm text-muted">
                {[TIPO[club.type] ?? club.type, club.city, club.country]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {club.organizacionPadre && (
                <p className="mt-1 text-xs text-muted">
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
                <dt className="text-muted">{t('club.sede')}</dt>
                <Valor texto={club.address} vacio={t('club.porDefinir')} />
              </div>
              <div>
                <dt className="text-muted">{t('club.horarios')}</dt>
                <Valor texto={club.schedule} vacio={t('club.porDefinir')} multilinea />
              </div>
              <div>
                <dt className="text-muted">{t('club.telefono')}</dt>
                <Valor texto={club.phone} vacio={t('comun.sinDato')} />
              </div>
              <div>
                <dt className="text-muted">Correo</dt>
                <Valor texto={club.email} vacio={t('comun.sinDato')} />
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
                    {etiquetaRed(url)}
                  </a>
                ))}
              </div>
            )}

            {club.gestores.length > 0 && (
              <div className="mt-4 border-t pt-4 border-line">
                <h3 className="mb-2 text-sm font-semibold text-muted">
                  {t('club.maestros')}
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
                          className="truncate text-xs text-muted"
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
                {t('club.editarFicha')}
              </Link>
            )}
          </div>
        </section>
      ))}
      </div>
    </main>
  );
}

/**
 * Un dato de la ficha del club. El vacío se ve vacío —en gris y sin negrita—,
 * no como un dato más: «Por definir» en negrita se leía igual que una
 * dirección de verdad (auditoría 003, nº 11).
 */
function Valor({
  texto,
  vacio,
  multilinea = false,
}: {
  texto: string | null | undefined;
  vacio: string;
  multilinea?: boolean;
}) {
  if (!texto) return <dd className="text-muted">{vacio}</dd>;
  return <dd className={multilinea ? 'whitespace-pre-line font-semibold' : 'font-semibold'}>{texto}</dd>;
}
