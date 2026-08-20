'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import api, {
  obtenerToken,
  decodificarToken,
  cerrarSesion,
  misOrganizacionesAPI,
  miClubAPI,
  type TokenPayload,
} from '@/lib/api';
import { Avatar } from '@/components/Avatar';

const CAMPEONATOS_URL =
  process.env.NEXT_PUBLIC_CAMPEONATOS_URL || 'http://localhost:3003';
const MEMBRESIAS_URL =
  process.env.NEXT_PUBLIC_MEMBRESIAS_URL || 'http://localhost:3006';
const ACADEMY_URL =
  process.env.NEXT_PUBLIC_ACADEMY_URL || 'http://localhost:3008';

export default function DashboardPage() {
  const router = useRouter();
  const [payload, setPayload] = useState<TokenPayload | null>(null);
  // ¿Gestiona alguna organización (admin/maestro)? ¿Pertenece a algún club?
  const [gestiona, setGestiona] = useState<boolean | null>(null);
  const [nombreClub, setNombreClub] = useState<string | null>(null);
  const [foto, setFoto] = useState<string | null>(null);

  useEffect(() => {
    const t = obtenerToken();
    if (!t) {
      router.replace('/login');
      return;
    }
    const p = decodificarToken(t);
    if (!p) {
      cerrarSesion();
      router.replace('/login');
      return;
    }
    setPayload(p);

    // Decide qué tarjeta mostrar: «Mi organización» (la gestiona) o
    // «Mi club» (solo pertenece). Ambas consultas fallan sin romper la página.
    Promise.allSettled([
      misOrganizacionesAPI(),
      miClubAPI(),
      api.get(`/users/${p.sub}/profile`),
    ]).then(([orgs, club, perfil]) => {
      setGestiona(orgs.status === 'fulfilled' && orgs.value.length > 0);
      if (club.status === 'fulfilled' && club.value.length > 0) {
        setNombreClub(club.value[0].name);
      }
      if (perfil.status === 'fulfilled') {
        setFoto((perfil.value.data as { avatarUrl: string | null }).avatarUrl);
      }
    });
  }, [router]);

  function salir() {
    cerrarSesion();
    router.replace('/login');
  }

  if (!payload) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p style={{ color: 'var(--text-muted)' }}>Cargando…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar src={foto} nombre={payload.fullName} size={56} />
          <div className="min-w-0">
            <p className="eyebrow mb-1">Tu cuenta DINAMYT</p>
            <h1 className="display text-3xl">Hola, {payload.fullName}</h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
              {payload.email}
              {payload.is_super_admin ? ' · Super administrador' : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/perfil" className="btn btn-outline">
            Mi perfil
          </Link>
          {/* Salir se distingue: es la única acción destructiva */}
          <button onClick={salir} className="btn btn-danger">
            ⏻ Salir
          </button>
        </div>
      </header>

      <section
        className="rounded-xl border p-5"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <h2 className="mb-4 text-lg font-semibold">Tus aplicaciones</h2>

        <div className="flex flex-col gap-3">
          {(payload.is_super_admin ||
            payload.app_scopes.includes('campeonatos')) && (
            // SSO por redirección: el token viaja en el fragmento (#) — nunca
            // llega al servidor — y la app lo guarda al aterrizar.
            //
            // ⚠️ La ruta es `/login`, no `/admin/login`: esa segunda NO EXISTE
            // en el frontend de Campeonatos y este enlace daba un 404. Lo que
            // todavía falta —y vive en `dinamyt-combat`, no aquí— es que su
            // `/login` LEA el `#token=`; mientras tanto se aterriza en su
            // formulario en vez de en una página que no existe.
            <a
              href={`${CAMPEONATOS_URL}/login#token=${encodeURIComponent(obtenerToken() ?? '')}`}
              className="rounded-lg px-4 py-3 font-semibold"
              style={{ background: 'var(--accion)', color: 'var(--accion-texto)' }}
            >
              Entrar a Campeonatos
              {payload.role_campeonatos ? ` (${payload.role_campeonatos})` : ''}
            </a>
          )}
          {(payload.is_super_admin ||
            payload.app_scopes.includes('membresias')) && (
            // Mismo SSO por fragmento que Campeonatos: membresias-web guarda el
            // token al aterrizar en /login#token=… sin segundo formulario.
            <a
              href={`${MEMBRESIAS_URL}/login#token=${encodeURIComponent(obtenerToken() ?? '')}`}
              className="rounded-lg px-4 py-3 font-semibold"
              style={{ background: 'var(--accion)', color: 'var(--accion-texto)' }}
            >
              Entrar a Membresías
              {payload.role_membresias ? ` (${payload.role_membresias})` : ''}
            </a>
          )}
          {(payload.is_super_admin || payload.app_scopes.includes('academy')) && (
            // Mismo SSO por fragmento: academy-web guarda el token al aterrizar
            // en /login#token=… sin segundo formulario.
            <a
              href={`${ACADEMY_URL}/login#token=${encodeURIComponent(obtenerToken() ?? '')}`}
              className="rounded-lg px-4 py-3 font-semibold"
              style={{ background: 'var(--accion)', color: 'var(--accion-texto)' }}
            >
              Entrar a Academy
              {payload.role_academy ? ` (${payload.role_academy})` : ''}
            </a>
          )}
          {!payload.is_super_admin && payload.app_scopes.length === 0 && (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              No tienes aplicaciones habilitadas todavía.{' '}
              <Link href="/planes" style={{ color: 'var(--gold)' }}>
                Ver planes disponibles
              </Link>
            </p>
          )}
        </div>
      </section>

      {/* «Mi organización» si la gestiona; si solo pertenece a un club,
          «Mi club» con su información (la llena el maestro/admin del club). */}
      {gestiona ? (
        <section
          className="mt-4 rounded-xl border p-5"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <h2 className="mb-1 text-lg font-semibold">Mi organización</h2>
          <p className="mb-3 text-sm" style={{ color: 'var(--text-muted)' }}>
            Gestiona tus clubes y tu gente, la ficha de tu club y las
            invitaciones entre organización y clubes.
          </p>
          <Link
            href="/mi-organizacion"
            className="inline-block rounded-lg border px-4 py-2 text-sm font-semibold"
            style={{ borderColor: 'var(--gold)', color: 'var(--gold)' }}
          >
            Abrir mi organización
          </Link>
        </section>
      ) : gestiona === false ? (
        <section
          className="mt-4 rounded-xl border p-5"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <h2 className="mb-1 text-lg font-semibold">Mi club</h2>
          <p className="mb-3 text-sm" style={{ color: 'var(--text-muted)' }}>
            {nombreClub
              ? `Perteneces a ${nombreClub}: mira sus horarios, sede y contactos.`
              : 'Cuando tu maestro te agregue a su club, aquí verás su información. ¿Eres maestro? Funda tu club.'}
          </p>
          <Link
            href="/mi-club"
            className="inline-block rounded-lg border px-4 py-2 text-sm font-semibold"
            style={{ borderColor: 'var(--gold)', color: 'var(--gold)' }}
          >
            {nombreClub ? 'Ver la información de mi club' : 'Mi club'}
          </Link>
        </section>
      ) : null}

      {payload.is_super_admin && (
        <section
          className="mt-4 rounded-xl border p-5"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <h2 className="mb-1 text-lg font-semibold">Administración del ecosistema</h2>
          <p className="mb-3 text-sm" style={{ color: 'var(--text-muted)' }}>
            Organizaciones, miembros con su rol y suscripciones a planes.
          </p>
          <Link
            href="/admin"
            className="inline-block rounded-lg px-4 py-2 text-sm font-semibold"
            style={{ background: 'var(--accion)', color: 'var(--accion-texto)' }}
          >
            Abrir panel de administración
          </Link>
        </section>
      )}
    </main>
  );
}
