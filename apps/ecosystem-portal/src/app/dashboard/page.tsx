'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import api, {
  obtenerToken,
  decodificarToken,
  cerrarSesion,
  refrescarSesionAPI,
  misOrganizacionesAPI,
  miClubAPI,
  misInvitacionesAPI,
  responderInvitacionAPI,
  extraerError,
  type TokenPayload,
  type MiInvitacion,
} from '@/lib/api';
import { nombreRol } from '@/lib/roles';
import { Avatar } from '@/components/Avatar';
import { EntrarAClub } from '@/components/EntrarAClub';

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
  const [invitaciones, setInvitaciones] = useState<MiInvitacion[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(
    null,
  );

  const cargar = useCallback(async (p: TokenPayload) => {
    // Ambas consultas fallan sin romper la página: lo que decide qué tarjeta
    // se enseña es «Mi organización» (la gestiona) o «Mi club» (solo
    // pertenece).
    const [orgs, club, perfil, invs] = await Promise.allSettled([
      misOrganizacionesAPI(),
      miClubAPI(),
      api.get(`/users/${p.sub}/profile`),
      misInvitacionesAPI(),
    ]);
    setGestiona(orgs.status === 'fulfilled' && orgs.value.length > 0);
    setNombreClub(
      club.status === 'fulfilled' && club.value.length > 0
        ? club.value[0].name
        : null,
    );
    if (perfil.status === 'fulfilled') {
      setFoto((perfil.value.data as { avatarUrl: string | null }).avatarUrl);
    }
    setInvitaciones(invs.status === 'fulfilled' ? invs.value : []);
  }, []);

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

    /**
     * **Lo primero al abrir el dashboard es volver a pedir el token.**
     *
     * Dentro del token van el club, los roles por app y `app_scopes`, y todo
     * eso lo cambia OTRA persona: el maestro que acepta tu solicitud, el admin
     * que activa la suscripción del club. Quien tenía la sesión abierta seguía
     * con el token de cuando entró, así que el alumno recién aceptado abría
     * esta pantalla y no veía ni su club ni sus aplicaciones — y Membresías
     * tampoco le creaba la ficha, porque eso también sale del `org_id` del
     * token. Desde fuera se veía como «la aplicación no me deja».
     *
     * Se pinta con el token viejo mientras tanto (`setPayload(p)` de arriba)
     * para que la pantalla no parpadee en blanco, y se repinta con el nuevo.
     */
    void refrescarSesionAPI().then((fresco) => {
      const vigente = fresco ?? p;
      if (fresco) setPayload(fresco);
      void cargar(vigente);
    });
  }, [router, cargar]);

  async function responderInvitacion(inv: MiInvitacion, aceptar: boolean) {
    setOcupado(true);
    setMsg(null);
    try {
      await responderInvitacionAPI(inv.id, aceptar);
      // Aceptar CREA la pertenencia, así que el token de este navegador acaba
      // de quedarse viejo otra vez. Sin este refresco, la persona acepta y
      // sigue sin ver ni su club ni sus apps hasta la próxima recarga.
      const fresco = await refrescarSesionAPI();
      const vigente = fresco ?? payload;
      if (fresco) setPayload(fresco);
      if (vigente) await cargar(vigente);
      setMsg({
        tipo: 'ok',
        texto: aceptar
          ? `Ya eres parte de ${inv.orgName}.`
          : `Rechazaste la invitación de ${inv.orgName}.`,
      });
    } catch (e) {
      setMsg({
        tipo: 'error',
        texto: extraerError(e, 'No se pudo responder la invitación.'),
      });
    } finally {
      setOcupado(false);
    }
  }

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

      {msg && (
        <p
          className="mb-4 text-sm"
          style={{ color: msg.tipo === 'ok' ? 'var(--ok)' : 'var(--danger)' }}
        >
          {msg.texto}
        </p>
      )}

      {/* ── Te invitaron ───────────────────────────────────────────────
          Lo primero de la pantalla, por delante incluso de las aplicaciones:
          es lo único aquí que espera una respuesta tuya, y de ella depende
          todo lo demás. Antes no existía —el maestro te metía en su club sin
          preguntarte— y ese era justamente el problema. */}
      {invitaciones.length > 0 && (
        <section className="card mb-5 p-5" style={{ borderColor: 'var(--gold)' }}>
          <h2 className="mb-1 text-lg font-semibold">
            ✉ Te invitaron a un club
          </h2>
          <p className="mb-3 text-sm" style={{ color: 'var(--text-muted)' }}>
            Decides tú. Si aceptas, tu ficha se crea sola en Membresías y verás
            los horarios y la sede de tu club.
          </p>
          <ul className="flex flex-col gap-2">
            {invitaciones.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-col gap-2 rounded-lg border px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between"
                style={{ borderColor: 'var(--border)' }}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <Avatar src={inv.orgLogoUrl} nombre={inv.orgName} size={36} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold" title={inv.orgName}>
                      {inv.orgName}
                    </p>
                    <p className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>
                      Te invita como {nombreRol(inv.role)}
                      {inv.orgCity ? ` · ${inv.orgCity}` : ''}
                    </p>
                    {inv.note && (
                      <p className="mt-0.5 truncate text-xs italic" title={inv.note}>
                        «{inv.note}»
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => void responderInvitacion(inv, true)}
                    disabled={ocupado}
                    className="btn btn-gold btn-sm"
                  >
                    Aceptar
                  </button>
                  <button
                    onClick={() => void responderInvitacion(inv, false)}
                    disabled={ocupado}
                    className="btn btn-outline btn-sm"
                  >
                    Rechazar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Sin club ───────────────────────────────────────────────────
          Se dibuja solo para quien no pertenece a ninguno, y va ARRIBA de las
          aplicaciones a propósito: sin club, casi todas le van a decir que no.
          Antes esto no existía y quien se registraba por su cuenta se quedaba
          con una cuenta que no servía para nada, sin ninguna pista de qué
          hacer a continuación.

          `gestiona === false` (y no `!gestiona`) porque `null` significa «aún
          no se sabe»: enseñarlo mientras carga lo haría parpadear en la
          pantalla de todo el mundo. */}
      {gestiona === false && nombreClub === null && invitaciones.length === 0 && (
        <div className="mb-5">
          {/* Al entrar con el código nace una solicitud, y el token de este
              navegador no se entera hasta que el maestro responda. Se refresca
              igualmente por si el maestro ya había dicho que sí. */}
          <EntrarAClub
            onEntrado={() => {
              void refrescarSesionAPI().then((fresco) => {
                const vigente = fresco ?? payload;
                if (fresco) setPayload(fresco);
                if (vigente) void cargar(vigente);
              });
            }}
          />
        </div>
      )}

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
              {payload.role_campeonatos ? ` (${nombreRol(payload.role_campeonatos)})` : ''}
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
              {payload.role_membresias ? ` (${nombreRol(payload.role_membresias)})` : ''}
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
              {payload.role_academy ? ` (${nombreRol(payload.role_academy)})` : ''}
            </a>
          )}
          {!payload.is_super_admin && payload.app_scopes.length === 0 && (
            /**
             * Sin suscripción activa no hay atajo a ninguna app: `app_scopes`
             * sale de las suscripciones, no de los roles (ver `buildToken`).
             *
             * Pero decirle «no tienes aplicaciones» a alguien que lleva meses
             * usando Membresías es sencillamente falso, y es lo que pasaba con
             * todo el que llegó por la reconciliación: su ficha, su club y sus
             * alumnos estaban ahí, y el portal le contestaba que no tenía
             * nada. Si la persona TIENE rol en una app, se le dice lo que de
             * verdad ocurre —falta la suscripción del club— y que su app sigue
             * funcionando por su dirección de siempre.
             */
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {payload.role_membresias ||
              payload.role_campeonatos ||
              payload.role_academy ? (
                <>
                  <p>
                    Tu cuenta está en{' '}
                    {[
                      payload.role_membresias && 'Membresías',
                      payload.role_campeonatos && 'Campeonatos',
                      payload.role_academy && 'Academy',
                    ]
                      .filter(Boolean)
                      .join(' y ')}
                    , pero tu club todavía no tiene una suscripción activa aquí,
                    así que el portal aún no puede llevarte de un salto.
                  </p>
                  <p className="mt-2">
                    Mientras tanto entras como siempre, por la dirección de tu
                    app. Pídele a un administrador de DINAMYT que active la
                    suscripción de tu club.
                  </p>
                </>
              ) : (
                <p>
                  No tienes aplicaciones habilitadas todavía.{' '}
                  <Link href="/planes" style={{ color: 'var(--gold)' }}>
                    Ver planes disponibles
                  </Link>
                </p>
              )}
            </div>
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
